# Development Notes

## Architecture

The scanner produces durable CSV artifacts. The web service archives artifacts
before import. The worker imports artifacts into normalized PostgreSQL tables.
The frontend uses scoped indexed queries for tree browsing and duplicate
inspection.

## Modules

- `scanner/src/scanner.rs`: scan orchestration.
- `scanner/src/csv_schema.rs`: CSV header and row encoding.
- `scanner/src/cache.rs`: SQLite hash cache.
- `scanner/src/config.rs`: TOML scanner config loading.
- `scanner/src/metadata.rs`: filesystem metadata normalization.
- `web/src/server/app.ts`: fetch-handler API routes.
- `web/src/server/importer.ts`: CSV validation and database import.
- `web/src/server/explorer.ts`: directory, duplicate, and history queries.
- `web/src/client/ImportsView.tsx`: CSV upload and import job actions.
- `web/src/client/ExplorerView.tsx`: virtualized file explorer.

## Scanner Memory Model

The scanner uses two filesystem walks. The first walk counts files and apparent
bytes for progress totals. The second walk hashes and writes each CSV row through
a buffered writer. It finalizes scan completion timestamps through a second CSV
file pass, so it does not retain the full file list or all CSV rows in memory.

Hashing uses a fixed 64 KiB read buffer. The local SQLite cache stores file hash
results keyed by source, root, absolute path, size, and modification timestamp.

## Database

Prisma 7 stores the database URL in `web/prisma.config.ts`, not in
`schema.prisma`. The schema defines normalized tables for sources, roots,
artifacts, import jobs, scans, scan roots, file hashes, and file locations.

The initial explorer indexes are:

- `FileLocation_scanId_rootId_parentRelativePath_idx`
- `FileLocation_hashId_idx`
- `FileLocation_rootId_relativePath_scanId_idx`
- `FileLocation_scanId_rootId_relativePath_key`

## Web API

`web/src/server/app.ts` exposes a framework-free `Request` to `Response`
handler used by Bun and by server tests. The current routes are:

- `POST /api/artifacts/upload`
- `GET /api/import-jobs`
- `POST /api/import-jobs/:id/retry`
- `GET /api/sources`
- `GET /api/sources/:id/roots`
- `GET /api/roots/:id/scans`
- `GET /api/explorer/children`
- `POST /api/explorer/duplicate-counts`
- `GET /api/hashes/:id/locations`

Upload stores the original CSV artifact in `ARTIFACT_ARCHIVE_DIR` before
creating a pending import job. Retry resets the failed job in place and returns
the artifact to `SAVED` status.

## Web Tests

Database-backed Vitest files run sequentially because they share the local
Postgres database and clean tables between tests.

## Performance Guardrails

The web test suite includes deterministic performance fixtures in
`web/tests/performance/`.

Run the guardrails against the local Docker Postgres:

```bash
docker compose up -d postgres
cd web
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer bunx prisma migrate deploy
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer \
  bun run test -- tests/performance
```

Current checks:

- `generateCsv.ts` writes synthetic scan CSVs with configurable file count,
  duplicate frequency, and directory fanout.
- `import.perf.test.ts` imports a 1000-row CSV under a 10 second local threshold.
- `queryPlans.test.ts` runs `ANALYZE` and verifies the scoped directory listing
  query uses `FileLocation_scanId_rootId_parentRelativePath_idx` instead of a
  sequential scan.
