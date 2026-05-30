import { Compass, Database, FolderTree } from "lucide-react";
import { useState } from "react";

import { routes } from "../routes";

const icons = {
  imports: Database,
  scans: Compass,
  explorer: FolderTree,
};

export function AppShell() {
  const [activeRoute, setActiveRoute] = useState<(typeof routes)[number]["id"]>("explorer");
  const route = routes.find((candidate) => candidate.id === activeRoute) ?? routes[2];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Drive Cartographer</div>
        <nav className="nav-tabs" aria-label="Primary">
          {routes.map((item) => {
            const Icon = icons[item.id];
            return (
              <button
                className={item.id === activeRoute ? "nav-tab active" : "nav-tab"}
                key={item.id}
                onClick={() => setActiveRoute(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="workspace">{route.element}</section>
    </main>
  );
}
