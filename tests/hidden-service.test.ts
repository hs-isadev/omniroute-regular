import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("hidden Windows launcher waits for Node and propagates failure", { skip: process.platform !== "win32", timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "omni hidden launcher "));
  const script = join(root, "fake daemon.cjs"), marker = join(root, "completed.txt");
  try {
    await writeFile(script, `setTimeout(() => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'completed'); process.exit(7); }, 300);`);
    const status = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "wscript.exe"), ["//B", "//Nologo", fileURLToPath(new URL("../installers/windows/dist/daemon-hidden.vbs", import.meta.url)), process.execPath, script], { windowsHide: true, stdio: "ignore" });
      child.once("error", reject); child.once("close", resolve);
    });
    assert.equal(status, 7);
    assert.equal(await readFile(marker, "utf8"), "completed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("startup task keeps interactive-user DPAPI and restart supervision without a console executable", async () => {
  const source = await readFile(new URL("../installers/windows/service-task.ps1", import.meta.url), "utf8");
  assert.match(source, /wscript\.exe/);
  assert.match(source, /daemon-hidden\.vbs/);
  assert.match(source, /InteractiveToken/);
  assert.match(source, /LeastPrivilege/);
  assert.match(source, /RestartOnFailure/);
  const launcher = await readFile(new URL("../installers/windows/dist/daemon-hidden.vbs", import.meta.url), "utf8");
  assert.match(launcher, /shell\.Run\(command, 0, True\)/);
  assert.match(launcher, /WScript\.Quit result/);
});
