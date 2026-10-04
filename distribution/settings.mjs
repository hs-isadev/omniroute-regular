import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_CONFIG, atomicWriteFile, getRuntimePaths, saveConfig, loadConfig, validateConfig, freeWorkerModel } from '../packages/config/dist/index.js';
import { MAX_CREDENTIAL_SLOTS, SecretVault } from '../packages/vault/dist/index.js';
import { createConfiguredProvider } from '../packages/providers/dist/index.js';
import { globalRedactor } from '../packages/observability/dist/index.js';
import { pathToFileURL } from 'node:url';
import { CREDIT_PROVIDERS, CODING_CANDIDATES } from './regular-policy.mjs';
export { CODING_CANDIDATES } from './regular-policy.mjs';

const STATUS_FILE='credential-status.json';
const STATUS_VALUES=new Set(['healthy','unhealthy','expired','unknown']);
const STATUS_TRANSIENT_REASONS=new Set(['QUOTA_OR_RATE_LIMIT','NETWORK_OR_ENDPOINT_TIMEOUT','NETWORK_OR_ENDPOINT_FAILURE','UNSUPPORTED_MODEL','UNSUPPORTED_MODEL_OR_REQUEST','CANCELLED']);
const statusKey=(providerId,slot)=>`${providerId}:${slot}`;
const credentialStatusPath=paths=>join(paths.vaultDir,STATUS_FILE);

async function readCredentialStatusState(paths) {
  let document;
  try {document=JSON.parse(await readFile(credentialStatusPath(paths),'utf8'));}
  catch(error) {if(error?.code==='ENOENT'||error instanceof SyntaxError)return new Map();throw error;}
  if(document?.version!==1||!Array.isArray(document.statuses))return new Map();
  const state=new Map();
  for(const item of document.statuses) {
    if(!item||!Object.hasOwn(fields,item.providerId)||!Number.isInteger(item.slot)||item.slot<1||item.slot>MAX_CREDENTIAL_SLOTS||typeof item.createdAt!=='string'||!STATUS_VALUES.has(item.status))continue;
    state.set(statusKey(item.providerId,item.slot),{
      providerId:item.providerId,slot:item.slot,createdAt:item.createdAt,status:item.status,
      checkedAt:typeof item.checkedAt==='string'?item.checkedAt:null,
      lastAttemptAt:typeof item.lastAttemptAt==='string'?item.lastAttemptAt:null,
      lastAttemptReasonCode:typeof item.lastAttemptReasonCode==='string'?item.lastAttemptReasonCode:null,
    });
  }
  return state;
}

function currentCredentialStatuses(vault,state) {
  const statuses=[];
  for(const providerId of Object.keys(fields)) for(const saved of vault.listCredentialSlots(providerId)) {
    const previous=state.get(statusKey(providerId,saved.slot));
    const valid=previous?.createdAt===saved.createdAt?previous:null;
    statuses.push({providerId,slot:saved.slot,status:valid?.status??'unknown',checkedAt:valid?.checkedAt??null,lastAttemptAt:valid?.lastAttemptAt??null,lastAttemptReasonCode:valid?.lastAttemptReasonCode??null});
  }
  return statuses;
}

async function writeCredentialStatusState(paths,vault,state) {
  const active=new Set();
  for(const providerId of Object.keys(fields)) for(const saved of vault.listCredentialSlots(providerId)) {
    const key=statusKey(providerId,saved.slot),entry=state.get(key);
    if(!entry||entry.createdAt!==saved.createdAt)continue;
    active.add(key);
  }
  const statuses=[...active].map(key=>state.get(key)).sort((a,b)=>a.providerId.localeCompare(b.providerId)||a.slot-b.slot);
  await mkdir(paths.vaultDir,{recursive:true});
  await atomicWriteFile(credentialStatusPath(paths),`${JSON.stringify({version:1,statuses},null,2)}\n`);
}

