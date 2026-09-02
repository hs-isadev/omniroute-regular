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
  if(env.OMNIROUTE_ZAI_BROWSER&&await exists(env.OMNIROUTE_ZAI_BROWSER))return env.OMNIROUTE_ZAI_BROWSER;
  const candidates=platform==='win32' ? [
    win32.join(env.LOCALAPPDATA??win32.join(home,'AppData/Local'),'Programs/Opera GX/opera.exe'),
    win32.join(env.LOCALAPPDATA??win32.join(home,'AppData/Local'),'Programs/Opera/opera.exe'),
    win32.join(env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),
    win32.join(env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe'),
  ] : [
    '/usr/bin/opera','/usr/bin/opera-beta','/usr/bin/opera-developer',
    '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
    '/usr/bin/chromium','/usr/bin/chromium-browser',
  ];
  for(const candidate of candidates)if(await exists(candidate))return candidate;
  throw new Error('No supported browser found. Install Opera, Chrome, or Chromium, or set OMNIROUTE_ZAI_BROWSER.');
}

function ps(value){return `'${String(value).replaceAll("'","''")}'`;}
export function buildBrowserLaunch({platform=process.platform,browserPath,profileDir,cdpPort=47843,background=false}) {
  const args=buildBrowserArguments(profileDir,cdpPort,{background});
  if(platform!=='win32')return {command:browserPath,args};
  const list=args.map(ps).join(',');
  return {command:'powershell.exe',args:['-NoLogo','-NoProfile','-NonInteractive','-Command',`Start-Process -FilePath ${ps(browserPath)} -ArgumentList @(${list})${background?' -WindowStyle Minimized':''}`]};
}

export function isZaiLoginUrl(url){return /^https:\/\/chat\.z\.ai\/(?:auth|login)(?:[/?#]|$)/i.test(url);}
