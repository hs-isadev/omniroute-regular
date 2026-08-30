import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_CONFIG, getRuntimePaths, loadConfig, temporaryRuntimeRoot, validateConfig } from "@omniroute/config";

test("legacy paid orchestrator migrates to the default free orchestrator", async () => {
  const root = temporaryRuntimeRoot("omniroute-config");
  const paths = getRuntimePaths(root);
  try {
    await mkdir(root, { recursive: true });
    const legacy = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    delete legacy.routing.freeOnly;
    delete legacy.routing.defaultMode;
    legacy.routing.orchestratorProviderId = "openai";
    legacy.routing.orchestratorModelId = "gpt-5.6-sol";
    await writeFile(paths.config, JSON.stringify(legacy), "utf8");
    const migrated = await loadConfig(paths);
    assert.equal(migrated.routing.freeOnly, true);
    assert.equal(migrated.routing.orchestratorProviderId, "openrouter");
    assert.equal(migrated.routing.orchestratorModelId, "openrouter/free");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("free-only validation rejects a paid orchestrator", () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.providers.find((provider: { id: string }) => provider.id === "openai").enabled = true;
  config.routing.orchestratorProviderId = "openai";
  config.routing.orchestratorModelId = "gpt-5.6-sol";
  assert.throws(() => validateConfig(config), /paid provider|zero-priced/);
});

test("existing config gains free downgrade models without re-enabling a disabled model", async () => {
  const root = temporaryRuntimeRoot("omniroute-ladder-config");
  const paths = getRuntimePaths(root);
  try {
    await mkdir(root, { recursive: true });
    const config = structuredClone(DEFAULT_CONFIG);
    const groq = config.providers.find((item) => item.id === "groq")!;
    groq.models = groq.models.filter((item) => item.modelId !== "openai/gpt-oss-20b");
    groq.models.find((item) => item.modelId === "openai/gpt-oss-120b")!.enabled = false;
    delete groq.freeModelOrder;
    await writeFile(paths.config, JSON.stringify(config));
    const loaded = await loadConfig(paths);
    const upgraded = loaded.providers.find((item) => item.id === "groq")!;
    assert.ok(upgraded.models.some((item) => item.modelId === "openai/gpt-oss-20b"));
    assert.equal(upgraded.models.find((item) => item.modelId === "openai/gpt-oss-120b")?.enabled, false);
    assert.equal(upgraded.freeModelOrder?.[0], "openai/gpt-oss-120b");
  } finally { await rm(root, { recursive: true, force: true }); }
});
