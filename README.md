# Drive Cartographer

Drive Cartographer scans file trees, archives scan CSVs, imports them into
PostgreSQL, and provides a local web UI for exploring file locations,
duplicates, and previous-scan context.

## MVP Components

- `scanner/`: Rust CLI that scans configured roots and writes CSV artifacts.
- `web/`: Bun TypeScript service, worker, and frontend.
- `fixtures/`: small test scan artifacts.

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

Install web dependencies and prepare the database:

```bash
cd web
bun install
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer bunx prisma generate
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer bunx prisma migrate deploy
```

Run the scanner against the example config:

```bash
cargo run --manifest-path scanner/Cargo.toml -- \
  scan \
  --config scanner/fixtures/example-config.toml \
  --output /tmp/drive-cartographer-example.csv
```

Scanner config files are TOML:

```toml
source_name = "laptop-a"
cache_path = "data/scanner-cache.sqlite"
server_url = "http://localhost:3000"
exclude_patterns = ["*.tmp", ".git/**"]

[[roots]]
label = "photos"
path = "/Volumes/Photos"
```

Use `--upload` to submit the generated CSV to the configured server after a
scan completes. The scanner sends the CSV as multipart field `artifact` to
`/api/artifacts/upload`.

The scanner displays terminal progress for enumeration, processing,
finalization, and upload. It detects MIME types with libmagic and stores
normalized EXIF JSON for common image fields when EXIF data is present.

Run the development web app:

```bash
cd web
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer \
ARTIFACT_ARCHIVE_DIR=./data/artifacts \
bun run dev
```

`bun run dev` starts the Bun API server and Vite dev server together. Vite
serves the frontend and proxies `/api/*` to the Bun server on `WEB_PORT`
(`3000` by default). Open the Vite URL printed in the terminal.

Run the import worker:

```bash
cd web
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer bun run worker
```

For a production build:

```bash
cd web
bun run build
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer \
ARTIFACT_ARCHIVE_DIR=./data/artifacts \
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
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer bun run test
bun run typecheck
bun run security:scan
```

Implementation details are tracked in `DEV.md`.
