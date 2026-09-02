import {chromium} from 'playwright';
import {ZAI_ASSISTANT_RESPONSE_SELECTOR,ZAI_FLASH_SWITCH_PATTERN,ZAI_PEAK_HOUR_PATTERN,cleanAssistantParts,decidePeakHourAction} from './dom.mjs';

const endpointIndex=process.argv.indexOf('--endpoint');
const endpoint=endpointIndex>=0?process.argv[endpointIndex+1]:process.env.ZAI_CDP_ENDPOINT||'http://127.0.0.1:9222';
const parsedEndpoint=new URL(endpoint||'invalid:');
if(parsedEndpoint.protocol!=='http:'||!['127.0.0.1','localhost'].includes(parsedEndpoint.hostname)||!/^\d+$/.test(parsedEndpoint.port))throw new Error('Z.AI CDP endpoint must be loopback HTTP with an explicit port.');
const port=Number(parsedEndpoint.port);if(port<1||port>65535)throw new Error('Z.AI CDP endpoint port is invalid.');

const input=[
  'textarea#chat-input',
  'textarea[data-testid="chat-input"]',
  'textarea[placeholder*="Message" i]',
  'textarea[placeholder*="Ask" i]',
  '[contenteditable="true"][role="textbox"]',
].join(',');
const sendButton='button[type="submit"],button[aria-label*="Send" i],[data-testid="send-button"]';
const stopButton='button[aria-label*="Stop" i],[data-testid="stop-button"],button[title*="Stop" i]';
const userMenu='#nux-user-menu-btn,button[aria-label="Open User Menu"]';
const result=(value,isError=false)=>({content:[{type:'text',text:JSON.stringify(value)}],...(isError?{isError:true}:{})});
let browser,page;

