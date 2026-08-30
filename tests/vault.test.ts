import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureRuntimeDirectories, EXTRA_FREE_PROVIDERS, getRuntimePaths } from "@omniroute/config";
import {
  CREDENTIAL_TEMPLATE,
  createCredentialTemplate,
  DpapiCurrentUserProtector,
  ensureCredentialTemplate,
  importCredentials,
  InMemoryKeyProtector,
  parseCredentialImport,
  SecretVault,
} from "@omniroute/vault";

test("vault record round-trip and tamper authentication", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-vault-"));
  const path = join(root, "vault.json");
  const protector = new InMemoryKeyProtector(Buffer.alloc(32, 7));
  try {
    const vault = await SecretVault.create(protector);
    vault.set("openai", { OPENAI_API_KEY: "fake-test-key-123456789" });
    await vault.save(path); vault.dispose();
    const loaded = await SecretVault.load(path, protector);
    assert.equal(loaded.get("openai")?.OPENAI_API_KEY, "fake-test-key-123456789");
    loaded.dispose();
    const raw = JSON.parse(await readFile(path, "utf8"));
    raw.records.openai.ciphertext = `${raw.records.openai.ciphertext.slice(0, -2)}AA`;
    await writeFile(path, JSON.stringify(raw));
    const tampered = await SecretVault.load(path, protector);
    assert.throws(() => tampered.get("openai"), /authentication failed/);
    tampered.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Windows DPAPI current-user round-trip", { skip: process.platform !== "win32" }, async () => {
  const protector = new DpapiCurrentUserProtector();
  const plaintext = Buffer.from("dpapi-round-trip-test");
  const protectedValue = await protector.protect(plaintext);
  assert.notDeepEqual(protectedValue, plaintext);
  assert.equal((await protector.unprotect(protectedValue)).toString("utf8"), plaintext.toString("utf8"));
});

test("credential parser rejects duplicates, unknown fields, and multiline markers", () => {
  assert.throws(() => parseCredentialImport("OPENAI_API_KEY=a\nOPENAI_API_KEY=b\n"), /duplicated/);
  assert.throws(() => parseCredentialImport("UNSAFE_KEY=value\n"), /not allowed/);
  assert.throws(() => parseCredentialImport("OPENAI_API_KEY=value\\\ncontinued"), /Multiline/);
});

