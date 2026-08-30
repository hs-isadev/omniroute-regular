import assert from "node:assert/strict";
import test from "node:test";
import { classifyTask } from "@omniroute/core";
import { validateRoutingPlan, type PlanValidationPolicy, type RouteRequest } from "@omniroute/contracts";
import { lunaFixture, modelFixture, planFixture, registryFixture } from "./helpers.js";

const policy: PlanValidationPolicy = {
  maxSubtasks: 4,
  maxParallelWorkers: 2,
  maxOutputTokensPerRequest: 8_000,
  perRequestBudgetUsd: 10,
  emergencyFallbackEnabled: false,
  estimatedInputTokens: 1_000,
  expectedSubtaskOutputTokens: 1_000,
  requiredCapabilities: [],
};
const snapshot = registryFixture([modelFixture(), lunaFixture()]);

test("valid routing plan is accepted", () => {
  const result = validateRoutingPlan(planFixture(), snapshot, policy);
  assert.equal(result.ok, true);
});

test("unknown model is rejected", () => {
  const plan = planFixture({ primary: { providerId: "openai", modelId: "invented-model", reasoningEffort: "low", maxOutputTokens: 500 } });
  const result = validateRoutingPlan(plan, snapshot, policy);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(" "), /outside the validated registry/);
});

test("capability mismatch and unknown capability metadata are rejected", () => {
  const noVision = lunaFixture({ capabilities: { ...lunaFixture().capabilities, imageInput: null } });
  const plan = planFixture({ requiredCapabilities: ["text", "vision"] });
  const result = validateRoutingPlan(plan, registryFixture([modelFixture(), noVision]), policy);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(" "), /confirmed vision capability/);
});

test("unsupported effort, output limit, fan-out, and disabled fallbacks are rejected", () => {
  const restricted = lunaFixture({ reasoningEfforts: ["none"], maxOutputTokens: 100 });
  const plan = planFixture({
    primary: { providerId: "openai", modelId: restricted.modelId, reasoningEffort: "high", maxOutputTokens: 500 },
    fallbacks: [{ providerId: "openai", modelId: modelFixture().modelId, reasoningEffort: "low", maxOutputTokens: 500 }],
    subtasks: Array.from({ length: 5 }, (_, index) => ({ id: `s${index}`, goal: "work", dependencies: [], providerId: "openai", modelId: restricted.modelId, reasoningEffort: "none" })),
  });
  const result = validateRoutingPlan(plan, registryFixture([modelFixture(), restricted]), policy);
  assert.equal(result.ok, false);
  if (!result.ok) {
    const errors = result.errors.join(" ");
    assert.match(errors, /unsupported/);
    assert.match(errors, /output limit/);
    assert.match(errors, /fan-out/);
    assert.match(errors, /fallback/);
  }
});

test("dependency cycles are rejected", () => {
  const plan = planFixture({ executionMode: "decomposed", subtasks: [
    { id: "a", goal: "A", dependencies: ["b"], providerId: "openai", modelId: "gpt-5.6-luna", reasoningEffort: "low" },
    { id: "b", goal: "B", dependencies: ["a"], providerId: "openai", modelId: "gpt-5.6-luna", reasoningEffort: "low" },
  ] });
  const result = validateRoutingPlan(plan, snapshot, policy);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(" "), /cycle/);
});

test("budget and unknown pricing are rejected deterministically", () => {
  const expensivePolicy = { ...policy, perRequestBudgetUsd: 0.000001 };
  assert.equal(validateRoutingPlan(planFixture(), snapshot, expensivePolicy).ok, false);
  const unknownPrice = lunaFixture({ pricing: { inputPerMillionUsd: null, outputPerMillionUsd: null, cachedInputPerMillionUsd: null, updatedAt: null } });
  const result = validateRoutingPlan(planFixture(), registryFixture([modelFixture(), unknownPrice]), policy);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(" "), /pricing is unknown/);
});

function request(prompt: string, attachments: RouteRequest["attachments"] = []): RouteRequest {
  return { prompt, sourceClient: "test", hostApplication: "test", hostModel: null, hostModelAuthoritative: false, attachments, requestedCapabilities: [], maxOutputTokens: null, privacyMode: null, metadata: {} };
}

test("task classifier uses risk, dependencies, tools, outputs, and attachments—not prompt length alone", () => {
  assert.equal(classifyTask(request("Format these three labels alphabetically.")).suggestedClass, "micro");
  assert.equal(classifyTask(request("Implement a multi-file repository migration, then run tests and produce three deliverables.")).suggestedClass, "medium");
  assert.equal(classifyTask(request("Rotate production credentials and delete the old database after validating the security plan.")).suggestedClass, "critical");
  const attachment = classifyTask(request("Summarize it.", [{ name: "large.txt", mediaType: "text/plain", size: 3_000_000, text: "" }]));
  assert.ok(["medium", "large"].includes(attachment.suggestedClass));
  assert.ok(attachment.requiredCapabilities.includes("long_context"));
});

test("intent separates everyday questions and tiny work from coding, tools and risk", () => {
  for (const prompt of ["Hi, how are you?", "Why is the sky blue?", "What is an API?", "What is Python?", "Explain this focused design."]) assert.equal(classifyTask(request(prompt)).intent, "casual_question", prompt);
  for (const prompt of ["Rewrite this sentence politely.", "Sort these labels alphabetically."]) assert.equal(classifyTask(request(prompt)).intent, "light_task", prompt);
  for (const prompt of ["Write a simple Python function to add two numbers.", "Write a tiny function to add numbers.", "Review this code for errors.", "Write a basic SQL query.", "Explain this code: ```js\nx + 1\n```", "Fix this Kotlin snippet."]) assert.equal(classifyTask(request(prompt)).intent, "coding", prompt);
  assert.equal(classifyTask({ ...request("Check this small snippet."), requestedCapabilities: ["coding"] }).intent, "coding");
  for (const prompt of ["Implement and debug this code.", "Prove this mathematical theorem.", "Research current API limits.", "Refactor the entire repository, then run tests.", "Delete the production database.", "Give medical advice about chest pain.", "Explain quantum mechanics in-depth."]) assert.ok(!["casual_question", "light_task"].includes(classifyTask(request(prompt)).intent), prompt);
  assert.equal(classifyTask(request("What is an API?")).requiresTools, false);
  assert.equal(classifyTask({ ...request("Hi"), requestedCapabilities: ["web"] }).intent, "complex_task");
});