export async function getCredentialStatuses(paths,{protector}={}) {
  const vault=await SecretVault.load(paths.vault,protector);
  try {return {ready:true,statuses:currentCredentialStatuses(vault,await readCredentialStatusState(paths))};}
  finally {vault.dispose();}
}

function trustedProfile(providerId) {
  const profile=structuredClone(DEFAULT_CONFIG.providers.find(candidate=>candidate.id===providerId));
  if(!profile)throw new Error('Unknown provider profile.');
  profile.freeTierConfirmed=true;
  return profile;
}

function validationModels(providerId,profile) {
  const preferred={openrouter:'openrouter/free',groq:'openai/gpt-oss-120b',gemini:'gemini-3.1-flash-lite'}[providerId];
  const eligible=profile.models.filter(model=>model.enabled&&model.allowed&&model.inputPerMillionUsd===0&&model.outputPerMillionUsd===0);
  return [...new Set([...(preferred?[preferred]:[]),...(profile.freeModelOrder??eligible.map(model=>model.modelId))])].filter(modelId=>eligible.some(model=>model.modelId===modelId)).slice(0,3);
}

function statusForReason(reasonCode) {
  if(reasonCode==='SUCCESS')return 'healthy';
  if(reasonCode==='INVALID_AUTHENTICATION')return 'expired';
  if(STATUS_TRANSIENT_REASONS.has(reasonCode))return 'unknown';
  return 'unhealthy';
}

export async function checkCredentialStatuses(paths,{protector,factory=createConfiguredProvider}={}) {
  const vault=await SecretVault.load(paths.vault,protector);
  try {
    const state=await readCredentialStatusState(paths),attempts=[];
    for(const providerId of Object.keys(fields)) for(const slot of vault.getCredentialSlots(providerId)) {
      const key=statusKey(providerId,slot.slot),summary=vault.listCredentialSlots(providerId).find(item=>item.slot===slot.slot),previous=state.get(key);
      const prior=previous?.createdAt===summary.createdAt?previous:null,attemptedAt=new Date().toISOString();
      let adapter,lastError=null,success=false;
      try {
        const profile=trustedProfile(providerId);
        adapter=factory(profile,slot.values);
        for(const modelId of validationModels(providerId,profile).slice(0,1)) {
          try {
            const response=await adapter.generate({modelId,instructions:'Reply briefly.',prompt:'Reply with OK only.',maxOutputTokens:32,reasoningEffort:'none',jsonSchema:null,schemaName:null,safetyIdentifier:null,signal:AbortSignal.timeout(15_000)});
            if(typeof response.text==='string'&&response.text.trim()){success=true;break;}
            lastError=new Error('Empty provider response');
          } catch(error) {
            lastError=error;
            const reason=validationReason(adapter,error).reasonCode;
            if(['INVALID_AUTHENTICATION','QUOTA_OR_RATE_LIMIT'].includes(reason))break;
          }
        }
      } catch(error) {lastError=error;}
      const resultReason=success?'SUCCESS':validationReason(adapter,lastError??new Error('No eligible free model is available')).reasonCode;
      const status=statusForReason(resultReason);
      const entry={providerId,slot:slot.slot,createdAt:summary.createdAt,status:status==='unknown'?(prior?.status??'unknown'):status,
        checkedAt:status==='unknown'?(prior?.checkedAt??null):attemptedAt,lastAttemptAt:attemptedAt,lastAttemptReasonCode:resultReason};
      state.set(key,entry);attempts.push({providerId,slot:slot.slot,status:entry.status,checkStatus:status,checkedAt:entry.checkedAt,lastAttemptAt:entry.lastAttemptAt,lastAttemptReasonCode:entry.lastAttemptReasonCode});
    }
    await writeCredentialStatusState(paths,vault,state);
    return {ready:true,statuses:currentCredentialStatuses(vault,state),attempts};
  } finally {vault.dispose();}
}

