import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import viteConfig from "../../vite.config";
import { createStaticFileHandler } from "../../src/server/staticFiles";
import { createWebFetchHandler } from "../../src/server/webApp";

describe("development server configuration", () => {
  it("proxies API requests from Vite to the local Bun server", () => {
    expect(viteConfig.server?.proxy?.["/api"]).toMatchObject({
      changeOrigin: true,
      target: process.env["VITE_API_TARGET"] ?? "http://localhost:3000",
    });
  });
});

describe("production static file serving", () => {
  it("serves built assets and falls back to index for SPA routes", async () => {
    const distDir = await mkdtemp(join(tmpdir(), "drive-cartographer-dist-"));
    await mkdir(join(distDir, "assets"));
    await writeFile(join(distDir, "index.html"), "<html><main>app shell</main></html>");
    await writeFile(join(distDir, "assets", "app.js"), "console.log('app');");
    const handler = createStaticFileHandler(distDir);

    const index = await handler(new Request("http://local/"));
    const asset = await handler(new Request("http://local/assets/app.js"));
    const route = await handler(new Request("http://local/explorer/current"));
    const missingAsset = await handler(new Request("http://local/assets/missing.js"));

    await expect(index.text()).resolves.toContain("app shell");
    await expect(asset.text()).resolves.toContain("console.log");
    await expect(route.text()).resolves.toContain("app shell");
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(missingAsset.status).toBe(404);
  });

  it("routes API requests before production frontend fallback", async () => {
    const distDir = await mkdtemp(join(tmpdir(), "drive-cartographer-dist-"));
    await writeFile(join(distDir, "index.html"), "<html><main>app shell</main></html>");
    const handler = createWebFetchHandler({
      apiFetch: async () => Response.json({ source: "api" }),
      staticDir: distDir,
    });

    const api = await handler(new Request("http://local/api/sources"));
    const route = await handler(new Request("http://local/explorer/current"));

    await expect(api.json()).resolves.toEqual({ source: "api" });
    await expect(route.text()).resolves.toContain("app shell");
  });
});
