import {access} from 'node:fs/promises';
import {win32} from 'node:path';

export function buildBrowserArguments(profileDir,cdpPort,{background=false}={}) {
  if(!profileDir)throw new Error('A dedicated Z.AI profile directory is required.');
  if(!Number.isInteger(cdpPort)||cdpPort<1||cdpPort>65535)throw new Error('Invalid CDP port.');
  return [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    ...(background?['--start-minimized']:[]),
    'https://chat.z.ai/',
  ];
}

export async function findConsumerBrowser({platform=process.platform,home,env=process.env,exists=async path=>{try{await access(path);return true;}catch{return false;}}}={}) {
  for(const override of [env.OMNIROUTE_ZAI_BROWSER,env.OMNIROUTE_BROWSER])if(override&&await exists(override))return override;
  const local=env.LOCALAPPDATA??win32.join(home??'','AppData/Local');
  const programs=env.PROGRAMFILES??'C:/Program Files';
  const programsX86=env['PROGRAMFILES(X86)']??'C:/Program Files (x86)';
  const candidates=platform==='win32' ? [
    win32.join(local,'Programs/Opera GX/opera.exe'),win32.join(local,'Programs/Opera/opera.exe'),
    win32.join(local,'BraveSoftware/Brave-Browser/Application/brave.exe'),win32.join(programs,'BraveSoftware/Brave-Browser/Application/brave.exe'),
    win32.join(local,'Vivaldi/Application/vivaldi.exe'),win32.join(programs,'Vivaldi/Application/vivaldi.exe'),
    win32.join(local,'Google/Chrome/Application/chrome.exe'),win32.join(programs,'Google/Chrome/Application/chrome.exe'),win32.join(programsX86,'Google/Chrome/Application/chrome.exe'),
    win32.join(local,'Microsoft/Edge/Application/msedge.exe'),win32.join(programs,'Microsoft/Edge/Application/msedge.exe'),win32.join(programsX86,'Microsoft/Edge/Application/msedge.exe'),
    win32.join(local,'Chromium/Application/chrome.exe'),win32.join(programs,'Chromium/Application/chrome.exe'),
  ] : [
    '/usr/bin/opera','/usr/bin/opera-beta','/usr/bin/opera-developer',
    '/usr/bin/brave-browser','/usr/bin/brave-browser-stable',
    '/usr/bin/vivaldi','/usr/bin/vivaldi-stable',
    '/usr/bin/microsoft-edge','/usr/bin/microsoft-edge-stable',
    '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
    '/usr/bin/chromium','/usr/bin/chromium-browser',
  ];
  for(const candidate of candidates)if(await exists(candidate))return candidate;
  throw new Error('No compatible Chromium-family browser found. Install Chrome, Edge, Opera, Brave, Vivaldi, or Chromium, or set OMNIROUTE_ZAI_BROWSER or OMNIROUTE_BROWSER.');
}

function ps(value){return `'${String(value).replaceAll("'","''")}'`;}
export function buildBrowserLaunch({platform=process.platform,browserPath,profileDir,cdpPort=47843,background=false}) {
  const args=buildBrowserArguments(profileDir,cdpPort,{background});
  if(platform!=='win32')return {command:browserPath,args};
  const list=args.map(ps).join(',');
  return {command:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath ${ps(browserPath)} -ArgumentList @(${list})${background?' -WindowStyle Minimized':''}`]};
}

export function isZaiLoginUrl(url){return /^https:\/\/chat\.z\.ai\/(?:auth|login)(?:[/?#]|$)/i.test(url);}

export async function minimizeBrowserWindow(context,page) {
  const session=await context.newCDPSession(page);
  try{
    const {windowId}=await session.send('Browser.getWindowForTarget');
    await session.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'minimized'}});
  }finally{await session.detach();}
}

export async function waitForConsumerAuthentication(page,{isLoginUrl,readySelector,timeoutMs=600000,pollMs=500}={}) {
  if(typeof isLoginUrl!=='function'||!readySelector)throw new Error('Authentication detection requires a login predicate and ready selector.');
  if(!Number.isFinite(timeoutMs)||timeoutMs<0||!Number.isFinite(pollMs)||pollMs<1)throw new Error('Invalid authentication wait timing.');
  const started=Date.now();
  for(;;){
    let visible=false;
    if(!isLoginUrl(page.url()))try{visible=await page.locator(readySelector).first().isVisible();}catch{}
    if(visible)return true;
    const remaining=timeoutMs-(Date.now()-started);if(remaining<=0)return false;
    await page.waitForTimeout(Math.min(pollMs,remaining));
  }
}