export const fields = {
  openrouter: ['OPENROUTER_API_KEY'], groq: ['GROQ_API_KEY'], gemini: ['GEMINI_API_KEY'],
  mistral: ['MISTRAL_API_KEY'], cohere: ['COHERE_API_KEY'],
  cerebras: ['CEREBRAS_API_KEY'], sambanova: ['SAMBANOVA_API_KEY'],
  cloudflare: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'], huggingface: ['HF_TOKEN'],
  kilo: ['KILO_API_KEY'], zai: ['ZAI_API_KEY'], nvidia: ['NVIDIA_API_KEY'],
  vercel: ['VERCEL_AI_GATEWAY_API_KEY'], 'opencode-zen': ['OPENCODE_ZEN_API_KEY'],
};
export function regularConfig() {
  // Never send newly entered keys to an endpoint from editable runtime config.
  const existing = structuredClone(DEFAULT_CONFIG);
  existing.routing.defaultMode = 'regular'; existing.routing.freeOnly = true;
  existing.routing.orchestratorProviderId = 'openrouter'; existing.routing.orchestratorModelId = 'openrouter/free';
  existing.routing.directProviderOrder = ['claude-consumer','zai-consumer','qwen-consumer','kimi-consumer','deepseek-consumer','perplexity-consumer','groq','cerebras','sambanova','gemini','mistral','cohere','cloudflare','huggingface','zai','kilo','nvidia','vercel','opencode-zen','openrouter'];
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

function validationReason(adapter,error) {
  let failure=error;
  try {if(typeof adapter?.classifyError==='function')failure=adapter.classifyError(error);} catch {}
  const category=failure?.category,status=failure?.providerStatus??failure?.status??null;
  const reasonCode=category==='authentication'||[401,403].includes(status)?'INVALID_AUTHENTICATION':
    category==='rate_limit'||[402,429].includes(status)?'QUOTA_OR_RATE_LIMIT':
    category==='timeout'?'NETWORK_OR_ENDPOINT_TIMEOUT':
    category==='unavailable'?(status===404?'UNSUPPORTED_MODEL':'NETWORK_OR_ENDPOINT_FAILURE'):
    category==='invalid_request'?'UNSUPPORTED_MODEL_OR_REQUEST':category==='cancelled'?'CANCELLED':'PROVIDER_ERROR';
  return {reasonCode,httpStatus:status};
}

function normalizeCredentialSlots(input) {
  const knownFields=new Set(Object.values(fields).flat()),knownProviders=new Set(Object.keys(fields));
  const keys=input.keys??{};
  if(!keys||typeof keys!=='object'||Array.isArray(keys))throw new Error('Missing key fields.');
  if(Object.keys(keys).some(key=>!knownFields.has(key)))throw new Error('Unknown credential field. Use only the supplied template fields.');
  const slots={};
  for(const [id,names] of Object.entries(fields)) if(names.some(name=>Object.hasOwn(keys,name))) slots[id]=[Object.fromEntries(names.map(name=>[name,keys[name]??'']))];
  if(input.slots!==undefined) {
    if(!input.slots||typeof input.slots!=='object'||Array.isArray(input.slots))throw new Error('Credential slots must be grouped by provider.');
    for(const [id,items] of Object.entries(input.slots)) {
      if(!knownProviders.has(id)||!Array.isArray(items))throw new Error('Unknown credential provider. Use only the supplied provider slots.');
      if(items.length>MAX_CREDENTIAL_SLOTS)throw new Error(`A provider accepts at most ${MAX_CREDENTIAL_SLOTS} credential slots.`);
      const names=fields[id];
      slots[id]=items.map(item=>{
        if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(name=>!names.includes(name)))throw new Error('Unknown credential field. Use only the supplied provider slots.');
        return Object.fromEntries(names.map(name=>[name,item[name]??'']));
      });
    }
  }
  for(const items of Object.values(slots))for(const values of items)for(const value of Object.values(values)) {
    if(typeof value!=='string'||/[\r\n\0]/.test(value)||value.length>4096)throw new Error('Invalid key format.');
    globalRedactor.register(value);
  }
  return slots;
}

