const state = { csrf: null, busy: false };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function api(path, init = {}) {
  const method = init.method ?? "GET";
  const headers = { "content-type": "application/json", ...(init.headers ?? {}) };
  if (!["GET", "HEAD"].includes(method) && state.csrf) headers["x-omniroute-csrf"] = state.csrf;
  const response = await fetch(path, { ...init, method, headers, credentials: "same-origin" });
  if (!response.ok) {
    const value = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(value.error?.message ?? `HTTP ${response.status}`);
  }
  return response;
}

function switchView(name) {
  document.querySelectorAll(".nav").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  if (name === "models") void loadModels();
  if (name === "routes") void loadRoutes();
  if (name === "settings") void loadConfig();
}

document.querySelectorAll(".nav").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => { $("#prompt").value = button.dataset.prompt; $("#prompt").focus(); }));

function addMessage(kind, text = "") {
  const article = document.createElement("article");
  article.className = `message ${kind}`;
  if (kind === "assistant") article.innerHTML = '<div class="stage">Planning route…</div><pre></pre><div class="badge"></div>';
  else article.textContent = text;
  $("#conversation").append(article);
  article.scrollIntoView({ behavior: "smooth", block: "end" });
  return article;
}

async function streamRoute(prompt, privacyMode, routingMode, article) {
  const response = await api("/v1/routes", { method: "POST", headers: { accept: "text/event-stream" }, body: JSON.stringify({ prompt, routingMode, sourceClient: "dashboard", hostApplication: "omniroute-dashboard", hostModel: null, hostModelAuthoritative: false, attachments: [], requestedCapabilities: [], maxOutputTokens: null, privacyMode, metadata: {} }) });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", event = "message", data = [];
  const textNode = article.querySelector("pre"), stage = article.querySelector(".stage"), badge = article.querySelector(".badge");
  const dispatch = () => {
    if (!data.length) return;
    let value; try { value = JSON.parse(data.join("\n")); } catch { value = data.join("\n"); }
    if (event === "route.planned") stage.textContent = `${value.plan.taskClass} · ${value.plan.executionMode} · ${value.plan.primary.providerId}/${value.plan.primary.modelId}`;
    if (event === "worker.started") stage.textContent = `${value.subtaskId ?? "final"} · ${value.providerId}/${value.modelId}`;
    if (event === "worker.delta" && value.subtaskId === null) textNode.textContent += value.text;
    if (event === "result") { textNode.textContent = value.answer; badge.textContent = value.badge; stage.textContent = "Completed with validated attribution"; }
    if (event === "route.failed" || event === "error") stage.textContent = value.error ?? value.message ?? "Route failed";
    event = "message"; data = [];
    article.scrollIntoView({ block: "end" });
  };
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    while (true) {
      const index = buffer.indexOf("\n"); if (index < 0) break;
      const line = buffer.slice(0, index).replace(/\r$/, ""); buffer = buffer.slice(index + 1);
      if (!line) dispatch(); else if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
  }
  dispatch();
}

$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (state.busy) return;
  const prompt = $("#prompt").value.trim(); if (!prompt) return;
  state.busy = true; $("#send").disabled = true; addMessage("user", prompt); const assistant = addMessage("assistant"); $("#prompt").value = "";
  try { await streamRoute(prompt, $("#privacy").checked, $("#routing-mode").value, assistant); }
  catch (error) { assistant.querySelector(".stage").textContent = error.message; }
  finally { state.busy = false; $("#send").disabled = false; }
});

async function loadModels(refresh = false) {
  try {
    const snapshot = await (await api(`/v1/models${refresh ? "?refresh=1" : ""}`)).json();
    const models = snapshot.models ?? [];
    $("#model-stats").innerHTML = `<div class="stat"><strong>${models.length}</strong><span>Discovered models</span></div><div class="stat"><strong>${models.filter((model) => model.health.status === "healthy").length}</strong><span>Healthy</span></div><div class="stat"><strong>${models.filter((model) => model.enabled && model.allowed).length}</strong><span>Enabled and allowed</span></div>`;
    $("#models-body").innerHTML = models.map((model) => {
      const capabilities = Object.entries(model.capabilities).filter(([, value]) => value === true).map(([key]) => `<span class="chip">${escapeHtml(key)}</span>`).join("");
      return `<tr><td><strong>${escapeHtml(model.providerId)}</strong><br><code>${escapeHtml(model.modelId)}</code></td><td><span class="status ${escapeHtml(model.health.status)}">${escapeHtml(model.health.status)}</span></td><td><div class="chips">${capabilities || '<span class="chip">unknown</span>'}</div></td><td>${model.contextWindow?.toLocaleString() ?? "unknown"} ctx<br>${model.maxOutputTokens?.toLocaleString() ?? "unknown"} out</td><td>${model.enabled ? "enabled" : "disabled"} · ${model.allowed ? "allowed" : "denied"}</td></tr>`;
    }).join("");
  } catch (error) { $("#models-body").innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; }
}

async function loadRoutes() {
  try {
    const { routes } = await (await api("/v1/routes?limit=100")).json();
    $("#routes-body").innerHTML = routes.map((route) => `<tr><td><code>${escapeHtml(route.routeId)}</code><br>${new Date(route.startedAt).toLocaleString()}</td><td>${escapeHtml(route.taskClass)}</td><td>${escapeHtml(`${route.orchestrator.providerId}/${route.orchestrator.modelId}`)}<br>${escapeHtml(route.orchestrator.reasoningEffort)}</td><td>${escapeHtml(`${route.worker.providerId}/${route.worker.modelId}`)}<br>${escapeHtml(route.worker.reasoningEffort)}</td><td>${route.usage.inputTokens + route.usage.outputTokens} tok<br>${route.usage.estimatedCostUsd == null ? "cost unknown" : `$${route.usage.estimatedCostUsd.toFixed(4)}`}</td><td><span class="status ${escapeHtml(route.status)}">${escapeHtml(route.status)}</span></td></tr>`).join("") || '<tr><td colspan="6">No routes yet.</td></tr>';
  } catch (error) { $("#routes-body").innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`; }
}

async function loadConfig() {
  try {
    const config = await (await api("/v1/config")).json();
    $("#daily").value = config.budgets.dailyUsd ?? ""; $("#monthly").value = config.budgets.monthlyUsd ?? ""; $("#per-request").value = config.budgets.perRequestUsd ?? "";
  } catch (error) { $("#budget-status").textContent = error.message; }
}

$("#budget-form").addEventListener("submit", async (event) => {
  event.preventDefault(); $("#budget-status").textContent = "Saving…";
  try {
    await api("/v1/budget", { method: "PATCH", body: JSON.stringify({ dailyUsd: Number($("#daily").value), monthlyUsd: Number($("#monthly").value), perRequestUsd: Number($("#per-request").value) }) });
    $("#budget-status").textContent = "Saved";
  } catch (error) { $("#budget-status").textContent = error.message; }
});

$("#refresh-models").addEventListener("click", () => void loadModels(true)); $("#refresh-routes").addEventListener("click", () => void loadRoutes());

async function boot() {
  try {
    const session = await (await api("/v1/session")).json(); state.csrf = session.csrf;
    const health = await (await fetch("/v1/health")).json(); $("#health-label").textContent = `${health.status} · ${health.version}`; $("#routing-mode").value = health.defaultMode; $("#routing-policy").textContent = `${health.freeOnly ? "free only" : "configured"} · ${health.orchestrator}`; document.querySelector(".pulse").classList.add("ok");
  } catch (error) { $("#health-label").textContent = "Session required"; }
}
void boot();
