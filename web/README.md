# Web Service

The web component stores uploaded CSV artifacts on disk, queues them for import,
loads them into PostgreSQL, and serves the UI for browsing scan data.

It contains three runtime surfaces:

- the Bun API server
- the import worker
- the Vite frontend in development, or static assets served by Bun in
  production

## Prerequisites

Install Bun through `asdf`:

```bash
asdf plugin add bun https://github.com/cometkim/asdf-bun.git
asdf install
```

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Install dependencies:

```bash
cd web
bun install
```

## Environment

Copy the example file and adjust values for the local machine:

```bash
cd web
cp .env.example .env
```

Environment variables:

- `DATABASE_URL`: required PostgreSQL connection string
- `ARTIFACT_ARCHIVE_DIR`: directory where original CSV artifacts are stored
  before and after import. Defaults to `./data/artifacts`.
- `WEB_PORT`: Bun API server port. Defaults to `3000`.

## Database Setup

Generate the Prisma client and apply migrations:

```bash
cd web
bun run prisma:generate
bunx prisma migrate deploy
```

## Development

Run the API server and Vite together:

```bash
cd web
bun run dev
```

`bun run dev` starts:

- the Bun API server on `WEB_PORT`
- the Vite dev server on its own port, proxying `/api/*` to the Bun server

Open the Vite URL printed in the terminal.

Run the import worker in a second terminal:

```bash
cd web
bun run worker
```

## Production

Build the frontend:

```bash
cd web
bun run build
```

Start the Bun server:

```bash
cd web
bun run start
```

The production server routes `/api/*` to the API handler and serves the built
frontend from `web/dist` when the build output exists.

Run the worker separately:

```bash
cd web
bun run worker
```

## Import Flow

CSV artifacts can enter the system in two ways:

1. The scanner uploads directly to `POST /api/artifacts/upload`.
2. An administrator uploads an existing CSV through the Imports UI.

In both cases the original CSV is saved into `ARTIFACT_ARCHIVE_DIR`, then a
pending import job is created. The worker claims pending jobs and imports them
into PostgreSQL.

## API Summary

Current API routes:

- `POST /api/artifacts/upload`
- `GET /api/import-jobs`
- `POST /api/import-jobs/:id/retry`
- `GET /api/sources`
- `GET /api/sources/:id/roots`
- `GET /api/roots/:id/scans`
- `GET /api/explorer/children`
- `POST /api/explorer/duplicate-counts`
- `GET /api/hashes/:id/locations`

## Checks

Run the web validation commands:

```bash
cd web
bun run test
bun run typecheck
bun run security:scan
bun run build
```
