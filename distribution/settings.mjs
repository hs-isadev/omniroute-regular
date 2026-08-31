import { mkdir } from 'node:fs/promises';
import { DEFAULT_CONFIG, getRuntimePaths, saveConfig, loadConfig, validateConfig, freeWorkerModel } from '../packages/config/dist/index.js';
import { SecretVault } from '../packages/vault/dist/index.js';
import { createConfiguredProvider } from '../packages/providers/dist/index.js';
import { globalRedactor } from '../packages/observability/dist/index.js';
import { pathToFileURL } from 'node:url';
import { CREDIT_PROVIDERS, CODING_CANDIDATES } from './regular-policy.mjs';
export { CODING_CANDIDATES } from './regular-policy.mjs';

export const fields = {
  openrouter: ['OPENROUTER_API_KEY'], groq: ['GROQ_API_KEY'], gemini: ['GEMINI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], cohere: ['COHERE_API_KEY'],
  cloudflare: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], huggingface: ['HF_TOKEN'],
  kilo: ['KILO_API_KEY'], zai: ['ZAI_API_KEY'], nvidia: ['NVIDIA_API_KEY'],
  vercel: ['VERCEL_AI_GATEWAY_API_KEY'], 'opencode-zen': ['OPENCODE_ZEN_API_KEY'],
};
export function regularConfig() {
  // Never send newly entered keys to an endpoint from editable runtime config.
  const existing = structuredClone(DEFAULT_CONFIG);
  existing.routing.defaultMode = 'regular'; existing.routing.freeOnly = true;
  existing.routing.orchestratorProviderId = 'openrouter'; existing.routing.orchestratorModelId = 'openrouter/free';
  existing.routing.directProviderOrder = ['groq','gemini','mistral','cohere','cloudflare','huggingface','zai','kilo','nvidia','vercel','opencode-zen','openrouter'];
  existing.daemon.port = 47839; existing.daemon.allowedOrigins = ['http://127.0.0.1:47839'];
  existing.reliability.retryLimit=0;
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
  for(const candidate of CODING_CANDIDATES) existing.providers.find(p=>p.id===candidate.provider).models.push({...freeWorkerModel(candidate.model,candidate.context),enabled:false,allowed:false,intelligenceTier:5});
  return existing;
}
export async function configure(input, paths, { protector, factory = createConfiguredProvider, existingSetup = false } = {}) {
  if (input.freeOnlyConfirmed !== true) throw new Error('Confirm free-only provider account settings first.');
  if (!input.keys || typeof input.keys !== 'object') throw new Error('Missing key fields.');
  const known=new Set(Object.values(fields).flat());
  if(Object.keys(input.keys).some(key=>!known.has(key))) throw new Error('Unknown credential field. Use only the supplied template fields.');
  if(!existingSetup&&CREDIT_PROVIDERS.some(id=>fields[id].some(name=>input.keys[name]?.trim()))) throw new Error('Credit-based providers are disabled in strict Regular mode.');
  for (const value of Object.values(input.keys)) {
    if (typeof value !== 'string' || /[\r\n\0]/.test(value) || value.length > 4096) throw new Error('Invalid key format.');
    globalRedactor.register(value);
  }
  const vault = await SecretVault.load(paths.vault, protector);
  try {
    const config = existingSetup ? await loadConfig(paths) : regularConfig();
    if(!existingSetup) {
      let previous;try {previous=await loadConfig(paths);}catch {/* Missing/invalid previous config cannot supply an endpoint. */}
      for(const provider of config.providers) provider.enabled=provider.id in fields && !!vault.get(provider.id);
      for(const candidate of CODING_CANDIDATES) {
        const provider=config.providers.find(p=>p.id===candidate.provider),old=previous?.providers.find(p=>p.id===candidate.provider);
        if(old?.baseUrl===provider.baseUrl&&old.models.some(m=>m.modelId===candidate.model&&m.enabled&&m.allowed&&m.inputPerMillionUsd===0&&m.outputPerMillionUsd===0)) {
          const model=provider.models.find(m=>m.modelId===candidate.model);model.enabled=true;model.allowed=true;provider.freeModelOrder.unshift(candidate.model);
        }
      }
    }
    if (!config.routing.freeOnly) throw new Error('This key editor only supports an existing free-only configuration.');
    if (!Object.values(input.keys).some(value=>value.trim()) && !config.providers.some(provider=>provider.enabled && vault.get(provider.id))) throw new Error('At least one supported worker credential is required.');
    const accepted = [], failed = [], codingCandidates=[];
    for (const [id, names] of Object.entries(fields)) {
      if(!existingSetup&&CREDIT_PROVIDERS.includes(id)) {config.providers.find(p=>p.id===id).enabled=false;continue;}
      const supplied = names.some(name => input.keys[name]?.trim());
      const settings = config.providers.find(provider => provider.id === id);
      const retainedEnabled = existingSetup ? settings.enabled : !!vault.get(id);
      if (!supplied) { if (!existingSetup) settings.enabled = !!vault.get(id); continue; }
      const values = Object.fromEntries(names.map(name => [name, input.keys[name]?.trim() ?? '']));
      if (Object.values(values).some(value => !value)) { failed.push(id); settings.enabled = retainedEnabled; continue; }
      try {
        const trusted = structuredClone(DEFAULT_CONFIG.providers.find(provider => provider.id === id));
        trusted.freeTierConfirmed = true;
        const provider = factory(trusted, values);
        const preferred = { openrouter:'openrouter/free', groq:'openai/gpt-oss-120b', gemini:'gemini-3.1-flash-lite' }[id];
        const eligible = trusted.models.filter(model=>model.enabled && model.allowed && model.inputPerMillionUsd===0 && model.outputPerMillionUsd===0);
        const candidates = [...new Set([...(preferred?[preferred]:[]),...(trusted.freeModelOrder ?? eligible.map(model=>model.modelId))])].filter(id=>eligible.some(model=>model.modelId===id));
        let validated = false;
        for (const modelId of candidates.slice(0,3)) {
          try {
            const result = await provider.generate({modelId, instructions:'Reply briefly.', prompt:'Reply with OK only.', maxOutputTokens:512, reasoningEffort:'none', jsonSchema:null, schemaName:null, safetyIdentifier:null, signal:AbortSignal.timeout(30_000)});
            if (result.text.trim()) {validated = true; break;}
          } catch(error) { if ([401,403,402].includes(error.providerStatus ?? error.status)) break; }
        }
        if (!validated) throw new Error('No answer');
        if(!existingSetup&&input.validateCodingCandidates===true) for(const candidate of CODING_CANDIDATES.filter(c=>c.provider===id)) {
          const model=settings.models.find(m=>m.modelId===candidate.model);
          try {
            const response=await provider.generate({modelId:candidate.model,instructions:'Reply briefly.',prompt:'Return a JavaScript function add(a,b) that returns a+b. Code only.',maxOutputTokens:512,reasoningEffort:'none',jsonSchema:null,schemaName:null,safetyIdentifier:null,signal:AbortSignal.timeout(30_000)});
            if(typeof response.text!=='string'||!response.text.trim()) throw new Error('Empty candidate response');
            model.enabled=true;model.allowed=true;settings.freeModelOrder=[candidate.model,...settings.freeModelOrder.filter(m=>m!==candidate.model)];
            codingCandidates.push({provider:id,model:candidate.model,status:'connectivity-validated; coding quality unverified'});
          }catch {model.enabled=false;model.allowed=false;codingCandidates.push({provider:id,model:candidate.model,status:'not activated'});}
        }
        Object.assign(settings, {baseUrl:trusted.baseUrl,apiPrefix:trusted.apiPrefix,type:trusted.type,credentialField:trusted.credentialField,freeTierConfirmed:true});
        vault.set(id, values); settings.enabled = true; accepted.push(id);
        if (!config.routing.directProviderOrder.includes(id)) config.routing.directProviderOrder.push(id);
      } catch { failed.push(id); settings.enabled = retainedEnabled; }
    }
    // Failed entries never replace existing credentials. Other valid entries may be saved.
    if (!config.providers.some(provider=>provider.enabled && provider.freeTierOnly && vault.get(provider.id) && provider.models.some(model=>model.enabled && model.allowed && model.inputPerMillionUsd===0 && model.outputPerMillionUsd===0))) throw new Error('Worker validation failed. At least one valid free provider is required; check the key and quota.');
    validateConfig(config);
    await mkdir(paths.vaultDir, {recursive:true});
    await vault.save(paths.vault); await saveConfig(config, paths);
    return { accepted, failed, codingCandidates, ready:true };
  } finally { vault.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let text = ''; for await (const chunk of process.stdin) { text += chunk; if (text.length > 65536) throw new Error('Input too large'); }
    const paths = getRuntimePaths();
    const result = await configure(JSON.parse(text), paths, {existingSetup:process.argv.includes('--existing')});
    if (process.argv.includes('--existing') && process.argv.includes('--restart') && result.accepted.length) {
      try {
        const {DaemonClient}=await import('../apps/cli/dist/client.js');
        const {WindowsServiceManager}=await import('../apps/cli/dist/service.js');
        const service=new WindowsServiceManager(new DaemonClient(paths));
        await service.stop();
        const config=await loadConfig(paths);
        for(let i=0;i<20;i++) {
          try {await fetch(`http://127.0.0.1:${config.daemon.port}/v1/health`,{signal:AbortSignal.timeout(300)});}
          catch {break;}
          await new Promise(resolve=>setTimeout(resolve,250));
        }
        await service.start();
      } catch {result.restartNeeded=true;}
    }
    process.stdout.write(JSON.stringify(result));
  } catch (error) { process.stdout.write(JSON.stringify({ready:false,error:globalRedactor.redactText(error.message)})); process.exitCode=1; }
}
