import type { Prisma, PrismaClient } from "../generated/prisma/client";

import { readScanCsv, type ScanCsvRow } from "./csv";
import { markJobCompleted, markJobFailed, markJobRunning } from "./importJobs";

export type ImportResult = {
  scanId: string;
  fileCount: number;
  uniqueHashCount: number;
};

export async function importArtifact(
  prisma: PrismaClient,
  artifactId: string,
): Promise<ImportResult> {
  const artifact = await prisma.scanArtifact.findUniqueOrThrow({
    where: {
      id: artifactId,
    },
  });
  await rejectDuplicateCompletedScan(prisma, artifactId);

  const jobId = await markJobRunning(prisma, artifactId);
  try {
    const rows = readScanCsv(artifact.storagePath);
    const result = await importRows(prisma, artifactId, rows);
    await markJobCompleted(prisma, jobId);
    await prisma.scanArtifact.update({
      where: {
        id: artifactId,
      },
      data: {
        status: "IMPORTED",
      },
    });
    return result;
  } catch (error) {
    const message = errorMessage(error);
    await markJobFailed(prisma, jobId, message);
    await prisma.scanArtifact.update({
      where: {
        id: artifactId,
      },
      data: {
        status: "FAILED",
      },
    });
    throw new Error(message);
  }
}

async function rejectDuplicateCompletedScan(
  prisma: PrismaClient,
  artifactId: string,
): Promise<void> {
  const existingScan = await prisma.scan.findFirst({
    where: {
      artifactId,
      importStatus: "COMPLETED",
    },
  });

  if (existingScan !== null) {
    throw new Error(`artifact ${artifactId} already has a completed scan`);
  }
}

async function importRows(
  prisma: PrismaClient,
  artifactId: string,
  rows: ScanCsvRow[],
): Promise<ImportResult> {
  return prisma.$transaction(async (transaction) => {
    const first = rows[0]!;
    const source = await upsertSource(transaction, first);
    const root = await upsertRoot(transaction, source.id, first);
    const scan = await createScan(transaction, artifactId, source.id, first);

    await transaction.scanRoot.create({
      data: {
        scanId: scan.id,
        rootId: root.id,
        rootPathSeen: first.root_path_seen,
        fileCount: rows.length,
      },
    });

    const uniqueHashes = new Set<string>();
    for (const row of rows) {
      uniqueHashes.add(row.sha256);
      const fileHash = await upsertFileHash(transaction, row);
      await transaction.fileLocation.create({
        data: buildFileLocation(row, scan.id, root.id, fileHash.id),
      });
    }

    await transaction.scan.update({
      where: {
        id: scan.id,
      },
      data: {
        importStatus: "COMPLETED",
        fileCount: rows.length,
        uniqueHashCount: uniqueHashes.size,
      },
    });

    return {
      scanId: scan.id,
      fileCount: rows.length,
      uniqueHashCount: uniqueHashes.size,
    };
  });
}

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function upsertSource(transaction: TransactionClient, row: ScanCsvRow) {
  return transaction.source.upsert({
    where: {
      name: row.source_name,
    },
    update: {
      hostname: row.hostname,
      os: row.os,
    },
    create: {
      name: row.source_name,
      hostname: row.hostname,
      os: row.os,
    },
  });
}

async function upsertRoot(
  transaction: TransactionClient,
  sourceId: string,
  row: ScanCsvRow,
) {
  return transaction.root.upsert({
    where: {
      sourceId_label: {
        sourceId,
        label: row.root_label,
      },
    },
    update: {
      absolutePath: row.root_path_seen,
    },
    create: {
      sourceId,
      label: row.root_label,
      absolutePath: row.root_path_seen,
    },
  });
}

async function createScan(
  transaction: TransactionClient,
  artifactId: string,
  sourceId: string,
  row: ScanCsvRow,
) {
  return transaction.scan.create({
    data: {
      sourceId,
      artifactId,
      scannerVersion: row.scanner_version,
      startedAt: parseDate(row.scan_started_at),
      finishedAt: parseDate(row.scan_finished_at),
      importStatus: "IMPORTING",
    },
  });
}

async function upsertFileHash(transaction: TransactionClient, row: ScanCsvRow) {
  const sizeBytes = BigInt(row.size_bytes);
  const existing = await transaction.fileHash.findUnique({
    where: {
      sha256: row.sha256,
    },
  });

  if (existing !== null && existing.sizeBytes !== sizeBytes) {
    throw new Error(`hash ${row.sha256} has conflicting file sizes`);
  }

  return transaction.fileHash.upsert({
    where: {
      sha256: row.sha256,
    },
    update: {
      lastSeenAt: new Date(),
    },
    create: {
      sha256: row.sha256,
      sizeBytes,
      mimeType: row.mime_type,
      exifJson: parseJsonObject(row.exif_json, "exif_json"),
    },
  });
}

function buildFileLocation(
  row: ScanCsvRow,
  scanId: string,
  rootId: string,
  hashId: string,
): Prisma.FileLocationUncheckedCreateInput {
  return {
    scanId,
    rootId,
    hashId,
    absolutePath: row.absolute_path,
    relativePath: row.relative_path,
    parentRelativePath: row.parent_relative_path,
    basename: row.basename,
    createdAtFs: parseOptionalDate(row.created_at_fs),
    modifiedAtFs: parseDate(row.modified_at_fs),
    ownershipPermissionsJson: parseJsonObject(
      row.ownership_permissions_json,
      "ownership_permissions_json",
    ),
    metadataJson: parseJsonObject(row.metadata_json, "metadata_json"),
  };
}

function parseOptionalDate(value: string): Date | null {
  return value.trim() === "" ? null : parseDate(value);
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`invalid timestamp ${value}`);
  }
  return date;
}

function parseJsonObject(value: string, column: string): Prisma.InputJsonObject {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${column} must contain a JSON object`);
  }
  return parsed as Prisma.InputJsonObject;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
