import {build} from 'esbuild';
await build({entryPoints:['tests/transferred-workflow.ts'],outfile:'temp/transferred-workflow-test.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'spfx',setup(b){b.onResolve({filter:/^@microsoft\/sp-http$/},()=>({path:'stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const SPHttpClient={configurations:{v1:{}}};'}));}}]});
await import('../temp/transferred-workflow-test.cjs');
