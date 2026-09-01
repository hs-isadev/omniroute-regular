import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {buildBrowserLaunch,findConsumerBrowser,isClaudeLoginUrl} from './browser.mjs';

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
  if(background)console.log(isClaudeLoginUrl(page.url())?'Claude needs you to sign in once. Run Setup again to open the login window.':'Claude consumer browser is ready in the background.');
  else console.log(isClaudeLoginUrl(page.url())?'Sign in to Claude in the dedicated browser window. OmniRoute will reuse only this profile.':'Claude is already signed in. You can close Setup; keep the dedicated browser running.');
}

start().catch(error=>{console.error(error.message);process.exitCode=1;});
