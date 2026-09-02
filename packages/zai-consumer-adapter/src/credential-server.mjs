import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {buildBrowserLaunch,findConsumerBrowser,isZaiLoginUrl} from './browser.mjs';

const background=process.argv.includes('--background');
const profileIndex=process.argv.indexOf('--profile');
const requestedProfile=profileIndex>=0?process.argv[profileIndex+1]:undefined;
if(profileIndex>=0&&(!requestedProfile||!isAbsolute(requestedProfile)))throw new Error('The Z.AI profile path must be absolute.');
const profile=requestedProfile||process.env.ZAI_CONSUMER_PROFILE||join(homedir(),'.zai-consumer-adapter','browser-profile');
const portIndex=process.argv.indexOf('--port'),requestedPort=portIndex>=0?Number(process.argv[portIndex+1]):47843;
if(!Number.isInteger(requestedPort)||requestedPort<1024||requestedPort>65535)throw new Error('The Z.AI browser port must be between 1024 and 65535.');
const endpoint=`http://127.0.0.1:${requestedPort}`;

async function version(){const response=await fetch(`${endpoint}/json/version`);if(!response.ok)throw new Error(`Browser endpoint returned ${response.status}`);return response.json();}
async function waitReady(timeout=30000){const start=Date.now();while(Date.now()-start<timeout){try{return await version();}catch{await new Promise(resolve=>setTimeout(resolve,500));}}throw new Error('The Z.AI browser did not start within 30 seconds.');}
async function start(){
  await mkdir(profile,{recursive:true,mode:0o700});
  let running=false;try{await version();running=true;}catch{}
  if(!running){
    const browserPath=await findConsumerBrowser({home:homedir()});
    const launch=buildBrowserLaunch({browserPath,profileDir:profile,cdpPort:requestedPort,background});
    const child=spawn(launch.command,launch.args,{detached:true,stdio:'ignore',windowsHide:true});child.unref();
  }
  await waitReady();
  const browser=await chromium.connectOverCDP(endpoint),context=browser.contexts()[0];
  if(!context)throw new Error('The Z.AI browser has no usable profile.');
  let page=context.pages().find(item=>item.url().includes('chat.z.ai'));
  if(!page)page=await context.newPage();
  if(!page.url().includes('chat.z.ai'))await page.goto('https://chat.z.ai/',{waitUntil:'domcontentloaded',timeout:30000});
  if(background)console.log(isZaiLoginUrl(page.url())?'Z.AI needs you to sign in once. Run setup again interactively.':'Z.AI consumer browser is ready in the background.');
  else console.log(isZaiLoginUrl(page.url())?'Sign in to Z.AI in this dedicated browser window. OmniRoute will reuse only this profile.':'Z.AI is already signed in. Keep this dedicated browser running.');
}

start().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
