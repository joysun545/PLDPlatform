const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pagePath = path.join(__dirname, '../pages/customer/driver/accept/accept');
const source = fs.readFileSync(pagePath + '.js', 'utf8');
const token = '12345678-1234-1234-1234-123456789abc';
const invitationUrl = '/pldp/api/lifecycle/customer/driver-invitations/' + token + '/';
const plain = value => JSON.parse(JSON.stringify(value));

function detail(patch = {}) {
  return {
    token, status: 'PENDING', accepted_by_me: false, acceptance_allowed: true,
    current_access_allowed: false, blocked_reason: '',
    vehicle: { id: 7, vehicle_no: '渝A12345', device_count: 1, devices: [] },
    owner: { organization_name: '用户车队', nickname: '负责人' },
    ...patch
  };
}

function setup() {
  const state = { requests: [], toasts: [], redirects: [], refreshes: [], reauth: 0, timers: [], hiddenLoading: 0 };
  let page;
  const app = {
    globalData: { apiBase: '/pldp/api' },
    authHeader: () => ({ Authorization: 'Bearer current-driver' }),
    ensureLogin: callback => callback(true),
    reauthenticate: () => { state.reauth += 1; },
    refreshUserProfile: callback => {
      state.refreshes.push({ callback, detail: plain(page.data.detail), canOpenDevices: page.data.canOpenDevices });
    }
  };
  const wx = {
    request: request => state.requests.push(request),
    showToast: value => state.toasts.push(value),
    showLoading() {},
    hideLoading: () => { state.hiddenLoading += 1; },
    redirectTo: ({ url }) => state.redirects.push(url),
    switchTab() {}
  };
  vm.runInNewContext(source, {
    Page: value => { page = value; }, getApp: () => app, wx,
    setTimeout: callback => { state.timers.push(callback); return state.timers.length; },
    clearTimeout: id => { state.timers[id - 1] = null; }
  });
  page.data = plain(page.data);
  page.setData = values => Object.assign(page.data, values);
  function respond(index, payload, statusCode = 200, code = 0, message = '') {
    const request = state.requests[index];
    assert.ok(request, 'expected request ' + index);
    request.success({ statusCode, data: { code, data: payload, msg: message } });
    if (request.complete) request.complete();
  }
  function fail(index) {
    const request = state.requests[index];
    request.fail();
    if (request.complete) request.complete();
  }
  function flushTimers() {
    const callbacks = state.timers.splice(0);
    callbacks.forEach(callback => callback && callback());
  }
  page.onLoad({ scene: token.replace(/-/g, '') });
  return { page, app, state, respond, fail, flushTimers };
}

test('pending invitation accepts once, applies the returned access before profile refresh, then opens devices', () => {
  const { page, state, respond, flushTimers } = setup();
  assert.equal(state.requests[0].url, invitationUrl);
  assert.equal(state.requests[0].method, 'GET');
  respond(0, detail());
  assert.equal(page.data.canAccept, true);
  assert.equal(page.data.canOpenDevices, false);
  page.acceptInvitation();
  page.acceptInvitation();
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[1].url, invitationUrl + 'accept/');
  assert.equal(state.requests[1].method, 'POST');
  assert.equal(state.requests[1].header.Authorization, 'Bearer current-driver');
  const accepted = detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false, current_access_allowed: true });
  respond(1, accepted);
  assert.equal(state.refreshes.length, 1);
  assert.equal(state.refreshes[0].detail.status, 'ACCEPTED');
  assert.equal(state.refreshes[0].canOpenDevices, true);
  assert.equal(page.data.canAccept, false);
  assert.equal(state.redirects.length, 0);
  state.refreshes[0].callback(true);
  flushTimers();
  assert.deepEqual(state.redirects, ['/pages/customer/device/list/list']);
  assert.equal(state.toasts.filter(row => row.icon === 'success').length, 1);
});

test('an accepted invitation offers devices only with current access and never posts again', () => {
  const { page, state, respond } = setup();
  respond(0, detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false, current_access_allowed: true }));
  assert.equal(page.data.canOpenDevices, true);
  page.acceptInvitation();
  assert.equal(state.requests.length, 1);
  page.openDevices();
  assert.equal(state.redirects.length, 1);
});

test('historical acceptance, revoked access, blocked reasons and inactive statuses cannot offer or trigger entry', () => {
  for (const payload of [
    detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false, current_access_allowed: false, blocked_reason: '当前司机身份已停用' }),
    detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false }),
    detail({ status: 'ACCEPTED', accepted_by_me: true, current_access_allowed: true, blocked_reason: '车辆已停用' }),
    detail({ status: 'PENDING', acceptance_allowed: false, blocked_reason: '当前微信已有其他业务岗位' }),
    detail({ status: 'PENDING', acceptance_allowed: true, blocked_reason: '当前邀请不可接受' }),
    detail({ status: 'EXPIRED', acceptance_allowed: true, current_access_allowed: true }),
    detail({ status: 'CANCELLED', accepted_by_me: true, acceptance_allowed: true, current_access_allowed: true })
  ]) {
    const { page, state, respond } = setup();
    respond(0, payload);
    assert.equal(page.data.canAccept, false, payload.status + ' cannot accept');
    assert.equal(page.data.canOpenDevices, false, payload.status + ' cannot open');
    page.acceptInvitation();
    page.openDevices();
    assert.equal(state.requests.length, 1);
    assert.equal(state.redirects.length, 0);
  }
});

