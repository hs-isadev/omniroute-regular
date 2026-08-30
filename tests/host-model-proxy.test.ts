import assert from "node:assert/strict";
import test from "node:test";
import { HostModelAnnotation, startHostModelProxy } from "../apps/cli/src/host-model-proxy.js";

const frame = (delta: object, finish_reason: string | null = null, model = "provider/actual-model") => `data: ${JSON.stringify({ model, choices: [{ index: 0, delta, finish_reason }] })}`;

test("stream label uses API metadata, preserves usage and never labels a tool turn", () => {
  const label = new HostModelAnnotation();
  const text = frame({ content: "Worker badge stays intact." });
  assert.equal(label.frame(text), text);
  const finish = label.frame(frame({}, "stop"));
  assert.match(finish, /Host model \(OpenRouter API\):/);
  assert.match(finish, /provider\/actual-model/);
  assert.equal(label.frame(frame({}, "stop")), frame({}, "stop"));
  const usage = 'data: {"choices":[],"usage":{"total_tokens":10}}';
  for (const unchanged of [usage, "data: [DONE]", ": keepalive", "data: invalid", 'data: {"error":{"message":"failed"}}']) assert.equal(label.frame(unchanged), unchanged);
  const tool = new HostModelAnnotation();
  tool.frame(frame({ content: "Calling a tool", tool_calls: [{ index: 0, function: { arguments: "{}" } }] }));
  assert.equal(tool.frame(frame({}, "stop")), frame({}, "stop"));
});

test("unknown model is not guessed; distinct metadata and text in final delta are preserved", () => {
  const unknown = new HostModelAnnotation();
  assert.match(unknown.frame(frame({ content: "answer" }, "stop", "openrouter/free")), /not reported by the API/);
  const label = new HostModelAnnotation();
  label.frame(frame({ content: "first" }, null, "provider/first"));
  const result = JSON.parse(label.frame(frame({ content: "last" }, "length", "provider/last")).slice(6));
  assert.match(result.choices[0].delta.content, /^last/);
  assert.match(result.choices[0].delta.content, /`provider\/first` → `provider\/last`/);
  assert.equal(result.choices[0].finish_reason, "length");
});

test("nonstream labels assistant text, not tool arguments", () => {
  const label = new HostModelAnnotation();
  const result = label.json({ model: "provider/model", choices: [{ finish_reason: "stop", message: { content: "Hello" } }] });
  assert.match(result.choices[0].message.content, /Hello[\s\S]*Host model/);
  const tool = { model: "provider/model", choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ function: { arguments: "{}" } }] } }] };
  assert.deepEqual(label.json(structuredClone(tool)), tool);
});

test("proxy authenticates locally, restricts routing and keeps the real key out of config", async () => {
  let calls = 0;
  const transport = (async (url: unknown, init: RequestInit) => {
    calls++;
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer upstream-test-secret");
    assert.equal(init.redirect, "error");
    return Response.json({ model: "provider/model", choices: [{ finish_reason: "stop", message: { content: "Answer" } }] });
  }) as typeof fetch;
  const proxy = await startHostModelProxy("upstream-test-secret", transport);
  const send = (body: object, headers: Record<string, string> = {}, path = "/chat/completions") => fetch(proxy.baseURL + path, { method: "POST", headers: { authorization: `Bearer ${proxy.token}`, ...headers }, body: JSON.stringify(body) });
  try {
    assert.notEqual(proxy.token, "upstream-test-secret");
    assert.equal((await send({model:"openrouter/free"}, {authorization:"Bearer wrong"})).status, 401);
    assert.equal((await send({model:"paid/model"})).status, 400);
    assert.equal((await send({model:"openrouter/free", models:["paid/model"]})).status, 400);
    assert.equal((await send({model:"openrouter/free"}, {origin:"https://untrusted.example"})).status, 403);
    assert.equal((await send({}, {}, "/other")).status, 404);
    assert.equal(calls, 0);
    const response = await send({model:"openrouter/free"});
    assert.equal(response.status, 200);
    assert.match((await response.json()).choices[0].message.content, /Host model/);
    const structured = await send({model:"openrouter/free", response_format:{type:"json_schema"}});
    assert.equal((await structured.json()).choices[0].message.content, "Answer");
    assert.equal(calls, 2);
  } finally { await proxy.close(); }
});

test("split UTF8 and CRLF streaming preserves content, finish, usage and DONE", async () => {
  const bytes = new TextEncoder().encode([frame({content:"héllo"}), frame({}, "stop"), 'data: {"choices":[],"usage":{"total_tokens":10}}', "data: [DONE]", ""].join("\r\n\r\n"));
  const transport = (async () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }), {headers:{"content-type":"text/event-stream"}})) as typeof fetch;
  const proxy = await startHostModelProxy("test-secret", transport);
  try {
    const response = await fetch(proxy.baseURL + "/chat/completions", {method:"POST", headers:{authorization:`Bearer ${proxy.token}`}, body:JSON.stringify({model:"openrouter/free",stream:true})});
    const output = await response.text();
    assert.match(output, /héllo/);
    assert.match(output, /Host model \(OpenRouter API\)/);
    assert.match(output, /"finish_reason":"stop"/);
    assert.match(output, /"total_tokens":10/);
    assert.ok(output.endsWith("data: [DONE]\n\n"));
  } finally { await proxy.close(); }
});

test("upstream errors preserve status and retry-after while redacting credentials", async () => {
  let localToken = "";
  const proxy = await startHostModelProxy("upstream-test-secret", (async () => new Response(JSON.stringify({error:{message:`upstream-test-secret ${localToken}`}}), {status:429,headers:{"retry-after":"60"}})) as typeof fetch);
  localToken = proxy.token;
  try {
    const response = await fetch(proxy.baseURL + "/chat/completions", {method:"POST",headers:{authorization:`Bearer ${proxy.token}`},body:JSON.stringify({model:"openrouter/free"})});
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    const output = await response.text();
    assert.ok(!output.includes(localToken));
    assert.ok(!output.includes("upstream-test-secret"));
  } finally { await proxy.close(); }
});

test("closing the proxy aborts an in-flight upstream call", async () => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let aborted = false;
  const transport = (async (_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, {once:true});
    started();
  })) as typeof fetch;
  const proxy = await startHostModelProxy("test-secret", transport);
  const pending = fetch(proxy.baseURL + "/chat/completions", {method:"POST",headers:{authorization:`Bearer ${proxy.token}`},body:JSON.stringify({model:"openrouter/free"})}).catch(() => null);
  await ready;
  await proxy.close();
  await pending;
  assert.equal(aborted, true);
});

test("incomplete streams are not synthesized into completed answers", async () => {
  const partial = frame({content:"unfinished"}) + "\n\n";
  const proxy = await startHostModelProxy("test-secret", (async () => new Response(partial, {headers:{"content-type":"text/event-stream"}})) as typeof fetch);
  try {
    const response = await fetch(proxy.baseURL + "/chat/completions", {method:"POST",headers:{authorization:`Bearer ${proxy.token}`},body:JSON.stringify({model:"openrouter/free",stream:true})});
    assert.equal(await response.text(), partial);
  } finally { await proxy.close(); }
});
