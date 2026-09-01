import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { AttributionRecord, TokenSavingsSummary } from "@omniroute/contracts";

const STATIC_SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{12,}\b/g,
  /\b(?:OPENAI|ANTHROPIC|OPENROUTER|AZURE_OPENAI|CUSTOM_OPENAI)_API_KEY\s*[=:]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /\b(?:api[_-]?key|access[_-]?token|secret)\s*[=:]\s*["']?[^\s,"'}]+/gi,
];

export class Redactor {
  readonly #values = new Set<string>();

  register(value: string): void {
    if (value.length >= 4) this.#values.add(value);
  }

  redactText(input: string): string {
    let output = input;
    for (const value of [...this.#values].sort((a, b) => b.length - a.length)) output = output.split(value).join("[REDACTED]");
    for (const pattern of STATIC_SECRET_PATTERNS) output = output.replace(pattern, "[REDACTED]");
    return output;
  }

  redact<T>(value: T): T {
    if (typeof value === "string") return this.redactText(value) as T;
    if (Array.isArray(value)) return value.map((item) => this.redact(item)) as T;
    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        if (/^(?:api[_-]?key|.*[_-]api[_-]?key|token|.*[_-]token|secret|.*[_-]secret|authorization|password|credential|credentials)$/i.test(key)) output[key] = "[REDACTED]";
        else output[key] = this.redact(item);
      }
      return output as T;
    }
    return value;
  }
}

export const globalRedactor = new Redactor();

export class SafeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(globalRedactor.redactText(message));
    this.name = "SafeError";
    this.code = code;
    this.status = status;
  }
}

export function safeError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof SafeError) return { code: error.code, message: globalRedactor.redactText(error.message), status: error.status };
  if (error instanceof Error) return { code: "INTERNAL_ERROR", message: globalRedactor.redactText(error.message || "Internal error"), status: 500 };
  return { code: "INTERNAL_ERROR", message: "Internal error", status: 500 };
}

export class JsonlLogger {
  constructor(private readonly path: string, private readonly maxBytes = 5_000_000) {}

  async write(level: "debug" | "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await this.rotateIfNeeded();
    const record = globalRedactor.redact({ at: new Date().toISOString(), level, event, ...data });
    await appendFile(this.path, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      if ((await stat(this.path)).size >= this.maxBytes) await rename(this.path, `${this.path}.1`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export class AuditStore {
  constructor(private readonly path: string) {}

  async append(record: AttributionRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const safeRecord = globalRedactor.redact(record);
    await appendFile(this.path, `${JSON.stringify(safeRecord)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async recent(limit = 50): Promise<AttributionRecord[]> {
    try {
      const lines = (await readFile(this.path, "utf8")).split(/\r?\n/).filter(Boolean);
      return lines.slice(-Math.max(1, Math.min(limit, 500))).reverse().map((line) => JSON.parse(line) as AttributionRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async spendingSince(since: Date): Promise<number> {
    try {
      const lines = (await readFile(this.path, "utf8")).split(/\r?\n/).filter(Boolean);
      let total = 0;
      for (const line of lines) {
        const record = JSON.parse(line) as AttributionRecord;
        if (new Date(record.startedAt) >= since) total += record.usage.estimatedCostUsd ?? 0;
      }
      return total;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }
  }

  async tokenSavingsSummary(): Promise<TokenSavingsSummary> {
    let records: AttributionRecord[] = [];
    try {
      records = (await readFile(this.path, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AttributionRecord);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const reported = records.filter((record) => record.usage.measurement === "provider-reported");
    const input = reported.reduce((sum, record) => sum + record.usage.inputTokens, 0);
    const output = reported.reduce((sum, record) => sum + record.usage.outputTokens, 0);
    return {
      routes: records.length,
      providerReportedRoutes: reported.length,
      routesWithoutProviderUsage: records.length - reported.length,
      providerReportedInputTokens: input,
      providerReportedOutputTokens: output,
      providerReportedTokensOffloaded: input + output,
      actualHostTokensSaved: null,
      savingsStatus: "counterfactual-host-usage-unavailable",
      explanation: "Offloaded tokens are provider-reported worker usage. Actual host tokens saved require the unknowable counterfactual usage of the same task without OmniRoute, so no exact savings number is claimed.",
    };
  }
}
