// Test helper only: production modules from the EXTRACTED package, fake provider.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const [app,temp]=process.argv.slice(2),moduleAt=p=>import(pathToFileURL(join(app,p)).href);
const {regularConfig}=await moduleAt('distribution/settings.mjs');
const {createRegularBackend}=await moduleAt('distribution/mcp-regular.mjs');
const {serveOmniMcp}=await moduleAt('packages/mcp-server/dist/index.js');
const {OmniRouter}=await moduleAt('packages/core/dist/index.js');
const {buildRegistry}=await moduleAt('packages/providers/dist/index.js');
const {AuditStore,JsonlLogger}=await moduleAt('packages/observability/dist/index.js');
const config=regularConfig();for(const p of config.providers)p.enabled=p.id==='groq';
const settings=config.providers.find(p=>p.id==='groq');
const provider={id:'groq',supportsStreaming:false,listModels:async()=>settings.models.map(m=>({id:m.modelId,capabilities:{},reasoningEfforts:['none']})),healthCheck:async()=>({status:'healthy',checkedAt:new Date().toISOString(),latencyMs:0,message:null}),generate:async request=>({text:request.prompt.includes('function')?'function add(a,b){return a+b;}':'A variable stores a value.',responseId:'fixture',usage:{inputTokens:10,outputTokens:5,cachedInputTokens:0,estimatedCostUsd:0}}),classifyError:e=>({category:'unknown',message:String(e),retryable:false,retryAfterMs:null})};
const providers=new Map([['groq',provider]]),registry=()=>buildRegistry(config,providers);
const audit=new AuditStore(join(temp,'routes.jsonl')),logger=new JsonlLogger(join(temp,'diagnostic.jsonl'));
const router=new OmniRouter({config,providers,registry,audit,logger});
await serveOmniMcp(await createRegularBackend({config,router,registry,recent:limit=>audit.recent(limit)}),{regularOnly:true});
