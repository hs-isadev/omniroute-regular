import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

export const SYNTHETIC_VALIDATION_PROMPT='Reply with OK only.';

export function classifyValidationFailure(adapter,error){
  const failure=adapter.classifyError(error);
  const reasonCode=failure.category==='authentication'?'INVALID_AUTHENTICATION':
    failure.category==='rate_limit'?'QUOTA_OR_RATE_LIMIT':
    failure.category==='timeout'?'NETWORK_OR_ENDPOINT_TIMEOUT':
    failure.category==='unavailable'?(failure.providerStatus===404?'UNSUPPORTED_MODEL':'NETWORK_OR_ENDPOINT_FAILURE'):
    failure.category==='invalid_request'?'UNSUPPORTED_MODEL_OR_REQUEST':
    failure.category==='cancelled'?'CANCELLED':'PROVIDER_ERROR';
  return {reasonCode,httpStatus:failure.providerStatus??null};
}

export async function validateConfiguredApiProviders({config,defaults,vault,factory,creditProviders,timeoutMs=30_000,now=()=>Date.now()}){
  if(config.routing?.freeOnly!==true)throw new Error('FREE_ONLY_REQUIRED');
  const stored=new Set(vault.list().map(item=>item.providerId));
  const rows=[];
  for(const active of config.providers.filter(provider=>!['local','mcp-stdio'].includes(provider.type))){
    const known=defaults.providers.find(provider=>provider.id===active.id);
    const credentialPresent=stored.has(active.id);
    const row={
      providerId:active.id,
      modelIds:active.models.map(model=>model.modelId),
      enabled:active.enabled===true,
      credentialPresent,
      freePolicyEligible:false,
      health:'unknown',
      status:'NOT_TESTED',
      reasonCode:null,
      quotaState:'unknown',
      cooldownState:'new-validation-process-none',
      maxConcurrentRequests:active.maxConcurrentRequests??config.daemon?.maxConcurrentRoutes??null,
      sourceHost:safeHost(active.baseUrl),
      tests:[],
    };
    rows.push(row);
    if(!active.enabled){row.reasonCode='DISABLED';continue;}
    if(!credentialPresent){row.reasonCode='UNCONFIGURED';continue;}
    if(!known?.freeTierOnly||active.freeTierConfirmed!==true){row.reasonCode='FREE_POLICY_INELIGIBLE';continue;}
    if(creditProviders.includes(active.id)){row.reasonCode='CREDIT_PROVIDER_EXCLUDED';continue;}
    if(active.type!==known.type||active.baseUrl!==known.baseUrl||active.apiPrefix!==known.apiPrefix){row.reasonCode='TRUSTED_CONFIGURATION_MISMATCH';continue;}
    const knownModels=new Map(known.models.map(model=>[model.modelId,model]));
    let eligible=active.models.filter(model=>{
      const trusted=knownModels.get(model.modelId);
      return model.enabled&&model.allowed&&trusted?.enabled&&trusted?.allowed&&
        model.inputPerMillionUsd===0&&model.outputPerMillionUsd===0&&
        trusted.inputPerMillionUsd===0&&trusted.outputPerMillionUsd===0;
    });
    const order=active.freeModelOrder??eligible.map(model=>model.modelId);
    eligible.sort((left,right)=>orderIndex(order,left.modelId)-orderIndex(order,right.modelId));
    if(!eligible.length){row.reasonCode='UNSUPPORTED_MODEL';continue;}
    row.freePolicyEligible=true;
    const credentials=vault.get(active.id);
    try{
      const trusted=structuredClone(known);trusted.freeTierConfirmed=true;
      const adapter=factory(trusted,credentials);
      if(typeof adapter.listModels==='function'){
        const discoveryStarted=now();
        try{
          const discovered=await adapter.listModels(AbortSignal.timeout(timeoutMs));
          if(discovered.length){
            const advertised=new Set(discovered.map(model=>model.id)),supported=[];
            for(const model of eligible){
              if(advertised.has(model.modelId))supported.push(model);
              else row.tests.push({modelId:model.modelId,status:'NOT_TESTED',reasonCode:'UNSUPPORTED_MODEL',httpStatus:null,latencyMs:Math.max(0,now()-discoveryStarted)});
            }
            eligible=supported;
            if(!eligible.length){row.status='FAILED';row.health='unhealthy';row.reasonCode='UNSUPPORTED_MODEL';continue;}
          }
        }catch(error){
          const failure=classifyValidationFailure(adapter,error);
          row.tests.push({modelId:null,status:'FAILED',...failure,latencyMs:Math.max(0,now()-discoveryStarted)});
          row.status='FAILED';row.health='unhealthy';row.reasonCode=failure.reasonCode;
          if(failure.reasonCode==='QUOTA_OR_RATE_LIMIT')row.quotaState='limited';
          continue;
        }
      }
      for(const model of eligible.slice(0,3)){
        const started=now();
        try{
          const result=await adapter.generate({modelId:model.modelId,instructions:'Reply with OK only. No tools.',prompt:SYNTHETIC_VALIDATION_PROMPT,maxOutputTokens:32,reasoningEffort:'none',jsonSchema:null,schemaName:null,safetyIdentifier:null,signal:AbortSignal.timeout(timeoutMs)});
          const succeeded=typeof result.text==='string'&&result.text.trim().length>0;
          row.tests.push({modelId:model.modelId,status:succeeded?'SUCCESS':'EMPTY_RESPONSE',reasonCode:succeeded?'SUCCESS':'PROVIDER_ERROR',httpStatus:null,latencyMs:Math.max(0,now()-started)});
          if(succeeded){row.status='SUCCESS';row.reasonCode='SUCCESS';row.health='healthy';break;}
        }catch(error){
          const failure=classifyValidationFailure(adapter,error);
          row.tests.push({modelId:model.modelId,status:'FAILED',...failure,latencyMs:Math.max(0,now()-started)});
          if(failure.reasonCode==='QUOTA_OR_RATE_LIMIT')row.quotaState='limited';
          if(['INVALID_AUTHENTICATION','CANCELLED'].includes(failure.reasonCode)||[401,402,403].includes(failure.httpStatus))break;
        }
      }
      if(row.status!=='SUCCESS'){
        row.status='FAILED';row.health='unhealthy';row.reasonCode=row.tests.at(-1)?.reasonCode??'PROVIDER_ERROR';
      }
    }finally{
      if(credentials)for(const key of Object.keys(credentials))credentials[key]='';
    }
  }
  return rows;
}