function normalizeReplacementSlots(input) {
  const replacements=input.replaceSlots??{};
  if(!replacements||typeof replacements!=='object'||Array.isArray(replacements)||Object.keys(replacements).some(id=>!Object.hasOwn(fields,id)))throw new Error('Replacement slots must use supported providers.');
  const normalized={};
  for(const [providerId,slots] of Object.entries(replacements)) {
    if(!Array.isArray(slots)||slots.length>MAX_CREDENTIAL_SLOTS||slots.some(slot=>!Number.isInteger(slot)||slot<1||slot>MAX_CREDENTIAL_SLOTS)||new Set(slots).size!==slots.length)throw new Error('Replacement slots must be unique slot numbers from 1 to 5.');
    normalized[providerId]=new Set(slots);
  }
  return normalized;
}

function findNextFreeSlot(requestedSlot, occupiedSlots, reservedSlots, allocatedSlots) {
  for (let offset = 1; offset < MAX_CREDENTIAL_SLOTS; offset += 1) {
    const slot = ((requestedSlot - 1 + offset) % MAX_CREDENTIAL_SLOTS) + 1;
    if (!occupiedSlots.has(slot) && !reservedSlots.has(slot) && !allocatedSlots.has(slot)) return slot;
  }
  return null;
}

export async function configure(input, paths, { protector, factory = createConfiguredProvider, existingSetup = false } = {}) {
  if (input.freeOnlyConfirmed !== true) throw new Error('Confirm free-only provider account settings first.');
  const submitted=normalizeCredentialSlots(input);
  const replacements=normalizeReplacementSlots(input);
  if(!existingSetup&&CREDIT_PROVIDERS.some(id=>(submitted[id]??[]).some(values=>Object.values(values).some(value=>value.trim())))) throw new Error('Credit-based providers are disabled in strict Regular mode.');
  const vault = await SecretVault.load(paths.vault, protector);
  try {
    const credentialStatuses=await readCredentialStatusState(paths);
    const config = existingSetup ? await loadConfig(paths) : regularConfig();
    if(!existingSetup) {
      let previous;try {previous=await loadConfig(paths);}catch {/* Missing/invalid previous config cannot supply an endpoint. */}
      for(const provider of config.providers) provider.enabled=provider.id in fields && vault.listCredentialSlots(provider.id).length>0;
      for(const candidate of CODING_CANDIDATES) {
        const provider=config.providers.find(p=>p.id===candidate.provider),old=previous?.providers.find(p=>p.id===candidate.provider);
        if(old?.baseUrl===provider.baseUrl&&old.models.some(m=>m.modelId===candidate.model&&m.enabled&&m.allowed&&m.inputPerMillionUsd===0&&m.outputPerMillionUsd===0)) {
          const model=provider.models.find(m=>m.modelId===candidate.model);model.enabled=true;model.allowed=true;provider.freeModelOrder.unshift(candidate.model);
        }
      }
    }
    if (!config.routing.freeOnly) throw new Error('This key editor only supports an existing free-only configuration.');
    const hasSupplied=Object.values(submitted).some(items=>items.some(values=>Object.values(values).some(value=>value.trim())));
    if (!hasSupplied && !config.providers.some(provider=>provider.enabled && vault.listCredentialSlots(provider.id).length)) throw new Error('At least one supported worker credential is required.');
    const acceptedSet=new Set(),failedSet=new Set(),slotResults=[],codingCandidates=[];
    for (const [id, names] of Object.entries(fields)) {
      if(!existingSetup&&CREDIT_PROVIDERS.includes(id)) {config.providers.find(p=>p.id===id).enabled=false;continue;}
      const settings = config.providers.find(provider => provider.id === id);
      const retainedEnabled = existingSetup ? settings.enabled : vault.listCredentialSlots(id).length>0;
      const storedSlots=vault.getCredentialSlots(id),occupiedSlots=new Set(storedSlots.map(item=>item.slot));
      const savedSecretSlots=new Map(storedSlots.map(item=>[item.values[names[0]],item.slot]));
      const reservedSlots=new Set(),reservedSecrets=new Set(savedSecretSlots.keys());
      for(const [index,values] of (submitted[id]??[]).entries()) {
        const secret=values[names[0]]?.trim()??'';
        if(secret&&names.every(name=>values[name]?.trim())&&!reservedSecrets.has(secret)) {reservedSlots.add(index+1);reservedSecrets.add(secret);}
      }
      const allocatedSlots=new Set();
      for(const [index,rawValues] of (submitted[id]??[]).entries()) {
        const requestedSlot=index+1,values=Object.fromEntries(names.map(name=>[name,rawValues[name]?.trim()??'']));
        if(!Object.values(values).some(Boolean))continue;
        if(Object.values(values).some(value=>!value)) {failedSet.add(id);slotResults.push({providerId:id,slot:requestedSlot,requestedSlot,status:'FAILED',reasonCode:'INCOMPLETE_CREDENTIALS',httpStatus:null});continue;}
        const secret=values[names[0]],duplicateSlot=savedSecretSlots.get(secret);
        if(duplicateSlot!==undefined) {slotResults.push({providerId:id,slot:requestedSlot,requestedSlot,status:'DUPLICATE',reasonCode:'DUPLICATE_CREDENTIAL',matchedSlot:duplicateSlot});continue;}
        const replaced=Boolean(replacements[id]?.has(requestedSlot)&&occupiedSlots.has(requestedSlot));
        const slot=replaced?requestedSlot:occupiedSlots.has(requestedSlot)?findNextFreeSlot(requestedSlot,occupiedSlots,reservedSlots,allocatedSlots):requestedSlot;
        if(slot===null) {failedSet.add(id);slotResults.push({providerId:id,slot:requestedSlot,requestedSlot,status:'FAILED',reasonCode:'NO_EMPTY_SLOT',httpStatus:null});continue;}
        allocatedSlots.add(slot);
        let provider,lastError=null,validated=false;
        try {
          const trusted = structuredClone(DEFAULT_CONFIG.providers.find(candidate => candidate.id === id));
          trusted.freeTierConfirmed = true;
          provider = factory(trusted, values);
          const preferred = { openrouter:'openrouter/free', groq:'openai/gpt-oss-120b', gemini:'gemini-3.1-flash-lite' }[id];
          const eligible = trusted.models.filter(model=>model.enabled && model.allowed && model.inputPerMillionUsd===0 && model.outputPerMillionUsd===0);
          const candidates = [...new Set([...(preferred?[preferred]:[]),...(trusted.freeModelOrder ?? eligible.map(model=>model.modelId))])].filter(modelId=>eligible.some(model=>model.modelId===modelId));
          for (const modelId of candidates.slice(0,3)) {
            try {
              const result = await provider.generate({modelId, instructions:'Reply briefly.', prompt:'Reply with OK only.', maxOutputTokens:512, reasoningEffort:'none', jsonSchema:null, schemaName:null, safetyIdentifier:null, signal:AbortSignal.timeout(30_000)});
              if (typeof result.text==='string'&&result.text.trim()) {validated = true; break;}
              lastError={category:'unknown'};
            } catch(error) {lastError=error;if ([401,403,402].includes(error?.providerStatus ?? error?.status)) break;}
          }
          if (!validated) throw lastError??new Error('No answer');
          if(!existingSetup&&input.validateCodingCandidates===true) for(const candidate of CODING_CANDIDATES.filter(c=>c.provider===id)) {
            const model=settings.models.find(m=>m.modelId===candidate.model);
            try {
              const response=await provider.generate({modelId:candidate.model,instructions:'Reply briefly.',prompt:'Return a JavaScript function add(a,b) that returns a+b. Code only.',maxOutputTokens:512,reasoningEffort:'none',jsonSchema:null,schemaName:null,safetyIdentifier:null,signal:AbortSignal.timeout(30_000)});
              if(typeof response.text!=='string'||!response.text.trim()) throw new Error('Empty candidate response');
              model.enabled=true;model.allowed=true;settings.freeModelOrder=[candidate.model,...settings.freeModelOrder.filter(m=>m!==candidate.model)];
              codingCandidates.push({provider:id,slot,model:candidate.model,status:'connectivity-validated; coding quality unverified'});
            }catch {model.enabled=false;model.allowed=false;codingCandidates.push({provider:id,slot,model:candidate.model,status:'not activated'});}
          }
          Object.assign(settings, {baseUrl:trusted.baseUrl,apiPrefix:trusted.apiPrefix,type:trusted.type,credentialField:trusted.credentialField,freeTierConfirmed:true});
          const saved=vault.setCredentialSlot(id,slot,values);
          if(replaced) for(const [oldSecret,oldSlot] of savedSecretSlots) if(oldSlot===slot)savedSecretSlots.delete(oldSecret);
          occupiedSlots.add(slot);savedSecretSlots.set(secret,slot);settings.enabled=true;acceptedSet.add(id);
          const checkedAt=new Date().toISOString();credentialStatuses.set(statusKey(id,slot),{providerId:id,slot,createdAt:saved.createdAt,status:'healthy',checkedAt,lastAttemptAt:checkedAt,lastAttemptReasonCode:'SUCCESS'});
          slotResults.push({providerId:id,slot,requestedSlot,status:'ACCEPTED',reasonCode:'SUCCESS',httpStatus:null,replaced});
          if (!config.routing.directProviderOrder.includes(id)) config.routing.directProviderOrder.push(id);
        } catch(error) {
          allocatedSlots.delete(slot);
          if(!occupiedSlots.has(requestedSlot))reservedSlots.delete(requestedSlot);
          failedSet.add(id);const failure=validationReason(provider,error);slotResults.push({providerId:id,slot,requestedSlot,status:'FAILED',...failure});
          settings.enabled=settings.enabled||retainedEnabled;
        }
      }
      if(!existingSetup&&!acceptedSet.has(id))settings.enabled=retainedEnabled;
    }
    // Failed entries never replace existing credentials. Other valid entries may be saved.
    if (!config.providers.some(provider=>provider.enabled && provider.freeTierOnly && vault.listCredentialSlots(provider.id).length && provider.models.some(model=>model.enabled && model.allowed && model.inputPerMillionUsd===0 && model.outputPerMillionUsd===0))) throw new Error('Worker validation failed. At least one valid free provider is required; check the key and quota.');
    validateConfig(config);
    await mkdir(paths.vaultDir, {recursive:true});
    await vault.save(paths.vault); await writeCredentialStatusState(paths,vault,credentialStatuses); await saveConfig(config, paths);
    const stored=Object.keys(fields).map(providerId=>({providerId,slots:vault.listCredentialSlots(providerId).map(item=>item.slot)})).filter(item=>item.slots.length);
    return { accepted:[...acceptedSet], failed:[...failedSet], slotResults, stored, statuses:currentCredentialStatuses(vault,credentialStatuses), codingCandidates, ready:true };
  } finally { vault.dispose(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const paths = getRuntimePaths();
    let result;
    if(process.argv.includes('--status')) result=await getCredentialStatuses(paths);
    else if(process.argv.includes('--check-status')) result=await checkCredentialStatuses(paths);
    else {
      let text = ''; for await (const chunk of process.stdin) { text += chunk; if (text.length > 65536) throw new Error('Input too large'); }
      result=await configure(JSON.parse(text), paths, {existingSetup:process.argv.includes('--existing')});
    }
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
