import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { atomicWriteFile, ensureRuntimeDirectories, EXTRA_FREE_PROVIDERS, getRuntimePaths, type RuntimePaths } from "@omniroute/config";
import { globalRedactor, SafeError } from "@omniroute/observability";
import { SecretServiceProtector } from "./secret-service.js";
export { SecretServiceProtector } from "./secret-service.js";

export function defaultKeyProtector(): KeyProtector {
  return process.platform === "linux" ? new SecretServiceProtector() : new DpapiCurrentUserProtector();
}

export interface KeyProtector {
  readonly scheme: string;
  protect(value: Buffer): Promise<Buffer>;
  unprotect(value: Buffer): Promise<Buffer>;
}

export class DpapiCurrentUserProtector implements KeyProtector {
  readonly scheme = "dpapi-current-user";

  async protect(value: Buffer): Promise<Buffer> {
    return this.run("protect", value);
  }

  async unprotect(value: Buffer): Promise<Buffer> {
    return this.run("unprotect", value);
  }

  private async run(operation: "protect" | "unprotect", value: Buffer): Promise<Buffer> {
    if (process.platform !== "win32") throw new SafeError("DPAPI_UNAVAILABLE", "DPAPI current-user protection requires Windows");
    const helper = fileURLToPath(new URL("./dpapi-helper.ps1", import.meta.url));
    return new Promise<Buffer>((resolvePromise, reject) => {
      const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", helper, "-Operation", operation], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (code) => {
        if (code !== 0) {
          reject(new SafeError("DPAPI_FAILED", `DPAPI ${operation} failed: ${Buffer.concat(stderr).toString("utf8")}`));
          return;
        }
        try { resolvePromise(Buffer.from(Buffer.concat(stdout).toString("utf8").trim(), "base64")); }
        catch { reject(new SafeError("DPAPI_FAILED", `DPAPI ${operation} returned invalid data`)); }
      });
      child.stdin.end(value.toString("base64"));
    });
  }
}

export class InMemoryKeyProtector implements KeyProtector {
  readonly scheme = "test-memory-protector";
  constructor(private readonly wrappingKey = randomBytes(32)) {}
  async protect(value: Buffer): Promise<Buffer> { return xor(value, this.wrappingKey); }
  async unprotect(value: Buffer): Promise<Buffer> { return xor(value, this.wrappingKey); }
}

function xor(value: Buffer, key: Buffer): Buffer {
  const output = Buffer.allocUnsafe(value.length);
  for (let index = 0; index < value.length; index += 1) output[index] = value[index]! ^ key[index % key.length]!;
  return output;
}

interface EncryptedRecord {
  version: 1;
  algorithm: "aes-256-gcm";
  nonce: string;
  ciphertext: string;
  tag: string;
  metadata: {
    providerId: string;
    fieldNames: string[];
    createdAt: string;
  };
  fingerprint: string;
}

interface VaultData {
  version: 1;
  wrappedMasterKey: { scheme: string; data: string };
  records: Record<string, EncryptedRecord>;
}

export interface VaultRecordSummary {
  providerId: string;
  fieldNames: string[];
  fingerprint: string;
  createdAt: string;
}

function aad(metadata: EncryptedRecord["metadata"]): Buffer {
  return Buffer.from(JSON.stringify({ version: 1, ...metadata, fieldNames: [...metadata.fieldNames].sort() }), "utf8");
}

function fingerprint(values: Record<string, string>): string {
  const digest = createHash("sha256");
  for (const [key, value] of Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) digest.update(`${key}\u0000${value}\u0000`, "utf8");
  return digest.digest("hex").slice(0, 12);
}

export class SecretVault {
  readonly #protector: KeyProtector;
  #data: VaultData;
  #masterKey: Buffer;

  private constructor(protector: KeyProtector, data: VaultData, masterKey: Buffer) {
    this.#protector = protector;
    this.#data = data;
    this.#masterKey = masterKey;
  }

