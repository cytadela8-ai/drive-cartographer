// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ImportsView,
  type ImportsApi,
} from "../../src/client/components/ImportsView";

describe("ImportsView", () => {
  it("loads import jobs and uploads the selected CSV", async () => {
    const api = createApi();
    render(<ImportsView api={api} />);

    expect(await screen.findByText("failed.csv")).toBeInTheDocument();

    const file = new File(["schema_version\n"], "scan.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Upload CSV"), {
      target: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(api.uploadArtifact).toHaveBeenCalledWith(file);
    });
    expect(api.loadImportJobs).toHaveBeenCalledTimes(2);
  });
});

function createApi(): ImportsApi {
  return {
    loadImportJobs: vi.fn(async () => [
      {
        artifactFilename: "failed.csv",
        artifactId: "artifact-1",
        attempts: 1,
        completedAt: null,
        id: "job-1",
        lastError: "bad csv",
        startedAt: null,
        status: "FAILED",
      },
    ]),
    retryImportJob: vi.fn(async () => undefined),
    uploadArtifact: vi.fn(async () => undefined),
  };
}
