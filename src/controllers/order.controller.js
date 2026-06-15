const db = require('../db');
const emailQueue = require('../queues/email.queue');

/**
 * Get Order History for the authenticated user.
 * 
 * [PLANTED PERFORMANCE PROBLEM 1]
 * This function exhibits a severe N+1 query problem. Instead of a single JOIN,
 * it fetches orders, then items, then menu details in a nested loop.
 * Performance will degrade exponentially as orders increase.
 */
const getOrderHistory = async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;

    console.log(`[Order Controller] Fetching history for User #${userId}`);

    // Single JOIN query replacing N+1 loop
    const result = await db.query(
        `SELECT
            o.id, o.total, o.status, o.created_at,
            json_agg(
                json_build_object(
                    'itemId', oi.menu_item_id,
                    'quantity', oi.quantity,
                    'unitPrice', oi.unit_price,
                    'name', mi.name
                )
            ) AS items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.user_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
    );

    res.json({
        user_id: userId,
        total_orders: result.rowCount,
        orders: result.rows
    });
};

/**
 * Create a new order.
 * 
 * [PLANTED PERFORMANCE PROBLEM 2]
 * Synchronous Email sending. The response is blocked by a simulated 
 * SMTP delay in every order creation.
 */
const createOrder = async (req, res) => {
    const { restaurant_id, items, delivery_fee } = req.body;
    const userId = req.user.id;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'No items in order' });
    }

    // Wrap in a simple transaction behavior (manual in pg-pool is a bit different, but using individual queries for now)
    try {
        // 1. Calculate total
        let total = 0;
        for (const item of items) {
            total += item.price * item.quantity;
        }
        total += delivery_fee;

        // 2. Create the order
        const orderResult = await db.query(
            'INSERT INTO orders (user_id, restaurant_id, total_amount, delivery_fee) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, restaurant_id, total, delivery_fee]
        );
        const orderId = orderResult.rows[0].id;

        // 3. Add order items
        for (const item of items) {
            await db.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5)',
                [orderId, item.menu_item_id, item.quantity, item.price, item.price * item.quantity]
            );
        }

        // Before: await emailService.sendConfirmation(orderId, req.user.email)
        // After: enqueue async - request handler no longer waits for email
        await emailQueue.add('send-confirmation', {
            orderId,
            userEmail: req.user.email,
            orderData: { id: orderId, restaurant_id, items, total, delivery_fee }
        });

        res.status(201).json({
            message: 'Order created successfully!',
            order_id: orderId
        });

    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
};

const getOrderById = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
        'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
        [id, userId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
};

module.exports = {
    getOrderHistory,
    createOrder,
    getOrderById
};