  static async create(protector: KeyProtector = defaultKeyProtector()): Promise<SecretVault> {
    const masterKey = randomBytes(32);
    const wrapped = await protector.protect(masterKey);
    return new SecretVault(protector, { version: 1, wrappedMasterKey: { scheme: protector.scheme, data: wrapped.toString("base64") }, records: {} }, masterKey);
  }

  static async load(path: string, protector: KeyProtector = defaultKeyProtector()): Promise<SecretVault> {
    let data: VaultData;
    try { data = JSON.parse(await readFile(path, "utf8")) as VaultData; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return SecretVault.create(protector);
      throw new SafeError("VAULT_INVALID", "The encrypted vault cannot be parsed");
    }
    if (data.version !== 1 || data.wrappedMasterKey?.scheme !== protector.scheme || typeof data.wrappedMasterKey.data !== "string" || typeof data.records !== "object") throw new SafeError("VAULT_INVALID", "The encrypted vault format or key protector is unsupported");
    const masterKey = await protector.unprotect(Buffer.from(data.wrappedMasterKey.data, "base64"));
    if (masterKey.length !== 32) throw new SafeError("VAULT_INVALID", "The protected vault master key is invalid");
    return new SecretVault(protector, data, masterKey);
  }

  clone(): SecretVault {
    return new SecretVault(this.#protector, JSON.parse(JSON.stringify(this.#data)) as VaultData, Buffer.from(this.#masterKey));
  }

  set(providerId: string, values: Record<string, string>): VaultRecordSummary {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(providerId)) throw new SafeError("VAULT_PROVIDER_INVALID", "Vault provider ID is invalid", 400);
    const entries = Object.entries(values);
    if (entries.length === 0 || entries.some(([key, value]) => !key || !value || /[\r\n\0]/.test(value))) throw new SafeError("VAULT_RECORD_INVALID", "Vault record fields must be non-empty single-line strings", 400);
    for (const [, value] of entries) globalRedactor.register(value);
    const metadata: EncryptedRecord["metadata"] = { providerId, fieldNames: entries.map(([key]) => key).sort(), createdAt: new Date().toISOString() };
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#masterKey, nonce);
    cipher.setAAD(aad(metadata));
    const plaintext = Buffer.from(JSON.stringify(values), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    plaintext.fill(0);
    const record: EncryptedRecord = {
      version: 1,
      algorithm: "aes-256-gcm",
      nonce: nonce.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      metadata,
      fingerprint: fingerprint(values),
    };
    this.#data.records[providerId] = record;
    return { providerId, fieldNames: metadata.fieldNames, fingerprint: record.fingerprint, createdAt: metadata.createdAt };
  }

  get(providerId: string): Record<string, string> | null {
    const record = this.#data.records[providerId];
    if (!record) return null;
    if (record.version !== 1 || record.algorithm !== "aes-256-gcm") throw new SafeError("VAULT_RECORD_INVALID", "Vault record format is unsupported");
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.#masterKey, Buffer.from(record.nonce, "base64"));
      decipher.setAAD(aad(record.metadata));
      decipher.setAuthTag(Buffer.from(record.tag, "base64"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]);
      const values = JSON.parse(plaintext.toString("utf8")) as Record<string, string>;
      plaintext.fill(0);
      for (const value of Object.values(values)) globalRedactor.register(value);
      return values;
    } catch {
      throw new SafeError("VAULT_AUTH_FAILED", `Vault record authentication failed for ${providerId}`);
    }
  }

