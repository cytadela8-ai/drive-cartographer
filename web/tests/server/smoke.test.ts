import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";

import { createFetchHandler } from "../../src/server/app";
import { createPrismaClient } from "../../src/server/db";
import { importArtifact } from "../../src/server/importer";
import { claimNextImportJob } from "../../src/server/worker";

const execFileAsync = promisify(execFile);
const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgresql://drive:drive@localhost:5432/drive_cartographer";
const prisma = createPrismaClient(databaseUrl);

describe("scanner to explorer smoke", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("imports scanner CSV output through upload and exposes explorer duplicates", async () => {
    const workspace = await createScannerWorkspace();
    const archiveDir = await mkdtemp(join(tmpdir(), "drive-cartographer-artifacts-"));
    const handler = createFetchHandler({ prisma, artifactArchiveDir: archiveDir });

    await runScanner(workspace.configPath, workspace.csvPath);
    const uploadResponse = await uploadScannerCsv(handler, workspace.csvPath);
    const claimed = await claimNextImportJob(prisma);
    expect(claimed).not.toBeNull();
    await importArtifact(prisma, claimed!.artifactId, { claimedJobId: claimed!.jobId });

    const source = await jsonRequest<{ id: string; name: string }[]>(
      handler,
      "http://local/api/sources",
    );
    const roots = await jsonRequest<{ id: string; label: string }[]>(
      handler,
      `http://local/api/sources/${source[0]!.id}/roots`,
    );
    const scans = await jsonRequest<{ id: string; label: string }[]>(
      handler,
      `http://local/api/roots/${roots[0]!.id}/scans`,
    );
    const children = await jsonRequest<ExplorerChild[]>(
      handler,
      childrenUrl(roots[0]!.id, scans[0]!.id),
    );
    const duplicateCounts = await duplicateCountsRequest(handler, scans[0]!.id, children);
    const locations = await jsonRequest<ExplorerChild[]>(
      handler,
      hashLocationsUrl(scans[0]!.id, children[0]!.hashId),
    );

    expect(uploadResponse.status).toBe(201);
    expect(source).toMatchObject([{ name: "smoke-source" }]);
    expect(roots).toMatchObject([{ label: "main" }]);
    expect(children.map((child) => child.basename).sort()).toEqual(["alpha.txt", "beta.txt"]);
    expect(new Set(Object.values(duplicateCounts))).toEqual(new Set([2]));
    expect(locations.map((location) => location.basename).sort()).toEqual([
      "alpha.txt",
      "beta.txt",
    ]);
  });
});

type ScannerWorkspace = {
  configPath: string;
  csvPath: string;
};

type ExplorerChild = {
  basename: string;
  hashId: string;
};

async function createScannerWorkspace(): Promise<ScannerWorkspace> {
  const workspace = await mkdtemp(join(tmpdir(), "drive-cartographer-smoke-"));
  const rootPath = join(workspace, "root");
  const configPath = join(workspace, "scanner.toml");
  const csvPath = join(workspace, "scan.csv");
  await mkdir(rootPath);
  await writeFile(join(rootPath, "alpha.txt"), "duplicate payload\n");
  await writeFile(join(rootPath, "beta.txt"), "duplicate payload\n");
  await writeFile(
    configPath,
    [
      'source_name = "smoke-source"',
      `cache_path = ${JSON.stringify(join(workspace, "cache.sqlite"))}`,
      "",
      "[[roots]]",
      'label = "main"',
      `path = ${JSON.stringify(rootPath)}`,
      "",
    ].join("\n"),
  );

  return { configPath, csvPath };
}

async function runScanner(configPath: string, csvPath: string): Promise<void> {
  await execFileAsync("cargo", [
    "run",
    "--quiet",
    "--manifest-path",
    resolve("../scanner/Cargo.toml"),
    "--",
    "scan",
    "--config",
    configPath,
    "--output",
    csvPath,
  ]);
}

async function uploadScannerCsv(
  handler: (request: Request) => Promise<Response>,
  csvPath: string,
): Promise<Response> {
  const bytes = await readFile(csvPath);
  const formData = new FormData();
  formData.set("artifact", new File([bytes], "smoke-scan.csv", { type: "text/csv" }));

  return handler(
    new Request("http://local/api/artifacts/upload", {
      body: formData,
      method: "POST",
    }),
  );
}

async function jsonRequest<T>(
  handler: (request: Request) => Promise<Response>,
  url: string,
): Promise<T> {
  const response = await handler(new Request(url));
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function duplicateCountsRequest(
  handler: (request: Request) => Promise<Response>,
  currentScanId: string,
  children: ExplorerChild[],
): Promise<Record<string, number>> {
  const response = await handler(
    new Request("http://local/api/explorer/duplicate-counts", {
      body: JSON.stringify({
        currentScanId,
        hashIds: children.map((child) => child.hashId),
      }),
      method: "POST",
    }),
  );

  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, number>>;
}

function childrenUrl(rootId: string, scanId: string): string {
  const url = new URL("http://local/api/explorer/children");
  url.searchParams.set("root_id", rootId);
  url.searchParams.set("scan_id", scanId);
  url.searchParams.set("parent_relative_path", "");
  return url.toString();
}

function hashLocationsUrl(scanId: string, hashId: string): string {
  const url = new URL(`http://local/api/hashes/${hashId}/locations`);
  url.searchParams.set("current_scan_id", scanId);
  return url.toString();
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
