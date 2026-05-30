import { createFetchHandler } from "./app";
import { loadConfig } from "./config";
import { createPrismaClient } from "./db";

type BunRuntime = {
  serve: (options: {
    fetch: (request: Request) => Response | Promise<Response>;
    port: number;
  }) => { url: URL };
};

declare const Bun: BunRuntime | undefined;
const bunRuntime = typeof Bun === "undefined" ? undefined : Bun;

export { saveArtifact } from "./artifacts";
export { createFetchHandler } from "./app";
export { loadConfig } from "./config";
export { createPrismaClient } from "./db";
export { importArtifact } from "./importer";
export { runNextImportJob } from "./worker";

if ((import.meta as ImportMeta & { main?: boolean }).main === true) {
  if (bunRuntime === undefined) {
    throw new Error("Bun runtime is required to start the API server.");
  }

  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);
  const fetch = createFetchHandler({
    artifactArchiveDir: config.artifactArchiveDir,
    prisma,
  });
  const server = bunRuntime.serve({ fetch, port: config.webPort });

  console.log(`Drive Cartographer API listening on ${server.url.toString()}`);
}
