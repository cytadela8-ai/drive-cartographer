import { readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

type BunFileRuntime = {
  file: (path: string) => Blob;
};

type FetchHandler = (request: Request) => Promise<Response>;

const contentTypes = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

export function createStaticFileHandler(staticDir: string): FetchHandler {
  const root = resolve(staticDir);
  const indexPath = resolve(root, "index.html");

  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const requestedPath = resolveStaticPath(root, url.pathname);
    if (requestedPath === null) {
      return new Response("Not Found", { status: 404 });
    }

    const filePath = await existingFilePath(requestedPath);
    if (filePath !== null) {
      return fileResponse(filePath, request.method, cacheControl(filePath));
    }

    if (extname(url.pathname) !== "") {
      return new Response("Not Found", { status: 404 });
    }

    return fileResponse(indexPath, request.method, "no-cache");
  };
}

export async function hasProductionFrontend(staticDir: string): Promise<boolean> {
  return (await existingFilePath(resolve(staticDir, "index.html"))) !== null;
}

function resolveStaticPath(root: string, pathname: string): string | null {
  const decodedPathname = decodeURIComponent(pathname);
  const relativePath = decodedPathname.replace(/^\/+/, "");
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  return candidate;
}

async function existingFilePath(path: string): Promise<string | null> {
  try {
    const stats = await stat(path);
    return stats.isFile() ? path : null;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

function fileResponse(path: string, method: string, cacheHeader: string): Response {
  const headers = new Headers({
    "Cache-Control": cacheHeader,
    "Content-Type": contentType(path),
  });
  if (method === "HEAD") {
    return new Response(null, { headers });
  }
  return new Response(fileBody(path), { headers });
}

function fileBody(path: string): BodyInit {
  const bun = (globalThis as typeof globalThis & { Bun?: BunFileRuntime }).Bun;
  if (bun !== undefined) {
    return bun.file(path);
  }
  return readFileSync(path);
}

function cacheControl(path: string): string {
  return path.includes(`${sep}assets${sep}`)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function contentType(path: string): string {
  return contentTypes.get(extname(path)) ?? "application/octet-stream";
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
