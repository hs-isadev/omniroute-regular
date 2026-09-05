import {access} from 'node:fs/promises';
import {win32} from 'node:path';

const sharedInput='textarea,[contenteditable="true"][role="textbox"],[contenteditable="true"][data-lexical-editor="true"]';
const signOutControls=(...labels)=>labels.flatMap(label=>[`button:has-text("${label}")`,`a:has-text("${label}")`,`[role="button"]:has-text("${label}")`]).join(',');
const sharedSession={id:'shared',displayName:'OmniRoute browser consumers',port:47842,profileName:'browser-consumer-profile',urls:['https://claude.ai/new','https://chat.z.ai/','https://chat.qwen.ai/','https://www.kimi.ai/login','https://chat.deepseek.com/','https://www.perplexity.ai/']};
const definitions={
  qwen:{
    id:'qwen',providerId:'qwen-consumer',displayName:'Qwen',modelId:'qwen-web-consumer',toolName:'qwen_query',port:sharedSession.port,url:'https://chat.qwen.ai/',profileName:sharedSession.profileName,
    loginPattern:/^https:\/\/(?:chat\.)?qwen\.ai\/(?:login|auth|sign_in)(?:[/?#]|$)/i,
    inputSelector:`textarea.MessageInput__TextArea--dAQGxw1v,${sharedInput}`,
    responseSelector:'[data-message-author-role="assistant"],[data-role="assistant"],.chat-message-assistant,.message-assistant .markdown,.assistant-message .markdown',
    signedOutSelector:signOutControls('Log in','Sign in','Sign up'),privateLocalOnly:true,
    highThinkingSelector:'button:has-text("Thinking"),[role="button"]:has-text("Thinking")',
  },
  kimi:{
    id:'kimi',providerId:'kimi-consumer',displayName:'Kimi',modelId:'kimi-web-consumer',toolName:'kimi_query',port:sharedSession.port,url:'https://www.kimi.ai/login',profileName:sharedSession.profileName,
    loginPattern:/^https:\/\/(?:www\.)?kimi\.ai\/(?:login|auth)(?:[/?#]|$)/i,
    inputSelector:`.chat-input-editor[role="textbox"],${sharedInput}`,
    responseSelector:'[data-message-author-role="assistant"],[data-role="assistant"],.segment-assistant,.assistant-message,.markdown',
    signedOutSelector:signOutControls('Log in','Sign in'),privateLocalOnly:true,
    highThinkingSelector:'button:has-text("Thinking"),[role="button"]:has-text("Thinking")',
  },
  deepseek:{
    id:'deepseek',providerId:'deepseek-consumer',displayName:'DeepSeek',modelId:'deepseek-web-consumer',toolName:'deepseek_query',port:sharedSession.port,url:'https://chat.deepseek.com/',profileName:sharedSession.profileName,
    loginPattern:/^https:\/\/chat\.deepseek\.com\/(?:sign_in|sign_up|login|auth)(?:[/?#]|$)/i,
    inputSelector:`textarea[placeholder*="Message" i],textarea[placeholder*="DeepSeek" i],${sharedInput}`,
    responseSelector:'[data-message-author-role="assistant"],[data-role="assistant"],.ds-markdown,.assistant-message,.markdown',
    signedOutSelector:signOutControls('Log in','Sign in','Sign up'),privateLocalOnly:true,
    highThinkingSelector:'button:has-text("DeepThink"),[role="button"]:has-text("DeepThink")',
  },
  perplexity:{
    id:'perplexity',providerId:'perplexity-consumer',displayName:'Perplexity',modelId:'perplexity-web-consumer',toolName:'perplexity_query',port:sharedSession.port,url:'https://www.perplexity.ai/',profileName:sharedSession.profileName,
    loginPattern:/^https:\/\/(?:www\.)?perplexity\.ai\/(?:login|auth)(?:[/?#]|$)/i,
    inputSelector:`#ask-input[role="textbox"],${sharedInput}`,
    responseSelector:'[data-testid="answer"],[data-message-author-role="assistant"],[data-role="assistant"],.assistant-message,.prose',
    signedOutSelector:signOutControls('Log in','Sign in','Sign In'),privateLocalOnly:true,
    highThinkingSelector:'button:has-text("Reasoning"),[role="button"]:has-text("Reasoning")',
  },
};

export const PRIVATE_BROWSER_CONSUMERS=Object.freeze(Object.values(definitions).map(item=>Object.freeze({...item})));

export function getSharedSessionDefinition(){return {...sharedSession,urls:[...sharedSession.urls]};}

export function getConsumerDefinition(id){
  const item=definitions[String(id??'').toLowerCase()];
  if(!item)throw new Error(`Unknown browser consumer: ${id}`);
  return item;
}

export function isLoginUrl(definition,url){return definition.loginPattern.test(String(url??''));}

export function buildBrowserArguments(definition,profileDir,cdpPort,{background=false}={}){
  if(!profileDir)throw new Error(`A dedicated ${definition.displayName} profile directory is required.`);
  if(!Number.isInteger(cdpPort)||cdpPort<1024||cdpPort>65535)throw new Error('Invalid CDP port.');
  return ['--new-window','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${cdpPort}`,`--user-data-dir=${profileDir}`,'--no-first-run',...(background?['--start-minimized']:[]),definition.url];
}

export function buildSharedBrowserArguments(profileDir,{cdpPort=sharedSession.port,background=false}={}){
  if(!profileDir)throw new Error('A dedicated shared browser profile directory is required.');
  if(!Number.isInteger(cdpPort)||cdpPort<1024||cdpPort>65535)throw new Error('Invalid CDP port.');
  return ['--new-window','--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${cdpPort}`,`--user-data-dir=${profileDir}`,'--no-first-run',...(background?['--start-minimized']:[]),...sharedSession.urls];
}

export async function findConsumerBrowser(definition,{platform=process.platform,home,env=process.env,exists=async path=>{try{await access(path);return true;}catch{return false;}}}={}){
  const providerOverride=`OMNIROUTE_${definition.id.toUpperCase()}_BROWSER`;
  for(const override of [env[providerOverride],env.OMNIROUTE_BROWSER])if(override&&await exists(override))return override;
  const local=env.LOCALAPPDATA??win32.join(home??'','AppData/Local'),programs=env.PROGRAMFILES??'C:/Program Files',programsX86=env['PROGRAMFILES(X86)']??'C:/Program Files (x86)';
  const candidates=platform==='win32'?[win32.join(local,'Programs/Opera GX/opera.exe'),win32.join(local,'Programs/Opera/opera.exe'),win32.join(local,'BraveSoftware/Brave-Browser/Application/brave.exe'),win32.join(programs,'BraveSoftware/Brave-Browser/Application/brave.exe'),win32.join(local,'Vivaldi/Application/vivaldi.exe'),win32.join(programs,'Vivaldi/Application/vivaldi.exe'),win32.join(local,'Google/Chrome/Application/chrome.exe'),win32.join(programs,'Google/Chrome/Application/chrome.exe'),win32.join(programsX86,'Google/Chrome/Application/chrome.exe'),win32.join(local,'Microsoft/Edge/Application/msedge.exe'),win32.join(programs,'Microsoft/Edge/Application/msedge.exe'),win32.join(programsX86,'Microsoft/Edge/Application/msedge.exe'),win32.join(local,'Chromium/Application/chrome.exe'),win32.join(programs,'Chromium/Application/chrome.exe')]:['/usr/bin/opera','/usr/bin/opera-beta','/usr/bin/opera-developer','/usr/bin/brave-browser','/usr/bin/brave-browser-stable','/usr/bin/vivaldi','/usr/bin/vivaldi-stable','/usr/bin/microsoft-edge','/usr/bin/microsoft-edge-stable','/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
  for(const candidate of candidates)if(await exists(candidate))return candidate;
  throw new Error(`No compatible Chromium-family browser found for ${definition.displayName}. Install Chrome, Edge, Opera, Brave, Vivaldi, or Chromium, or set ${providerOverride} or OMNIROUTE_BROWSER.`);
}

function ps(value){return `'${String(value).replaceAll("'","''")}'`;}
export function buildBrowserLaunch(definition,{platform=process.platform,browserPath,profileDir,cdpPort=definition.port,background=false}){
  const args=buildBrowserArguments(definition,profileDir,cdpPort,{background});
  if(platform!=='win32')return {command:browserPath,args};
  return {command:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath ${ps(browserPath)} -ArgumentList @(${args.map(ps).join(',')})${background?' -WindowStyle Minimized':''}`]};
}

export function buildSharedBrowserLaunch({platform=process.platform,browserPath,profileDir,cdpPort=sharedSession.port,background=false}){
  const args=buildSharedBrowserArguments(profileDir,{cdpPort,background});
  return {command:browserPath,args};
}

export async function minimizeBrowserWindow(context,page){
  const session=await context.newCDPSession(page);
  try{const {windowId}=await session.send('Browser.getWindowForTarget');await session.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});}finally{await session.detach();}
}

export async function waitForConsumerAuthentication(page,{definition,timeoutMs=600000,pollMs=500}={}){
  if(!definition)throw new Error('A browser consumer definition is required.');
  const started=Date.now();
  for(;;){
    let ready=false,signedOut=false,signedIn=true;
    if(!isLoginUrl(definition,page.url())){
      try{ready=await page.locator(definition.inputSelector).first().isVisible();}catch{}
      if(definition.signedOutSelector)try{signedOut=await page.locator(definition.signedOutSelector).first().isVisible();}catch{}
      if(definition.signedInSelector)try{signedIn=await page.locator(definition.signedInSelector).first().isVisible();}catch{signedIn=false;}
    }
    if(ready&&!signedOut&&signedIn)return true;
    const remaining=timeoutMs-(Date.now()-started);if(remaining<=0)return false;
    await page.waitForTimeout(Math.min(pollMs,remaining));
  }
}
