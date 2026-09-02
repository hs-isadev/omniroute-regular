import {readdir,readFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {SecretVault} from '../packages/vault/dist/index.js';
import {getRuntimePaths} from '../packages/config/dist/index.js';
const folder=resolve(import.meta.dirname,'../release/OmniRoute-Dual-0.5.0'),patterns=[];
for(const paths of [getRuntimePaths(),getRuntimePaths(join(process.env.LOCALAPPDATA,'OmniRouteRegular','data'))]){
  const vault=await SecretVault.load(paths.vault);
  try{for(const record of vault.list()){const values=vault.get(record.providerId);for(const value of Object.values(values??{}))if(value.length>=12)patterns.push(Buffer.from(value));if(values)for(const name of Object.keys(values))values[name]='';}}finally{vault.dispose();}
}
let checked=0;const hits=[];
async function scan(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isSymbolicLink())throw new Error('Unexpected symlink');if(item.isDirectory())await scan(path);else{const bytes=await readFile(path);checked++;if(patterns.some(value=>bytes.includes(value)))hits.push(relative(folder,path));}}}
try{await scan(folder);}finally{for(const value of patterns)value.fill(0);}
console.log(JSON.stringify({filesChecked:checked,matchingFiles:hits,secretValuesPrinted:false,passed:hits.length===0}));
if(hits.length)process.exitCode=1;
