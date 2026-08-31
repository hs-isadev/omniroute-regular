import { DEFAULT_CONFIG } from '../packages/config/dist/index.js';

// Credit balances are not zero-price model entitlements. Keep vault records but
// do not expose these providers to Regular routing, even on upgraded profiles.
export const CREDIT_PROVIDERS=['huggingface','vercel'];
export const CODING_CANDIDATES=[
  {provider:'nvidia',model:'moonshotai/kimi-k2.6',context:262144},
  {provider:'openrouter',model:'qwen/qwen3-coder:free',context:131072},
];
export function assertRegularProviderPolicy(config) {
  const trusted=new Map(DEFAULT_CONFIG.providers.filter(p=>p.freeTierOnly&&p.credentialField).map(p=>[p.id,p]));
  const seen=new Set();
  for(const provider of config.providers) {
    if(CREDIT_PROVIDERS.includes(provider.id)) {provider.enabled=false;continue;}
    if(!provider.enabled) continue;
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
