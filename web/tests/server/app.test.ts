import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createFetchHandler } from "../../src/server/app";
import { createPrismaClient } from "../../src/server/db";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);

describe("server HTTP app", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("lists sources, roots, and scans for explorer controls", async () => {
    const seeded = await seedScan();
    const handler = createFetchHandler({
      prisma,
      artifactArchiveDir: await mkdtemp(join(tmpdir(), "drive-cartographer-")),
    });

    const sources = await jsonRequest(handler, "http://local/api/sources");
    const roots = await jsonRequest(handler, `http://local/api/sources/${seeded.sourceId}/roots`);
    const scans = await jsonRequest(handler, `http://local/api/roots/${seeded.rootId}/scans`);

    expect(sources).toEqual([{ id: seeded.sourceId, name: "Laptop" }]);
    expect(roots).toEqual([{ id: seeded.rootId, label: "Main" }]);
    expect(scans).toEqual([{ id: seeded.scanId, label: "2026-05-30T10:00:00.000Z" }]);
  });

  it("archives uploaded artifacts and creates a pending import job", async () => {
    const archiveDir = await mkdtemp(join(tmpdir(), "drive-cartographer-"));
    const handler = createFetchHandler({ prisma, artifactArchiveDir: archiveDir });
    const formData = new FormData();
    formData.set("artifact", new File(["a,b\n1,2\n"], "scan.csv", { type: "text/csv" }));

    const response = await handler(
      new Request("http://local/api/artifacts/upload", {
        body: formData,
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { artifact: { storagePath: string } };
    expect(body.artifact.storagePath.startsWith(archiveDir)).toBe(true);
    expect(existsSync(body.artifact.storagePath)).toBe(true);
    await expect(prisma.importJob.count({ where: { status: "PENDING" } })).resolves.toBe(1);
  });

  it("lists import jobs and retries a failed job in place", async () => {
    const artifact = await prisma.scanArtifact.create({
      data: {
        storagePath: "/tmp/failed.csv",
        originalFilename: "failed.csv",
        sizeBytes: 10,
        sha256: "failed-artifact",
        submissionMethod: "admin_upload",
        status: "FAILED",
        importJobs: {
          create: {
            attempts: 1,
            completedAt: new Date("2026-05-30T10:00:00Z"),
            lastError: "bad csv",
            startedAt: new Date("2026-05-30T09:59:00Z"),
            status: "FAILED",
          },
        },
      },
      include: {
        importJobs: true,
      },
    });
    const job = artifact.importJobs[0]!;
    const handler = createFetchHandler({
      prisma,
      artifactArchiveDir: await mkdtemp(join(tmpdir(), "drive-cartographer-")),
    });

    const jobsBefore = await jsonRequest(handler, "http://local/api/import-jobs");
    const retryResponse = await handler(
      new Request(`http://local/api/import-jobs/${job.id}/retry`, { method: "POST" }),
    );
    const retried = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    const savedArtifact = await prisma.scanArtifact.findUniqueOrThrow({
      where: { id: artifact.id },
    });

    expect(jobsBefore).toMatchObject([
      {
        artifactId: artifact.id,
        artifactFilename: "failed.csv",
        id: job.id,
        lastError: "bad csv",
        status: "FAILED",
      },
    ]);
    expect(retryResponse.status).toBe(200);
    expect(retried.status).toBe("PENDING");
    expect(retried.lastError).toBeNull();
    expect(retried.startedAt).toBeNull();
    expect(retried.completedAt).toBeNull();
    expect(savedArtifact.status).toBe("SAVED");
  });
});

async function jsonRequest(handler: (request: Request) => Promise<Response>, url: string) {
  const response = await handler(new Request(url));
  expect(response.status).toBe(200);
  return response.json();
}

async function seedScan() {
  const source = await prisma.source.create({
    data: {
      hostname: "laptop.local",
      name: "Laptop",
      os: "linux",
    },
  });
  const root = await prisma.root.create({
    data: {
      absolutePath: "/data",
      label: "Main",
      sourceId: source.id,
    },
  });
  const artifact = await prisma.scanArtifact.create({
    data: {
      originalFilename: "scan.csv",
      sha256: "scan-artifact",
      sizeBytes: 1,
      status: "IMPORTED",
      storagePath: "/tmp/scan.csv",
      submissionMethod: "test",
    },
  });
  const scan = await prisma.scan.create({
    data: {
      artifactId: artifact.id,
      finishedAt: new Date("2026-05-30T10:01:00Z"),
      importStatus: "COMPLETED",
      scannerVersion: "0.1.0",
      sourceId: source.id,
      startedAt: new Date("2026-05-30T10:00:00Z"),
    },
  });
  await prisma.scanRoot.create({
    data: {
      rootId: root.id,
      rootPathSeen: "/data",
      scanId: scan.id,
    },
  });

  return {
    rootId: root.id,
    scanId: scan.id,
    sourceId: source.id,
  };
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
