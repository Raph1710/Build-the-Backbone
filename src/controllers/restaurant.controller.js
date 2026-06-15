const db = require('../db');
const redis = require('../lib/redis');
const { invalidateRestaurantCache } = require('../lib/cacheInvalidation');

/**
 * Get List of Restaurants with filters.
 *
 * [PLANTED PERFORMANCE PROBLEM 3]
 * Missing indexes on WHERE and JOIN columns in the database.
 * This query will scan the full table even with a simple city filter.
 *
 * [OPTIMIZATION] Cache-aside pattern with Redis (5 min TTL).
 */
const getRestaurants = async (req, res) => {
    const { city, limit = 20, page = 1, sort } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build deterministic cache key from all query params
    const key = `restaurants:city=${city || 'all'}:page=${page}:limit=${limit}:sort=${sort || 'rating'}`;

    // Cache-aside: check cache first
    const cached = await redis.get(key);
    if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(JSON.parse(cached));
    }

    // Cache miss - query the database
    let queryStr = 'SELECT * FROM restaurants';
    const params = [];

    if (city) {
        queryStr += ' WHERE city = $1';
        params.push(city);
        queryStr += ` LIMIT $2 OFFSET $3`;
        params.push(limit, offset);
    } else {
        queryStr += ` LIMIT $1 OFFSET $2`;
        params.push(limit, offset);
    }

    const result = await db.query(queryStr, params);

    const data = {
        total: result.rowCount,
        restaurants: result.rows
    };

    // Store in cache for 5 minutes (300 seconds)
    await redis.setex(key, 300, JSON.stringify(data));

    res.setHeader('X-Cache', 'MISS');
    res.json(data);
};

/**
 * Get Restaurant Menu items with category details.
 *
 * [PLANTED PERFORMANCE PROBLEM 4]
 * N+1 for category details inside a loop.
 */
const getMenu = async (req, res) => {
    const { id } = req.params;

    console.log(`[Restaurant Controller] Fetching menu for Restaurant #${id}`);

    // Single JOIN query replacing N+1 category lookups
    const result = await db.query(
        `SELECT mi.*, c.name AS category_name
         FROM menu_items mi
         LEFT JOIN categories c ON c.id = mi.category_id
         WHERE mi.restaurant_id = $1 AND mi.available = TRUE`,
        [id]
    );

    const populatedMenu = result.rows.map(item => ({
        ...item,
        category: item.category_name || 'Uncategorized'
    }));

    res.json({
        restaurant_id: id,
        menu: populatedMenu
    });
};

/**
 * Create a new restaurant.
 * Invalidates the restaurant list cache after creation.
 */
const createRestaurant = async (req, res) => {
    const { name, city, address, cuisine_type, rating } = req.body;

    const result = await db.query(
        `INSERT INTO restaurants (name, city, address, cuisine_type, rating)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, city, address, cuisine_type, rating]
    );

    const restaurant = result.rows[0];

    // Invalidate cache for this city and the 'all' cache
    await invalidateRestaurantCache(city);

    res.status(201).json(restaurant);
};

/**
 * Update an existing restaurant.
 * Invalidates the restaurant list cache after update.
 */
const updateRestaurant = async (req, res) => {
    const { id } = req.params;
    const { name, city, address, cuisine_type, rating } = req.body;

    const result = await db.query(
        `UPDATE restaurants
         SET name = $1, city = $2, address = $3, cuisine_type = $4, rating = $5
         WHERE id = $6
         RETURNING *`,
        [name, city, address, cuisine_type, rating, id]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Restaurant not found' });
    }

    const restaurant = result.rows[0];

    // Invalidate cache for this city and the 'all' cache
    await invalidateRestaurantCache(city);

    res.json(restaurant);
};

/**
 * Delete a restaurant.
 * Invalidates the restaurant list cache after deletion.
 */
const deleteRestaurant = async (req, res) => {
    const { id } = req.params;

    // Fetch city before deleting so we can invalidate the right cache keys
    const existing = await db.query('SELECT city FROM restaurants WHERE id = $1', [id]);
    if (existing.rowCount === 0) {
        return res.status(404).json({ error: 'Restaurant not found' });
    }

    const { city } = existing.rows[0];

    await db.query('DELETE FROM restaurants WHERE id = $1', [id]);

    // Invalidate cache for this city and the 'all' cache
    await invalidateRestaurantCache(city);

    res.status(204).send();
};

const getHealth = async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'UP', database: 'connected' });
    } catch (err) {
        res.status(503).json({ status: 'DOWN', database: 'disconnected' });
    }
};

module.exports = {
    getRestaurants,
    getMenu,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant,
    getHealth
};
