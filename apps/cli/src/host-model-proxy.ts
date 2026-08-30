import { randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { Redactor } from "@omniroute/observability";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MAX_BODY = 16 * 1024 * 1024;
const MAX_FRAME = 2 * 1024 * 1024;
type Json = Record<string, any>;

export class HostModelAnnotation {
  private models = new Set<string>();
  private textChoices = new Set<number>();
  private toolChoices = new Set<number>();
  private labelledChoices = new Set<number>();

  private observe(value: unknown): void {
    if (typeof value === "string" && /^[a-zA-Z0-9._:@/+\-]{1,200}$/.test(value) && !["openrouter/free", "openrouter/openrouter/free"].includes(value) && !value.startsWith("sk-")) this.models.add(value);
  }

  private footer(): string {
    const model = this.models.size ? [...this.models].map(value => `\`${value}\``).join(" → ") : "not reported by the API (router alias only)";
    return `\n\n---\nHost model (OpenRouter API): ${model}\n`;
  }

  json(payload: Json): Json {
    this.observe(payload.model);
    if (payload.error || !Array.isArray(payload.choices)) return payload;
    for (const choice of payload.choices) {
      if (["stop", "length"].includes(choice.finish_reason) && typeof choice.message?.content === "string" && choice.message.content && !choice.message.tool_calls?.length && !choice.message.function_call) choice.message.content += this.footer();
    }
    return payload;
  }

  frame(frame: string): string {
    const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return frame;
    let payload: Json;
    try { payload = JSON.parse(data) as Json; } catch { return frame; }
    if (!payload || typeof payload !== "object") return frame;
    this.observe(payload.model);
    if (payload.error || !Array.isArray(payload.choices)) return frame;
    let changed = false;
    for (const choice of payload.choices) {
      const index = choice.index ?? 0;
      if (typeof choice.delta?.content === "string" && choice.delta.content) this.textChoices.add(index);
      if (choice.delta?.tool_calls?.length || choice.delta?.function_call) this.toolChoices.add(index);
      if (["stop", "length"].includes(choice.finish_reason) && this.textChoices.has(index) && !this.toolChoices.has(index) && !this.labelledChoices.has(index)) {
        choice.delta = { ...choice.delta, content: (choice.delta?.content ?? "") + this.footer() };
        this.labelledChoices.add(index);
        changed = true;
      }
    }
    if (!changed) return frame;
    const otherLines = frame.split("\n").filter(line => !line.startsWith("data:"));
    return [...otherLines, `data: ${JSON.stringify(payload)}`].join("\n");
  }
}

async function write(response: ServerResponse, text: string, signal: AbortSignal): Promise<void> {
  if (!response.write(text)) await once(response, "drain", { signal });
}

/** Session-local transport adapter. No persistence, new destination, or model selection. */
export async function startHostModelProxy(apiKey: string, transport: typeof fetch = fetch): Promise<{ baseURL: string; token: string; close(): Promise<void> }> {
  const token = randomBytes(32).toString("hex");
  const expectedAuth = Buffer.from(`Bearer ${token}`);
  const redactor = new Redactor(); redactor.register(apiKey); redactor.register(token);
  const active = new Set<AbortController>();
  const server = createServer(async (request, response) => {
    const error = (status: number, message: string): void => {
      response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: { message } }));
    };
    const authorization = Buffer.from(request.headers.authorization ?? "");
    if (authorization.length !== expectedAuth.length || !timingSafeEqual(authorization, expectedAuth)) { error(401, "Local model-label authentication required"); return; }
    if (request.method !== "POST" || request.url !== "/chat/completions") { error(404, "Unsupported local model-label endpoint"); return; }
    if (request.headers.origin) { error(403, "Browser requests are not supported"); return; }
    const controller = new AbortController(); active.add(controller);
    const timer = setTimeout(() => controller.abort(), 240_000);
    request.once("aborted", () => controller.abort());
    response.once("close", () => { if (!response.writableEnded) controller.abort(); });
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > MAX_BODY) { error(413, "Model request is too large"); return; }
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      let input: Json;
      try { input = JSON.parse(raw) as Json; } catch { error(400, "Invalid JSON request"); return; }
      if (!input || typeof input !== "object" || input.model !== "openrouter/free" || input.models !== undefined) { error(400, "Only the configured free host router is allowed"); return; }
      const upstream = await transport(ENDPOINT, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: raw, signal: controller.signal, redirect: "error" });
      if (!upstream.ok) {
        response.writeHead(upstream.status, { "content-type": "application/json", "cache-control": "no-store", ...(upstream.headers.get("retry-after") ? { "retry-after": redactor.redactText(upstream.headers.get("retry-after")!) } : {}) });
        response.end(redactor.redactText(await upstream.text())); return;
      }
      const annotate = !input.response_format || input.response_format.type === "text";
      const annotation = new HostModelAnnotation();
      if (input.stream === true) {
        if (!upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) { error(502, "Expected a streaming host response"); return; }
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
        const reader = upstream.body.getReader(), decoder = new TextDecoder();
        let pending = "";
        try {
          for (;;) {
            const item = await reader.read();
            pending += item.done ? decoder.decode() : decoder.decode(item.value, { stream: true });
            pending = pending.replace(/\r\n/g, "\n");
            let boundary: number;
            while ((boundary = pending.indexOf("\n\n")) >= 0) {
              const frame = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
              if (frame.length > MAX_FRAME) throw new Error("Host stream frame too large");
              await write(response, `${annotate ? annotation.frame(frame) : frame}\n\n`, controller.signal);
            }
            if (pending.length > MAX_FRAME) throw new Error("Host stream frame too large");
            if (item.done) break;
          }
          // Do not turn an incomplete stream into an apparently completed one.
          if (pending) await write(response, pending, controller.signal);
          response.end();
        } finally { reader.releaseLock(); }
      } else {
        const payload = await upstream.json() as Json;
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify(annotate && payload && typeof payload === "object" ? annotation.json(payload) : payload));
      }
    } catch {
      if (!response.headersSent) error(502, "Host model request failed");
      else response.destroy();
    } finally { clearTimeout(timer); active.delete(controller); controller.abort(); }
  });
  server.requestTimeout = 240_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start local model-label adapter");
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    token,
    async close() {
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
