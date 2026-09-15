import {cp, readdir, readFile, writeFile, unlink, rename} from 'node:fs/promises';
import {resolve, join, relative} from 'node:path';
import {transform} from 'esbuild';

// Only generated package staging is writable here. Source checkout is never removed.
export async function prepareRuntimePayload(payload, repo) {
  const root=resolve(payload), app=join(root,'app');
  const staging=resolve(repo,'release');
  if(!root.startsWith(staging+'\\')&&!root.startsWith(staging+'/')) throw Error('Payload must be inside release staging');
  for(const name of ['browser-consumer-adapter','claude-consumer-adapter','zai-consumer-adapter']) {
    const source=resolve(app,'packages',name,'src'), target=resolve(app,'packages',name,'runtime');
    if(!source.startsWith(root+'\\')&&!source.startsWith(root+'/')) throw Error('Unsafe adapter staging path');
    try {await rename(source,target);} catch(error) {if(error.code!=='ENOENT')throw error;}
  }
  for(const name of ['config','contracts','core','integrations','mcp-server','observability','providers','vault']) {
    await cp(join(repo,'packages',name,'dist'),join(app,'node_modules/@omniroute',name,'dist'),{recursive:true,force:true});
  }
  let compiled=0, removed=0;
  async function walk(directory) {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      const path=join(directory,entry.name), rel=relative(app,path).replaceAll('\\','/');
      if(entry.isSymbolicLink()) throw Error('Unexpected payload link');
      if(entry.isDirectory()) {await walk(path);continue;}
      const owned=/^(?:apps\/|packages\/|distribution\/|node_modules\/@omniroute\/)/.test(rel);
      if(owned && (/\.(?:ts|map)$|\.tsbuildinfo$|\.(?:test|spec)\.[cm]?js$/.test(rel)||/^(?:packages|node_modules\/@omniroute)\/testing\//.test(rel))) {
        await unlink(path);removed++;continue;
      }
      if(owned && /\.[cm]?js$/.test(rel)) {
        const code=(await readFile(path,'utf8')).replaceAll('consumer-adapter/src/','consumer-adapter/runtime/').replace(/(['"])src\/adapter\.mjs\1/g,'$1runtime/adapter.mjs$1');
        const generated=await transform(code,{loader:'js',format:rel.endsWith('.cjs')?'cjs':'esm',target:'node22',minify:true,legalComments:'none',sourcemap:false});
        await writeFile(path,generated.code);compiled++;
      }
      if(owned && /consumer-adapter\/package\.json$/.test(rel)) await writeFile(path,(await readFile(path,'utf8')).replaceAll('./src/','./runtime/'));
    }
  }
  await walk(app);
  return {compiled,removed};
}