test('a post rejection clears the preview immediately and reads current eligibility again', () => {
  const { page, state, respond } = setup();
  respond(0, detail());
  page.acceptInvitation();
  respond(1, {}, 409, 409, '司机身份已停用');
  assert.equal(page.data.detail, null);
  assert.equal(page.data.canAccept, false);
  assert.equal(page.data.canOpenDevices, false);
  assert.equal(page.data.loading, true);
  assert.equal(state.requests.length, 3);
  assert.equal(state.requests[2].method, 'GET');
  page.acceptInvitation();
  page.openDevices();
  assert.equal(state.requests.length, 3);
  respond(2, detail({ acceptance_allowed: false, blocked_reason: '司机身份已停用' }));
  assert.equal(page.data.canAccept, false);
  assert.equal(page.data.detail.blocked_reason, '司机身份已停用');
  assert.equal(state.refreshes.length, 0);
  assert.equal(state.redirects.length, 0);
  assert.equal(state.toasts.some(row => row.icon === 'success'), false);
});

test('failed reload after rejection cannot leave a stale accept button or device entry', () => {
  const { page, state, respond, fail } = setup();
  respond(0, detail());
  page.acceptInvitation();
  respond(1, {}, 409, 1, '该邀请不能接受');
  fail(2);
  assert.equal(page.data.error, '网络请求失败');
  assert.equal(page.data.detail, null);
  assert.equal(page.data.canAccept, false);
  assert.equal(page.data.canOpenDevices, false);
  page.acceptInvitation();
  page.openDevices();
  assert.equal(state.requests.length, 3);
  assert.equal(state.redirects.length, 0);
});

test('both GET and POST login expiry invalidate action state and retain reauthentication behavior', () => {
  for (const [statusCode, code] of [[401, 401], [200, 401]]) {
    const initial = setup();
    initial.respond(0, {}, statusCode, code, '登录过期');
    assert.equal(initial.state.reauth, 1);
    assert.equal(initial.page.data.canAccept, false);
    assert.equal(initial.page.data.canOpenDevices, false);
    const posting = setup();
    posting.respond(0, detail());
    posting.page.acceptInvitation();
    posting.respond(1, {}, statusCode, code, '登录过期');
    assert.equal(posting.state.reauth, 1);
    assert.equal(posting.page.data.detail, null);
    assert.equal(posting.page.data.canAccept, false);
    assert.equal(posting.state.requests.length, 2, 'reauthentication does not issue a stale invitation retry');
    assert.equal(posting.state.refreshes.length, 0);
    assert.equal(posting.state.redirects.length, 0);
  }
});

test('a nominal success without current access cannot refresh profile, celebrate or navigate', () => {
  const { page, state, respond, flushTimers } = setup();
  respond(0, detail());
  page.acceptInvitation();
  respond(1, detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false, blocked_reason: '车辆已停用' }));
  assert.equal(page.data.canOpenDevices, false);
  assert.equal(state.requests[2].method, 'GET');
  flushTimers();
  assert.equal(state.refreshes.length, 0);
  assert.equal(state.redirects.length, 0);
  assert.equal(state.toasts.some(row => row.icon === 'success'), false);
});

test('profile refresh failure prevents automatic success and clears device entry', () => {
  const { page, state, respond, flushTimers } = setup();
  respond(0, detail());
  page.acceptInvitation();
  respond(1, detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false, current_access_allowed: true }));
  state.refreshes[0].callback(false);
  flushTimers();
  assert.equal(page.data.canOpenDevices, false);
  assert.equal(page.data.detail, null);
  assert.equal(state.redirects.length, 0);
  assert.equal(state.toasts.some(row => row.icon === 'success'), false);
});

test('a late preview cannot overwrite a newer refusal, and guards recheck current payload fields', () => {
  const { page, state, respond } = setup();
  page.loadInvitation();
  respond(1, detail({ acceptance_allowed: false, blocked_reason: '车辆已停用' }));
  respond(0, detail());
  assert.equal(page.data.canAccept, false);
  assert.equal(page.data.detail.blocked_reason, '车辆已停用');
  // A stale derived display flag must not make either event handler perform work.
  page.setData({ canAccept: true, canOpenDevices: true });
  page.acceptInvitation();
  page.openDevices();
  assert.equal(state.requests.length, 2);
  assert.equal(state.redirects.length, 0);
});

test('a lost POST response refreshes safely, and leaving the page cancels pending success navigation', () => {
  const lost = setup();
  lost.respond(0, detail());
  lost.page.acceptInvitation();
  lost.fail(1);
  assert.equal(lost.page.data.canAccept, false);
  assert.equal(lost.state.requests[2].method, 'GET');
  const leaving = setup();
  leaving.respond(0, detail());
  leaving.page.acceptInvitation();
  leaving.respond(1, detail({ status: 'ACCEPTED', accepted_by_me: true, acceptance_allowed: false, current_access_allowed: true }));
  leaving.state.refreshes[0].callback(true);
  leaving.page.onUnload();
  leaving.flushTimers();
  assert.equal(leaving.state.redirects.length, 0);
});

test('visible success and buttons use current derived permissions, never historical acceptance', () => {
  const template = fs.readFileSync(pagePath + '.wxml', 'utf8');
  assert.doesNotMatch(template, /detail\.accepted_by_me/);
  assert.match(template, /class="accepted" wx:if="\{\{canOpenDevices\}\}"/);
  assert.match(template, /wx:if="\{\{canOpenDevices\}\}"[^>]+bindtap="openDevices"/);
  assert.match(template, /wx:elif="\{\{canAccept\}\}"[^>]+bindtap="acceptInvitation"/);
  assert.match(template, /class="blocked" wx:else>\{\{detail\.blocked_reason/);
});
