import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repository = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const installer = join(repository, "installers", "windows", "install.ps1");
test('source installer prunes generated package trees before recursion',async()=>{
  const source=await readFile(installer,'utf8');
  for(const name of ['.build','.cache','release','test-artifacts','artifacts'])assert.ok(source.includes("'"+name+"'"),name);
  assert.doesNotMatch(source,/Get-ChildItem -LiteralPath \$sourceRoot -Recurse -File/);
});

test("Windows installer restores the previous application and shim after post-setup failure", { skip: process.platform !== "win32", timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-installer-rollback-"));
  const app = join(root, "app"), bin = join(root, "bin"), shim = join(bin, "omni.cmd");
  try {
    await mkdir(app, { recursive: true }); await mkdir(bin, { recursive: true });
    await writeFile(join(app, "previous.txt"), "previous-version"); await writeFile(shim, "previous-shim");
    const result = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
      const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", installer, "-SourcePath", repository, "-RuntimeRoot", root, "-Apply", "-SkipVerification", "-SkipService", "-SkipPathUpdate", "-FailureInjection", "AfterSetup"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      const stderr: Buffer[] = []; child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk)); child.once("error", reject);
      child.once("close", (code) => resolve({ code: code ?? -1, stderr: Buffer.concat(stderr).toString("utf8") }));
    });
    assert.notEqual(result.code, 0, "failure injection must fail the install");
    assert.equal(await readFile(join(app, "previous.txt"), "utf8"), "previous-version");
    assert.equal(await readFile(shim, "utf8"), "previous-shim");
  } finally { await rm(root, { recursive: true, force: true }); }
});
