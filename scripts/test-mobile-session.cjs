// Exercise the real interceptor with controlled network responses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../frontend/node_modules/typescript');
function setup() {
  let requestHook, errorHook, successHook, finishRefresh;
  let rotations = 0, clears = 0, retries = 0;
  let token = 'old';
  const client = async config => { retries++; return requestHook(config); };
  client.interceptors = {
    request: { use(fn) { requestHook = fn; } },
    response: { use(ok, fail) { successHook = ok; errorHook = fail; } },
  };
  client.post = () => { rotations++; return new Promise((resolve, reject) => {
    finishRefresh = async error => error ? reject(error) : resolve(await successHook({ data: { token: 'new' } }));
  }); };
  const axios = { create: () => client, isAxiosError: e => !!e.isAxiosError };
  const native = { isNativeApp: true, MOBILE_CLIENT_HEADER: 'learners-mobile', getAuthToken: () => token,
    setAuthToken: async value => { token = value; if (value === null) clears++; } };
  let source = fs.readFileSync('frontend/src/api/client.ts', 'utf8').replaceAll('import.meta.env', '({})');
  const exports = {};
  const location = { href: '' };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: id => id === 'axios' ? { default: axios } : id === '../native' ? native : { appCampus: { apiUrl: 'https://example.test/api' } }, window: { location } });
  return { exports, location, request: () => requestHook({ url: '/fees', headers: {} }), fail: error => errorHook(error),
    finish: error => finishRefresh(error), counts: () => ({ rotations, clears, retries }) };
}
const unauthorized = config => ({ isAxiosError: true, response: { status: 401 }, config });
(async () => {
  const app = setup();
  const first = app.request(), second = app.request(), late = app.request();
  const scheduled = app.exports.refreshSession();
  const requests = [app.fail(unauthorized(first)), app.fail(unauthorized(second))];
  assert.equal(app.counts().rotations, 1);
  await app.finish();
  await Promise.all([scheduled, ...requests]);
  await app.fail(unauthorized(late));
  assert.deepEqual(app.counts(), { rotations: 1, clears: 0, retries: 3 });
  assert.equal(first.headers.Authorization, 'Bearer new');
  for (const expired of [false, true]) {
    const app = setup();
    const failure = expired ? unauthorized() : new Error('offline');
    const pending = app.fail(unauthorized(app.request()));
    const rejected = assert.rejects(pending);
    await app.finish(failure);
    await rejected;
    assert.equal(app.counts().clears, expired ? 1 : 0);
    assert.equal(app.location.href, expired ? '/login' : '');
  }
  console.log('Passed: concurrent refresh, late 401, updated token, offline retention, expired-session logout');
})().catch(error => { console.error(error); process.exitCode = 1; });
