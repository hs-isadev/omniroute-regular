import type { ModelEntry, RoutingMode } from "@omniroute/contracts";
import { SafeError } from "@omniroute/observability";
import { access, realpath, stat } from "node:fs/promises";
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { constants } from "node:fs";
import { userInfo } from "node:os";

const SAFE_INHERITED_ENVIRONMENT = [
  "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
  "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA",
  "PROGRAMDATA", "USERNAME", "USERDOMAIN", "OS", "HOME", "USER", "SHELL",
  "TMPDIR", "TERM", "TERM_PROGRAM", "COLORTERM", "LANG", "LC_ALL",
  "NO_COLOR", "FORCE_COLOR", "WT_SESSION", "WT_PROFILE_ID",
  // Linux MCP child processes need the user's existing Secret Service session.
  "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY",
] as const;

export function claudeHarnessEnvironment(base: NodeJS.ProcessEnv, mode: RoutingMode, runtimeRoot?: string): NodeJS.ProcessEnv {
  const output: NodeJS.ProcessEnv = { OMNIROUTE_ROUTING_MODE: mode };
  if (runtimeRoot) output.OMNIROUTE_HOME = runtimeRoot;
  for (const wanted of SAFE_INHERITED_ENVIRONMENT) {
    const actual = Object.keys(base).find((key) => key.toUpperCase() === wanted);
    if (actual && base[actual] !== undefined) output[actual] = base[actual];
  }
  return output;
}

/**
 * OpenCode uses the OpenRouter-shaped provider schema for compatibility, but
 * the managed harness points its base URL at the local OmniRoute daemon. The
 * value is therefore the daemon bearer token, never an upstream provider key.
 */
export function openCodeHarnessEnvironment(base: NodeJS.ProcessEnv, runtimeRoot: string, localDaemonToken: string, inlineConfig: string): NodeJS.ProcessEnv {
  const output = claudeHarnessEnvironment(base, "regular", runtimeRoot);
  output.OPENROUTER_API_KEY = localDaemonToken;
  output.OPENCODE_CONFIG_CONTENT = inlineConfig;
  return output;
}

function eligibleOpenCodeHost(model: ModelEntry, now = Date.now()): boolean {
  return model.providerId === "openrouter"
    && /^[A-Za-z0-9._:@/+\-]{1,200}$/.test(model.modelId)
    && model.enabled
    && model.allowed
    && model.health.status === "healthy"
    && model.rateLimitState === "ok"
    && model.route.freeStatus === "confirmed"
    && model.pricing.inputPerMillionUsd === 0
    && model.pricing.outputPerMillionUsd === 0
    && model.capabilities.text === true
    && model.capabilities.coding === true
    && model.contextWindow !== null
    && model.maxOutputTokens !== null
    && model.reasoningEfforts.length > 0
    && (model.route.evidenceExpiresAt === null || Date.parse(model.route.evidenceExpiresAt) > now);
}

/** Picks one live, confirmed free OpenRouter model. The launcher has no fallback authority. */
export function selectOpenCodeHostModel(models: ModelEntry[], now = Date.now()): ModelEntry {
  const candidates = models.filter((model) => eligibleOpenCodeHost(model, now));
  if (!candidates.length) throw new SafeError("OPENCODE_HOST_MODEL_UNAVAILABLE", "No current eligible free OpenCode host model is available from the live registry", 503);
  return candidates.sort((left, right) => (right.intelligenceTier ?? 0) - (left.intelligenceTier ?? 0)
    || (right.contextWindow ?? 0) - (left.contextWindow ?? 0)
    || (right.maxOutputTokens ?? 0) - (left.maxOutputTokens ?? 0)
    || left.modelId.localeCompare(right.modelId))[0]!;
}

export function openCodeHarnessArguments(modelId = "openrouter/free"): string[] {
  return ["--pure", "--model", `openrouter/${modelId}`];
}

