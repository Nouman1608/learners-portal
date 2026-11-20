const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
const source = ts.transpileModule(fs.readFileSync('frontend/src/context/startupSession.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const events = new Map(), timers = new Map(), pending = [], changes = [];
  let timerId = 0, clears = 0;
  const document = { visibilityState: 'visible', addEventListener: (key,fn) => events.set(key,fn), removeEventListener: key => events.delete(key) };
  const window = { addEventListener: (key,fn) => events.set(key,fn), removeEventListener: key => events.delete(key) };
  const exports = {};
  vm.runInNewContext(source, { exports, AbortController, window, document,
    require: () => ({ isSessionExpired: e => e?.status === 401 }),
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  const session = exports.startStartupSession({
    getUser: signal => new Promise((resolve, reject) => pending.push({ resolve, reject, signal })),
    clearSession: async () => { clears++; },
    onChecking: () => changes.push('checking'), onUnavailable: () => changes.push('unavailable'),
    onAuthenticated: user => changes.push(user), onSignedOut: () => changes.push('signed-out'),
  });
  return { session, pending, changes, timers, events, document, clears: () => clears };
}
(async () => {
  for (const failure of [new Error('offline'), {status:503}, {status:429}, {code:'ECONNABORTED'}]) {
    const s = setup();
    s.pending[0].reject(failure); await flush();
    assert.equal(s.clears(), 0);
    assert.deepEqual(s.changes, ['checking', 'unavailable']);
    assert.equal([...s.timers.values()][0].delay, 5000);
    void s.session.retry(); void s.session.retry(); s.events.get('online')();
    assert.equal(s.pending.length, 2, 'manual/online retries share one request');
    s.pending[1].resolve({ id:'test-user' }); await flush();
    assert.equal(s.changes.at(-1).id, 'test-user');
    assert.equal(s.events.size,0); assert.equal(s.timers.size,0); assert.equal(s.clears(),0);
    void s.session.retry(); assert.equal(s.pending.length,2);
  }
  const expired=setup(); expired.pending[0].reject({status:401}); await flush();
  assert.equal(expired.clears(),1); assert.equal(expired.changes.at(-1),'signed-out');
  assert.equal(expired.timers.size,0);
  const reconnect=setup(); reconnect.pending[0].reject(new Error('offline')); await flush();
  reconnect.document.visibilityState='hidden'; reconnect.events.get('visibilitychange')(); assert.equal(reconnect.pending.length,1);
  reconnect.document.visibilityState='visible'; reconnect.events.get('visibilitychange')(); assert.equal(reconnect.pending.length,2);
  reconnect.pending[1].reject({status:503}); await flush();
  assert.equal([...reconnect.timers.values()][0].delay,10000);
  [...reconnect.timers.values()][0].fn(); assert.equal(reconnect.pending.length,3);
  reconnect.pending[2].resolve({id:'restored'}); await flush();
  const disposed=setup(); disposed.session.dispose(); assert(disposed.pending[0].signal.aborted);
  disposed.pending[0].reject({status:401}); await flush();
  assert.equal(disposed.clears(),0); assert.deepEqual(disposed.changes,['checking']);
  const stale=setup(); stale.session.dispose(); stale.pending[0].resolve({id:'stale'}); await flush();
  assert.deepEqual(stale.changes,['checking']);
  console.log('Passed: offline/503/429/timeout retention, coalesced retry, online/foreground recovery, timed backoff, confirmed 401, cancellation and stale response protection');
})().catch(error => { console.error(error); process.exitCode=1; });
