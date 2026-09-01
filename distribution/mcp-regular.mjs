import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getRuntimePaths, loadConfig, ensureRuntimeDirectories } from '../packages/config/dist/index.js';
import { SecretVault } from '../packages/vault/dist/index.js';
import { createProviders, buildRegistry } from '../packages/providers/dist/index.js';
import { OmniRouter } from '../packages/core/dist/index.js';
import { AuditStore, JsonlLogger, globalRedactor } from '../packages/observability/dist/index.js';
import { serveOmniMcp } from '../packages/mcp-server/dist/index.js';
import { assertRegularProviderPolicy } from './regular-policy.mjs';

// No listening socket, daemon token, provider login or credential writes.
// A host-owned stdio process exits on EOF; each connection keeps one router.
export async function createRegularBackend(options={}) {
  const paths=options.paths??getRuntimePaths();
  if(!options.config) await access(paths.config);
  const config=options.config??await loadConfig(paths);
  if(!config.routing.freeOnly) throw new Error('Antigravity MCP requires free-only configuration.');
  if(config.routing.defaultMode!=='regular') throw new Error('Antigravity MCP requires an isolated regular profile, not an orchestrator profile.');
  // Check before loading/decrypting any credentials, not only during key entry.
  assertRegularProviderPolicy(config);
  let router=options.router,registry=options.registry,recent=options.recent,usageSummary=options.usageSummary;
  let routeSignal,cache,loadedAt=0;
  if(!router) {
    await ensureRuntimeDirectories(paths);
    const vault=await SecretVault.load(paths.vault,options.protector),credentials={};
    try {for(const provider of config.providers.filter(p=>p.enabled)) {const value=vault.get(provider.id);if(value) credentials[provider.id]=value;}}
    finally {vault.dispose();}
    // An edited profile cannot introduce a paid provider into this entrypoint.
    config.providers=config.providers.filter(p=>p.freeTierOnly);
    const providers=createProviders(config,{credentials,...options.providerOptions});
    for(const key of Object.keys(credentials)) delete credentials[key];
    registry=async()=>{
      if(cache&&Date.now()-loadedAt<config.routing.modelHealthTtlSeconds*1000) return cache;
      cache=await buildRegistry(config,providers,routeSignal??AbortSignal.timeout(60_000));loadedAt=Date.now();return cache;
    };
    const audit=new AuditStore(paths.routes),sink=new JsonlLogger(paths.log);
    // Upstream error bodies can echo user content. Return redacted details to
    // the caller, but persist only a generic error plus routing metadata.
    const logger={write:(level,event,data)=>sink.write(level,event,event==='route.failed'?{...data,error:'Worker failed; details returned to the host, not persisted.'}:data)};
    recent=limit=>audit.recent(limit);
    usageSummary=()=>audit.tokenSavingsSummary();
    router=new OmniRouter({config,providers,registry,audit,logger});
  }
  let busy=false;
  return {
    async route(input,signal) {
      if(input.routingMode && input.routingMode!=='regular') throw new Error('This MCP server is locked to regular mode.');
      if(typeof input.prompt!=='string'||!input.prompt.trim()||Buffer.byteLength(input.prompt)>config.daemon.maxRequestBytes) throw new Error('Invalid or oversized worker prompt.');
      let prompt=input.prompt;
      if(/^\s*(?:please\s+)?(?:continue|carry on|go on|teruskan|sambung)(?:\s+(?:please|tolong))?[.!?\s]*$/i.test(prompt)) {
        if(typeof input.parentTask!=='string'||!input.parentTask.trim()) throw new Error('A continuation needs bounded parentTask context; workers have no conversation history.');
        prompt=`Parent task and requirements:\n${input.parentTask}\n\nContinuation: ${prompt}`;
        if(Buffer.byteLength(prompt)>config.daemon.maxRequestBytes) throw new Error('Parent context exceeds the worker prompt limit.');
      }
      if(signal?.aborted) throw signal.reason;
      if(busy) throw new Error('Worker busy; wait for the previous tool request before retrying.');
      busy=true;
      routeSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(Math.min(config.daemon.routeTimeoutMs,300_000))]);
      try {
        return await router.route({prompt,routingMode:'regular',sourceClient:'antigravity-mcp',hostApplication:input.hostApplication??'antigravity',hostModel:input.hostModelAuthoritative?input.hostModel??null:null,hostModelAuthoritative:input.hostModelAuthoritative===true,attachments:[],requestedCapabilities:input.requiredCapabilities??[],maxOutputTokens:null,privacyMode:null,metadata:{workerTextOnly:'true'}},routeSignal);
      } catch(error) {throw new Error(globalRedactor.redactText(error instanceof Error?error.message:'Worker request failed'));}
      finally {busy=false;routeSignal=undefined;}
    },
    async models() {return (await registry()).models.filter(model=>model.enabled&&model.allowed);},
    async recentRoutes(limit) {return recent(Math.max(1,Math.min(100,Number.isFinite(limit)?limit:20)));},
    async usageSummary() {return usageSummary?usageSummary():{routes:0,providerReportedRoutes:0,routesWithoutProviderUsage:0,providerReportedInputTokens:0,providerReportedOutputTokens:0,providerReportedTokensOffloaded:0,actualHostTokensSaved:null,savingsStatus:'counterfactual-host-usage-unavailable',explanation:'No persistent audit store is attached to this backend.'};},
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    if(process.argv[2]==='hook') {
      let raw='';for await(const chunk of process.stdin){raw+=chunk.toString();if(raw.length>1_000_000)throw new Error('Hook input too large');}
      let prompt='';try{const input=JSON.parse(raw);prompt=typeof input.prompt==='string'?input.prompt:'';}catch{}
      if(prompt)process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:'OmniRoute Regular is available for bounded non-sensitive delegation through omni_route with routingMode=regular. Use omni_usage for exact provider-reported offload; do not claim exact host-token savings. Preserve attribution and verify worker output.'}}));
    } else await serveOmniMcp(await createRegularBackend(),{regularOnly:true});
  }
  catch(error) {process.stderr.write(globalRedactor.redactText(`OmniRoute Regular: ${error.message}. Check Settings and the isolated regular profile.\n`));process.exitCode=1;}
}
