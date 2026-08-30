#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { DEFAULT_CONFIG, EXTRA_FREE_PROVIDERS, ensureRuntimeDirectories, getRuntimePaths, loadConfig, saveConfig } from "@omniroute/config";
import { classifyTask } from "@omniroute/core";
import { ROUTING_MODES, type RouteRequest, type RouteResult, type RoutingMode } from "@omniroute/contracts";
import { CODEX_OMNIROUTE_FIRST_POLICY, IntegrationManager, type IntegrationTarget } from "@omniroute/integrations";
import { serveOmniMcp } from "@omniroute/mcp-server";
import { claudeHarnessEnvironment, harnessLaunchCommand, openCodeHarnessArguments, openCodeHarnessEnvironment, openCodeRegularConfig, resolveHarnessLauncher } from "./harness-env.js";
import { globalRedactor, safeError, SafeError } from "@omniroute/observability";
import { AnthropicProvider, createConfiguredProvider, HttpTransport, OpenAICompatibleProvider, OpenAIProvider } from "@omniroute/providers";
import { configureProvider } from "./provider-management.js";
import {
  createCredentialTemplate,
  ensureCredentialTemplate,
  ensureLocalDaemonToken,
  importCredentials,
  SecretVault,
  type CredentialVerifier,
} from "@omniroute/vault";
import { DaemonClient } from "./client.js";
import { createCliMcpBackend } from "./mcp-backend.js";
import { WindowsServiceManager } from "./service.js";
import { startHostModelProxy } from "./host-model-proxy.js";

const args = process.argv.slice(2);
const paths = getRuntimePaths();
const client = new DaemonClient(paths);

function has(flag: string): boolean { return args.includes(flag); }
function option(name: string): string | null {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}
function positionals(start = 1): string[] {
  const values: string[] = [];
  for (let index = start; index < args.length; index += 1) {
    if (args[index] === "--mode") { index += 1; continue; }
    if (args[index]?.startsWith("--")) continue;
    values.push(args[index]!);
  }
  return values;
}
function writeJson(value: unknown): void { output.write(`${JSON.stringify(globalRedactor.redact(value), null, 2)}\n`); }

function selectedRoutingMode(fallback?: RoutingMode): RoutingMode | undefined {
  const value = option("--mode") ?? process.env.OMNIROUTE_ROUTING_MODE ?? fallback;
  if (value === undefined) return undefined;
  if (!ROUTING_MODES.includes(value as RoutingMode)) throw new SafeError("ROUTING_MODE_INVALID", "--mode must be regular or orchestrator", 400);
  return value as RoutingMode;
}

function baseRoute(prompt: string, sourceClient: string): RouteRequest {
  const routingMode = selectedRoutingMode();
  return {
    prompt,
    ...(routingMode ? { routingMode } : {}),
    sourceClient,
    hostApplication: "omni-cli",
    hostModel: null,
    hostModelAuthoritative: false,
    attachments: [],
    requestedCapabilities: [],
    maxOutputTokens: null,
    privacyMode: null,
    metadata: {},
  };
}

async function ask(prompt: string): Promise<RouteResult> {
  if (!prompt.trim()) throw new SafeError("PROMPT_REQUIRED", "A non-empty prompt is required", 400);
  let activeLabel: string | null = null;
  const result = await client.streamRoute(baseRoute(prompt, "omni-ask"), (event, data) => {
    if (event === "worker.started" && data && typeof data === "object") {
      const item = data as { subtaskId?: string | null; providerId?: string; modelId?: string };
      activeLabel = item.subtaskId ?? "final";
      output.write(`\n[${activeLabel} · ${item.providerId}/${item.modelId}]\n`);
    }
    if (event === "worker.delta" && data && typeof data === "object") {
      const item = data as { subtaskId?: string | null; text?: string };
      if ((item.subtaskId ?? "final") === activeLabel && item.text) output.write(item.text);
    }
  });
  output.write(`\n\n${result.badge}\n`);
  return result;
}

