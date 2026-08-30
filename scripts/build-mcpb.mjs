import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const sourceRoot = resolve("packages/integrations/claude-desktop");
const bundleRoot = resolve(sourceRoot, "dist");
const serverRoot = resolve(bundleRoot, "server");
const artifactRoot = resolve("artifacts");
const artifact = resolve(artifactRoot, "omniroute-0.1.0.mcpb");
const mcpbCli = resolve("node_modules/@anthropic-ai/mcpb/dist/cli/cli.js");

async function mcpb(...args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [mcpbCli, ...args], { stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`mcpb ${args[0]} failed with exit code ${code}`)));
  });
}

await rm(bundleRoot, { recursive: true, force: true });
await mkdir(serverRoot, { recursive: true });
await mkdir(artifactRoot, { recursive: true });
await cp(resolve(sourceRoot, "manifest.json"), resolve(bundleRoot, "manifest.json"));
await cp(resolve("packages/vault/src/dpapi-helper.ps1"), resolve(serverRoot, "dpapi-helper.ps1"));
await build({
  entryPoints: [resolve(sourceRoot, "server/index.ts")],
  outfile: resolve(serverRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
  minify: false,
  legalComments: "none",
});
await mcpb("validate", resolve(bundleRoot, "manifest.json"));
await mcpb("pack", bundleRoot, artifact);
await mcpb("info", artifact);
