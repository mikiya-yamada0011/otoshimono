import { build, context } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// SPHttpClient is not called by the test repository; avoid loading the SPFx runtime outside SharePoint.
const stub={name:'spfx-test-harness',setup(b){b.onResolve({filter:/^@microsoft\/sp-http$/},()=>({path:'sp-http',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const SPHttpClient = {configurations:{v1:{}}};'}));b.onLoad({filter:/\.scss$/},async(args)=>{const sass=spawnSync(process.execPath,[resolve('node_modules/sass/sass.js'),args.path,'--no-source-map'],{encoding:'utf8'});if(sass.status!==0)throw new Error(sass.stderr);return{contents:sass.stdout.replace(/:global\s+/g,''),loader:'css'};});}};
const output=resolve('temp/test-harness');
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'index.html'),'<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lost & Found Test Harness</title><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#f5f7f3}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
const options={entryPoints:['tests/harness/index.tsx'],bundle:true,outfile:resolve(output,'app.js'),plugins:[stub],define:{'process.env.NODE_ENV':'"development"'},sourcemap:true};
if(process.argv.includes('--build')) {await build(options);process.exit(0);}
const ctx=await context(options);await ctx.watch();
await ctx.serve({servedir:output,host:'127.0.0.1',port:4173});
console.log('Test harness: http://127.0.0.1:4173/?role=student');
