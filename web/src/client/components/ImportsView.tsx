import { RefreshCw, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { importsApi, type ImportJobSummary } from "../api";

export type ImportsApi = {
  loadImportJobs: () => Promise<ImportJobSummary[]>;
  retryImportJob: (jobId: string) => Promise<void>;
  uploadArtifact: (file: File) => Promise<void>;
};

type ImportsViewProps = {
  api?: ImportsApi;
};

export function ImportsView({ api = importsApi }: ImportsViewProps) {
  const [jobs, setJobs] = useState<ImportJobSummary[]>([]);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function refreshJobs() {
    setJobs(await api.loadImportJobs());
  }

  useEffect(() => {
    void refreshJobs();
  }, [api]);

  async function uploadFile(file: File) {
    setIsUploading(true);
    try {
      await api.uploadArtifact(file);
      await refreshJobs();
    } finally {
      setIsUploading(false);
    }
  }

  async function retryJob(jobId: string) {
    setBusyJobId(jobId);
    try {
      await api.retryImportJob(jobId);
      await refreshJobs();
    } finally {
      setBusyJobId(null);
    }
  }

  return (
    <section className="panel">
      <h1>Imports</h1>
      <div className="toolbar">
        <label className="upload-control">
          <UploadCloud aria-hidden="true" size={18} />
          <span>{isUploading ? "Uploading" : "Upload CSV"}</span>
          <input
            accept=".csv,text/csv"
            aria-label="Upload CSV"
            disabled={isUploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                void uploadFile(file);
              }
            }}
            type="file"
          />
        </label>
      </div>
      {jobs.length === 0 ? (
        <div className="empty-state">No import jobs loaded.</div>
      ) : (
        <ul className="import-list">
          {jobs.map((job) => (
            <li className="import-row" key={job.id}>
              <div>
                <strong>{job.artifactFilename}</strong>
                <span>{job.status}</span>
                {job.lastError === null ? null : <p>{job.lastError}</p>}
              </div>
              {job.status === "FAILED" ? (
                <button
                  aria-label={`Retry ${job.artifactFilename}`}
                  className="icon-button"
                  disabled={busyJobId === job.id}
                  onClick={() => {
                    void retryJob(job.id);
                  }}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={16} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