async function setup(): Promise<void> {
  await ensureRuntimeDirectories(paths);
  const config = await loadConfig(paths);
  await saveConfig(config, paths);
  await ensureLocalDaemonToken(paths);
  const credentialPath = await ensureCredentialTemplate(paths);
  writeJson({ status: "ready", runtimeRoot: paths.root, config: paths.config, credentialImport: credentialPath, defaultMode: config.routing.defaultMode, freeOnly: config.routing.freeOnly, orchestrator: `${config.routing.orchestratorProviderId}/${config.routing.orchestratorModelId}`, next: ["Add an OpenRouter key locally for the OpenCode regular harness.", "Run: omni providers list; enable chosen additional profiles only after confirming free-only account settings.", "Run: omni secrets import", "Restart an existing daemon: omni service stop, then omni service start", "For a new installation: omni service install --apply", "Run: omni integrate opencode --user --apply"] });
}

function timeoutSignal(ms = 15_000): AbortSignal {
  return AbortSignal.timeout(ms);
}

const verifyCredential: CredentialVerifier = async (providerId, values) => {
  if (EXTRA_FREE_PROVIDERS.some((item) => item.id === providerId)) {
    const config = await loadConfig(paths);
    const configured = config.providers.find((item) => item.id === providerId)!;
    // Verify against the built-in endpoint and allowlist, never a user-edited URL.
    const settings = { ...DEFAULT_CONFIG.providers.find((item) => item.id === providerId)!, freeTierConfirmed: configured.freeTierConfirmed === true };
    const provider = createConfiguredProvider(settings, values);
    // Public model catalogs alone do not authenticate a key. A tiny completion
    // verifies inference permission and consumes a little of the confirmed free quota.
    await provider.generate({ modelId: settings.models[0]!.modelId, instructions: "Reply briefly.", prompt: "Hi", reasoningEffort: "none", maxOutputTokens: 16, jsonSchema: null, schemaName: null, safetyIdentifier: null, signal: timeoutSignal(30_000) });
    return;
  }
  if (providerId === "openai") {
    const provider = new OpenAIProvider({ id: "openai", baseUrl: "https://api.openai.com", apiKey: values.OPENAI_API_KEY });
    const health = await provider.healthCheck(timeoutSignal());
    if (health.status !== "healthy") throw new SafeError("CREDENTIAL_TEST_FAILED", health.message ?? "OpenAI connectivity failed");
    return;
  }
  if (providerId === "anthropic") {
    const provider = new AnthropicProvider({ id: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: values.ANTHROPIC_API_KEY });
    const health = await provider.healthCheck(timeoutSignal());
    if (health.status !== "healthy") throw new SafeError("CREDENTIAL_TEST_FAILED", health.message ?? "Anthropic connectivity failed");
    return;
  }
  if (providerId === "openrouter") {
    const provider = new OpenAICompatibleProvider({ id: "openrouter", baseUrl: "https://openrouter.ai/api/", apiKey: values.OPENROUTER_API_KEY });
    const health = await provider.healthCheck(timeoutSignal());
    if (health.status !== "healthy") throw new SafeError("CREDENTIAL_TEST_FAILED", health.message ?? "OpenRouter connectivity failed");
    return;
  }
  if (providerId === "gemini") {
    const provider = new OpenAICompatibleProvider({ id: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", apiPrefix: "", apiKey: values.GEMINI_API_KEY });
    const health = await provider.healthCheck(timeoutSignal());
    if (health.status !== "healthy") throw new SafeError("CREDENTIAL_TEST_FAILED", health.message ?? "Gemini free-tier connectivity failed");
    return;
  }
  if (providerId === "groq") {
    const provider = new OpenAICompatibleProvider({ id: "groq", baseUrl: "https://api.groq.com/openai/", apiKey: values.GROQ_API_KEY });
    const health = await provider.healthCheck(timeoutSignal());
    if (health.status !== "healthy") throw new SafeError("CREDENTIAL_TEST_FAILED", health.message ?? "Groq free-tier connectivity failed");
    return;
  }
  if (providerId === "custom-openai") {
    const provider = new OpenAICompatibleProvider({ id: "custom-openai", baseUrl: values.CUSTOM_OPENAI_BASE_URL!, apiKey: values.CUSTOM_OPENAI_API_KEY });
    const health = await provider.healthCheck(timeoutSignal());
    if (health.status !== "healthy") throw new SafeError("CREDENTIAL_TEST_FAILED", health.message ?? "Custom OpenAI-compatible connectivity failed");
    return;
  }
  if (providerId === "azure-openai") {
    const endpoint = new URL(values.AZURE_OPENAI_ENDPOINT!);
    if (endpoint.protocol !== "https:") throw new SafeError("CREDENTIAL_TEST_FAILED", "Azure OpenAI endpoint must use HTTPS");
    const transport = new HttpTransport({ baseUrl: endpoint.href, allowLoopback: false, headers: () => ({ "api-key": values.AZURE_OPENAI_API_KEY! }) });
    await transport.request("azure-openai", "openai/models?api-version=2024-10-21", { signal: timeoutSignal() });
    return;
  }
  throw new SafeError("PROVIDER_UNSUPPORTED", `No credential verifier exists for ${providerId}`, 400);
};

async function providersCommand(): Promise<void> {
  const config = await loadConfig(paths);
  const action = args[1] ?? "list";
  if (action === "list") {
    writeJson(config.providers.filter((item) => item.freeTierOnly).map((item) => {
      const profile = EXTRA_FREE_PROVIDERS.find((entry) => entry.id === item.id);
      return { id: item.id, enabled: item.enabled, modes: ["regular", "orchestrator"], credentialField: item.credentialField, models: item.models.filter((model) => model.enabled && model.allowed).map((model) => model.modelId), freeModelOrder: item.freeModelOrder ?? null, freeModelFailoverEnabled: config.routing.freeModelFailoverEnabled, freeAccess: profile?.access ?? (item.type === "local" ? "local" : "free-tier"), freeTierConfirmed: item.freeTierConfirmed ?? null, signup: profile?.signup ?? null, note: profile?.note ?? null };
    }));
    return;
  }
  if (action !== "enable" && action !== "disable") throw new SafeError("COMMAND_UNKNOWN", "Use omni providers list|enable|disable", 400);
  const id = args[2];
  if (!id) throw new SafeError("PROVIDER_REQUIRED", "Specify one provider ID from omni providers list", 400);
  configureProvider(config, id, { enabled: action === "enable", confirmFreeTier: has("--confirm-free-tier"), modelId: option("--model"), contextTokens: Number(option("--context-tokens")), coding: has("--coding") });
  await saveConfig(config, paths);
  writeJson({ provider: id, enabled: action === "enable", modes: ["regular", "orchestrator"], restartRequired: true, next: "Import credentials locally if needed, then run omni service stop followed by omni service start." });
}

async function secrets(): Promise<void> {
  const action = args[1] ?? "list";
  if (action === "template") { output.write(`${await createCredentialTemplate(paths, { force: has("--force") })}\n`); return; }
  if (action === "import") {
    const result = await importCredentials({ paths, verifier: verifyCredential });
    writeJson({ imported: result.imported.map((item) => ({ provider: item.providerId, fields: item.fieldNames, maskedFingerprint: `sha256:${item.fingerprint}` })), restartRequired: true, next: "Run omni service stop, then omni service start to load the new credentials.", warnings: [...result.warnings, "Plaintext cleanup cannot guarantee forensic deletion on SSDs, backups, sync services, filesystem journals, or clipboard history."] });
    return;
  }
  const vault = await SecretVault.load(paths.vault);
  try {
    if (action === "list") { writeJson(vault.list().filter((item) => item.providerId !== "local-daemon").map((item) => ({ provider: item.providerId, fields: item.fieldNames, maskedFingerprint: `sha256:${item.fingerprint}`, createdAt: item.createdAt }))); return; }
    const providerId = args[2];
    if (!providerId) throw new SafeError("PROVIDER_REQUIRED", `secrets ${action} requires a provider ID`, 400);
    if (action === "remove") {
      const removed = vault.remove(providerId);
      if (removed) await vault.save(paths.vault);
      writeJson({ provider: providerId, removed }); return;
    }
    if (action === "rotate") {
      if (!vault.get(providerId)) throw new SafeError("PROVIDER_NOT_CONFIGURED", `No credential is configured for ${providerId}`, 404);
      const file = await createCredentialTemplate(paths);
      writeJson({ provider: providerId, status: "awaiting-local-edit", file, instruction: "Put the replacement credential in the local file, then run `omni secrets import`. The active credential remains unchanged unless validation succeeds." }); return;
    }
    if (action === "test") {
      if (!has("--live")) throw new SafeError("LIVE_FLAG_REQUIRED", "Live credential tests require --live", 400);
      const budget = Number(option("--budget-usd"));
      if (!Number.isFinite(budget) || budget <= 0) throw new SafeError("BUDGET_REQUIRED", "Live credential tests require a positive --budget-usd value", 400);
      const values = vault.get(providerId);
      if (!values) throw new SafeError("PROVIDER_NOT_CONFIGURED", `No credential is configured for ${providerId}`, 404);
      await verifyCredential(providerId, values);
      writeJson({ provider: providerId, status: "healthy", live: true, maximumAuthorizedBudgetUsd: budget }); return;
    }
    throw new SafeError("COMMAND_UNKNOWN", `Unknown secrets action: ${action}`, 400);
  } finally { vault.dispose(); }
}

function cliEntry(): string { return fileURLToPath(import.meta.url); }

async function integrate(): Promise<void> {
  const validTargets: IntegrationTarget[] = ["codex", "chatgpt-desktop", "claude-code", "claude-desktop", "opencode"];
  const requireTarget = (value: string | undefined): IntegrationTarget => {
    if (!value) throw new SafeError("TARGET_REQUIRED", "Integration target is required", 400);
    if (!validTargets.includes(value as IntegrationTarget)) throw new SafeError("INTEGRATION_TARGET_INVALID", `Unknown integration target: ${value}`, 400);
    return value as IntegrationTarget;
  };
  const actionOrTarget = args[1] ?? "status";
  const manager = new IntegrationManager({ nodePath: process.execPath, cliPath: cliEntry(), runtimePaths: paths });
  if (actionOrTarget === "status") { writeJson(await manager.status()); return; }
  if (actionOrTarget === "doctor") { writeJson(await manager.doctor()); return; }
  if (actionOrTarget === "restore") {
    const target = requireTarget(args[2]);
    await manager.restore(target); writeJson({ target, restored: true }); return;
  }
  const remove = actionOrTarget === "remove";
  const requested = remove ? args[2] : actionOrTarget;
  if (!requested) throw new SafeError("TARGET_REQUIRED", "Integration target is required", 400);
  const targets: IntegrationTarget[] = requested === "all" ? validTargets : [requireTarget(requested)];
  const plans = [];
  for (const target of targets) plans.push(await manager.plan(target, remove ? "remove" : "install"));
  writeJson(plans.map((plan) => ({ target: plan.target, action: plan.action, changed: plan.changed, changes: plan.changes.map((item) => ({ path: item.path, diff: item.redactedDiff })), notes: plan.notes })));
  if (has("--apply")) {
    const manifests = [];
    for (const plan of plans) manifests.push({ target: plan.target, rollbackManifest: await manager.apply(plan) });
    writeJson({ applied: true, manifests });
  } else output.write("Dry run only. Re-run with --apply to make these changes.\n");
}

async function service(): Promise<void> {
  const action = args[1] ?? "status";
  const manager = new WindowsServiceManager(client);
  if (action === "install") {
    writeJson({ dryRun: !has("--apply"), plan: manager.plan() });
    if (has("--apply")) { await manager.install(); writeJson({ installed: true }); }
    return;
  }
  if (action === "start") { await manager.start(); writeJson({ started: true }); return; }
  if (action === "stop") { await manager.stop(); writeJson({ stopping: true }); return; }
  if (action === "status") { writeJson(await manager.status()); return; }
  if (action === "uninstall") { await manager.uninstall(); writeJson({ uninstalled: true }); return; }
  throw new SafeError("COMMAND_UNKNOWN", `Unknown service action: ${action}`, 400);
}

async function budget(): Promise<void> {
  const action = args[1] ?? "show";
  if (action === "show" || action === "inspect") { writeJson((await client.request<{ budgets: unknown }>("/v1/config")).budgets); return; }
  if (action === "set") {
    const payload: Record<string, number | null> = {};
    for (const [flag, key] of [["--daily", "dailyUsd"], ["--monthly", "monthlyUsd"], ["--per-request", "perRequestUsd"]] as const) {
      const raw = option(flag);
      if (raw === null) continue;
      payload[key] = raw === "none" ? null : Number(raw);
    }
    if (Object.keys(payload).length === 0) throw new SafeError("BUDGET_VALUE_REQUIRED", "Provide --daily, --monthly, or --per-request", 400);
    writeJson(await client.request("/v1/budget", { method: "PATCH", body: JSON.stringify(payload) })); return;
  }
  throw new SafeError("COMMAND_UNKNOWN", `Unknown budget action: ${action}`, 400);
}

async function doctor(): Promise<void> {
  const findings: Array<{ check: string; status: string; detail?: unknown }> = [];
  findings.push({ check: "runtime root", status: paths.root.toLowerCase().includes("onedrive") ? "warning" : "ok", detail: paths.root });
  try { findings.push({ check: "daemon", status: "ok", detail: await client.request("/v1/health") }); }
  catch (error) { findings.push({ check: "daemon", status: "error", detail: safeError(error).message }); }
  try {
    const models = await client.models();
    const configured = await loadConfig(paths);
    const orchestrator = models.find((model) => model.providerId === configured.routing.orchestratorProviderId && model.modelId === configured.routing.orchestratorModelId);
    findings.push({ check: "free orchestrator access", status: orchestrator?.health.status === "healthy" && orchestrator.enabled && orchestrator.allowed && orchestrator.pricing.inputPerMillionUsd === 0 && orchestrator.pricing.outputPerMillionUsd === 0 ? "ok" : "error", detail: orchestrator ? { provider: orchestrator.providerId, model: orchestrator.modelId, health: orchestrator.health.status, enabled: orchestrator.enabled, allowed: orchestrator.allowed } : "not in registry" });
  } catch (error) { findings.push({ check: "model registry", status: "error", detail: safeError(error).message }); }
  try {
    const vault = await SecretVault.load(paths.vault);
    try { findings.push({ check: "encrypted vault", status: "ok", detail: vault.list().filter((item) => item.providerId !== "local-daemon").map((item) => ({ provider: item.providerId, fingerprint: item.fingerprint })) }); }
    finally { vault.dispose(); }
  } catch (error) { findings.push({ check: "encrypted vault", status: "error", detail: safeError(error).message }); }
  const manager = new IntegrationManager({ nodePath: process.execPath, cliPath: cliEntry(), runtimePaths: paths });
  findings.push({ check: "integrations", status: "info", detail: await manager.doctor() });
  writeJson(findings);
  if (findings.some((item) => item.status === "error")) process.exitCode = 1;
}

async function chat(): Promise<void> {
  const readline = createInterface({ input, output });
  const displayMode = selectedRoutingMode() ?? (await loadConfig(paths)).routing.defaultMode;
  output.write(`OmniRoute chat (${displayMode} mode). Type /exit to quit. Free-only policy is enforced.\n`);
  try {
    while (true) {
      const prompt = await readline.question("\nomni> ");
      if (prompt.trim() === "/exit") break;
      if (prompt.trim()) await ask(prompt);
    }
  } finally { readline.close(); }
}

async function runSavedTask(): Promise<void> {
  const path = positionals()[0];
  if (!path) throw new SafeError("TASK_FILE_REQUIRED", "omni run requires a task file", 400);
  const text = await readFile(path, "utf8");
  let request: RouteRequest;
  try {
    const parsed = JSON.parse(text) as Partial<RouteRequest>;
    request = { ...baseRoute(parsed.prompt ?? "", "omni-run"), ...parsed, sourceClient: "omni-run", hostModel: null, hostModelAuthoritative: false };
  } catch { request = baseRoute(text, "omni-run"); }
  const result = await client.streamRoute(request, (event, data) => {
    if (event === "worker.delta" && data && typeof data === "object" && (data as { subtaskId?: string | null }).subtaskId === null) output.write((data as { text?: string }).text ?? "");
  });
  output.write(`\n\n${result.badge}\n`);
}

async function mcp(): Promise<void> {
  await serveOmniMcp(createCliMcpBackend(client));
}

async function hook(host: "codex" | "claude"): Promise<void> {
  let raw = "";
  for await (const chunk of input) { raw += chunk.toString(); if (raw.length > 1_000_000) throw new SafeError("HOOK_INPUT_TOO_LARGE", "Hook input exceeds one megabyte"); }
  let prompt = "";
  try { const payload = JSON.parse(raw) as { prompt?: string }; prompt = typeof payload.prompt === "string" ? payload.prompt : ""; } catch { /* no context */ }
  if (!prompt) return;
  const signals = classifyTask(baseRoute(prompt, `${host}-hook`));
  const hostMode = process.env.OMNIROUTE_ROUTING_MODE ?? "regular";
  const context = host === "codex"
    ? `${CODEX_OMNIROUTE_FIRST_POLICY}\nLocal signals: ${signals.suggestedClass}, ${signals.riskLevel} risk.`
    : hostMode === "orchestrator"
    ? `Act as the host orchestrator. Decompose the user's task when useful, delegate bounded work through omniroute/omni_route with routingMode=regular, then synthesize and verify the final answer yourself. Use only OmniRoute's free-policy workers and preserve every returned attribution badge. The host model is unknown unless the host reports authoritative metadata. Local signals: ${signals.suggestedClass}, ${signals.riskLevel} risk.`
    : signals.suggestedClass === "micro" || signals.suggestedClass === "small"
      ? "Regular mode is active. Answer normally with the configured free Claude Code gateway. OmniRoute remains available through MCP when the user explicitly requests it. The host model is unknown unless the host reports authoritative metadata."
      : `Regular mode is active. This prompt appears ${signals.suggestedClass} (${signals.riskLevel} risk); OmniRoute is available through omniroute/omni_route with routingMode=regular for bounded free-tier delegation. The host model is unknown unless the host reports authoritative metadata.`;
  output.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context } }));
}

