import {resolve, dirname} from 'node:path';
import { DEFAULT_CONFIG } from '../packages/config/dist/index.js';

// Credit balances are not zero-price model entitlements. Keep vault records but
// do not expose these providers to Regular routing, even on upgraded profiles.
export const CREDIT_PROVIDERS=['huggingface','vercel'];
export const CODING_CANDIDATES=[
  {provider:'nvidia',model:'moonshotai/kimi-k2.6',context:262144},
  {provider:'openrouter',model:'qwen/qwen3-coder:free',context:131072},
];
export function assertRegularProviderPolicy(config) {
  const appRoot=resolve(import.meta.dirname,'..');
  const consumers=new Map(DEFAULT_CONFIG.providers.filter(p=>p.id.endsWith('-consumer')).map(p=>[p.id,p]));
  const trusted=new Map(DEFAULT_CONFIG.providers.filter(p=>p.freeTierOnly&&p.credentialField).map(p=>[p.id,p]));
  const seen=new Set();
  for(const provider of config.providers) {
    if(CREDIT_PROVIDERS.includes(provider.id)) {provider.enabled=false;continue;}
    if(!provider.enabled) continue;
    if(consumers.has(provider.id)) {
      const original=consumers.get(provider.id);
      const generic=!['claude-consumer','zai-consumer'].includes(provider.id);
      const adapter=resolve(appRoot,'packages',generic?'browser-consumer-adapter':provider.id+'-adapter','src/adapter.mjs');
      const args=[adapter,...(generic?['--provider',provider.id.replace('-consumer','')]:[]),'--endpoint',provider.baseUrl];
      const node=resolve(appRoot,'../node',process.platform==='win32'?'node.exe':'node');
      const isNode=[node,process.execPath].some(path=>resolve(provider.mcpCommand??'')===resolve(path));
      const endpoint=/^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/.exec(provider.baseUrl);
      const validPort=endpoint && Number(endpoint[1])>0 && Number(endpoint[1])<=65535;
      const validArgs=provider.mcpArgs?.length===args.length&&args.every((arg,i)=>i===0?resolve(provider.mcpArgs[i])===arg:provider.mcpArgs[i]===arg);
      const limits=provider.models.every(model=>{
        const documented=original.models.find(item=>item.modelId===model.modelId);
        return documented&&model.contextWindow>0&&model.contextWindow<=documented.contextWindow&&model.maxOutputTokens>0&&model.maxOutputTokens<=documented.maxOutputTokens&&model.inputPerMillionUsd===0&&model.outputPerMillionUsd===0&&Object.entries(model.capabilities).every(([key,value])=>!value||documented.capabilities[key]===true)&&model.reasoningEfforts.every(effort=>documented.reasoningEfforts.includes(effort));
      });
      if(seen.has(provider.id)||provider.type!=='mcp-stdio'||!provider.freeTierOnly||provider.freeTierConfirmed!==true||provider.credentialField!==null||provider.apiPrefix!==''||!['micro','small'].includes(provider.maxTaskClass)||!validPort||!isNode||!validArgs||resolve(provider.mcpWorkingDirectory??'')!==dirname(adapter)||!limits) throw new Error('Browser consumer does not match the trusted local adapter policy. Reopen Settings.');
      seen.add(provider.id);
      continue;
    }
    const original=trusted.get(provider.id);
    if(!original||seen.has(provider.id)||!provider.freeTierOnly||provider.freeTierConfirmed!==true||['baseUrl','apiPrefix','type','credentialField'].some(key=>provider[key]!==original[key])) throw new Error('Regular provider does not match the trusted endpoint allowlist. Reopen Settings.');
    seen.add(provider.id);
    const allowed=new Set(original.models.filter(m=>m.enabled&&m.allowed&&m.inputPerMillionUsd===0&&m.outputPerMillionUsd===0).map(m=>m.modelId));
    for(const candidate of CODING_CANDIDATES.filter(c=>c.provider===provider.id)) allowed.add(candidate.model);
    for(const model of provider.models.filter(m=>m.enabled&&m.allowed)) {
      if(!allowed.has(model.modelId)||model.inputPerMillionUsd!==0||model.outputPerMillionUsd!==0) throw new Error('Regular model is outside the trusted free-model allowlist. Reopen Settings.');
    }
  }
}
