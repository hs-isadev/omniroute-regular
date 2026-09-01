import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {getRuntimePaths} from '../packages/config/dist/index.js';
import {regularConfig} from '../distribution/settings.mjs';
import {createChatBackend} from '../distribution/dual-chat.mjs';
const evidence=JSON.parse(await readFile('../provider-check-2026-08-31/results.json','utf8'));
const results=[];
for(const row of evidence.results.filter(r=>r.status==='passed')) {
  const config=regularConfig(),p=config.providers.find(p=>p.id===row.provider);p.enabled=true;p.freeTierConfirmed=true;
  const model=row.tests.find(t=>t.status==='passed').model;p.freeModelOrder=[model,...p.freeModelOrder.filter(m=>m!==model)];
  const backend=await createChatBackend(getRuntimePaths().root,{configOverride:config,loggerOverride:{write:async()=>{}}});
  const input={model:'regular',messages:[{role:'user',content:'Call the echo function exactly once with text OK.'}],tools:[{type:'function',function:{name:'echo',description:'Return text unchanged',parameters:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:'echo'}},max_tokens:512};
  const result={provider:row.provider};
  try {
    const first=await backend.complete(input,AbortSignal.timeout(90000));
    const message=first.choices[0].message,call=message.tool_calls?.find(c=>c.function?.name==='echo');
    if(!call)throw new Error('no-tool-call');
    JSON.parse(call.function.arguments);
    const second=await backend.complete({...input,tool_choice:'none',messages:[...input.messages,message,{role:'tool',tool_call_id:call.id,content:'OK'}]},AbortSignal.timeout(90000));
    result.status=second.choices[0].message.content?.trim()?'passed':'empty';result.model=first.model;
  }catch(e){result.status='failed';result.code=e.code??e.name;result.httpStatus=e.providerStatus??null;}
  results.push(result);console.log(JSON.stringify(result));
}
await writeFile('../provider-check-2026-08-31/tool-calls.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