async function harness(): Promise<void> {
  const target = args[1];
  if (target !== "claude" && target !== "opencode") throw new SafeError("HARNESS_INVALID", "Harness must be claude or opencode", 400);
  const mode = selectedRoutingMode("regular")!;
  const subscription = has("--subscription");
  const childArgs: string[] = [];
  if (target === "opencode") {
    if (mode !== "regular") throw new SafeError("HARNESS_MODE_INVALID", "OpenCode is restricted to regular mode", 400);
    if (subscription) throw new SafeError("HARNESS_SUBSCRIPTION_INVALID", "OpenCode regular mode does not accept --subscription", 400);
    const launcher = await resolveHarnessLauncher("opencode", process.env, process.cwd());
    const vault = await SecretVault.load(paths.vault);
    let openRouterApiKey: string;
    try {
      const openrouter = vault.get("openrouter");
      if (!openrouter?.OPENROUTER_API_KEY) throw new SafeError("OPENROUTER_REQUIRED", "The OpenCode regular harness requires an imported OPENROUTER_API_KEY", 400);
      openRouterApiKey = openrouter.OPENROUTER_API_KEY;
    } finally { vault.dispose(); }
    const instructionsPath = fileURLToPath(new URL("../../../docs/integrations/opencode-regular-instructions.md", import.meta.url));
    const hostLabels = await startHostModelProxy(openRouterApiKey);
    try {
      const inlineConfig = openCodeRegularConfig(process.execPath, cliEntry(), paths.root, instructionsPath, hostLabels.baseURL);
      const childEnvironment = openCodeHarnessEnvironment(process.env, paths.root, hostLabels.token, inlineConfig);
      const launch = harnessLaunchCommand(launcher, process.env);
      const child = spawn(launch.command, [...launch.prefix, ...openCodeHarnessArguments()], { cwd: process.cwd(), env: childEnvironment, stdio: "inherit", windowsHide: false, shell: false });
      const exitCode = await new Promise<number>((resolvePromise, reject) => { child.once("error", reject); child.once("close", (code) => resolvePromise(code ?? 1)); });
      if (exitCode !== 0) throw new SafeError("HARNESS_EXITED", `OpenCode exited with status ${exitCode}`);
    } finally { await hostLabels.close(); }
    return;
  }
  const childEnvironment = claudeHarnessEnvironment(process.env, mode, paths.root);
  if (subscription) {
    if (mode !== "orchestrator") throw new SafeError("HARNESS_MODE_INVALID", "--subscription is reserved for Claude host-orchestrator mode", 400);
    childArgs.push("--model", "claude-opus-5");
  } else {
    const vault = await SecretVault.load(paths.vault);
    try {
      const openrouter = vault.get("openrouter");
      if (!openrouter?.OPENROUTER_API_KEY) throw new SafeError("OPENROUTER_REQUIRED", "The free Claude Code harness requires an imported OPENROUTER_API_KEY", 400);
      childEnvironment.ANTHROPIC_BASE_URL = "https://openrouter.ai/api";
      childEnvironment.ANTHROPIC_AUTH_TOKEN = openrouter.OPENROUTER_API_KEY;
      childEnvironment.ANTHROPIC_API_KEY = "";
      childEnvironment.ANTHROPIC_MODEL = "openrouter/free";
      childEnvironment.ANTHROPIC_DEFAULT_OPUS_MODEL = "openrouter/free";
      childEnvironment.ANTHROPIC_DEFAULT_SONNET_MODEL = "openrouter/free";
      childEnvironment.ANTHROPIC_DEFAULT_HAIKU_MODEL = "openrouter/free";
      childEnvironment.CLAUDE_CODE_SUBAGENT_MODEL = "openrouter/free";
    } finally { vault.dispose(); }
  }
  const launcher = await resolveHarnessLauncher("claude", process.env, process.cwd());
  const launch = harnessLaunchCommand(launcher, process.env);
  const child = spawn(launch.command, [...launch.prefix, ...childArgs], { cwd: process.cwd(), env: childEnvironment, stdio: "inherit", windowsHide: false, shell: false });
  const exitCode = await new Promise<number>((resolvePromise, reject) => { child.once("error", reject); child.once("close", (code) => resolvePromise(code ?? 1)); });
  if (exitCode !== 0) throw new SafeError("HARNESS_EXITED", `Claude Code exited with status ${exitCode}`);
}

