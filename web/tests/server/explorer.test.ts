import { beforeEach, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/server/db";
import {
  getDuplicateCounts,
  getHashLocations,
  listDirectoryChildren,
} from "../../src/server/explorer";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);

describe("explorer queries", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lists current immediate children for one scan root", async () => {
    const data = await seedExplorerData();

    const children = await listDirectoryChildren(prisma, {
      scanId: data.currentScanId,
      rootId: data.rootId,
      parentRelativePath: "",
      includePrevious: false,
    });

    expect(children.map((child) => child.relativePath).sort()).toEqual([
      "dup-a.txt",
      "keep.txt",
    ]);
    expect(children.every((child) => child.presence === "current")).toBe(true);
  });

  it("includes previous-only entries when history overlay is enabled", async () => {
    const data = await seedExplorerData();

    const children = await listDirectoryChildren(prisma, {
      scanId: data.currentScanId,
      rootId: data.rootId,
      parentRelativePath: "",
      includePrevious: true,
    });

    expect(children.map((child) => child.relativePath).sort()).toEqual([
      "dup-a.txt",
      "keep.txt",
      "old-only.txt",
    ]);
    expect(children.find((child) => child.relativePath === "old-only.txt")?.presence).toBe(
      "previous",
    );
  });

  it("counts duplicate current locations for visible hashes", async () => {
    const data = await seedExplorerData();

    const counts = await getDuplicateCounts(prisma, {
      currentScanId: data.currentScanId,
      hashIds: [data.hashAId, data.hashBId],
    });

    expect(counts.get(data.hashAId)).toBe(2);
    expect(counts.get(data.hashBId)).toBe(0);
  });

  it("returns hash locations with history only when requested", async () => {
    const data = await seedExplorerData();

    const current = await getHashLocations(prisma, {
      currentScanId: data.currentScanId,
      hashId: data.hashAId,
      includeHistory: false,
    });
    const historical = await getHashLocations(prisma, {
      currentScanId: data.currentScanId,
      hashId: data.hashAId,
      includeHistory: true,
    });

    expect(current).toHaveLength(2);
    expect(historical).toHaveLength(3);
  });
});

async function seedExplorerData() {
  const source = await prisma.source.create({
    data: {
      name: "explorer-source",
      hostname: "host",
      os: "linux",
    },
  });
  const root = await prisma.root.create({
    data: {
      sourceId: source.id,
      label: "main",
      absolutePath: "/data/root",
    },
  });
  const artifact = await prisma.scanArtifact.create({
    data: {
      storagePath: "/tmp/explorer.csv",
      originalFilename: "explorer.csv",
      sizeBytes: 1,
      sha256: "explorer-artifact",
      submissionMethod: "test",
      status: "IMPORTED",
    },
  });
  const oldScan = await createScan(source.id, artifact.id, new Date("2026-05-29T00:00:00Z"));
  const currentScan = await createScan(source.id, artifact.id, new Date("2026-05-30T00:00:00Z"));
  const hashA = await createHash("hash-a", 5);
  const hashB = await createHash("hash-b", 7);

  await prisma.scanRoot.createMany({
    data: [
      { scanId: oldScan.id, rootId: root.id, rootPathSeen: "/data/root" },
      { scanId: currentScan.id, rootId: root.id, rootPathSeen: "/data/root" },
    ],
  });
  await createLocation(oldScan.id, root.id, hashA.id, "keep.txt");
  await createLocation(oldScan.id, root.id, hashB.id, "old-only.txt");
  await createLocation(currentScan.id, root.id, hashA.id, "keep.txt");
  await createLocation(currentScan.id, root.id, hashA.id, "dup-a.txt");

  return {
    currentScanId: currentScan.id,
    rootId: root.id,
    hashAId: hashA.id,
    hashBId: hashB.id,
  };
}

async function createScan(sourceId: string, artifactId: string, startedAt: Date) {
  return prisma.scan.create({
    data: {
      sourceId,
      artifactId,
      scannerVersion: "0.1.0",
      startedAt,
      finishedAt: startedAt,
      importStatus: "COMPLETED",
    },
  });
}

async function createHash(sha256: string, sizeBytes: number) {
  return prisma.fileHash.create({
    data: {
      sha256,
      sizeBytes,
      mimeType: "text/plain",
    },
  });
}

async function createLocation(
  scanId: string,
  rootId: string,
  hashId: string,
  relativePath: string,
) {
  return prisma.fileLocation.create({
    data: {
      scanId,
      rootId,
      hashId,
      absolutePath: `/data/root/${relativePath}`,
      relativePath,
      parentRelativePath: "",
      basename: relativePath,
      modifiedAtFs: new Date("2026-05-30T00:00:00Z"),
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
