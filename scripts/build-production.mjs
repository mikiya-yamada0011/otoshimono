// Keep the running local dev server's dist/HMR output out of release packages.
import {cp, copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stage = await mkdtemp(join(tmpdir(), 'lost-found-production-'));
const packageName = 'lost-found-student-spfx.sppkg';
const destination = join(root, 'sharepoint/solution', packageName);
const temporary = `${destination}.building-${process.pid}`;
const run = args => new Promise((ok, fail) => {
  const child = spawn(process.execPath, [join(root, 'node_modules/@rushstack/heft/bin/heft'), ...args], {
    cwd: stage, stdio: 'inherit', env: process.env,
  });
  child.on('error', fail);
  child.on('exit', code => code === 0 ? ok() : fail(new Error(`Production build failed (${code})`)));
});

try {
  for (const name of ['src', 'config', 'teams', 'package.json', 'tsconfig.json', 'eslint.config.js']) {
    await cp(join(root, name), join(stage, name), {recursive: true});
  }
  await symlink(join(root, 'node_modules'), join(stage, 'node_modules'), 'dir');
  await run(['test', '--clean', '--production']);
  const assets = await readdir(join(stage, 'dist'));
  if (assets.some(name => name.includes('hot-update') || name === 'lost-found-student-web-part.js')) {
    throw new Error('Development assets must not enter a production package');
  }
  await run(['package-solution', '--production']);
  // SPFx rewrites the intermediate base URL to SPCLIENTSIDEASSETLIBRARY while
  // packaging. Validate the resulting component manifest after that rewrite.
  const output = join(stage, 'sharepoint/solution/debug');
  for (const name of (await readdir(output, {recursive: true})).filter(name => /WebPart_.*\.xml$/.test(name))) {
    if (/https?:\/\/(?:localhost|127\.0\.0\.1)(?=[:/])/i.test(await readFile(join(output, name), 'utf8'))) {
      throw new Error('Packaged manifest must not reference the local development server');
    }
  }
  await mkdir(dirname(destination), {recursive: true});
  await copyFile(join(stage, 'sharepoint/solution', packageName), temporary);
  await rename(temporary, destination);
  console.log(`Production package: ${destination}`);
} finally {
  await rm(temporary, {force: true});
  await rm(stage, {recursive: true, force: true});
}