async function connect(){
  if(!browser||!browser.isConnected())browser=await chromium.connectOverCDP(endpoint);
  const context=browser.contexts()[0];if(!context)throw new Error('The browser attached for Z.AI has no usable profile.');
  if(!page||page.isClosed())page=await context.newPage();
  return page;
}
async function closePage(){try{if(page&&!page.isClosed())await page.close();}catch{}page=undefined;}
async function ready(target){
  await target.goto('https://chat.z.ai/',{waitUntil:'domcontentloaded',timeout:30000});
  if(/^https:\/\/chat\.z\.ai\/(?:auth|login)(?:[/?#]|$)/i.test(target.url()))throw new Error('Z.AI is not signed in in the attached browser profile.');
  try{await target.waitForSelector(input,{state:'visible',timeout:15000});}
  catch{throw new Error('The Z.AI prompt input is unavailable. Sign in at chat.z.ai in the attached browser, or update the adapter selectors if the site changed.');}
  try{await target.waitForSelector(userMenu,{state:'visible',timeout:15000});}
  catch{throw new Error('Z.AI is not signed in in the attached browser profile.');}
}
async function responseState(target){
  const items=await target.$$(ZAI_ASSISTANT_RESPONSE_SELECTOR);
  if(!items.length)return {count:0,text:''};
  const parts=await items.at(-1).evaluate(node=>{
    const children=[...node.children];
    return (children.length?children:[node]).map(child=>({
      text:child.textContent??'',
      thinking:child.matches?.('.thinking-chain-container')||Boolean(child.querySelector?.('.thinking-chain-container')),
    }));
  });
  return {count:items.length,text:cleanAssistantParts(parts)};
}
async function handlePeakHour(target,state){
  const notices=target.getByText(ZAI_PEAK_HOUR_PATTERN),noticeCount=await notices.count();
  let noticeText='';
  for(let index=noticeCount-1;index>=0;index--){
    const notice=notices.nth(index);
    if(await notice.isVisible().catch(()=>false)){noticeText=await notice.innerText().catch(()=>'in peak hour');break;}
  }
  if(!noticeText)return;
  const controls=target.locator('button,[role="button"],a'),labels=await controls.allInnerTexts();
  const decision=decidePeakHourAction(noticeText,labels);
  if(decision.action==='none')return;
  if(decision.action==='switch'&&!state.attemptedAt){
    const candidates=controls.filter({hasText:ZAI_FLASH_SWITCH_PATTERN}),count=await candidates.count();
    for(let index=0;index<count;index++){
      const candidate=candidates.nth(index);
      if(await candidate.isVisible().catch(()=>false)&&await candidate.isEnabled().catch(()=>false)){
        await candidate.click();state.attemptedAt=Date.now();return;
      }
    }
  }
  if(state.attemptedAt&&Date.now()-state.attemptedAt<10000)return;
  throw new Error('Z.AI is in peak hour and GLM 5.3 Flash could not be selected. OmniRoute should try another provider.');
}
async function stable(target,before){
  let last='',same=0;const started=Date.now(),peakHour={attemptedAt:0};
  while(Date.now()-started<120000){
    await target.waitForTimeout(750);
    await handlePeakHour(target,peakHour);
    const current=await responseState(target);
    const changed=current.count>before.count||(current.text&&current.text!==before.text);
    if(!changed)continue;
    if(current.text&&current.text===last)same++;else if(current.text){last=current.text;same=0;}
    const generating=Boolean(await target.$(stopButton));
    if(last&&!generating&&same>=3)return last;
  }
  return last;
}
async function submit(target,prompt){
  await target.fill(input,prompt);
  const button=await target.$(sendButton);
  if(button&&await button.isVisible()&&await button.isEnabled())await button.click();
  else await target.keyboard.press('Enter');
}
async function call(name,args={}){
  try{
    const target=await connect();await ready(target);
    if(name==='test_connection')return result({status:'ready',browser:'chromium-cdp',endpoint});
    if(name!=='zai_query')return result({error:`Unknown tool: ${name}`},true);
    const prompt=typeof args.prompt==='string'?args.prompt.trim():'';if(!prompt)return result({error:'prompt must be a non-empty string'},true);
    const before=await responseState(target);await submit(target,prompt);
    const output=await stable(target,before);if(!output)throw new Error('Z.AI returned no readable response.');
    return result({output,usage:{model:'glm-web-consumer',estimatedTokens:Math.ceil((prompt.length+output.length)/4)},metadata:{transport:'browser-cdp',timestamp:new Date().toISOString()}});
  }catch(error){return result({error:error instanceof Error?error.message:String(error)},true);}finally{await closePage();}
}
function send(id,payload){process.stdout.write(`${JSON.stringify({jsonrpc:'2.0',id,...payload})}\n`);}
let buffered='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  buffered+=chunk;
  for(;;){const newline=buffered.indexOf('\n');if(newline<0)break;const line=buffered.slice(0,newline).trim();buffered=buffered.slice(newline+1);if(!line)continue;
    void (async()=>{try{const message=JSON.parse(line);if(message.id===undefined)return;
      if(message.method==='initialize')send(message.id,{result:{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'zai-consumer-adapter',version:'0.1.0'}}});
      else if(message.method==='tools/list')send(message.id,{result:{tools:[{name:'zai_query',description:'Ask a GLM model through the signed-in Z.AI browser session.',inputSchema:{type:'object',properties:{prompt:{type:'string',minLength:1}},required:['prompt'],additionalProperties:false}},{name:'test_connection',description:'Check the attached Z.AI browser login.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}});
      else if(message.method==='tools/call')send(message.id,{result:await call(message.params?.name,message.params?.arguments)});
      else send(message.id,{error:{code:-32601,message:'Method not found'}});
    }catch(error){try{const parsed=JSON.parse(line);if(parsed.id!==undefined)send(parsed.id,{error:{code:-32603,message:error instanceof Error?error.message:String(error)}});}catch{}}})();
  }
});
