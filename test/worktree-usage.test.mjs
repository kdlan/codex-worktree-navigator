import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWorktreeUnused, assertNoOpenFiles } from '../src/server/worktree-usage.js';

test('empty, attached, and nested unarchived sessions protect the directory independent of runtime state', async () => {
  for (const cwd of ['/extra', '/extra/subdir', '/alias']) {
    let checked = false;
    await assert.rejects(assertWorktreeUnused(null, '/extra', {
      readThreads: async () => [{ id: 'empty', cwd, archived: false }],
      canonicalize: async p => p === '/alias' ? '/extra' : p,
      checkOpenFiles: async () => { checked = true; },
    }), /unarchived/);
    assert.equal(checked, false);
  }
});
test('archived and unrelated threads still require the local open-file check', async () => {
  let checked = 0;
  await assertWorktreeUnused(null, '/extra', {
    readThreads: async () => [{ cwd: '/extra', archived: true }, { cwd: '/extra-other', archived: false }],
    canonicalize: async p => p, checkOpenFiles: async p => { assert.equal(p, '/extra'); checked++; },
  });
  assert.equal(checked, 1);
});
test('unavailable session index and process inspection fail closed', async () => {
  await assert.rejects(assertWorktreeUnused(null, '/extra', { readThreads: async () => { throw Error('index missing'); } }), /index missing/);
  for (const error of [{code:'ENOENT'}, {code:1,stderr:'permission denied'}, {code:2}]) {
    await assert.rejects(assertNoOpenFiles('/extra', async () => { throw error; }), /verify open files/);
  }
  await assert.rejects(assertNoOpenFiles('/extra', async () => ({ stdout: 'p123\nn/extra', stderr: '' })), /using this worktree/);
  await assert.rejects(assertNoOpenFiles('/extra', async () => { throw { code: 1, stdout: 'p123', stderr: '' }; }), /using this worktree/);
  await assertNoOpenFiles('/extra', async () => { throw { code: 1, stdout: '', stderr: '' }; });
});
