# Domain Model

## Core Concepts
- **ShortURL**: A shortened representation of an original URL.
- **Click**: An event representing a user accessing a ShortURL.
- **User Identity / Lightweight Session**: An anonymous session tracked via a persistent cookie (`session_id`). This establishes ownership (the **locality** of links) without requiring hard authentication.
- **Ownership Locality**: A `ShortURL` is tightly coupled to the `Session` that created it. Dashboards and editing capabilities are isolated across this seam.