test("free provider credentials are present in the template and import into separate vault records", async () => {
  assert.match(CREDENTIAL_TEMPLATE, /^GEMINI_API_KEY=$/m);
  assert.match(CREDENTIAL_TEMPLATE, /^GROQ_API_KEY=$/m);
  const parsed = parseCredentialImport("GEMINI_API_KEY=gemini-free-test\nGROQ_API_KEY=groq-free-test\n");
  assert.deepEqual(parsed, { GEMINI_API_KEY: "gemini-free-test", GROQ_API_KEY: "groq-free-test" });
  const root = await mkdtemp(join(tmpdir(), "omniroute-import-free-"));
  const paths = getRuntimePaths(root);
  const protector = new InMemoryKeyProtector(Buffer.alloc(32, 11));
  try {
    await ensureRuntimeDirectories(paths);
    await createCredentialTemplate(paths);
    await writeFile(paths.credentialsImport, "GEMINI_API_KEY=gemini-free-test\nGROQ_API_KEY=groq-free-test\n", { mode: 0o600 });
    const verified: string[] = [];
    const result = await importCredentials({ paths, protector, verifier: async (provider) => { verified.push(provider); } });
    assert.deepEqual(verified.sort(), ["gemini", "groq"]);
    assert.deepEqual(result.imported.map((record) => record.providerId).sort(), ["gemini", "groq"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("expanded credentials import atomically into separate records and preserve failure safety", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-import-expanded-"));
  const paths = getRuntimePaths(root);
  const protector = new InMemoryKeyProtector(Buffer.alloc(32, 13));
  const content = [...EXTRA_FREE_PROVIDERS.map((profile) => `${profile.credentialField}=fake-${profile.id}-credential`), `CLOUDFLARE_ACCOUNT_ID=${"a".repeat(32)}`, ""].join("\n");
  try {
    await ensureRuntimeDirectories(paths);
    await writeFile(paths.credentialsImport, content);
    const result = await importCredentials({ paths, protector, verifier: async () => {} });
    assert.deepEqual(result.imported.map((item) => item.providerId).sort(), EXTRA_FREE_PROVIDERS.map((item) => item.id).sort());
    const vault = await SecretVault.load(paths.vault, protector);
    for (const profile of EXTRA_FREE_PROVIDERS) {
      assert.equal(vault.get(profile.id)?.[profile.credentialField], `fake-${profile.id}-credential`);
      assert.ok(CREDENTIAL_TEMPLATE.includes(`${profile.credentialField}=\n`));
    }
    vault.dispose();
    await writeFile(paths.credentialsImport, "CLOUDFLARE_API_TOKEN=fake-no-account\n");
    await assert.rejects(importCredentials({ paths, protector, verifier: async () => { throw new Error("must not contact network"); } }), /imported together/);
    assert.equal(await readFile(paths.credentialsImport, "utf8"), "CLOUDFLARE_API_TOKEN=fake-no-account\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("setup upgrades the exact old empty three-key template without discarding edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-template-upgrade-"));
  const paths = getRuntimePaths(root);
  try {
    await ensureRuntimeDirectories(paths);
    const old = CREDENTIAL_TEMPLATE.split("\n").filter((line) => line.startsWith("#") || /^(OPENROUTER|GEMINI|GROQ)_API_KEY=$/.test(line) || line === "").join("\n");
    await writeFile(paths.credentialsImport, old);
    await ensureCredentialTemplate(paths);
    assert.equal(await readFile(paths.credentialsImport, "utf8"), CREDENTIAL_TEMPLATE);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("import verifies, atomically activates, removes plaintext, and recreates an empty template", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-import-"));
  const paths = getRuntimePaths(root);
  const protector = new InMemoryKeyProtector(Buffer.alloc(32, 3));
  const fakeSecret = "sk-fake-seeded-secret-never-log-12345";
  try {
    await ensureRuntimeDirectories(paths);
    await createCredentialTemplate(paths);
    await writeFile(paths.credentialsImport, `OPENAI_API_KEY=${fakeSecret}\n`, { mode: 0o600 });
    let verified = false;
    const result = await importCredentials({ paths, protector, verifier: async (provider, values) => { verified = provider === "openai" && values.OPENAI_API_KEY === fakeSecret; } });
    assert.equal(verified, true);
    assert.equal(result.imported[0]?.providerId, "openai");
    const template = await readFile(paths.credentialsImport, "utf8");
    assert.doesNotMatch(template, new RegExp(fakeSecret));
    const vaultText = await readFile(paths.vault, "utf8");
    assert.doesNotMatch(vaultText, new RegExp(fakeSecret));
    const vault = await SecretVault.load(paths.vault, protector);
    assert.equal(vault.get("openai")?.OPENAI_API_KEY, fakeSecret);
    vault.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed connectivity validation leaves active vault and plaintext import untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-import-fail-"));
  const paths = getRuntimePaths(root);
  const protector = new InMemoryKeyProtector(Buffer.alloc(32, 9));
  try {
    await ensureRuntimeDirectories(paths);
    const active = await SecretVault.create(protector); active.set("openai", { OPENAI_API_KEY: "old-fake-key" }); await active.save(paths.vault); active.dispose();
    await writeFile(paths.credentialsImport, "OPENAI_API_KEY=new-fake-key\n");
    await assert.rejects(importCredentials({ paths, protector, verifier: async () => { throw new Error("connectivity failed"); } }), /connectivity failed/);
    assert.match(await readFile(paths.credentialsImport, "utf8"), /new-fake-key/);
    const reloaded = await SecretVault.load(paths.vault, protector); assert.equal(reloaded.get("openai")?.OPENAI_API_KEY, "old-fake-key"); reloaded.dispose();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("idempotent setup preserves a populated local credential import", async () => {
  const root = await mkdtemp(join(tmpdir(), "omniroute-template-preserve-"));
  const paths = getRuntimePaths(root);
  const pending = "OPENAI_API_KEY=sk-fake-pending-local-edit-123456\n";
  try {
    await ensureRuntimeDirectories(paths);
    await writeFile(paths.credentialsImport, pending, { mode: 0o600 });
    await ensureCredentialTemplate(paths);
    assert.equal(await readFile(paths.credentialsImport, "utf8"), pending);
    await assert.rejects(createCredentialTemplate(paths), /Refusing to overwrite/);
    await createCredentialTemplate(paths, { force: true });
    assert.doesNotMatch(await readFile(paths.credentialsImport, "utf8"), /sk-fake-pending/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
