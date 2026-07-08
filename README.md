# URL Shortener

A minimal, fast URL shortening service built with FastAPI, SQLAlchemy, and SQLite.

## Features

- **Shorten URLs** — POST a long URL, get a 6-character short code
- **Redirect** — Visit short URL, get redirected to the original
- **URL Validation** — Rejects invalid URLs (no "abc" nonsense)
- **Collision Handling** — Automatically retries if short code conflicts
- **Docker Ready** — Everything runs in containers, no local setup needed

## Quick Start

```bash
docker-compose up --build
```

Visit `http://localhost:8000` in your browser or use the API.

## API

**Create a short URL**
```bash
curl -X POST http://localhost:8000/shorten \
  -H "Content-Type: application/json" \
  -d '{"original_url": "https://github.com"}'
```

Response: `{"short_code": "aB3xY2"}`

**Redirect**
```bash
curl -L http://localhost:8000/aB3xY2
```

## Tech Stack

- FastAPI (web framework)
- SQLAlchemy (ORM)
- SQLite (database)
- Docker (containerization)

## Load Testing

```bash
k6 run load_test.js
```

Handles 1800+ req/s with 10 concurrent users, 100% success rate.



MIT License
