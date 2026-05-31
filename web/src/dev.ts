import { spawn } from "node:child_process";

type ManagedProcess = {
  name: string;
  child: ReturnType<typeof spawn>;
};

const apiPort = process.env["WEB_PORT"] ?? "3000";
const env = {
  ...process.env,
  VITE_API_TARGET: process.env["VITE_API_TARGET"] ?? `http://localhost:${apiPort}`,
};
const processes: ManagedProcess[] = [
  startProcess("api", "bun", ["run", "server"], env),
  startProcess("vite", "bunx", ["vite"], env),
];

let stopping = false;

for (const managed of processes) {
  managed.child.on("error", (error) => {
    console.error(`${managed.name} process failed to start: ${error.message}`);
    if (!stopping) {
      stopping = true;
      stopProcesses();
    }
    process.exit(1);
  });
  managed.child.on("exit", (code, signal) => {
    if (stopping) {
      return;
    }
    stopping = true;
    stopProcesses();
    const exitCode = code ?? (signal === null ? 1 : 130);
    process.exit(exitCode);
  });
}

process.on("SIGINT", () => {
  stopping = true;
  stopProcesses();
});
process.on("SIGTERM", () => {
  stopping = true;
  stopProcesses();
});

function startProcess(
  name: string,
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): ManagedProcess {
  return {
    name,
    child: spawn(command, args, {
      env: environment,
      shell: false,
      stdio: "inherit",
    }),
  };
}

function stopProcesses(): void {
  for (const managed of processes) {
    if (managed.child.exitCode === null) {
      managed.child.kill("SIGTERM");
    }
  }
}
