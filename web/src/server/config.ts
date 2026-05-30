export type ServerConfig = {
  databaseUrl: string;
  artifactArchiveDir: string;
  webPort: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    databaseUrl: requireEnv(env, "DATABASE_URL"),
    artifactArchiveDir: env["ARTIFACT_ARCHIVE_DIR"] ?? "./data/artifacts",
    webPort: parsePort(env["WEB_PORT"]),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing ${key}. Set it in .env or the process environment.`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 3000;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Invalid WEB_PORT "${value}". Use an integer from 1 to 65535.`);
  }
  return parsed;
}
