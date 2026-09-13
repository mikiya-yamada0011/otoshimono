import {build} from 'esbuild';
await build({entryPoints:['tests/workflow.ts'],outfile:'temp/workflow-test.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'spfx',setup(b){b.onResolve({filter:/^@microsoft\/sp-http$/},()=>({path:'stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const SPHttpClient={configurations:{v1:{}}};'}));}}]});
await import('../temp/workflow-test.cjs');
