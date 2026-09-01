import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {openCodeConfig,startChatProxy,createChatBackend} from '../distribution/dual-chat.mjs';
import {openCodeEnvironment} from '../distribution/dual-setup.mjs';
import {regularConfig} from '../distribution/settings.mjs';
import {getRuntimePaths} from '../packages/config/dist/index.js';
const root=await mkdtemp(join(tmpdir(),'dual-opencode-'));
const file=join(root,'fixture.txt');await writeFile(file,'DUAL_HOST_TOOL_PROOF_8472\n');
let requests=0,toolRoundTrip=false;
let liveBackend;
if(process.argv.includes('--live')){
  const config=regularConfig();config.providers.find(p=>p.id==='groq').enabled=true;
  liveBackend=await createChatBackend(getRuntimePaths().root,{configOverride:config,loggerOverride:{write:async()=>{}}});
}
const proxy=await startChatProxy({complete:async input=>{
  requests++;
  const tool=input.messages.find(m=>m.role==='tool'&&JSON.stringify(m.content).includes('DUAL_HOST_TOOL_PROOF_8472'));
  if(tool)toolRoundTrip=true;
  if(liveBackend)return liveBackend.complete(input,AbortSignal.timeout(60000));
  const message=tool?{role:'assistant',content:'DUAL_HOST_TOOL_PROOF_8472'}:{role:'assistant',content:null,tool_calls:[{id:'call_read_fixture',type:'function',function:{name:'read',arguments:JSON.stringify({filePath:file})}}]};
  return {id:'chatcmpl_fixture',object:'chat.completion',created:1,model:'fixture/free',choices:[{index:0,message,finish_reason:tool?'stop':'tool_calls'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};
}});
const config=openCodeConfig(proxy.baseURL,proxy.token);config.permission={'*':'deny',read:'allow'};
const binary=process.argv[2];if(!binary)throw new Error('Pass a pinned OpenCode executable');
const env=openCodeEnvironment(process.env,root,JSON.stringify(config));
const child=spawn(resolve(binary),['run','--pure','--model','omniroute/regular','--format','json','Read fixture.txt with the read tool and report its marker.'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
const timer=setTimeout(()=>child.kill(),90000);
try {
  const code=await new Promise((res,rej)=>{child.on('error',rej);child.on('close',res);});
  const ok=code===0&&toolRoundTrip&&stdout.includes('DUAL_HOST_TOOL_PROOF_8472');
  console.log(JSON.stringify({live:!!liveBackend,exitCode:code,requests,toolRoundTrip,markerReturned:stdout.includes('DUAL_HOST_TOOL_PROOF_8472'),passed:ok,testDirectory:root}));
  if(!ok){console.error(stderr.split(proxy.token).join('[SESSION]').slice(-2200));console.error(stdout.split(proxy.token).join('[SESSION]').slice(-1800));process.exitCode=1;}
}finally{clearTimeout(timer);await proxy.close();}
