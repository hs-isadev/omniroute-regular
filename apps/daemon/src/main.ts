import { createDaemonRuntime } from "./runtime.js";
import { OmniDaemonServer } from "./server.js";

const runtime = await createDaemonRuntime();
const server = new OmniDaemonServer(runtime);
await server.start();

let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await server.stop();
  process.exitCode = 0;
};

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("uncaughtException", (error) => {
  void runtime.logger.write("error", "daemon.uncaught", { error: error.message }).finally(() => { process.exitCode = 1; void stop(); });
});
process.on("unhandledRejection", (error) => {
  void runtime.logger.write("error", "daemon.unhandled_rejection", { error: error instanceof Error ? error.message : String(error) });
});
