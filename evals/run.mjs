import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { classifyTask } from "../packages/core/dist/index.js";

const fixtures = JSON.parse(await readFile(new URL("./dataset.json", import.meta.url), "utf8"));
const rows = [];
const prices = { luna: { input: .2, output: 1.2 }, terra: { input: 2, output: 12 }, sol: { input: 4, output: 20 } };

for (const fixture of fixtures) {
  const started = performance.now();
  const request = { prompt: fixture.prompt, sourceClient: "eval", hostApplication: "eval", hostModel: null, hostModelAuthoritative: false, attachments: fixture.attachments ?? [], requestedCapabilities: fixture.requiredCapabilities ?? [], maxOutputTokens: null, privacyMode: false, metadata: {} };
  const signals = classifyTask(request);
  const workerTier = signals.suggestedClass === "micro" || signals.suggestedClass === "small" ? "luna" : signals.suggestedClass === "medium" ? "terra" : "sol";
  const classAccepted = fixture.acceptableClasses.includes(signals.suggestedClass);
  const capabilitiesAccepted = fixture.requiredCapabilities.every((capability) => signals.requiredCapabilities.includes(capability));
  const workerTierAccepted = workerTier === fixture.expectedWorkerTier;
  const estimatedOutput = signals.suggestedClass === "micro" ? 300 : signals.suggestedClass === "small" ? 1000 : signals.suggestedClass === "medium" ? 3000 : 6000;
  const price = prices[workerTier];
  const estimatedCostUsd = (signals.estimatedInputTokens * price.input + estimatedOutput * price.output) / 1_000_000;
  rows.push({ id: fixture.id, expectedClasses: fixture.acceptableClasses, actualClass: signals.suggestedClass, classAccepted, capabilitiesAccepted, workerTier, expectedWorkerTier: fixture.expectedWorkerTier, workerTierAccepted, unnecessarySolWorker: workerTier === "sol" && !["large", "critical"].includes(signals.suggestedClass), estimatedCostUsd, latencyMs: performance.now() - started });
}

const passed = rows.filter((row) => row.classAccepted && row.capabilitiesAccepted && row.workerTierAccepted).length;
const report = {
  generatedAt: new Date().toISOString(),
  mode: "deterministic pre-route policy evaluation; no provider calls",
  fixtures: rows.length,
  passed,
  routeAccuracy: passed / rows.length,
  unnecessarySolWorkerRate: rows.filter((row) => row.unnecessarySolWorker).length / rows.length,
  averageLatencyMs: rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length,
  totalEstimatedWorkerCostUsd: rows.reduce((sum, row) => sum + row.estimatedCostUsd, 0),
  rows,
};
await writeFile(new URL("./report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ fixtures: report.fixtures, passed: report.passed, routeAccuracy: report.routeAccuracy, unnecessarySolWorkerRate: report.unnecessarySolWorkerRate, averageLatencyMs: report.averageLatencyMs, totalEstimatedWorkerCostUsd: report.totalEstimatedWorkerCostUsd }, null, 2));
if (passed !== rows.length) process.exitCode = 1;
