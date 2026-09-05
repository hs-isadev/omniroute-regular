import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const sharedAdapter=fileURLToPath(new URL('../packages/browser-consumer-adapter/src/adapter.mjs',import.meta.url));
const definitions={
  claude:{adapter:fileURLToPath(new URL('../packages/claude-consumer-adapter/src/adapter.mjs',import.meta.url)),toolName:'claude_query'},
  zai:{adapter:fileURLToPath(new URL('../packages/zai-consumer-adapter/src/adapter.mjs',import.meta.url)),toolName:'zai_query'},
  qwen:{adapter:sharedAdapter,toolName:'qwen_query',providerArg:'qwen'},
  kimi:{adapter:sharedAdapter,toolName:'kimi_query',providerArg:'kimi'},
  deepseek:{adapter:sharedAdapter,toolName:'deepseek_query',providerArg:'deepseek'},
  perplexity:{adapter:sharedAdapter,toolName:'perplexity_query',providerArg:'perplexity'},
};
const query=process.argv.includes('--query');

async function probe(provider,definition){
  const args=[definition.adapter,...(definition.providerArg?['--provider',definition.providerArg]:[]),'--endpoint','http://127.0.0.1:47842'];
  const child=spawn(process.execPath,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
  let buffered='',stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;});
  try{
    const response=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error(`${provider} probe timed out`)),query?150000:45000);
      child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
        buffered+=chunk;
        for(;;){const newline=buffered.indexOf('\n');if(newline<0)break;const line=buffered.slice(0,newline).trim();buffered=buffered.slice(newline+1);if(!line)continue;
          try{const message=JSON.parse(line);if(message.id===2){clearTimeout(timer);resolve(message);}}catch{}
        }
      });
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{if(code!==null&&code!==0){clearTimeout(timer);reject(new Error(`${provider} adapter exited ${code}${stderr.trim()?`: ${stderr.trim()}`:''}`));}});
      child.stdin.write(`${JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'omniroute-private-probe',version:'0.1.0'}}})}\n`);
      child.stdin.write(`${JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})}\n`);
      child.stdin.write(`${JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:query?definition.toolName:'test_connection',arguments:query?{prompt:'Reply with exactly: OMNIROUTE_OK'}:{}}})}\n`);
    });
    const result=response.result??{},text=result.content?.find(item=>item.type==='text')?.text,payload=text?JSON.parse(text):{};
    return {provider,ok:result.isError!==true&&(query?payload.output?.includes('OMNIROUTE_OK'):payload.status==='ready'),result:query?String(payload.output??'').slice(0,120):payload.status??payload.error??'invalid response'};
  }finally{try{child.stdin.end();}catch{}if(child.exitCode===null)child.kill();}
}

const results=[];
for(const [provider,definition] of Object.entries(definitions))results.push(await probe(provider,definition));
console.log(JSON.stringify(results,null,2));
if(results.some(item=>!item.ok))process.exitCode=1;
