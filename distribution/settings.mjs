import { mkdir } from 'node:fs/promises';
import { DEFAULT_CONFIG, getRuntimePaths, saveConfig } from '../packages/config/dist/index.js';
import { SecretVault } from '../packages/vault/dist/index.js';
import { createConfiguredProvider } from '../packages/providers/dist/index.js';
import { globalRedactor } from '../packages/observability/dist/index.js';
import { pathToFileURL } from 'node:url';

export const fields = {
  openrouter: ['OPENROUTER_API_KEY'], groq: ['GROQ_API_KEY'], gemini: ['GEMINI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], cohere: ['COHERE_API_KEY'],
  cloudflare: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], huggingface: ['HF_TOKEN'],
};
export function regularConfig() {
  // Never send newly entered keys to an endpoint from editable runtime config.
  const existing = structuredClone(DEFAULT_CONFIG);
  existing.routing.defaultMode = 'regular'; existing.routing.freeOnly = true;
  existing.routing.orchestratorProviderId = 'openrouter'; existing.routing.orchestratorModelId = 'openrouter/free';
  existing.routing.directProviderOrder = ['groq','gemini','mistral','cohere','cloudflare','huggingface','openrouter'];
  existing.daemon.port = 47839; existing.daemon.allowedOrigins = ['http://127.0.0.1:47839'];
  for (const provider of existing.providers) {
    provider.enabled = false;
    if (provider.id in fields) provider.freeTierConfirmed = true;
    if (provider.id === 'openrouter') {
      // Retain explicit disabled records: config migration otherwise re-adds
      // omitted default models, including unavailable legacy free slugs.
      for (const model of provider.models) {
        model.enabled = model.modelId === 'openrouter/free';
        model.allowed = model.enabled;
      }
      provider.freeModelOrder = ['openrouter/free'];
    }
  }
  return existing;
}
export async function configure(input, paths, { protector, factory = createConfiguredProvider } = {}) {
  if (input.freeOnlyConfirmed !== true) throw new Error('Confirm free-only provider account settings first.');
  if (!input.keys || typeof input.keys !== 'object') throw new Error('Missing key fields.');
  for (const value of Object.values(input.keys)) {
    if (typeof value !== 'string' || /[\r\n\0]/.test(value) || value.length > 4096) throw new Error('Invalid key format.');
    globalRedactor.register(value);
  }
  const vault = await SecretVault.load(paths.vault, protector);
  try {
    const config = regularConfig();
    if (!input.keys.OPENROUTER_API_KEY?.trim() && !vault.get('openrouter')) throw new Error('An OpenRouter API key is required.');
    const accepted = [], failed = [];
    for (const [id, names] of Object.entries(fields)) {
      const supplied = names.some(name => input.keys[name]?.trim());
      const settings = config.providers.find(provider => provider.id === id);
      if (!supplied) { settings.enabled = !!vault.get(id); continue; }
      const values = Object.fromEntries(names.map(name => [name, input.keys[name]?.trim() ?? '']));
      if (Object.values(values).some(value => !value)) { failed.push(id); settings.enabled = !!vault.get(id); continue; }
      settings.freeTierConfirmed = true;
      try {
        const provider = factory(settings, values);
        const modelId = { openrouter:'openrouter/free', groq:'openai/gpt-oss-120b', gemini:'gemini-3.1-flash-lite' }[id] ?? settings.models[0].modelId;
        const result = await provider.generate({modelId, instructions:'Reply briefly.', prompt:'Reply with OK only.', maxOutputTokens:512, reasoningEffort:'none', jsonSchema:null, schemaName:null, safetyIdentifier:null, signal:AbortSignal.timeout(30_000)});
        if (!result.text.trim()) throw new Error('No answer');
        vault.set(id, values); settings.enabled = true; accepted.push(id);
      } catch { failed.push(id); settings.enabled = !!vault.get(id); }
    }
    // Failed entries never replace existing credentials. Other valid entries may be saved.
    if (!vault.get('openrouter')) throw new Error('OpenRouter validation failed. Check the key and free quota, then try again.');
    await mkdir(paths.vaultDir, {recursive:true});
    await vault.save(paths.vault); await saveConfig(config, paths);
    return { accepted, failed, ready:true };
  } finally { vault.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let text = ''; for await (const chunk of process.stdin) { text += chunk; if (text.length > 65536) throw new Error('Input too large'); }
    const result = await configure(JSON.parse(text), getRuntimePaths());
    process.stdout.write(JSON.stringify(result));
  } catch (error) { process.stdout.write(JSON.stringify({ready:false,error:globalRedactor.redactText(error.message)})); process.exitCode=1; }
}
