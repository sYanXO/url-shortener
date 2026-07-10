# Shorty — URL Shortener & Analytics

FastAPI URL shortener featuring SQLite persistence, in-memory caching, Bloom-filter negative lookups, custom link nicknames, live dashboard search, and secure deletion confirmations.

## Features

- **Link Shortening**: Create short links instantly with `POST /shorten`.
- **Auto-Prefixing**: Missing URL schemes (e.g. `google.com`) are auto-prepended with `https://` on submission.
- **Link Nicknames**: Give short links friendly nicknames (e.g. "Work Doc", "Portfolio") for easy management. Updates are limited to once every 7 days per link.
- **Live Search**: Instantly filter links in the dashboard by nickname, short code, or destination URL.
- **Vercel-Style Deletion**: Safely delete links from the database using a confirmation modal that requires typing the exact nickname or short code to confirm.
- **QR Codes**: Toggle inline QR code generation for any link on both the landing page and dashboard.
- **Rate Limiting**: Protect creation routes with a rate limit of 10 requests per minute.
- **Security Headers**: Standard security protections including Content Security Policy (CSP), X-Frame-Options, and X-Content-Type-Options.

## Architecture

The project is built on clean domain-modeling seams and deep modules:

### 1. Short URL Store (`ShortURLStore`)
Encapsulates all mapping operations behind a deep interface:
- **Bloom Filter Lookups**: Process-local Bloom filter checks query code existence before touching caches or database sessions.
- **Redirect Caching**: Fast in-memory LRU cache (`cachetools.LRUCache`) prevents database write bottlenecks on hot links.
- **Lookup Path**: `Bloom Filter Check` → `LRU Cache Check` → `SQLite Lookup` → `Redirect & Async Log Click`.

### 2. Click Analytics Tracker (`ClickTracker`)
Isolates click counting and tracking metrics:
- **Fire-and-Forget Logging**: Background tasks log click events and increment click counters outside the main redirect response path.
- **Aggregations**: Handles day-by-day click stats and aggregate total links/clicks calculations.

### 3. App Bootstrap (`AppBootstrap`)
Consolidates settings configuration, static mounting, lifecycles, and security middleware registrations into a unified setup block to keep the route execution layer completely clean.

### 4. Modal Manager (`ModalManager`)
Frontend manager in `static/dashboard.html` that abstracts transition visibility, keyboard Escape keybinds, and input auto-focus triggers across dashboard modal frames.

## Quick Start

```bash
docker compose up --build -d
```

Open `http://localhost:8000`.

### Services:
- `app`: FastAPI app on `http://localhost:8000`
- `db`: Local SQLite database (`shortener.db`)

## API Reference

### Create a Short URL:
```bash
curl -X POST http://localhost:8000/shorten \
  -H "Content-Type: application/json" \
  -d '{"original_url": "https://github.com", "nickname": "My GitHub"}'
```
Response:
```json
{"short_code": "aB3xY2", "already_exists": false}
```

### Follow a Redirect:
```bash
curl -L http://localhost:8000/aB3xY2
```

### Delete a Link:
```bash
curl -X DELETE http://localhost:8000/api/links/aB3xY2
```

### Update a Nickname (Once every 7 days):
```bash
curl -X PATCH http://localhost:8000/api/links/aB3xY2/nickname \
  -H "Content-Type: application/json" \
  -d '{"nickname": "Updated Nickname"}'
```

## Load Testing

Run:
```bash
k6 run load_test.js
```

Current `load_test.js` configuration:
- 20 virtual users for 30 seconds.
- Each iteration performs a creation request, redirect checks, and Bloom filter negative lookup validation.

## License

MIT
