import {build} from 'esbuild';
await build({entryPoints:['tests/photo-repository.ts'],outfile:'temp/photo-repository-test.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'spfx',setup(b){b.onResolve({filter:/^@microsoft\/sp-http$/},()=>({path:'stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const SPHttpClient={configurations:{v1:{}}};'}));}}]});
await import('../temp/photo-repository-test.cjs');
