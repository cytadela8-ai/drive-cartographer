import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppShell } from "./components/AppShell";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <AppShell />
  </StrictMode>,
);
