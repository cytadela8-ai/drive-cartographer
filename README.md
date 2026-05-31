# Drive Cartographer

Drive Cartographer scans file trees, archives scan CSVs, imports them into
PostgreSQL, and provides a local web UI for exploring file locations,
duplicates, and previous-scan context.

## Components

- [`scanner/`](scanner/README.md): Rust CLI that enumerates roots, hashes files,
  writes CSV artifacts, and can upload them.
- [`web/`](web/README.md): Bun API server, import worker, PostgreSQL-backed
  importer, and React frontend.
- `fixtures/`: small test artifacts used by scanner and server tests.

## Development

Install scanner system dependencies:

```bash
sudo apt-get install libmagic-dev
```

Install Bun through asdf:

```bash
asdf plugin add bun https://github.com/cometkim/asdf-bun.git
asdf install
```

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Prepare the web environment:

```bash
cd web
bun install
cp .env.example .env
bun run prisma:generate
bunx prisma migrate deploy
```

Run the scanner against the example config:

```bash
cargo run --manifest-path scanner/Cargo.toml -- \
  scan \
  --config scanner/fixtures/example-config.toml \
  --output /tmp/drive-cartographer-example.csv
```

Scanner usage, config details, caching behavior, and upload modes are documented
in [`scanner/README.md`](scanner/README.md).

Run the development web app and worker:

```bash
cd web
bun run dev
bun run worker
```

`bun run dev` starts the Bun API server and Vite dev server together. Vite
serves the frontend and proxies `/api/*` to the Bun server on `WEB_PORT`
(`3000` by default). Open the Vite URL printed in the terminal.

For a production build:

```bash
cd web
bun run build
bun run start
```

The Bun server serves `/api/*` from the API handler and serves the built Vite
frontend from `web/dist` when `dist/index.html` exists. If `dist/` is missing,
the server remains API-only.

The API exposes CSV artifact upload, import job retry/listing, source/root/scan
listing, explorer children, duplicate counts, and hash location endpoints under
`/api`.

Run checks:

```bash
cargo test --manifest-path scanner/Cargo.toml
cargo clippy --manifest-path scanner/Cargo.toml --all-targets -- -D warnings
cd web
bun run test
bun run typecheck
bun run security:scan
bun run build
```

Implementation details are tracked in [`DEV.md`](DEV.md). Component-specific
setup and runtime instructions live in [`scanner/README.md`](scanner/README.md)
and [`web/README.md`](web/README.md).
