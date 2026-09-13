// Offline allowlist projection. Never print or copy raw records, prompts or error bodies.
import {readFile} from 'node:fs/promises';

export function summarize(records) {
  const group = selector => {
    const counts = new Map();
    for (const record of records) {
      const key = selector(record);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts].map(([key, count]) => ({key, count, percent: Number((count * 100 / records.length).toFixed(2))}));
  };
  const knownPolicies = [
    ['regular', /regular mode bypassed/], ['free_only', /free-only provider policy/],
    ['lightweight', /lightweight model preference/], ['quality', /quality model preference/],
    ['provider_first', /provider-first free selection/], ['quality_floor', /quality floor/],
    ['rate_limit', /rate_limit/], ['unavailable', /unavailable/], ['timeout', /timeout/],
  ];
  return {
    records: records.length,
    first: records[0]?.startedAt ?? null, last: records.at(-1)?.startedAt ?? null,
    providers: group(r => r.worker?.providerId ?? 'unknown'),
    models: group(r => `${r.worker?.providerId}/${r.worker?.modelId}`),
    taskClass: group(r => `${r.taskClass}|${r.worker?.providerId}`),
    sourceHost: group(r => `${r.sourceClient}|${r.hostApplication}|${r.worker?.providerId}`),
    status: group(r => `${r.status}|${r.worker?.providerId}`),
    fallback: group(r => `${r.worker?.providerId}|recorded=${Boolean(r.fallbacksAttempted?.length)}`),
    capabilities: group(r => `${r.worker?.providerId}|${r.routingDiagnostics?.[0]?.requiredCapabilities?.join(',') ?? 'not-recorded'}`),
    selectedHealth: group(r => `${r.worker?.providerId}|${r.routingDiagnostics?.[0]?.candidates?.find(c => c.providerId === r.worker?.providerId && c.modelId === r.worker?.modelId)?.health ?? 'not-recorded'}`),
    policyCounts: knownPolicies.map(([code, pattern]) => ({code, count: records.filter(r => r.policyDecisions?.some(p => pattern.test(p))).length})),
    limitations: 'Legacy records lack capability requirements, candidate exclusions, health snapshots and initial selection reasons. Fallback arrays may include selection changes without failures. Do not infer historical eligibility from current configuration.',
  };
}

if (process.argv[1]?.endsWith('summarize-route-history.mjs')) {
  const records = (await readFile(process.argv[2], 'utf8')).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  process.stdout.write(JSON.stringify(summarize(records), null, 2) + '\n');
}
