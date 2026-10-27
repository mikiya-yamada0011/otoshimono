import assert from 'node:assert/strict';
import { RefreshCoordinator } from '../src/webparts/lostFoundStudent/found-items/utils/refreshCoordinator';

function deferred<T>(): {promise: Promise<T>; resolve: (value: T) => void; reject: (reason: Error) => void} {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, fail) => {resolve = ok; reject = fail;});
  return {promise, resolve, reject};
}

async function main(): Promise<void> {
  const reads: ReturnType<typeof deferred<string>>[] = [], applied: string[] = [];
  const loader = new RefreshCoordinator(() => {
    const read = deferred<string>(); reads.push(read); return read.promise;
  }, value => applied.push(value));
  const initial = loader.refresh();
  assert.equal(loader.refresh(), initial, 'Initial load, focus and visibility share one read');
  assert.equal(loader.refresh(), initial);
  assert.equal(reads.length, 1);
  reads[0].resolve('initial'); await initial;
  assert.deepEqual(applied, ['initial']);

  const beforeSave = loader.refresh();
  loader.invalidate();
  const afterSave = loader.refresh();
  assert.notEqual(beforeSave, afterSave, 'Saving requires a new read');
  reads[2].resolve('saved'); await afterSave;
  reads[1].resolve('stale'); await beforeSave;
  assert.deepEqual(applied, ['initial', 'saved'], 'A slow response from before saving cannot overwrite saved data');

  const old = loader.refresh(); loader.invalidate();
  const current = loader.refresh();
  reads[3].resolve('ignored'); await old;
  assert.equal(loader.refresh(), current, 'An old completion cannot clear the current request');
  reads[4].reject(new Error('offline')); await assert.rejects(current, /offline/);
  const retry = loader.refresh(); assert.equal(reads.length, 6);
  reads[5].resolve('retried'); await retry;
  assert.deepEqual(applied, ['initial', 'saved', 'retried']);

  const unmounted = loader.refresh(); loader.invalidate();
  reads[6].resolve('unmounted'); await unmounted;
  assert.deepEqual(applied, ['initial', 'saved', 'retried']);
  console.log('PASS: overlapping refreshes coalesce, saves invalidate old results, retries recover, unmounted views receive no updates');
}
void main().catch(error => {console.error(error); process.exitCode = 1;});
