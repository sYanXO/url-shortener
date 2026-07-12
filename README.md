# URL Shortener

A high-performance, architecturally sound URL Shortener built with modern web principles. 

## What It Does
This application allows users to shorten long URLs, assign memorable nicknames, generate QR codes, and track analytics on link clicks. It includes a user dashboard to seamlessly manage links (edit nicknames, delete links, view stats) without requiring a traditional login system—ownership is handled automatically via secure session cookies.

## Features & Implementation

### 1. Link Management & Dashboard
- **Shortening**: Users can generate short links backed by random code generation with retry logic.
- **Customization**: Nicknames can be edited seamlessly to identify links.
- **QR Codes**: Generated dynamically on the client-side for quick physical sharing.
- **Implementation**: The frontend relies on React, Vite, and `react-router-dom`. Views are cleanly decoupled into a `HomeView` and `DashboardView`. State management and API data syncing are powered by `swr` (Stale-While-Revalidate) hooks for resilient caching, deduping, and background updates. 

### 2. User Authentication (Session Seam)
- **Automatic Ownership**: Users own the links they create via an invisible, automatically assigned session.
- **Implementation**: The backend assigns a `session_id` using a lightweight HTTP-only cookie. It is patched with `samesite="lax"` and `secure=True` (in production) to prevent CSRF and session leaking. 

### 3. Architecture & Data Integrity
- **Database**: SQLite managed by SQLAlchemy ORM.
- **Repository Pattern**: Data access is completely decoupled from the API routes using `URLRepository` and `AnalyticsRepository`, injected via FastAPI's `Depends` for clean dependency management and isolation.
- **Connection Safety**: Background tasks (like analytics tracking) spin up their own localized database sessions to prevent connection leaking.

### 4. Performance & Caching
- **Bloom Filters**: Implemented using `pybloom-live` to probabilistically check if a URL exists before making a trip to the database.
- **LRU Cache**: Frequently accessed short links are kept in a local cache (`cachetools`) to serve redirects in memory, avoiding redundant SQLite disk reads.

### 5. Security & Rate Limiting
- **Rate Limiting**: Built on top of `slowapi`. To ensure trust boundaries are respected behind reverse proxies (like Nginx/Docker), it utilizes `ProxyHeadersMiddleware` to correctly unwrap `X-Forwarded-For` headers so individual clients are rate-limited correctly, instead of the proxy itself.

### 6. Design Engineering & UI Polish
- **Aesthetics**: TailwindCSS drives the modern, minimal design.
- **Fluid Motion**: `framer-motion` adds physics-based, spring animations and glassmorphism elements, adhering to design engineering principles for a premium feel.

### 7. Reliability
- **Testing**: A comprehensive `pytest` suite provides 100% test coverage over the core repositories and FastAPI endpoints. It employs a fully isolated in-memory SQLite database (`StaticPool`) injected directly into the application context to guarantee thread safety during concurrent tests.
