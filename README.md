# URL Shortener

FastAPI URL shortener with SQLite persistence, Redis redirect caching, Bloom-filter negative lookups, and async click logging through Celery.

## Features

- Create short URLs with `POST /shorten`
- Redirect short codes with `GET /{short_code}`
- Validate input URLs before storage
- Retry short-code generation on collision
- Cache resolved redirects in Redis
- Reject definitely-missing short codes with a Bloom filter before Redis or SQLite lookup
- Queue redirect analytics through Celery so click logging is off the redirect path
- Serve a basic browser UI from `/`
- Run app, Redis, and Celery worker with Docker Compose

## Architecture

Redirect lookup path:

1. Check the in-memory Bloom filter.
2. If the code is definitely absent, return `404`.
3. Check Redis for a cached destination URL.
4. On cache hit, redirect immediately and enqueue click logging.
5. On cache miss, query SQLite.
6. Store the resolved URL in Redis, enqueue click logging, and redirect.

Notes:

- SQLite is used for local persistence and simple deployment, but it becomes the main write bottleneck under higher concurrency.
- The Bloom filter is process-local. It is populated when links are created during the current app process and resets when the app restarts.
- Redis stores redirect cache entries and is also used as the Celery broker/result backend.
- The current Celery task logs clicks; it does not persist analytics records.

## Quick Start

```bash
docker-compose up --build
```

Open `http://localhost:8000`.

Services:

- `app`: FastAPI app on `http://localhost:8000`
- `redis`: Redis 7 on `localhost:6379`
- `celery`: Celery worker using Redis as broker

## API

Create a short URL:

```bash
curl -X POST http://localhost:8000/shorten \
  -H "Content-Type: application/json" \
  -d '{"original_url": "https://github.com"}'
```

Example response:

```json
{"short_code": "aB3xY2"}
```

Follow a redirect:

```bash
curl -L http://localhost:8000/aB3xY2
```

Invalid URLs are rejected:

```bash
curl -X POST http://localhost:8000/shorten \
  -H "Content-Type: application/json" \
  -d '{"original_url": "abc"}'
```

URLs must include a scheme and host, for example `https://example.com`.

## Load Testing

Run:

```bash
k6 run load_test.js
```

Current `load_test.js` configuration:

- `20` virtual users
- `30s` duration
- Each iteration performs four app requests:
  - `POST /shorten`
  - first `GET /{short_code}` to warm Redis
  - second `GET /{short_code}` to measure cached redirect latency
  - `GET /missing-*` to verify Bloom-filter negative lookup behavior
- Redirect following is disabled so redirect timing measures this app, not the target URL.
- Expected statuses are `2xx`, `3xx`, and `404`; the missing-code request is intentional.

Observed results:

| Metric | Result |
| --- | ---: |
| Virtual users | 20 |
| Duration | 30s |
| Completed iterations | 1,504 |
| Total app requests | 6,016 |
| Iteration throughput | 49.6 iterations/s |
| Request throughput | 198.4 req/s |
| Check success rate | 100% |
| Overall request duration p95 | 280.23ms |
| Cached redirect duration p95 | 64.85ms |
| Cached redirect failure rate | 0% |
| Cold redirect failure rate | 0% |
| Shorten failure rate | 0% |

Measured improvements:

- Cached redirect lookups avoid SQLite and stay under the `100ms` p95 threshold in the current test.
- Bloom-filter checks avoid unnecessary Redis and SQLite work for definitely-invalid short codes.
- Click logging is queued through Celery instead of blocking redirects.
- The latest mixed workload completed with 100% successful checks across create, cold redirect, cached redirect, and missing-code paths.

Known bottlenecks:

- SQLite write contention limits concurrent create throughput.
- Overall p95 latency is still driven by writes and cold redirects, not cached redirects.
- Celery task dispatch adds overhead at high request rates, even when the task itself is small.

## Production Notes

For traffic beyond this local setup:

- Replace SQLite with a database that handles concurrent writes well, such as PostgreSQL.
- Make Bloom-filter state durable or rebuild it from the database on startup.
- Add cache TTLs and an invalidation strategy if URLs become editable or deletable.
- Persist analytics events instead of only logging them.
- Re-test with separate read-heavy, write-heavy, and mixed workloads before setting capacity targets.

## Tech Stack

- FastAPI
- SQLAlchemy
- SQLite
- Redis
- Celery
- pybloom-live
- Pydantic
- Docker Compose

## License

MIT
