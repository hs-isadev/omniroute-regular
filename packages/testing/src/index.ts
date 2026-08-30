import type { ProviderErrorShape, Usage } from "@omniroute/contracts";
import type { GenerateRequest, GenerateResult, ProviderAdapter, ProviderHealth, ProviderModel, ProviderStreamEvent } from "@omniroute/providers";

export class MockProvider implements ProviderAdapter {
  readonly supportsStreaming = true;
  calls: GenerateRequest[] = [];
  cancelled: string[] = [];
  health: ProviderHealth = { status: "healthy", checkedAt: new Date(0).toISOString(), latencyMs: 1, message: null };
  models: ProviderModel[] = [];
  responses: Array<{ text: string; usage?: Usage; error?: Error }> = [];

  constructor(readonly id: string) {}
  async listModels(): Promise<ProviderModel[]> { return this.models; }
  async healthCheck(): Promise<ProviderHealth> { return this.health; }
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    this.calls.push(request);
    const next = this.responses.shift() ?? { text: "mock response" };
    if (next.error) throw next.error;
    return { text: next.text, responseId: `mock-${this.calls.length}`, usage: next.usage ?? { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, estimatedCostUsd: null } };
  }
  async *stream(request: GenerateRequest): AsyncGenerator<ProviderStreamEvent> {
    const result = await this.generate(request);
    yield { type: "start", responseId: result.responseId };
    for (const part of result.text.match(/.{1,8}/gs) ?? []) yield { type: "delta", text: part };
    yield { type: "usage", usage: result.usage };
    yield { type: "done", responseId: result.responseId };
  }
  async cancel(responseId: string): Promise<void> { this.cancelled.push(responseId); }
  classifyError(error: unknown): ProviderErrorShape { return { category: "unknown", message: error instanceof Error ? error.message : String(error), retryable: false, retryAfterMs: null, providerStatus: null }; }
}
