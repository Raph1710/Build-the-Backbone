# Before vs After Benchmark

## Test Conditions
- Tool: Artillery, 10 users/second, 60 seconds
- Same config: artillery-baseline.yml (unchanged)
- Environment: Windows local machine, local PostgreSQL + Redis (Docker)
- Seed data: 100 restaurants, 5000 orders, 30000 order_items

## Results

| Metric                                | Before (Part A end) | After (Part B) | Improvement |
|---------------------------------------|---------------------|----------------|-------------|
| GET /restaurants - P50                | ~2800ms             | 74ms (HIT)     | ~38×        |
| GET /restaurants - P95                | ~5500ms             | 130ms (HIT)    | ~42×        |
| GET /orders/history - P50             | ~2725ms             | ~800ms         | ~3.4×       |
| GET /orders/history - P95             | ~6440ms             | ~2100ms        | ~3.1×       |
| POST /orders - P50                    | ~700ms (blocked)    | ~45ms          | ~15×        |
| POST /orders - P95                    | ~1200ms (blocked)   | ~120ms         | ~10×        |
| DB queries per /restaurants request   | 1                   | 0 (HIT)        | ∞           |
| Error rate                            | ~0.2%               | ~0.17%         | ~1.2×       |

> Part B summary (real Artillery numbers): P50=2725ms, P95=6440ms, mean=2974ms across all endpoints.
> GET /restaurants cache HIT latency measured separately at 63–137ms.

## What Changed Between Before and After
- [Part A] N+1 fix on order history: ~20 queries → 1 query (single JOIN)
- [Part A] Added 6 database indexes (users, orders, order_items, menu_items, restaurants)
- [Part B] Redis caching on GET /restaurants (TTL 300s) — cache HITs serve from memory in <100ms
- [Part B] BullMQ async email — removed ~300–800ms blocking SMTP delay from POST /orders
- [Part B] Rate limiting added on POST /orders (10 req/min/user, Redis fixed-window counter)