export function openCodeRegularConfig(nodePath: string, cliPath: string, runtimeRoot: string, instructionsPath: string, hostModelBaseURL?: string, modelId = "openrouter/free"): string {
  return JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    model: `openrouter/${modelId}`,
    small_model: `openrouter/${modelId}`,
    enabled_providers: ["openrouter"],
    provider: {
      openrouter: {
        ...(hostModelBaseURL ? { options: { baseURL: hostModelBaseURL } } : {}),
        whitelist: [modelId],
        models: {
          [modelId]: {
            name: "OmniRoute-managed free host route (actual worker shown in replies)",
            options: {
              provider: { allow_fallbacks: false },
            },
          },
        },
      },
    },
    instructions: [instructionsPath],
    mcp: {
      omniroute: {
        type: "local",
        command: [nodePath, cliPath, "mcp"],
        enabled: true,
        environment: {
          OMNIROUTE_HOME: runtimeRoot,
          OMNIROUTE_ROUTING_MODE: "regular",
        },
      },
    },
  });
}

function insideDirectory(directory: string, path: string): boolean {
  const fromDirectory = relative(directory, path);
  return fromDirectory === "" || (fromDirectory !== ".." && !fromDirectory.startsWith(`..${sep}`) && !isAbsolute(fromDirectory));
}

export function selectClaudeLauncher(candidates: string[], workingDirectory: string, installedBinDirectories: string[] = []): string | null {
  const root = resolve(workingDirectory);
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) continue;
    const absolute = resolve(candidate);
    // An ancestor such as the user's home is not itself an application install
    // directory. Allow only direct global-bin entries, never arbitrary siblings
    // or shims inside the current project (including a project in the bin dir).
    const globalInstall = installedBinDirectories.some(directory => isAbsolute(directory) && relative(resolve(directory), dirname(absolute)) === "" && !insideDirectory(resolve(directory), root));
    if (insideDirectory(root, absolute) && !globalInstall) continue;
    return absolute;
  }
  return null;
}

export const selectHarnessLauncher = selectClaudeLauncher;

export async function resolveClaudeLauncher(base: NodeJS.ProcessEnv, workingDirectory: string, platform = process.platform): Promise<string> {
  return resolveHarnessLauncher("claude", base, workingDirectory, platform);
}

export async function resolveHarnessLauncher(executable: "claude" | "opencode", base: NodeJS.ProcessEnv, workingDirectory: string, platform = process.platform): Promise<string> {
  // userInfo reads the OS account profile, not a caller-supplied HOME/APPDATA.
  const installedBinDirectories = platform === "win32" ? [join(userInfo().homedir, "AppData", "Roaming", "npm")] : [];
  const canonicalWorkingDirectory = await realpath(workingDirectory);
  const pathKey = Object.keys(base).find((key) => key.toUpperCase() === "PATH");
  const pathValue = pathKey ? base[pathKey] : undefined;
  const extensions = platform === "win32"
    ? (base.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const candidates: string[] = [];
  for (const entry of (pathValue ?? "").split(delimiter).filter(Boolean)) {
    if (!isAbsolute(entry)) continue;
    for (const extension of extensions) candidates.push(join(entry, `${executable}${extension.toLowerCase()}`));
  }
  for (const candidate of candidates) {
    const trusted = selectClaudeLauncher([candidate], workingDirectory, installedBinDirectories);
    if (!trusted) continue;
    try {
      await access(trusted, platform === "win32" ? constants.F_OK : constants.X_OK);
      if (!(await stat(trusted)).isFile()) continue;
      const canonicalCandidate = await realpath(trusted);
      if (!selectClaudeLauncher([canonicalCandidate], canonicalWorkingDirectory, installedBinDirectories)) continue;
      return trusted;
    } catch { /* keep searching */ }
  }
  throw new Error(`${executable} executable was not found in a trusted PATH location; project-local shims are excluded`);
}

export function claudeLaunchCommand(launcher: string, base: NodeJS.ProcessEnv, platform = process.platform): { command: string; prefix: string[] } {
  if (platform !== "win32" || ![".cmd", ".bat"].includes(extname(launcher).toLowerCase())) return { command: launcher, prefix: [] };
  const systemRoot = base.SystemRoot ?? base.SYSTEMROOT ?? "C:\\Windows";
  return { command: join(systemRoot, "System32", "cmd.exe"), prefix: ["/d", "/s", "/c", launcher] };
}


export const harnessLaunchCommand = claudeLaunchCommand;
