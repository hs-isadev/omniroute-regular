import {writeFile, mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {DEFAULT_CONFIG,getRuntimePaths,loadConfig} from '../packages/config/dist/index.js';
import {SecretVault} from '../packages/vault/dist/index.js';
import {createConfiguredProvider,HttpTransport} from '../packages/providers/dist/index.js';
import {CREDIT_PROVIDERS} from '../distribution/regular-policy.mjs';
const paths=getRuntimePaths();
const config=await loadConfig(paths);
if(!config.routing.freeOnly)throw new Error('Free-only policy required');
const vault=await SecretVault.load(paths.vault);
const results=[];
try {
  for(const {providerId:id} of vault.list().filter(x=>x.providerId!=='local-daemon')) {
    const known=DEFAULT_CONFIG.providers.find(p=>p.id===id);
    const active=config.providers.find(p=>p.id===id);
    const row={provider:id,status:'skipped',tests:[]};
    results.push(row);
    if(!known?.freeTierOnly||!active?.enabled){row.reason='disabled-or-not-free';continue;}
    const keys=vault.get(id);
    try {
      if(CREDIT_PROVIDERS.includes(id)) {
        row.reason='credit-based inference excluded from strict-free mode';
        if(id==='huggingface') {
          try {
            const transport=new HttpTransport({baseUrl:'https://huggingface.co',headers:()=>({Authorization:'Bearer '+keys.HF_TOKEN}),allowLoopback:false});
            const response=await transport.request(id,'api/whoami-v2',{signal:AbortSignal.timeout(20000)});
            await response.body?.cancel();row.tokenValid=true;
          }catch(e){row.tokenValid=false;row.httpStatus=e.providerStatus??null;}
        }
        continue;
      }
      const trusted={...structuredClone(known),freeTierConfirmed:active.freeTierConfirmed===true||['groq','gemini','openrouter'].includes(id)};
      if(!trusted.freeTierConfirmed){row.reason='free-tier-not-confirmed';continue;}
      const adapter=createConfiguredProvider(trusted,keys);
      const order=active.freeModelOrder??trusted.freeModelOrder??[];
      const models=trusted.models.filter(m=>m.enabled&&m.allowed&&m.inputPerMillionUsd===0&&m.outputPerMillionUsd===0);
      models.sort((a,b)=>(order.indexOf(a.modelId)<0?999:order.indexOf(a.modelId))-(order.indexOf(b.modelId)<0?999:order.indexOf(b.modelId)));
      for(const model of models.slice(0,3)) {
        try {
          const result=await adapter.generate({modelId:model.modelId,instructions:'Reply briefly. No tools.',prompt:'Reply with OK only.',maxOutputTokens:512,reasoningEffort:'none',jsonSchema:null,schemaName:null,safetyIdentifier:null,signal:AbortSignal.timeout(30000)});
          row.tests.push({model:model.modelId,status:result.text.trim()?'passed':'empty'});
          if(result.text.trim()){row.status='passed';break;}
        }catch(error){
          const failure=adapter.classifyError(error);
          row.tests.push({model:model.modelId,status:'failed',category:failure.category,httpStatus:failure.providerStatus??null});
          if(['authentication','cancelled'].includes(failure.category)||[401,402,403].includes(failure.providerStatus))break;
        }
      }
      if(row.status!=='passed')row.status='failed';
    }finally {if(keys)for(const key of Object.keys(keys))keys[key]='';console.log(JSON.stringify(row));}
  }
}finally {vault.dispose();}
const folder=resolve('../provider-check-2026-08-31');await mkdir(folder,{recursive:true});
await writeFile(join(folder,'results.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
