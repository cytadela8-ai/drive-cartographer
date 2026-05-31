import { createStaticFileHandler, hasProductionFrontend } from "./staticFiles";

type FetchHandler = (request: Request) => Promise<Response>;

export type WebFetchHandlerOptions = {
  apiFetch: FetchHandler;
  staticDir: string | null;
};

export function createWebFetchHandler(options: WebFetchHandlerOptions): FetchHandler {
  const staticFetch = options.staticDir === null
    ? null
    : createStaticFileHandler(options.staticDir);

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      return options.apiFetch(request);
    }
    if (staticFetch === null) {
      return options.apiFetch(request);
    }
    return staticFetch(request);
  };
}

export async function productionStaticDir(distDir: string): Promise<string | null> {
  return await hasProductionFrontend(distDir) ? distDir : null;
}
