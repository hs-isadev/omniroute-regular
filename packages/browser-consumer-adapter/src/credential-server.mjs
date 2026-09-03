import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {buildBrowserLaunch,findConsumerBrowser,getConsumerDefinition,minimizeBrowserWindow,waitForConsumerAuthentication} from './runtime.mjs';

const providerIndex=process.argv.indexOf('--provider'),definition=getConsumerDefinition(providerIndex>=0?process.argv[providerIndex+1]:'');
const background=process.argv.includes('--background'),profileIndex=process.argv.indexOf('--profile'),requestedProfile=profileIndex>=0?process.argv[profileIndex+1]:undefined;
if(profileIndex>=0&&(!requestedProfile||!isAbsolute(requestedProfile)))throw new Error(`The ${definition.displayName} profile path must be absolute.`);
const profile=requestedProfile||join(homedir(),`.${definition.id}-consumer-adapter`,'browser-profile');
const portIndex=process.argv.indexOf('--port'),requestedPort=portIndex>=0?Number(process.argv[portIndex+1]):definition.port;
if(!Number.isInteger(requestedPort)||requestedPort<1024||requestedPort>65535)throw new Error(`The ${definition.displayName} browser port must be between 1024 and 65535.`);
const endpoint=`http://127.0.0.1:${requestedPort}`;
async function version(){const response=await fetch(`${endpoint}/json/version`);if(!response.ok)throw new Error(`Browser endpoint returned ${response.status}`);return response.json();}
async function waitReady(timeout=30000){const start=Date.now();while(Date.now()-start<timeout){try{return await version();}catch{await new Promise(resolve=>setTimeout(resolve,500));}}throw new Error(`The ${definition.displayName} browser did not start within 30 seconds.`);}
async function start(){
  await mkdir(profile,{recursive:true,mode:0o700});let running=false;try{await version();running=true;}catch{}
  if(!running){const browserPath=await findConsumerBrowser(definition,{home:homedir()}),launch=buildBrowserLaunch(definition,{browserPath,profileDir:profile,cdpPort:requestedPort,background});const child=spawn(launch.command,launch.args,{detached:true,stdio:'ignore',windowsHide:true});child.unref();}
  await waitReady();const browser=await chromium.connectOverCDP(endpoint),context=browser.contexts()[0];if(!context)throw new Error(`The ${definition.displayName} browser has no usable profile.`);
  let page=context.pages().find(item=>item.url().startsWith(new URL(definition.url).origin));if(!page)page=await context.newPage();if(!page.url().startsWith(new URL(definition.url).origin))await page.goto(definition.url,{waitUntil:'domcontentloaded',timeout:30000});
  if(!background)console.log(`Sign in to ${definition.displayName} in the dedicated browser window. It will minimize automatically when ready.`);
  const authenticated=await waitForConsumerAuthentication(page,{definition,timeoutMs:background?2000:600000});
  if(!authenticated){if(background){console.log(`${definition.displayName} needs a one-time sign-in. Run Setup to open its dedicated login window.`);return;}throw new Error(`Timed out waiting for ${definition.displayName} sign-in. Run Setup again when ready.`);}
  await minimizeBrowserWindow(context,page);console.log(`${definition.displayName} consumer browser is signed in and running in the background.`);
}
start().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
