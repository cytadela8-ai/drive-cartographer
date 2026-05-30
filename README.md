# Drive Cartographer

Drive Cartographer scans file trees, archives scan CSVs, imports them into
PostgreSQL, and provides a local web UI for exploring file locations,
duplicates, and previous-scan context.

## MVP Components

- `scanner/`: Rust CLI that scans configured roots and writes CSV artifacts.
- `web/`: Bun TypeScript service, worker, and frontend.
- `fixtures/`: small test scan artifacts.

## Development

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

Run checks:

```bash
cargo test --manifest-path scanner/Cargo.toml
cargo clippy --manifest-path scanner/Cargo.toml --all-targets -- -D warnings
cd web
DATABASE_URL=postgresql://drive:drive@localhost:5432/drive_cartographer bun run test
bun run typecheck
```

Implementation details are tracked in `DEV.md`.
