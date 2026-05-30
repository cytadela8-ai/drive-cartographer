import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/server/db";
import { importArtifact } from "../../src/server/importer";
import { writeSyntheticCsv } from "./generateCsv";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);

describe("query plan guardrails", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("uses the directory children index for scoped explorer queries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "drive-cartographer-"));
    const csvPath = join(dir, "plans.csv");
    writeSyntheticCsv({
      fileCount: 1500,
      duplicateEvery: 15,
      outputPath: csvPath,
      parentCount: 30,
    });
    const artifact = await createArtifact(csvPath);
    const imported = await importArtifact(prisma, artifact.id);
    const scan = await prisma.scan.findUniqueOrThrow({ where: { id: imported.scanId } });
    const root = await prisma.root.findFirstOrThrow({ where: { sourceId: scan.sourceId } });
    await prisma.$executeRawUnsafe('ANALYZE "FileLocation"');

    const plan = await explainDirectoryChildren(imported.scanId, root.id, "dir-7");

    expect(JSON.stringify(plan)).toContain("FileLocation_scanId_rootId_parentRelativePath_idx");
    expect(JSON.stringify(plan)).not.toContain("Seq Scan");
  });
});

async function explainDirectoryChildren(scanId: string, rootId: string, parentPath: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ "QUERY PLAN": unknown }>>(
    `EXPLAIN (FORMAT JSON)
     SELECT *
     FROM "FileLocation"
     WHERE "scanId" = $1
       AND "rootId" = $2
       AND "parentRelativePath" = $3`,
    scanId,
    rootId,
    parentPath,
  );

  return rows[0]?.["QUERY PLAN"] ?? [];
}

async function createArtifact(storagePath: string) {
  const bytes = readFileSync(storagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  return prisma.scanArtifact.create({
    data: {
      storagePath,
      originalFilename: "plans.csv",
      sizeBytes: bytes.length,
      sha256,
      submissionMethod: "query_plan_test",
      status: "SAVED",
      importJobs: {
        create: {
          status: "PENDING",
        },
      },
    },
  });
}

async function cleanDatabase() {
  await prisma.fileLocation.deleteMany();
  await prisma.scanRoot.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.fileHash.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.scanArtifact.deleteMany();
  await prisma.root.deleteMany();
  await prisma.source.deleteMany();
}
