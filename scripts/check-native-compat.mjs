import {writeFile} from 'node:fs/promises';
import {DEFAULT_CONFIG,getRuntimePaths} from '../packages/config/dist/index.js';
import {SecretVault} from '../packages/vault/dist/index.js';
import {HttpTransport} from '../packages/providers/dist/index.js';
const vault=await SecretVault.load(getRuntimePaths().vault),results=[];
try{for(const id of ['mistral','cohere','cloudflare']){
  const settings=DEFAULT_CONFIG.providers.find(p=>p.id===id),keys=vault.get(id);if(!keys)continue;
  const prefix=id==='cloudflare'?'client/v4/accounts/'+keys.CLOUDFLARE_ACCOUNT_ID+'/ai/v1/':settings.apiPrefix;
  const transport=new HttpTransport({baseUrl:settings.baseUrl,headers:()=>({authorization:'Bearer '+keys[settings.credentialField],'content-type':'application/json'}),allowLoopback:false});
  for(const model of settings.models.filter(m=>m.enabled&&m.allowed&&m.inputPerMillionUsd===0&&m.outputPerMillionUsd===0)){
    const row={provider:id,model:model.modelId};
    const messages=[{role:'user',content:'Call echo once with text OK.'}],tools=[{type:'function',function:{name:'echo',description:'Echo text',parameters:{type:'object',properties:{text:{type:'string'}},required:['text']}}}];
    try{
      const response=await transport.request(id,prefix+'chat/completions',{method:'POST',signal:AbortSignal.timeout(30000),body:JSON.stringify({model:model.modelId,messages,tools,tool_choice:{type:'function',function:{name:'echo'}},max_tokens:512,stream:false})});
      const first=await response.json(),message=first.choices?.[0]?.message,call=message?.tool_calls?.[0];if(call?.function?.name!=='echo')throw new Error('tool-not-returned');JSON.parse(call.function.arguments);
      const second=await transport.request(id,prefix+'chat/completions',{method:'POST',signal:AbortSignal.timeout(30000),body:JSON.stringify({model:model.modelId,messages:[...messages,message,{role:'tool',tool_call_id:call.id,content:'OK'}],tools,tool_choice:'none',max_tokens:512,stream:false})});
      row.status=(await second.json()).choices?.[0]?.message?.content?.trim()?'passed':'empty';
    }catch(e){row.status='failed';row.code=e.code??e.message;row.httpStatus=e.providerStatus??null;}
    results.push(row);console.log(JSON.stringify(row));
  }
  for(const key of Object.keys(keys))keys[key]='';
}}finally{vault.dispose();}
await writeFile('../provider-check-2026-08-31/native-compat.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
