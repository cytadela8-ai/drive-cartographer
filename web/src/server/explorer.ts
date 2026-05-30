import type { PrismaClient } from "../generated/prisma/client";

export type DirectoryChildPresence = "current" | "previous";

export type DirectoryChild = {
  id: string;
  scanId: string;
  rootId: string;
  hashId: string;
  absolutePath: string;
  relativePath: string;
  parentRelativePath: string;
  basename: string;
  presence: DirectoryChildPresence;
};

export type ListDirectoryChildrenInput = {
  scanId: string;
  rootId: string;
  parentRelativePath: string;
  includePrevious: boolean;
};

export type DuplicateCountsInput = {
  currentScanId: string;
  hashIds: string[];
};

export type HashLocationsInput = {
  currentScanId: string;
  hashId: string;
  includeHistory: boolean;
};

export async function listDirectoryChildren(
  prisma: PrismaClient,
  input: ListDirectoryChildrenInput,
): Promise<DirectoryChild[]> {
  const currentRows = await prisma.fileLocation.findMany({
    where: {
      scanId: input.scanId,
      rootId: input.rootId,
      parentRelativePath: input.parentRelativePath,
    },
    orderBy: {
      basename: "asc",
    },
  });
  const currentChildren = currentRows.map((row) => toDirectoryChild(row, "current"));

  if (!input.includePrevious) {
    return currentChildren;
  }

  const previousChildren = await listPreviousOnlyChildren(prisma, input, currentChildren);
  return [...currentChildren, ...previousChildren].sort((left, right) =>
    left.basename.localeCompare(right.basename),
  );
}

export async function getDuplicateCounts(
  prisma: PrismaClient,
  input: DuplicateCountsInput,
): Promise<Map<string, number>> {
  const counts = new Map(input.hashIds.map((hashId) => [hashId, 0]));
  if (input.hashIds.length === 0) {
    return counts;
  }

  const grouped = await prisma.fileLocation.groupBy({
    by: ["hashId"],
    where: {
      scanId: input.currentScanId,
      hashId: {
        in: input.hashIds,
      },
    },
    _count: {
      hashId: true,
    },
  });

  for (const group of grouped) {
    const count = group._count.hashId;
    counts.set(group.hashId, count > 1 ? count : 0);
  }

  return counts;
}

export async function getHashLocations(
  prisma: PrismaClient,
  input: HashLocationsInput,
): Promise<DirectoryChild[]> {
  const where = input.includeHistory
    ? { hashId: input.hashId }
    : { hashId: input.hashId, scanId: input.currentScanId };
  const rows = await prisma.fileLocation.findMany({
    where,
    orderBy: [
      {
        scan: {
          startedAt: "desc",
        },
      },
      {
        absolutePath: "asc",
      },
    ],
  });

  return rows.map((row) =>
    toDirectoryChild(row, row.scanId === input.currentScanId ? "current" : "previous"),
  );
}

async function listPreviousOnlyChildren(
  prisma: PrismaClient,
  input: ListDirectoryChildrenInput,
  currentChildren: DirectoryChild[],
): Promise<DirectoryChild[]> {
  const currentScan = await prisma.scan.findUniqueOrThrow({
    where: {
      id: input.scanId,
    },
  });
  const currentPaths = new Set(currentChildren.map((child) => child.relativePath));
  const previousRows = await prisma.fileLocation.findMany({
    where: {
      rootId: input.rootId,
      parentRelativePath: input.parentRelativePath,
      scan: {
        startedAt: {
          lt: currentScan.startedAt,
        },
      },
    },
    orderBy: [
      {
        scan: {
          startedAt: "desc",
        },
      },
      {
        basename: "asc",
      },
    ],
  });

  const previousByPath = new Map<string, DirectoryChild>();
  for (const row of previousRows) {
    if (!currentPaths.has(row.relativePath) && !previousByPath.has(row.relativePath)) {
      previousByPath.set(row.relativePath, toDirectoryChild(row, "previous"));
    }
  }

  return [...previousByPath.values()];
}

function toDirectoryChild(
  row: {
    id: string;
    scanId: string;
    rootId: string;
    hashId: string;
    absolutePath: string;
    relativePath: string;
    parentRelativePath: string;
    basename: string;
  },
  presence: DirectoryChildPresence,
): DirectoryChild {
  return {
    id: row.id,
    scanId: row.scanId,
    rootId: row.rootId,
    hashId: row.hashId,
    absolutePath: row.absolutePath,
    relativePath: row.relativePath,
    parentRelativePath: row.parentRelativePath,
    basename: row.basename,
    presence,
  };
}
