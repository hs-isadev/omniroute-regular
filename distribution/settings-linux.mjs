import { emitKeypressEvents } from 'node:readline';
import { configure, fields } from './settings.mjs';
import { getRuntimePaths } from '../packages/config/dist/index.js';
import { globalRedactor } from '../packages/observability/dist/index.js';
import { CREDIT_PROVIDERS } from './regular-policy.mjs';

// Raw TTY input: nothing typed (including confirmation) is echoed or stored in
// shell history. Refuse redirected stdin rather than encouraging key files.
export function hiddenPrompt(label, input=process.stdin, output=process.stdout) {
  if (!input.isTTY || !output.isTTY) throw new Error('Key setup requires an interactive terminal. Do not pipe API keys or put them in command arguments.');
  output.write(label);
  emitKeypressEvents(input);
  return new Promise((resolve,reject)=>{
    let value=''; const wasRaw=input.isRaw;
    const finish=(error)=>{
      input.removeListener('keypress',onKey); input.setRawMode(!!wasRaw); input.pause(); output.write('\n');
      error ? reject(error) : resolve(value);
      value='';
    };
    const onKey=(text,key={})=>{
      if(key.ctrl && key.name==='c') return finish(new Error('Setup cancelled.'));
      if(key.name==='return' || key.name==='enter') return finish();
      if(key.name==='backspace') {value=value.slice(0,-1);return;}
      if(key.ctrl || key.meta || !text || /[\x00-\x1f\x7f]/.test(text)) return;
      if(value.length+text.length>4096) return finish(new Error('Input too long.'));
      value+=text;
    };
    input.on('keypress',onKey); input.setRawMode(true); input.resume();
  });
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith('/settings-linux.mjs') && process.argv[1].endsWith('settings-linux.mjs')) {
  const keys={};
  try {
    if(process.platform!=='linux' || process.getuid?.()===0) throw new Error('Run as your normal Linux desktop user.');
    console.log('OmniRoute Regular — API key setup (input is hidden, not even stars).');
    console.log('Any one suitable free provider is enough. Enter skips/keeps a saved key. Antigravity sign-in stays in Antigravity.');
    console.log('Key links and free-access conditions: see README.md and docs/free-provider-expansion.md.');
    console.log('Never enter passwords, browser cookies or Claude/ChatGPT login sessions.');
    const consent=await hiddenPrompt('Confirm free-only accounts, no paid overages or auto-top-up. Type yes: ');
    if(consent.trim().toLowerCase()!=='yes') throw new Error('Free-only confirmation is required.');
    for(const [id,names] of Object.entries(fields)) if(!CREDIT_PROVIDERS.includes(id)) for(const name of names) keys[name]=await hiddenPrompt(`${name}: `);
    const validateCodingCandidates=(await hiddenPrompt('Test Kimi K2.6 / Qwen3 Coder free candidates? Up to one extra call per supplied key. Type yes: ')).trim().toLowerCase()==='yes';
    console.log('Validating supplied keys with small API requests (uses free quota)…');
    const result=await configure({keys,freeOnlyConfirmed:true,validateCodingCandidates},getRuntimePaths());
    console.log(`Saved: ${result.accepted.join(', ') || 'existing keys retained'}.`);
    if(result.failed.length) console.log(`Not updated: ${result.failed.join(', ')}. Check keys, eligibility and free quota; saved working keys were preserved.`);
    for(const candidate of result.codingCandidates) console.log(`${candidate.provider}/${candidate.model}: ${candidate.status}`);
    console.log('Ready. Close any running OmniRoute Regular window, then run Launch.sh.');
  } catch(error) { console.error(globalRedactor.redactText(error.message));process.exitCode=1; }
  finally {for(const name of Object.keys(keys)) keys[name]='';}
}
