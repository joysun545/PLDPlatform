const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// The optional root lets these same checks verify the unchanged baseline.
const frontend = process.env.PLDP_FRONTEND_UNDER_TEST || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(frontend, 'pages/aftersale/material_return/material_return.js'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function harness({refreshError, omitRefresh = false} = {}) {
  let page;
  const requests = [], modals = [], warnings = [], toasts = [];
  let refreshes = 0;
  const app = {
    globalData: {apiBase: '/isolated'}, authHeader: () => ({Authorization: 'isolated'}),
    ensureLogin: cb => cb(true),
    refreshTasks() { refreshes++; if (refreshError) throw refreshError; }
  };
  if (omitRefresh) delete app.refreshTasks;
  const wx = {
    request: q => requests.push(q), showModal: q => modals.push(q),
    showToast: q => toasts.push(q)
  };
  vm.runInNewContext(source, {
    getApp: () => app, Page: value => {page = value;}, wx,
    console: {warn: (...values) => warnings.push(values)}
  });
  page.data = plain(page.data);
  page.setData = value => Object.assign(page.data, plain(value));
  page.data.id = 7;
  page.data.detail = {id: 7, status: 'SENT', can_receive: true};
  return {page, requests, modals, warnings, toasts, refreshes: () => refreshes};
}

function submit(h) {
  h.page.receive();
  assert.equal(h.modals.length, 1);
  h.modals[0].success({confirm: true});
  assert.equal(h.requests.length, 1);
  const request = h.requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/isolated/lifecycle/after-sales/replacement-material-returns/7/');
  assert.deepEqual(plain(request.data), {confirmed: true});
  return request;
}

test('successful committed receipt refreshes inbox once without altering the request', () => {
  const h = harness(), q = submit(h);
  q.success({data: {code: 0, data: {id: 7, status: 'RECEIVED', can_receive: false}}});
  q.complete();
  assert.equal(h.refreshes(), 1);
  assert.equal(h.page.data.detail.status, 'RECEIVED');
  assert.equal(h.page.data.busy, false);
  assert.equal(h.toasts.length, 0);
});

test('business rejection retains detail and never refreshes inbox', () => {
  const h = harness(), q = submit(h);
  q.success({data: {code: 1, msg: '无权签收'}}); q.complete();
  assert.equal(h.refreshes(), 0);
  assert.equal(h.page.data.detail.status, 'SENT');
  assert.equal(h.page.data.busy, false);
  assert.equal(h.toasts[0].title, '无权签收');
});

test('malformed error response cannot invalidate inbox', () => {
  const h = harness(), q = submit(h);
  q.success({data: null}); q.complete();
  assert.equal(h.refreshes(), 0);
  assert.equal(h.page.data.busy, false);
  assert.equal(h.toasts[0].title, '签收失败');
});

test('network failure only releases busy state and never refreshes', () => {
  const h = harness(), q = submit(h);
  if (q.fail) q.fail({errMsg: 'request:fail'});
  q.complete();
  assert.equal(h.refreshes(), 0);
  assert.equal(h.page.data.detail.status, 'SENT');
  assert.equal(h.page.data.busy, false);
});

test('cancelled confirmation never submits or refreshes', () => {
  const h = harness(); h.page.receive(); h.modals[0].success({confirm: false});
  assert.equal(h.requests.length, 0);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.page.data.busy, false);
});

test('in-flight receipt blocks duplicate tap', () => {
  const h = harness(), q = submit(h);
  h.page.receive();
  assert.equal(h.modals.length, 1);
  assert.equal(h.requests.length, 1);
  q.success({data: {code: 0, data: {id: 7, status: 'RECEIVED', can_receive: false}}}); q.complete();
  assert.equal(h.refreshes(), 1);
});

test('synchronous inbox refresh error preserves committed success and releases busy state', () => {
  const h = harness({refreshError: new Error('inbox offline')}), q = submit(h);
  assert.doesNotThrow(() => q.success({data: {code: 0, data: {id: 7, status: 'RECEIVED', can_receive: false}}}));
  q.complete();
  assert.equal(h.refreshes(), 1);
  assert.equal(h.page.data.detail.status, 'RECEIVED');
  assert.equal(h.page.data.busy, false);
  assert.equal(h.warnings.length, 1);
  assert.equal(h.toasts.length, 0);
});

test('unavailable inbox helper cannot mask a committed receipt', () => {
  const h = harness({omitRefresh: true}), q = submit(h);
  assert.doesNotThrow(() => q.success({data: {code: 0, data: {id: 7, status: 'RECEIVED', can_receive: false}}}));
  q.complete();
  assert.equal(h.page.data.detail.status, 'RECEIVED');
  assert.equal(h.page.data.busy, false);
  assert.equal(h.warnings.length, 1);
});