async function dashboard(): Promise<void> {
  const session = await client.request<{ url: string }>("/v1/dashboard/session", { method: "POST", body: "{}" });
  if (process.platform === "win32") spawn("rundll32.exe", ["url.dll,FileProtocolHandler", session.url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else output.write(`${session.url}\n`);
}

function help(): void {
  output.write("Provider setup: omni providers list | enable <id> --confirm-free-tier | disable <id>\nLocal setup: omni providers enable <id> --model <id> --context-tokens <N> [--coding]\n\n");
  output.write(`OmniRoute 0.1.0\n\nCommands:\n  omni setup\n  omni ask <prompt> [--mode regular|orchestrator]\n  omni chat [--mode regular|orchestrator]\n  omni run <task-file> [--mode regular|orchestrator]\n  omni harness opencode --mode regular\n  omni harness claude --mode regular|orchestrator [--subscription]\n  omni routes [--limit N]\n  omni models [--refresh]\n  omni budget show|set\n  omni secrets template|import|list|test|remove|rotate\n  omni integrate status|doctor|<target>|remove|restore\n  omni service install|start|stop|status|uninstall\n  omni dashboard\n  omni doctor\n\nOpenCode is the regular-mode harness and is pinned to openrouter/free. Claude subscription mode remains available only for future host orchestration.\n`);
}

async function main(): Promise<void> {
  const command = args[0] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") { help(); return; }
  if (command === "setup") { await setup(); return; }
  if (command === "ask") { await ask(positionals().join(" ")); return; }
  if (command === "chat") { await chat(); return; }
  if (command === "run") { await runSavedTask(); return; }
  if (command === "routes") { writeJson(await client.recentRoutes(Number(option("--limit") ?? 50))); return; }
  if (command === "models") { if (has("--refresh")) await client.request("/v1/models?refresh=1"); writeJson(await client.models()); return; }
  if (command === "budget") { await budget(); return; }
  if (command === "secrets") { await secrets(); return; }
  if (command === "providers") { await providersCommand(); return; }
  if (command === "integrate") { await integrate(); return; }
  if (command === "service") { await service(); return; }
  if (command === "doctor") { await doctor(); return; }
  if (command === "dashboard") { await dashboard(); return; }
  if (command === "harness") { await harness(); return; }
  if (command === "mcp") { await mcp(); return; }
  if (command === "hook") { const host = args[1]; if (host !== "codex" && host !== "claude") throw new SafeError("HOOK_HOST_INVALID", "Hook host must be codex or claude"); await hook(host); return; }
  if (command === "daemon") { await import(new URL("../../daemon/dist/main.js", import.meta.url).href); return; }
  throw new SafeError("COMMAND_UNKNOWN", `Unknown command: ${command}`, 400);
}

try { await main(); }
catch (error) {
  const safe = safeError(error);
  process.stderr.write(`${safe.code}: ${safe.message}\n`);
  process.exitCode = safe.status >= 500 ? 1 : 2;
}
