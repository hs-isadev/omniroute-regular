import {randomBytes,timingSafeEqual,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {getRuntimePaths,loadConfig} from '../packages/config/dist/index.js';
import {SecretVault} from '../packages/vault/dist/index.js';
import {createConfiguredProvider,buildRegistry,HttpTransport} from '../packages/providers/dist/index.js';
import {classifyTask,estimateTokens} from '../packages/core/dist/index.js';
import {FreeModelFailover} from '../packages/core/dist/free-failover.js';
import {JsonlLogger,SafeError} from '../packages/observability/dist/index.js';
import {assertRegularProviderPolicy} from './regular-policy.mjs';

export function openCodeConfig(baseURL,token) {
  return {$schema:'https://opencode.ai/config.json',model:'omniroute/regular',small_model:'omniroute/regular',enabled_providers:['omniroute'],share:'disabled',autoupdate:false,
    permission:{bash:'ask',edit:'ask',external_directory:'ask'},
    provider:{omniroute:{npm:'@ai-sdk/openai-compatible',name:'OmniRoute — free providers',options:{baseURL,apiKey:token},models:{regular:{name:'OmniRoute Auto — actual worker shown in replies',limit:{context:32768,output:8192},tool_call:true}}}}};
}
const text=content=>typeof content==='string'?content:(content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');
export function requestIntent(input) {
  const users=input.messages.filter(m=>m.role==='user').map(m=>text(m.content));
  let prompt=users.at(-1)??'';
  if(/^\s*(continue|go on|yes|ok|carry on)[.!?\s]*$/i.test(prompt)&&users.length>1)prompt=users.at(-2)+'\n'+prompt;
  const signals=classifyTask({prompt,attachments:[],requestedCapabilities:[],sourceClient:'antigravity-mcp',metadata:{workerTextOnly:'true'}});
  return {...signals,modelPreference:['casual_question','light_task'].includes(signals.intent)?'lightweight':'quality'};
}
export function validateChat(input) {
  if(!input||input.model!=='regular'||input.models!==undefined||!Array.isArray(input.messages)||!input.messages.length)throw new SafeError('CHAT_INVALID','Only the regular model and a nonempty conversation are supported',400);
  for(const m of input.messages) {
    if(!m||!['system','developer','user','assistant','tool'].includes(m.role))throw new SafeError('CHAT_INVALID','Invalid message role',400);
    if(m.content!==null&&m.content!==undefined&&typeof m.content!=='string'&&(!Array.isArray(m.content)||m.content.some(p=>p.type!=='text'||typeof p.text!=='string')))throw new SafeError('TEXT_ONLY','This release supports text/code and tools, not image/audio input',400);
  }
  if(input.tools!==undefined&&(!Array.isArray(input.tools)||input.tools.length>128||input.tools.some(t=>t.type!=='function'||!t.function||!/^[a-zA-Z0-9_-]{1,128}$/.test(t.function.name))))throw new SafeError('TOOLS_INVALID','Invalid function tools',400);
  for(const key of ['max_tokens','max_completion_tokens'])if(input[key]!==undefined&&(!Number.isInteger(input[key])||input[key]<1||input[key]>32768))throw new SafeError('BUDGET_INVALID','Output limit must be between 1 and 32768',400);
  if(Buffer.byteLength(JSON.stringify(input))>2*1024*1024)throw new SafeError('CHAT_TOO_LARGE','Request exceeds 2 MiB',413);
}
export function upstreamBody(input,selection) {
  // Explicit option allowlist: no provider URL, key, model fallback or arbitrary headers.
  const body={model:selection.modelId,messages:input.messages,stream:false,max_tokens:selection.maxOutputTokens};
  for(const key of ['tools','tool_choice','temperature','top_p','stop','response_format'])if(input[key]!==undefined)body[key]=input[key];
  if(selection.providerId==='openrouter')body.provider={max_price:{prompt:0,completion:0},allow_fallbacks:true};
  if(selection.providerId==='zai')body.thinking={type:'disabled'};
  return body;
}
export function normalizeCompletion(payload,selection,routeId,structured=false) {
  const choice=payload?.choices?.[0],message=choice?.message;
  if(!message||(!message.content?.trim?.()&&!message.tool_calls?.length)||!['stop','length','tool_calls'].includes(choice.finish_reason))throw new SafeError('UPSTREAM_INVALID','Provider returned an incomplete or unsupported response',503);
  const worker=selection.providerId+'/'+selection.modelId;
  const result={id:payload.id??'chatcmpl_'+routeId,object:'chat.completion',created:payload.created??Math.floor(Date.now()/1000),model:worker,choices:[{index:0,message:{...message,role:'assistant'},finish_reason:choice.finish_reason}],usage:payload.usage??{}};
  if(!structured&&!message.tool_calls?.length)result.choices[0].message.content+='\n\n---\nOmniRoute · '+worker+' · route: '+routeId;
  return result;
}
export function applyVerifiedToolCapabilities(config){
  // Native function-call + tool-result probes passed on 2026-08-31.
  const verified=new Set(['mistral/mistral-small-2603','mistral/ministral-8b-2512','cohere/command-r7b-12-2024','cloudflare/@cf/openai/gpt-oss-120b','cloudflare/@cf/zai-org/glm-4.7-flash','kilo/openrouter/free','opencode-zen/big-pickle']);
  for(const provider of config.providers)for(const model of provider.models)if(verified.has(provider.id+'/'+model.modelId))model.capabilities.tool_calling=true;
}
export async function createChatBackend(root,{protector,providerOptions={},transportFactory,configOverride,registryOverride,loggerOverride}={}) {
  const paths=getRuntimePaths(root),config=configOverride??await loadConfig(paths);
  if(!config.routing.freeOnly||config.routing.defaultMode!=='regular')throw new Error('Regular free-only profile required');
  assertRegularProviderPolicy(config);
  applyVerifiedToolCapabilities(config);
  const vault=await SecretVault.load(paths.vault,protector),providers=new Map(),transports=new Map();
  try {
    for(const p of config.providers.filter(p=>p.enabled)) {
      const keys=vault.get(p.id);if(!keys)continue;
      try {
        const key=keys[p.credentialField];
        let prefix=p.apiPrefix;
        if(p.id==='cloudflare'){
          if(!/^[a-f0-9]{32}$/i.test(keys.CLOUDFLARE_ACCOUNT_ID??''))throw new Error('Invalid Cloudflare account ID');
          prefix='client/v4/accounts/'+keys.CLOUDFLARE_ACCOUNT_ID+'/ai/v1/';
        }
        providers.set(p.id,createConfiguredProvider(p,keys,providerOptions));
        const transport=transportFactory?transportFactory(p,keys):new HttpTransport({baseUrl:p.baseUrl,allowLoopback:false,headers:()=>({authorization:'Bearer '+key,'content-type':'application/json'})});
        transports.set(p.id,{transport,path:prefix+'chat/completions'});
      }finally{for(const key of Object.keys(keys))keys[key]='';}
    }
  }finally{vault.dispose();}
  const failover=new FreeModelFailover(config,providers),logger=loggerOverride??new JsonlLogger(join(paths.logsDir,'opencode-routes.jsonl'));
  let snapshot,loadedAt=0;
  return {async complete(input,signal=AbortSignal.timeout(180000)) {
    validateChat(input);
    if(!providers.size)throw new SafeError('KEYS_REQUIRED','No free providers enabled. Open API Keys and complete validation.',503);
    if(!snapshot||Date.now()-loadedAt>60000){snapshot=registryOverride??await buildRegistry(config,providers,signal);loadedAt=Date.now();}
    const intent=requestIntent(input),first=config.routing.directProviderOrder.find(id=>providers.has(id));
    const p=config.providers.find(p=>p.id===first);
    const initial={providerId:first,modelId:p.freeModelOrder?.[0]??p.models.find(m=>m.enabled&&m.allowed)?.modelId,maxOutputTokens:Math.min(input.max_tokens??input.max_completion_tokens??8192,8192),reasoningEffort:'none'};
    const required=['text',...(input.tools?.length?['tool_calling']:[]),...(intent.requiredCapabilities.includes('coding')?['coding']:[])];
    const audit={fallbackAttempts:[],policyDecisions:[]},routeId=randomUUID();
    // The registry must contain the seed; candidates will be filtered and ordered deterministically.
    const candidates=failover.candidates(initial,snapshot,required,estimateTokens(JSON.stringify(input)),intent.modelPreference);
    if(!candidates.length)throw new SafeError('FREE_MODELS_UNAVAILABLE','No free model supports this conversation size and tools',503);
    try {
      const result=await failover.run(candidates[0],snapshot,required,estimateTokens(JSON.stringify(input)),signal,audit,'opencode',async selection=>{
        const {transport,path}=transports.get(selection.providerId);
        const response=await transport.request(selection.providerId,path,{method:'POST',body:JSON.stringify(upstreamBody(input,selection)),signal});
        return normalizeCompletion(await response.json(),selection,routeId,!!input.response_format&&input.response_format.type!=='text');
      },intent.modelPreference);
      await logger.write('info','opencode.route',{routeId,intent:intent.intent,provider:result.selection.providerId,model:result.selection.modelId,fallbacks:audit.fallbackAttempts});
      return result.value;
    }catch(error){await logger.write('warn','opencode.failed',{routeId,intent:intent.intent,fallbacks:audit.fallbackAttempts});throw error;}
  }};
}
export async function startChatProxy(backend) {
  const token=randomBytes(32).toString('hex'),auth=Buffer.from('Bearer '+token),active=new Set();
  const server=createServer(async(req,res)=>{
    const error=(status,message)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:{message}}));};
    const supplied=Buffer.from(req.headers.authorization??'');
    if(supplied.length!==auth.length||!timingSafeEqual(supplied,auth))return error(401,'Local session authentication required');
    if(req.headers.origin)return error(403,'Browser requests rejected');
    if(req.method!=='POST'||req.url!=='/v1/chat/completions')return error(404,'Unsupported endpoint');
    if(active.size>=2)return error(429,'Two local requests are already active');
    const controller=new AbortController();active.add(controller);
    const timer=setTimeout(()=>controller.abort(),180000);req.once('aborted',()=>controller.abort());res.once('close',()=>{if(!res.writableEnded)controller.abort();});
    try {
      const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>2*1024*1024)return error(413,'Request too large');chunks.push(b);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{return error(400,'Invalid JSON');}
      validateChat(input);const result=await backend.complete(input,controller.signal);
      if(input.stream){
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});
        const choice=result.choices[0],message=choice.message;
        const emit=(delta,finish_reason=null)=>res.write('data: '+JSON.stringify({id:result.id,object:'chat.completion.chunk',created:result.created,model:result.model,choices:[{index:0,delta,finish_reason}]})+'\n\n');
        emit({role:'assistant',...(message.content?{content:message.content}:{}),...(message.tool_calls?.length?{tool_calls:message.tool_calls.map((t,index)=>({...t,index}))}:{})});
        emit({},choice.finish_reason);res.end('data: [DONE]\n\n');
      }else{res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));}
    }catch(e){if(!res.headersSent)error(e instanceof SafeError?e.status:503,e instanceof SafeError&&['CHAT_INVALID','TOOLS_INVALID','TEXT_ONLY','BUDGET_INVALID','KEYS_REQUIRED','FREE_MODELS_UNAVAILABLE'].includes(e.code)?e.message:'Free worker failed; see provider status and retry later.');else res.destroy();}
    finally{clearTimeout(timer);active.delete(controller);}
  });
  server.headersTimeout=10000;server.requestTimeout=180000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {baseURL:'http://127.0.0.1:'+server.address().port+'/v1',token,async close(){for(const c of active)c.abort();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
