import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { SafeError } from "@omniroute/observability";
import type { KeyProtector } from "./index.js";

const referencePattern = /^[a-f0-9-]{36}$/;

// The vault stores only an opaque reference. The 256-bit master key lives in
// the user's unlocked Secret Service, never in argv, environment or a key file.
export class SecretServiceProtector implements KeyProtector {
  readonly scheme = "linux-secret-service-v1";

  async protect(value: Buffer): Promise<Buffer> {
    if (value.length !== 32) throw new SafeError("KEY_INVALID", "Expected a 256-bit vault key");
    const reference = randomUUID();
    await this.run(["store", "--label=OmniRoute encrypted vault", "application", "omniroute", "vault-id", reference], value.toString("base64"));
    const verified = await this.unprotect(Buffer.from(reference));
    try {
      if (!verified.equals(value)) throw new SafeError("KEYRING_FAILED", "Keyring verification failed");
    } finally { verified.fill(0); }
    return Buffer.from(reference);
  }

  async unprotect(value: Buffer): Promise<Buffer> {
    const reference = value.toString("utf8");
    if (!referencePattern.test(reference)) throw new SafeError("KEYRING_INVALID", "Invalid vault keyring reference");
    // Never create/replace a key on lookup failure: that would lose old data.
    const encoded = await this.run(["lookup", "application", "omniroute", "vault-id", reference]);
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new SafeError("KEYRING_INVALID", "Vault key is missing or invalid in the desktop keyring");
    return Buffer.from(encoded, "base64");
  }

  private async run(args: string[], input?: string): Promise<string> {
    if (process.platform !== "linux") throw new SafeError("KEYRING_UNAVAILABLE", "Secret Service requires Linux");
    return new Promise((resolve, reject) => {
      const fail = () => reject(new SafeError("KEYRING_UNAVAILABLE", "Cannot access the desktop keyring. Install secret-tool (libsecret-tools), sign in to a desktop session and unlock the keyring. No plaintext fallback is used."));
      const child = spawn("secret-tool", args, { stdio: ["pipe", "pipe", "ignore"] });
      let output = "";
      const timer = setTimeout(() => { child.kill(); fail(); }, 30_000);
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString("utf8");
        if (output.length > 4096) { child.kill(); fail(); }
      });
      child.stdin.on("error", () => { /* close/error below reports a sanitized failure */ });
      child.once("error", () => { clearTimeout(timer); fail(); });
      child.once("close", code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : fail(); });
      child.stdin.end(input ?? "");
    });
  }
}