  list(): VaultRecordSummary[] {
    return Object.values(this.#data.records).map((record) => ({ providerId: record.metadata.providerId, fieldNames: record.metadata.fieldNames, fingerprint: record.fingerprint, createdAt: record.metadata.createdAt }));
  }

  remove(providerId: string): boolean {
    if (!this.#data.records[providerId]) return false;
    delete this.#data.records[providerId];
    return true;
  }

  async save(path: string): Promise<void> {
    await atomicWriteFile(path, `${JSON.stringify(this.#data, null, 2)}\n`);
  }

  dispose(): void {
    this.#masterKey.fill(0);
    this.#masterKey = Buffer.alloc(0);
  }
}

const ORIGINAL_IMPORT_FIELDS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_ENDPOINT",
  "CUSTOM_OPENAI_BASE_URL",
  "CUSTOM_OPENAI_API_KEY",
] as const;

export const IMPORT_FIELDS = [...ORIGINAL_IMPORT_FIELDS, ...EXTRA_FREE_PROVIDERS.map((item) => item.credentialField), "CLOUDFLARE_ACCOUNT_ID"];

const FREE_TEMPLATE_FIELDS = [
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  ...EXTRA_FREE_PROVIDERS.map((item) => item.credentialField),
  "CLOUDFLARE_ACCOUNT_ID",
] as const;

const TEMPLATE_HEADER = [
  "# OmniRoute local credential import file.",
  "# This file must stay outside source repositories and synchronized folders.",
  "# Fill locally, run `omni secrets import`, then OmniRoute clears/removes it.",
];

export const CREDENTIAL_TEMPLATE = [
  ...TEMPLATE_HEADER,
  ...FREE_TEMPLATE_FIELDS.map((field) => `${field}=`),
  "",
].join("\n");

const LEGACY_CREDENTIAL_TEMPLATES = [
  [...TEMPLATE_HEADER, ...ORIGINAL_IMPORT_FIELDS.filter((field) => field !== "GEMINI_API_KEY" && field !== "GROQ_API_KEY").map((field) => `${field}=`), ""].join("\n"),
  [...TEMPLATE_HEADER, ...ORIGINAL_IMPORT_FIELDS.map((field) => `${field}=`), ""].join("\n"),
  [...TEMPLATE_HEADER, ...["OPENROUTER_API_KEY", "GEMINI_API_KEY", "GROQ_API_KEY"].map((field) => `${field}=`), ""].join("\n"),
];

export function parseCredentialImport(text: string): Record<string, string> {
  if (text.includes("\0")) throw new SafeError("IMPORT_INVALID", "Credential import contains a NUL byte", 400);
  const allowed = new Set<string>(IMPORT_FIELDS);
  const output: Record<string, string> = {};
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.endsWith("\\")) throw new SafeError("IMPORT_INVALID", `Multiline values are not allowed (line ${index + 1})`, 400);
    const separator = line.indexOf("=");
    if (separator < 1) throw new SafeError("IMPORT_INVALID", `Malformed credential line ${index + 1}`, 400);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!allowed.has(key)) throw new SafeError("IMPORT_FIELD_DENIED", `Credential field ${key} is not allowed`, 400);
    if (Object.hasOwn(output, key)) throw new SafeError("IMPORT_DUPLICATE", `Credential field ${key} is duplicated`, 400);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/[\r\n\0]/.test(value)) throw new SafeError("IMPORT_INVALID", `Credential field ${key} is not a single line`, 400);
    if (value) output[key] = value;
  }
  if (Object.keys(output).length === 0) throw new SafeError("IMPORT_EMPTY", "No non-empty credentials were found", 400);
  return output;
}

