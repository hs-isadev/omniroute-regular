import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {buildSharedBrowserLaunch,findConsumerBrowser,getConsumerDefinition,getSharedSessionDefinition,minimizeBrowserWindow,waitForConsumerAuthentication} from './runtime.mjs';

const session=getSharedSessionDefinition(),background=process.argv.includes('--background');
const profileIndex=process.argv.indexOf('--profile'),requestedProfile=profileIndex>=0?process.argv[profileIndex+1]:undefined;
if(profileIndex>=0&&(!requestedProfile||!isAbsolute(requestedProfile)))throw new Error('The shared browser profile path must be absolute.');
const profile=requestedProfile||join(homedir(),'.omniroute-browser-consumers','browser-profile');
const portIndex=process.argv.indexOf('--port'),port=portIndex>=0?Number(process.argv[portIndex+1]):session.port;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('The shared browser port must be between 1024 and 65535.');
const endpoint=`http://127.0.0.1:${port}`;
const sites=[
  {id:'claude',displayName:'Claude',url:'https://claude.ai/new',loginPattern:/^https:\/\/claude\.ai\/(?:login|oauth|auth)(?:[/?#]|$)/i,inputSelector:'[data-testid="chat-input"][contenteditable="true"],.ProseMirror[contenteditable="true"],[contenteditable="true"][role="textbox"],textarea[data-testid="prompt-input"]',signedOutSelector:'button:has-text("Log in"),a:has-text("Log in")'},
  {id:'zai',displayName:'Z.AI',url:'https://chat.z.ai/',loginPattern:/^https:\/\/chat\.z\.ai\/(?:auth|login)(?:[/?#]|$)/i,inputSelector:'textarea#chat-input,textarea[data-testid="chat-input"],[contenteditable="true"][role="textbox"]',signedInSelector:'#nux-user-menu-btn,button[aria-label="Open User Menu"]'},
  ...['qwen','kimi','deepseek','perplexity'].map(getConsumerDefinition),
];
const isLogin=(site,url)=>site.loginPattern.test(String(url??''));
async function version(){const response=await fetch(`${endpoint}/json/version`);if(!response.ok)throw new Error(`Browser endpoint returned ${response.status}`);return response.json();}
async function waitReady(timeout=30000){const started=Date.now();while(Date.now()-started<timeout){try{return await version();}catch{await new Promise(resolve=>setTimeout(resolve,500));}}throw new Error('The shared browser did not start within 30 seconds.');}
async function start(){
  await mkdir(profile,{recursive:true,mode:0o700});let running=false;try{await version();running=true;}catch{}
  if(!running){const browserPath=await findConsumerBrowser(session,{home:homedir()}),launch=buildSharedBrowserLaunch({browserPath,profileDir:profile,cdpPort:port,background});const child=spawn(launch.command,launch.args,{detached:true,stdio:'ignore',windowsHide:true});child.unref();}
  await waitReady();const browser=await chromium.connectOverCDP(endpoint),context=browser.contexts()[0];if(!context)throw new Error('The shared browser has no usable profile.');
  const pages=[];
  for(const site of sites){const origin=new URL(site.url).origin;let page=context.pages().find(candidate=>candidate.url().startsWith(origin)&&!pages.includes(candidate));if(!page){page=await context.newPage();await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:30000});}pages.push(page);}
  if(!background)console.log('Sign in to any unfinished provider tabs. The shared Opera window will minimize when all six are ready.');
  const checks=await Promise.all(sites.map((site,index)=>waitForConsumerAuthentication(pages[index],{definition:{...site,loginPattern:site.loginPattern},timeoutMs:background?3000:600000}).then(ok=>({site,ok}))));
  const pending=checks.filter(item=>!item.ok).map(item=>item.site.displayName);if(pending.length){if(background){console.log(`Shared browser needs sign-in for: ${pending.join(', ')}.`);return;}throw new Error(`Timed out waiting for sign-in: ${pending.join(', ')}`);}
  await minimizeBrowserWindow(context,pages[0]);console.log('All OmniRoute browser consumers are signed in and running in one background Opera session.');
}
start().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
