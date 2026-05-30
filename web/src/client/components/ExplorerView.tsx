import { useVirtualizer } from "@tanstack/react-virtual";
import { FolderSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { explorerApi, type RootOption, type ScanOption, type SourceOption } from "../api";
import type { DirectoryChild } from "../../server/explorer";
import { FileDetailDrawer } from "./FileDetailDrawer";

export type ExplorerApi = {
  loadSources: () => Promise<SourceOption[]>;
  loadRoots: (sourceId: string) => Promise<RootOption[]>;
  loadScans: (rootId: string) => Promise<ScanOption[]>;
  loadChildren: (input: {
    scanId: string;
    rootId: string;
    parentRelativePath: string;
    includePrevious: boolean;
  }) => Promise<DirectoryChild[]>;
  loadDuplicateCounts: (input: {
    currentScanId: string;
    hashIds: string[];
  }) => Promise<Map<string, number>>;
  loadHashLocations: (input: {
    currentScanId: string;
    hashId: string;
    includeHistory: boolean;
  }) => Promise<DirectoryChild[]>;
};

type ExplorerViewProps = {
  api?: ExplorerApi;
};

export function ExplorerView({ api = explorerApi }: ExplorerViewProps) {
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [roots, setRoots] = useState<RootOption[]>([]);
  const [scans, setScans] = useState<ScanOption[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [rootId, setRootId] = useState("");
  const [scanId, setScanId] = useState("");
  const [includePrevious, setIncludePrevious] = useState(false);
  const [children, setChildren] = useState<DirectoryChild[]>([]);
  const [duplicateCounts, setDuplicateCounts] = useState(new Map<string, number>());
  const [drawerRows, setDrawerRows] = useState<DirectoryChild[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api.loadSources().then((loadedSources) => {
      setSources(loadedSources);
      setSourceId(loadedSources[0]?.id ?? "");
    });
  }, [api]);

  useEffect(() => {
    if (sourceId === "") {
      return;
    }
    void api.loadRoots(sourceId).then((loadedRoots) => {
      setRoots(loadedRoots);
      setRootId(loadedRoots[0]?.id ?? "");
    });
  }, [api, sourceId]);

  useEffect(() => {
    if (rootId === "") {
      return;
    }
    void api.loadScans(rootId).then((loadedScans) => {
      setScans(loadedScans);
      setScanId(loadedScans[0]?.id ?? "");
    });
  }, [api, rootId]);

  useEffect(() => {
    if (scanId === "" || rootId === "") {
      return;
    }
    void api
      .loadChildren({
        scanId,
        rootId,
        parentRelativePath: "",
        includePrevious,
      })
      .then(setChildren);
  }, [api, includePrevious, rootId, scanId]);

  useEffect(() => {
    if (scanId === "" || children.length === 0) {
      setDuplicateCounts(new Map());
      return;
    }
    const hashIds = [...new Set(children.map((child) => child.hashId))];
    void api.loadDuplicateCounts({ currentScanId: scanId, hashIds }).then(setDuplicateCounts);
  }, [api, children, scanId]);

  const virtualizer = useVirtualizer({
    count: children.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });
  const virtualRows = useMemo(() => virtualizer.getVirtualItems(), [virtualizer]);
  const renderedRows = virtualRows.length > 0 ? virtualRows : fallbackRows(children.length);

  return (
    <section className="panel explorer-panel">
      <div className="panel-header">
        <div>
          <h1>Explorer</h1>
          <p>Browse a scan root and inspect duplicates.</p>
        </div>
        <FolderSearch aria-hidden="true" size={30} />
      </div>

      <div className="controls">
        <SelectField label="Source" onChange={setSourceId} options={sources} value={sourceId} />
        <SelectField label="Root" onChange={setRootId} options={roots} value={rootId} />
        <SelectField label="Scan" onChange={setScanId} options={scans} value={scanId} />
        <label className="toggle">
          <input
            checked={includePrevious}
            onChange={(event) => setIncludePrevious(event.target.checked)}
            type="checkbox"
          />
          Show previous entries
        </label>
      </div>

      <div className="tree" ref={parentRef}>
        <div style={{ height: `${Math.max(children.length * 36, 36)}px`, position: "relative" }}>
          {renderedRows.map((virtualRow) => {
            const child = children[virtualRow.index];
            if (child === undefined) {
              return null;
            }
            return (
              <button
                className={`tree-row ${child.presence}`}
                key={child.id}
                onClick={() => {
                  void api
                    .loadHashLocations({
                      currentScanId: scanId,
                      hashId: child.hashId,
                      includeHistory: includePrevious,
                    })
                    .then(setDrawerRows);
                }}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
                type="button"
              >
                <span>{child.basename}</span>
                <span className="duplicate-count">{duplicateCounts.get(child.hashId) ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <FileDetailDrawer
        locations={drawerRows}
        onClose={() => setDrawerRows([])}
        open={drawerRows.length > 0}
      />
    </section>
  );
}

type SelectOption = {
  id: string;
  label?: string;
  name?: string;
};

type SelectFieldProps<T extends SelectOption> = {
  label: string;
  onChange: (value: string) => void;
  options: T[];
  value: string;
};

function SelectField<T extends SelectOption>({
  label,
  onChange,
  options,
  value,
}: SelectFieldProps<T>) {
  return (
    <label className="field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value} aria-label={label}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label ?? option.name ?? option.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function fallbackRows(count: number) {
  const visibleCount = Math.min(count, 80);
  return Array.from({ length: visibleCount }, (_, index) => ({
    index,
    start: index * 36,
  }));
}