function groupCredentials(fields: Record<string, string>): Record<string, Record<string, string>> {
  const groups: Record<string, Record<string, string>> = {};
  const add = (provider: string, key: string): void => {
    if (fields[key]) (groups[provider] ??= {})[key] = fields[key]!;
  };
  add("openai", "OPENAI_API_KEY");
  add("anthropic", "ANTHROPIC_API_KEY");
  add("openrouter", "OPENROUTER_API_KEY");
  add("gemini", "GEMINI_API_KEY");
  add("groq", "GROQ_API_KEY");
  for (const profile of EXTRA_FREE_PROVIDERS) add(profile.id, profile.credentialField);
  add("cloudflare", "CLOUDFLARE_ACCOUNT_ID");
  if (groups.cloudflare && (!groups.cloudflare.CLOUDFLARE_API_TOKEN || !/^[a-f0-9]{32}$/i.test(groups.cloudflare.CLOUDFLARE_ACCOUNT_ID ?? ""))) throw new SafeError("IMPORT_INCOMPLETE", "Cloudflare token and 32-character hexadecimal account ID must be imported together", 400);
  add("azure-openai", "AZURE_OPENAI_API_KEY");
  add("azure-openai", "AZURE_OPENAI_ENDPOINT");
  add("custom-openai", "CUSTOM_OPENAI_BASE_URL");
  add("custom-openai", "CUSTOM_OPENAI_API_KEY");
  if ((groups["azure-openai"]?.AZURE_OPENAI_API_KEY && !groups["azure-openai"]?.AZURE_OPENAI_ENDPOINT) || (!groups["azure-openai"]?.AZURE_OPENAI_API_KEY && groups["azure-openai"]?.AZURE_OPENAI_ENDPOINT)) throw new SafeError("IMPORT_INCOMPLETE", "Azure OpenAI key and endpoint must be imported together", 400);
  if ((groups["custom-openai"]?.CUSTOM_OPENAI_API_KEY && !groups["custom-openai"]?.CUSTOM_OPENAI_BASE_URL) || (!groups["custom-openai"]?.CUSTOM_OPENAI_API_KEY && groups["custom-openai"]?.CUSTOM_OPENAI_BASE_URL)) throw new SafeError("IMPORT_INCOMPLETE", "Custom OpenAI key and base URL must be imported together", 400);
  return groups;
}

export interface ImportResult {
  imported: VaultRecordSummary[];
  warnings: string[];
}

export type CredentialVerifier = (providerId: string, values: Readonly<Record<string, string>>) => Promise<void>;

export async function importCredentials(options: {
  paths?: RuntimePaths;
  protector?: KeyProtector;
  verifier: CredentialVerifier;
}): Promise<ImportResult> {
  const paths = options.paths ?? getRuntimePaths();
  await ensureRuntimeDirectories(paths);
  const importPath = resolve(paths.credentialsImport);
  const warnings = await credentialLocationWarnings(importPath);
  const text = await readFile(importPath, "utf8");
  const fields = parseCredentialImport(text);
  for (const value of Object.values(fields)) globalRedactor.register(value);
  const groups = groupCredentials(fields);
  const active = await SecretVault.load(paths.vault, options.protector);
  const candidate = active.clone();
  const summaries: VaultRecordSummary[] = [];
  try {
    for (const [providerId, values] of Object.entries(groups)) {
      summaries.push(candidate.set(providerId, values));
      await options.verifier(providerId, values);
    }
    await candidate.save(paths.vault);
    await clearPlaintextImport(importPath);
    await createCredentialTemplate(paths);
    return { imported: summaries, warnings };
  } finally {
    for (const key of Object.keys(fields)) fields[key] = "";
    candidate.dispose();
    active.dispose();
  }
}

