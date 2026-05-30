import type {
  DirectoryChild,
  DuplicateCountsInput,
  HashLocationsInput,
  ListDirectoryChildrenInput,
} from "../server/explorer";

export type SourceOption = {
  id: string;
  name: string;
};

export type RootOption = {
  id: string;
  label: string;
};

export type ScanOption = {
  id: string;
  label: string;
};

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export const explorerApi = {
  loadSources: () => getJson<SourceOption[]>("/api/sources"),
  loadRoots: (sourceId: string) => getJson<RootOption[]>(`/api/sources/${sourceId}/roots`),
  loadScans: (rootId: string) => getJson<ScanOption[]>(`/api/roots/${rootId}/scans`),
  loadChildren: (input: ListDirectoryChildrenInput) => {
    const params = new URLSearchParams({
      scan_id: input.scanId,
      root_id: input.rootId,
      parent_relative_path: input.parentRelativePath,
      include_previous: String(input.includePrevious),
    });
    return getJson<DirectoryChild[]>(`/api/explorer/children?${params}`);
  },
  loadDuplicateCounts: async (input: DuplicateCountsInput) => {
    const response = await fetch("/api/explorer/duplicate-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(`duplicate count request failed with ${response.status}`);
    }
    return new Map(Object.entries((await response.json()) as Record<string, number>));
  },
  loadHashLocations: (input: HashLocationsInput) => {
    const params = new URLSearchParams({
      current_scan_id: input.currentScanId,
      include_history: String(input.includeHistory),
    });
    return getJson<DirectoryChild[]>(`/api/hashes/${input.hashId}/locations?${params}`);
  },
};
