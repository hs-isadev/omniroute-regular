import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {buildBrowserLaunch,findConsumerBrowser,isClaudeLoginUrl,minimizeBrowserWindow,waitForConsumerAuthentication} from './browser.mjs';

const readySelector='[data-testid="chat-input"][contenteditable="true"],.ProseMirror[contenteditable="true"],[contenteditable="true"][role="textbox"],textarea[data-testid="prompt-input"],textarea[placeholder*="Message" i]';

const background=process.argv.includes('--background');
const profileIndex=process.argv.indexOf('--profile');
const requestedProfile=profileIndex>=0?process.argv[profileIndex+1]:undefined;
if(profileIndex>=0&&(!requestedProfile||!isAbsolute(requestedProfile)))throw new Error('The Claude profile path must be absolute.');
const profile=requestedProfile||process.env.CLAUDE_CONSUMER_PROFILE||join(homedir(),'.claude-consumer-adapter','browser-profile');
const portIndex=process.argv.indexOf('--port'),requestedPort=portIndex>=0?Number(process.argv[portIndex+1]):9222;
if(!Number.isInteger(requestedPort)||requestedPort<1024||requestedPort>65535)throw new Error('The Claude browser port must be between 1024 and 65535.');
const port=requestedPort;
const endpoint=`http://127.0.0.1:${port}`;

async function version(){const response=await fetch(`${endpoint}/json/version`);if(!response.ok)throw new Error(`Browser endpoint returned ${response.status}`);return response.json();}
async function waitReady(timeout=30000){const start=Date.now();while(Date.now()-start<timeout){try{return await version();}catch{await new Promise(resolve=>setTimeout(resolve,500));}}throw new Error('The Claude browser did not start within 30 seconds.');}
async function start(){
  await mkdir(profile,{recursive:true,mode:0o700});
  let running=false;try{await version();running=true;}catch{}
  if(!running){
    const browserPath=await findConsumerBrowser({home:homedir()});
    const launch=buildBrowserLaunch({browserPath,profileDir:profile,cdpPort:port,background});
    const child=spawn(launch.command,launch.args,{detached:true,stdio:'ignore',windowsHide:true});child.unref();
  }
  await waitReady();
  const browser=await chromium.connectOverCDP(endpoint),context=browser.contexts()[0];
  if(!context)throw new Error('The Claude browser has no usable profile.');
  let page=context.pages().find(item=>item.url().includes('claude.ai'));
  if(!page)page=await context.newPage();
  if(!page.url().includes('claude.ai'))await page.goto(background?'https://claude.ai/new':'https://claude.ai/login',{waitUntil:'domcontentloaded',timeout:30000});
  if(!background&&isClaudeLoginUrl(page.url()))console.log('Sign in to Claude in the dedicated browser window. It will minimize automatically when ready.');
  const authenticated=await waitForConsumerAuthentication(page,{isLoginUrl:isClaudeLoginUrl,readySelector,timeoutMs:background?2000:600000});
  if(!authenticated){
    if(background){console.log('Claude needs a one-time sign-in. Run Setup to open its dedicated login window.');return;}
    throw new Error('Timed out waiting for Claude sign-in. Run Setup again when you are ready.');
  }
  await minimizeBrowserWindow(context,page);
  console.log('Claude consumer browser is signed in and running in the background.');
}

start().then(()=>process.exit(0)).catch(error=>{console.error(error.message);process.exit(1);});
