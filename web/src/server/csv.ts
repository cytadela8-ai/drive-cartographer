import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";

const REQUIRED_COLUMNS = [
  "schema_version",
  "source_name",
  "hostname",
  "os",
  "scanner_version",
  "scan_started_at",
  "scan_finished_at",
  "root_label",
  "root_path_seen",
  "sha256",
  "size_bytes",
  "absolute_path",
  "relative_path",
  "parent_relative_path",
  "basename",
  "created_at_fs",
  "modified_at_fs",
  "mime_type",
  "ownership_permissions_json",
  "exif_json",
  "metadata_json",
] as const;

export type ScanCsvRow = Record<(typeof REQUIRED_COLUMNS)[number], string>;

export function readScanCsv(path: string): ScanCsvRow[] {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`read artifact ${path}: ${errorMessage(error)}`);
  }

  const rows = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  }) as Record<string, string>[];

  validateRows(rows, path);
  return rows as ScanCsvRow[];
}

function validateRows(rows: Record<string, string>[], path: string): void {
  if (rows.length === 0) {
    throw new Error(`artifact ${path} has no file rows`);
  }

  for (const column of REQUIRED_COLUMNS) {
    if (!(column in rows[0]!)) {
      throw new Error(`artifact ${path} is missing required column ${column}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
