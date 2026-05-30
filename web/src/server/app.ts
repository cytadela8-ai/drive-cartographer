import type { PrismaClient } from "../generated/prisma/client";

import { saveUploadedArtifact } from "./artifacts";
import {
  getDuplicateCounts,
  getHashLocations,
  listDirectoryChildren,
} from "./explorer";

export type ServerAppDependencies = {
  prisma: PrismaClient;
  artifactArchiveDir: string;
};

type FetchHandler = (request: Request) => Promise<Response>;

export function createFetchHandler(dependencies: ServerAppDependencies): FetchHandler {
  return async (request) => {
    try {
      return await routeRequest(dependencies, request);
    } catch (error) {
      return json({ error: errorMessage(error) }, 500);
    }
  };
}

async function routeRequest(
  dependencies: ServerAppDependencies,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/sources") {
    return listSources(dependencies.prisma);
  }
  if (request.method === "GET" && isPath(parts, ["api", "sources", ":id", "roots"])) {
    return listRoots(dependencies.prisma, parts[2]!);
  }
  if (request.method === "GET" && isPath(parts, ["api", "roots", ":id", "scans"])) {
    return listScans(dependencies.prisma, parts[2]!);
  }
  if (request.method === "GET" && url.pathname === "/api/explorer/children") {
    return listChildren(dependencies.prisma, url);
  }
  if (request.method === "POST" && url.pathname === "/api/explorer/duplicate-counts") {
    return listDuplicateCounts(dependencies.prisma, request);
  }
  if (request.method === "GET" && isPath(parts, ["api", "hashes", ":id", "locations"])) {
    return listHashLocations(dependencies.prisma, parts[2]!, url);
  }
  if (request.method === "POST" && url.pathname === "/api/artifacts/upload") {
    return uploadArtifact(dependencies, request);
  }
  if (request.method === "GET" && url.pathname === "/api/import-jobs") {
    return listImportJobs(dependencies.prisma);
  }
  if (request.method === "POST" && isPath(parts, ["api", "import-jobs", ":id", "retry"])) {
    return retryImportJob(dependencies.prisma, parts[2]!);
  }

  return json({ error: "not found" }, 404);
}

async function listSources(prisma: PrismaClient): Promise<Response> {
  const sources = await prisma.source.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
    },
  });
  return json(sources);
}

async function listRoots(prisma: PrismaClient, sourceId: string): Promise<Response> {
  const roots = await prisma.root.findMany({
    where: {
      sourceId,
    },
    orderBy: {
      label: "asc",
    },
    select: {
      id: true,
      label: true,
    },
  });
  return json(roots);
}

async function listScans(prisma: PrismaClient, rootId: string): Promise<Response> {
  const scans = await prisma.scan.findMany({
    where: {
      scanRoots: {
        some: {
          rootId,
        },
      },
    },
    orderBy: {
      startedAt: "desc",
    },
    select: {
      id: true,
      startedAt: true,
    },
  });
  return json(scans.map((scan) => ({ id: scan.id, label: scan.startedAt.toISOString() })));
}

async function listChildren(prisma: PrismaClient, url: URL): Promise<Response> {
  const children = await listDirectoryChildren(prisma, {
    includePrevious: parseBoolean(url.searchParams.get("include_previous")),
    parentRelativePath: requiredParam(url, "parent_relative_path"),
    rootId: requiredParam(url, "root_id"),
    scanId: requiredParam(url, "scan_id"),
  });
  return json(children);
}

async function listDuplicateCounts(
  prisma: PrismaClient,
  request: Request,
): Promise<Response> {
  const body = await request.json() as { currentScanId: string; hashIds: string[] };
  const counts = await getDuplicateCounts(prisma, body);
  return json(Object.fromEntries(counts));
}

async function listHashLocations(
  prisma: PrismaClient,
  hashId: string,
  url: URL,
): Promise<Response> {
  const locations = await getHashLocations(prisma, {
    currentScanId: requiredParam(url, "current_scan_id"),
    hashId,
    includeHistory: parseBoolean(url.searchParams.get("include_history")),
  });
  return json(locations);
}

async function uploadArtifact(
  dependencies: ServerAppDependencies,
  request: Request,
): Promise<Response> {
  const formData = await request.formData();
  const artifact = formData.get("artifact");
  if (!(artifact instanceof File)) {
    return json({ error: "multipart field artifact must be a file" }, 400);
  }

  const saved = await saveUploadedArtifact(dependencies.prisma, {
    archiveDir: dependencies.artifactArchiveDir,
    file: artifact,
    submissionMethod: "admin_upload",
  });

  return json({ artifact: artifactResponse(saved) }, 201);
}

async function listImportJobs(prisma: PrismaClient): Promise<Response> {
  const jobs = await prisma.importJob.findMany({
    include: {
      artifact: {
        select: {
          originalFilename: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return json(jobs.map((job) => ({
    artifactFilename: job.artifact.originalFilename,
    artifactId: job.artifactId,
    attempts: job.attempts,
    completedAt: job.completedAt?.toISOString() ?? null,
    id: job.id,
    lastError: job.lastError,
    startedAt: job.startedAt?.toISOString() ?? null,
    status: job.status,
  })));
}

async function retryImportJob(prisma: PrismaClient, jobId: string): Promise<Response> {
  const job = await prisma.importJob.findUnique({
    where: {
      id: jobId,
    },
  });
  if (job === null) {
    return json({ error: "import job not found" }, 404);
  }
  if (job.status !== "FAILED") {
    return json({ error: "only failed import jobs can be retried" }, 409);
  }

  const retried = await prisma.$transaction(async (transaction) => {
    await transaction.scanArtifact.update({
      where: {
        id: job.artifactId,
      },
      data: {
        status: "SAVED",
      },
    });
    return transaction.importJob.update({
      where: {
        id: jobId,
      },
      data: {
        completedAt: null,
        lastError: null,
        startedAt: null,
        status: "PENDING",
      },
    });
  });

  return json({
    artifactId: retried.artifactId,
    id: retried.id,
    status: retried.status,
  });
}

function artifactResponse(artifact: {
  id: string;
  originalFilename: string;
  sha256: string;
  sizeBytes: bigint;
  status: string;
  storagePath: string;
}) {
  return {
    id: artifact.id,
    originalFilename: artifact.originalFilename,
    sha256: artifact.sha256,
    sizeBytes: artifact.sizeBytes.toString(),
    status: artifact.status,
    storagePath: artifact.storagePath,
  };
}

function isPath(parts: string[], pattern: string[]): boolean {
  if (parts.length !== pattern.length) {
    return false;
  }

  return pattern.every((expected, index) => expected.startsWith(":") || parts[index] === expected);
}

function requiredParam(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (value === null) {
    throw new Error(`missing query parameter ${key}`);
  }
  return value;
}

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
