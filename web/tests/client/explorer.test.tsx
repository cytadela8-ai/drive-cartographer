// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExplorerView, type ExplorerApi } from "../../src/client/components/ExplorerView";

const source = { id: "source-1", name: "Laptop" };
const root = { id: "root-1", label: "Photos" };
const scan = { id: "scan-1", label: "2026-05-30" };

describe("ExplorerView", () => {
  it("renders source, root, and scan selectors", async () => {
    render(<ExplorerView api={createApi()} />);

    expect(await screen.findByLabelText("Source")).toBeInTheDocument();
    expect(screen.getByLabelText("Root")).toBeInTheDocument();
    expect(screen.getByLabelText("Scan")).toBeInTheDocument();
  });

  it("requests history overlay when the toggle is enabled", async () => {
    const api = createApi();
    render(<ExplorerView api={api} />);

    await screen.findByText("keep.txt");
    fireEvent.click(screen.getByLabelText("Show previous entries"));

    await waitFor(() => {
      expect(api.loadChildren).toHaveBeenLastCalledWith({
        scanId: "scan-1",
        rootId: "root-1",
        parentRelativePath: "",
        includePrevious: true,
      });
    });
  });

  it("does not mount every row for a large directory", async () => {
    const api = createApi({
      children: Array.from({ length: 500 }, (_, index) =>
        child(`row-${index}`, `hash-${index}`, `file-${index}.txt`),
      ),
    });

    render(<ExplorerView api={api} />);

    expect(await screen.findByText("file-0.txt")).toBeInTheDocument();
    expect(screen.queryByText("file-499.txt")).not.toBeInTheDocument();
  });
});

function createApi(overrides: Partial<ExplorerApiFixtures> = {}): ExplorerApi {
  const children =
    overrides.children ?? [
      child("row-1", "hash-1", "keep.txt"),
    ];

  return {
    loadSources: vi.fn(async () => [source]),
    loadRoots: vi.fn(async () => [root]),
    loadScans: vi.fn(async () => [scan]),
    loadChildren: vi.fn(async () => children),
    loadDuplicateCounts: vi.fn(async () => new Map([["hash-1", 2]])),
    loadHashLocations: vi.fn(async () => []),
  };
}

type ExplorerApiFixtures = {
  children: Awaited<ReturnType<ExplorerApi["loadChildren"]>>;
};

function child(id: string, hashId: string, relativePath: string) {
  return {
    id,
    scanId: "scan-1",
    rootId: "root-1",
    hashId,
    absolutePath: `/data/root/${relativePath}`,
    relativePath,
    parentRelativePath: "",
    basename: relativePath,
    presence: "current" as const,
  };
}
