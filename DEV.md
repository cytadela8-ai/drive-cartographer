# Development Notes

## Architecture

The scanner produces durable CSV artifacts. The web service archives artifacts
before import. The worker imports artifacts into normalized PostgreSQL tables.
The frontend uses scoped indexed queries for tree browsing and duplicate
inspection.

## Planned Modules

- `scanner/src/scanner.rs`: scan orchestration.
- `scanner/src/csv_schema.rs`: CSV header and row encoding.
- `scanner/src/cache.rs`: SQLite hash cache.
- `web/src/server/importer.ts`: CSV validation and database import.
- `web/src/server/explorer.ts`: directory, duplicate, and history queries.
- `web/src/client/ExplorerView.tsx`: virtualized file explorer.
