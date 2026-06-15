const redis = require('../lib/redis');

const LIMIT = 10;
const WINDOW_SECONDS = 60;

/**
 * Per-user rate limiter for POST /orders.
 * Algorithm: Fixed window counter using redis.incr() + redis.expire().
 * Key format: ratelimit:user:{userId}:orders
 */
const orderRateLimit = async (req, res, next) => {
  const userId = req.user.id;
  const key = `ratelimit:user:${userId}:orders`;

  // Increment counter; if it's new, set expiry
  const count = await redis.incr(key);

  if (count === 1) {
    // First request in this window — set the TTL
    await redis.expire(key, WINDOW_SECONDS);
  }

  const ttl = await redis.ttl(key);
  const remaining = Math.max(0, LIMIT - count);

  res.setHeader('X-RateLimit-Limit', LIMIT);
  res.setHeader('X-RateLimit-Remaining', remaining);

  if (count > LIMIT) {
    res.setHeader('Retry-After', ttl);
    return res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Too many orders. You can place up to ${LIMIT} orders per minute.`,
      retryAfter: ttl
    });
  }

  next();
};

module.exports = { orderRateLimit };
