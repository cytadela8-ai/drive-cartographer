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

## Performance Guardrails

The web test suite includes deterministic performance fixtures in
`web/tests/performance/`.

Run the guardrails against the local Docker Postgres:

```bash
docker compose up -d postgres
cd web
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer npx prisma migrate deploy
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer npm test -- tests/performance
```

Current checks:

- `generateCsv.ts` writes synthetic scan CSVs with configurable file count,
  duplicate frequency, and directory fanout.
- `import.perf.test.ts` imports a 1000-row CSV under a 10 second local threshold.
- `queryPlans.test.ts` runs `ANALYZE` and verifies the scoped directory listing
  query uses `FileLocation_scanId_rootId_parentRelativePath_idx` instead of a
  sequential scan.
