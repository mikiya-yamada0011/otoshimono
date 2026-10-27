import {build} from 'esbuild';
await build({entryPoints:['tests/refresh-coordinator.ts'],outfile:'temp/refresh-coordinator.cjs',bundle:true,platform:'node',format:'cjs'});
await import('../temp/refresh-coordinator.cjs');
