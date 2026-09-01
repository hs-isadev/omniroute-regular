import {chromium} from 'playwright';

const endpointIndex=process.argv.indexOf('--endpoint');
const endpoint=endpointIndex>=0?process.argv[endpointIndex+1]:process.env.CLAUDE_CDP_ENDPOINT||'http://127.0.0.1:9222';
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d{1,5}$/.test(endpoint||''))throw new Error('Claude CDP endpoint must be loopback HTTP.');
const input='[data-testid="chat-input"][contenteditable="true"],.ProseMirror[contenteditable="true"],[contenteditable="true"][role="textbox"],textarea[data-testid="prompt-input"],textarea[placeholder*="Message" i]';
const responses='[data-testid="assistant-message"],[data-testid*="assistant"],[data-is-streaming],.font-claude-response';
const result=(value,isError=false)=>({content:[{type:'text',text:JSON.stringify(value)}],...(isError?{isError:true}:{})});
let browser,page;

async function connect(){
  if(!browser||!browser.isConnected())browser=await chromium.connectOverCDP(endpoint);
  const context=browser.contexts()[0];if(!context)throw new Error('The dedicated Claude browser is not running.');
  if(!page||page.isClosed())page=await context.newPage();
  return page;
}
async function closePage(){try{if(page&&!page.isClosed())await page.close();}catch{}page=undefined;}
async function ready(target){
  await target.goto('https://claude.ai/new',{waitUntil:'domcontentloaded',timeout:30000});
  if(/claude\.ai\/(login|oauth|auth)/i.test(target.url()))throw new Error('Claude is not signed in. Run Setup and sign in in the dedicated browser.');
  await target.waitForSelector(input,{state:'visible',timeout:15000});
}
async function stable(target){
  let last='',same=0;const started=Date.now();
  while(Date.now()-started<120000){
    await target.waitForTimeout(750);
    const items=await target.$$(responses),text=items.length?(await items.at(-1).textContent())?.trim()||'':'';
    if(text&&text===last)same++;else if(text){last=text;same=0;}
    const generating=Boolean(await target.$('[data-testid="stop-button"],button[aria-label*="stop" i]'));
    if(last&&!generating&&same>=3)return last;
  }
  return last;
}
async function call(name,args={}){
  try{
    const target=await connect();await ready(target);
    if(name==='test_connection')return result({status:'ready',browser:'dedicated-chromium-cdp',endpoint});
    if(name!=='claude_query')return result({error:`Unknown tool: ${name}`},true);
    const prompt=typeof args.prompt==='string'?args.prompt.trim():'';if(!prompt)return result({error:'prompt must be a non-empty string'},true);
    await target.fill(input,prompt);await target.keyboard.press('Enter');
    await target.waitForSelector(responses,{state:'attached',timeout:60000});
    const output=await stable(target);if(!output)throw new Error('Claude returned no readable response.');
    return result({output,usage:{model:'claude-web-consumer',estimatedTokens:Math.ceil((prompt.length+output.length)/4)},metadata:{transport:'browser-cdp',timestamp:new Date().toISOString()}});
  }catch(error){return result({error:error.message},true);}finally{await closePage();}
}
function send(id,payload){process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id,...payload})}\n`);}
let buffered='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffered+=chunk;
  for(;;){const newline=buffered.indexOf('\n');if(newline<0)break;const line=buffered.slice(0,newline).trim();buffered=buffered.slice(newline+1);if(!line)continue;
    void (async()=>{try{const message=JSON.parse(line);if(message.id===undefined)return;
      if(message.method==='initialize')send(message.id,{result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'claude-consumer-adapter',version:'0.1.0'}}});
      else if(message.method==='tools/list')send(message.id,{result:{tools:[{name:'claude_query',description:'Ask Claude through the signed-in dedicated browser.',inputSchema:{type:'object',properties:{prompt:{type:'string',minLength:1}},required:['prompt'],additionalProperties:false}},{name:'test_connection',description:'Check the dedicated Claude browser login.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}});
      else if(message.method==='tools/call')send(message.id,{result:await call(message.params?.name,message.params?.arguments)});
      else send(message.id,{error:{code:-32601,message:'Method not found'}});
    }catch(error){try{const parsed=JSON.parse(line);if(parsed.id!==undefined)send(parsed.id,{error:{code:-32603,message:error.message}});}catch{}}})();
  }
});
