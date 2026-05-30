import { ExplorerView } from "./components/ExplorerView";
import { ImportsView } from "./components/ImportsView";
import { ScansView } from "./components/ScansView";

export const routes = [
  { id: "imports", label: "Imports", element: <ImportsView /> },
  { id: "scans", label: "Scans", element: <ScansView /> },
  { id: "explorer", label: "Explorer", element: <ExplorerView /> },
] as const;