function orderIndex(order,modelId){const index=order.indexOf(modelId);return index<0?Number.MAX_SAFE_INTEGER:index;}
function safeHost(value){try{return new URL(value).host;}catch{return 'invalid';}}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const runtimeApp=process.env.OMNIROUTE_APP_ROOT;
  const load=relative=>runtimeApp?import(pathToFileURL(join(runtimeApp,relative)).href):import('../'+relative);
  const [{DEFAULT_CONFIG,getRuntimePaths,loadConfig},{SecretVault},{createConfiguredProvider},{CREDIT_PROVIDERS,assertRegularProviderPolicy}]=await Promise.all([
    load('packages/config/dist/index.js'),load('packages/vault/dist/index.js'),load('packages/providers/dist/index.js'),load('distribution/regular-policy.mjs'),
  ]);
  const paths=getRuntimePaths(),config=await loadConfig(paths);assertRegularProviderPolicy(config);
  const vault=await SecretVault.load(paths.vault);
  try{
    const rows=await validateConfiguredApiProviders({config,defaults:DEFAULT_CONFIG,vault,factory:createConfiguredProvider,creditProviders:CREDIT_PROVIDERS});
    process.stdout.write(JSON.stringify({checkedAt:new Date().toISOString(),syntheticRequest:true,rows},null,2)+'\n');
  }finally{vault.dispose();}
}