export async function createCredentialTemplate(paths = getRuntimePaths(), options: { force?: boolean } = {}): Promise<string> {
  await ensureRuntimeDirectories(paths);
  try {
    const existing = await readFile(paths.credentialsImport, "utf8");
    if (existing !== CREDENTIAL_TEMPLATE && !LEGACY_CREDENTIAL_TEMPLATES.includes(existing) && options.force !== true) {
      throw new SafeError("IMPORT_FILE_EXISTS", "Refusing to overwrite the existing local credential import file; import it or use --force explicitly", 409);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWriteFile(paths.credentialsImport, CREDENTIAL_TEMPLATE);
  await restrictFileToCurrentUser(paths.credentialsImport);
  return paths.credentialsImport;
}

export async function ensureCredentialTemplate(paths = getRuntimePaths()): Promise<string> {
  await ensureRuntimeDirectories(paths);
  try {
    await access(paths.credentialsImport);
    const existing = await readFile(paths.credentialsImport, "utf8");
    if (LEGACY_CREDENTIAL_TEMPLATES.includes(existing)) await atomicWriteFile(paths.credentialsImport, CREDENTIAL_TEMPLATE);
    await restrictFileToCurrentUser(paths.credentialsImport);
    return paths.credentialsImport;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return createCredentialTemplate(paths);
  }
}

export async function ensureLocalDaemonToken(paths = getRuntimePaths(), protector?: KeyProtector): Promise<string> {
  await ensureRuntimeDirectories(paths);
  const vault = await SecretVault.load(paths.vault, protector);
  try {
    const existing = vault.get("local-daemon");
    if (existing?.TOKEN) return existing.TOKEN;
    const token = randomBytes(32).toString("base64url");
    vault.set("local-daemon", { TOKEN: token });
    await vault.save(paths.vault);
    return token;
  } finally { vault.dispose(); }
}

async function clearPlaintextImport(path: string): Promise<void> {
  try {
    const current = await readFile(path);
    if (current.length > 0) await writeFile(path, randomBytes(current.length), { mode: 0o600 });
    await writeFile(path, "", { mode: 0o600 });
    await rm(path, { force: true });
  } catch (error) {
    throw new SafeError("IMPORT_CLEANUP_FAILED", `Credential encryption succeeded but plaintext cleanup failed: ${(error as Error).message}`);
  }
}

async function credentialLocationWarnings(path: string): Promise<string[]> {
  const warnings: string[] = [];
  const lower = path.toLowerCase();
  if (lower.includes("\\onedrive\\") || lower.includes("/onedrive/")) warnings.push("Credential import file is inside a synchronized OneDrive directory.");
  let cursor = dirname(path);
  for (let depth = 0; depth < 12; depth += 1) {
    try { await access(join(cursor, ".git")); warnings.push("Credential import file is inside a Git repository."); break; }
    catch { /* continue */ }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  warnings.push(...await credentialAclWarnings(path));
  return warnings;
}

async function credentialAclWarnings(path: string): Promise<string[]> {
  if (process.platform !== "win32") return [];
  return new Promise<string[]>((resolvePromise) => {
    const child = spawn("icacls.exe", [path], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.once("error", () => resolvePromise(["Could not inspect the credential import file ACL."]));
    child.once("close", (code) => {
      if (code !== 0) { resolvePromise(["Could not verify the credential import file ACL."]); return; }
      const acl = Buffer.concat(stdout).toString("utf8");
      const currentUser = process.env.USERNAME?.toLowerCase();
      const warnings: string[] = [];
      if (currentUser && !acl.toLowerCase().includes(currentUser)) warnings.push("Credential import ACL does not visibly grant the current Windows user.");
      if (/\b(?:Everyone|BUILTIN\\Users|Authenticated Users)\b.*\((?:F|M|W|RX|R)\)/i.test(acl)) warnings.push("Credential import ACL may grant access to other local users.");
      resolvePromise(warnings);
    });
  });
}

export async function restrictFileToCurrentUser(path: string): Promise<void> {
  if (process.platform !== "win32") return;
  if (!isAbsolute(path)) throw new SafeError("ACL_PATH_INVALID", "ACL target must be absolute");
  const user = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
  if (!user) throw new SafeError("ACL_USER_UNKNOWN", "Cannot determine the current Windows user for credential ACL");
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("icacls.exe", [path, "/inheritance:r", "/grant:r", `${user}:(F)`], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new SafeError("ACL_FAILED", `Could not restrict credential file ACL: ${Buffer.concat(stderr).toString("utf8")}`)));
  });
}

export function isWithin(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
