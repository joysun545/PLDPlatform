const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.PLDP_FRONTEND_UNDER_TEST || path.join(__dirname, '..');
const applicationPage = 'pages/account/root_application/root_application.js';
const reviewPage = 'pages/account/root_application_review/root_application_review.js';
const token = 'a'.repeat(64);
const license = 'f876015a-2770-49f8-808e-6f7a293b121d';
const plain = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(route = applicationPage, options = {}) {
  const requests = [], uploads = [], downloads = [], modals = [], toasts = [], navigations = [], media = [], scans = [];
  let page, profileRefreshes = 0, taskRefreshes = 0, reauthentications = 0;
  const app = {
    globalData: { apiBase: 'https://example.test/pldp/api', access_token: 'session-one', role: 'tourist', is_platform_admin: false, _isScanning: false },
    ensureLogin: callback => callback(true),
    authHeader(contentType = 'application/x-www-form-urlencoded') {
      return { ...(contentType ? { 'content-type': contentType } : {}), Authorization: `Bearer ${this.globalData.access_token}` };
    },
    reauthenticate() { reauthentications++; },
    refreshUserProfile(callback) {
      profileRefreshes++;
      if (options.profileFailure) { callback(false); return; }
      if (!options.keepTouristProfile) Object.assign(this.globalData, { role: 'factory_admin', organization_id: 77 });
      callback(true);
    },
    refreshTasks() { taskRefreshes++; if (options.taskRefreshFailure) throw new Error('inbox offline'); }
  };
  if (options.admin) app.globalData.is_platform_admin = true;
  const wx = {
    request: request => requests.push(request),
    uploadFile: request => uploads.push(request),
    downloadFile: request => downloads.push(request),
    chooseMedia: request => media.push(request),
    scanCode: request => scans.push(request),
    showModal: modal => modals.push(modal),
    showToast: toast => toasts.push(toast),
    navigateTo: navigation => navigations.push(navigation),
    switchTab: navigation => navigations.push(navigation),
    previewImage: value => { wx.preview = value; },
    showLoading() {}, hideLoading() {}
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/root-trial.js'), 'utf8'), {
    getApp: () => app, wx, module, console: { warn() {} }
  });
  const helper = module.exports;
  if (route) {
    vm.runInNewContext(fs.readFileSync(path.join(root, route), 'utf8'), {
      getApp: () => app, wx, Page: value => { page = value; },
      require: name => name.endsWith('/root-trial') ? helper : name.endsWith('/theme') ? { get: () => ({ color_scheme: 'jade' }) } : { sync() {} },
      console
    });
    page.data = plain(page.data);
    page.setData = value => Object.assign(page.data, plain(value));
  }
  return {
    page, app, wx, helper, requests, uploads, downloads, modals, toasts, navigations, media, scans,
    profileRefreshes: () => profileRefreshes, taskRefreshes: () => taskRefreshes,
    reauthentications: () => reauthentications,
    respond(request, data, statusCode = 200, code = 0) {
      request.success({ statusCode, data: { code, data, msg: statusCode >= 400 ? '拒绝操作' : '' } });
      if (request.complete) request.complete();
    }
  };
}

function pending(extra = {}) {
  return { id: 12, status: 'PENDING', organization_name: '甲制造有限公司', license_upload_id: license, can_review: true, ...extra };
}

function approved() {
  return pending({ status: 'APPROVED', can_review: false, root_organization: { id: 77, name: '甲制造有限公司' } });
}

async function readyApplicant(h, application = null) {
  h.page.onLoad({});
  h.respond(h.requests.shift(), { eligibility: { eligible: true, can_submit: !application || application.status === 'REJECTED' }, application });
  await flush();
}

test('retry keys satisfy the backend UUID contract and change between submissions', () => {
  const h = harness(null);
  const keys = Array.from({ length: 50 }, () => h.helper.requestId());
  for (const key of keys) assert.match(key, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(new Set(keys).size, keys.length);
});

test('applicant must finish a genuine upload before submission; upload uses Bearer multipart', async () => {
  const h = harness();
  await readyApplicant(h);
  h.page.onOrganizationInput({ detail: { value: '甲制造有限公司' } });
  h.page.chooseLicense();
  h.media[0].success({ tempFiles: [{ tempFilePath: '/tmp/license.jpg', size: 1000 }] });
  h.page.submitApplication();
  assert.equal(h.requests.length, 0);
  assert.equal(h.page.data.licenseId, null);
  const upload = h.uploads[0];
  assert.equal(upload.url, 'https://example.test/pldp/api/root-trial/license/');
  assert.deepEqual(plain(upload.header), { Authorization: 'Bearer session-one' });
  upload.success({ statusCode: 200, data: JSON.stringify({ code: 0, data: { license_upload_id: license } }) });
  await flush();
  h.page.submitApplication();
  h.page.submitApplication();
  assert.equal(h.requests.length, 1);
  assert.deepEqual(Object.keys(h.requests[0].data).sort(), ['license_upload_id', 'organization_name', 'request_id']);
  assert.equal(h.requests[0].data.license_upload_id, license);
  assert.equal(h.requests[0].data.organization_name, '甲制造有限公司');
});

test('invalid or failed upload cannot reuse the previously selected image identifier', async () => {
  const h = harness();
  await readyApplicant(h);
  h.page.setData({ licenseId: license, organizationName: '甲制造有限公司' });
  h.page.chooseLicense();
  h.media[0].success({ tempFiles: [{ tempFilePath: '/tmp/replacement.jpg', size: 1000 }] });
  assert.equal(h.page.data.licenseId, null);
  h.uploads[0].success({ statusCode: 200, data: '{broken' });
  await flush();
  h.page.submitApplication();
  assert.equal(h.requests.length, 0);
  assert.equal(h.page.data.uploading, false);
  assert.match(h.page.data.imageError, /上传失败/);
});

test('uncertain submission retries keep one UUID and recover pending state without granting identity', async () => {
  const h = harness();
  await readyApplicant(h);
  h.page.setData({ organizationName: '甲制造有限公司', licenseId: license });
  h.page.submitApplication();
  const first = h.requests.shift();
  first.fail({ errMsg: 'request:fail timeout' });
  await flush();
  h.page.submitApplication();
  const retry = h.requests.shift();
  assert.equal(first.data.request_id, retry.data.request_id);
  h.respond(retry, { application: pending(), created: false });
  await flush();
  assert.equal(h.page.data.statusLabel, '审核中');
  assert.equal(h.page.data.canSubmit, false);
  assert.equal(h.app.globalData.role, 'tourist');
  assert.equal(h.taskRefreshes(), 1);
});

test('rejected applicant can revise and resubmit while retaining the review reason', async () => {
  const h = harness();
  await readyApplicant(h, pending({ status: 'REJECTED', can_resubmit: true, review_reason: '请提供完整执照' }));
  assert.equal(h.page.data.canSubmit, true);
  assert.equal(h.page.data.reviewReason, '请提供完整执照');
  assert.equal(h.page.data.licenseId, license);
  h.page.onOrganizationInput({ detail: { value: '乙制造有限公司' } });
  assert.deepEqual(plain(h.page.data.rootOrganization), { state: 'pending_creation', name: '乙制造有限公司' });
  h.page.submitApplication();
  assert.equal(h.requests[0].data.organization_name, '乙制造有限公司');
  assert.equal(h.requests[0].data.license_upload_id, license);
});

test('saved licenses download privately and only a successful local file is previewed', async () => {
  const h = harness();
  await readyApplicant(h, pending());
  assert.equal(h.downloads.length, 1);
  const download = h.downloads[0];
  assert.equal(download.url, `https://example.test/pldp/api/root-trial/licenses/${license}/`);
  assert.deepEqual(plain(download.header), { Authorization: 'Bearer session-one' });
  assert.equal(download.url.includes('session-one'), false);
  download.success({ statusCode: 200, tempFilePath: '/tmp/private-license.jpg' });
  await flush();
  h.page.previewLicense();
  assert.deepEqual(plain(h.wx.preview), { current: '/tmp/private-license.jpg', urls: ['/tmp/private-license.jpg'] });
});

test('a switched session cannot receive an earlier account private license', async () => {
  const h = harness(null);
  const promise = h.helper.downloadLicense(license);
  h.app.globalData.access_token = 'session-two';
  h.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/not-current.jpg' });
  await assert.rejects(promise, /账号已变化/);
});

test('an applicant account change clears an already visible license and original browser consent', async () => {
  const h = harness();
  h.page.onLoad({ webToken: token });
  h.respond(h.requests.shift(), { eligibility: { eligible: true }, application: pending() });
  await flush();
  h.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/previous-account.jpg' });
  await flush();
  assert.equal(h.page.data.licensePath, '/tmp/previous-account.jpg');
  h.page.refreshStatus();
  const oldRequest = h.requests.shift();
  h.app.globalData.access_token = 'session-two';
  h.respond(oldRequest, { eligibility: { eligible: true }, application: pending() });
  await flush();
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.licensePath, '');
  assert.equal(h.page.data.organizationName, '');
  assert.equal(h.page.data.profileReady, false);
  assert.equal(h.page.data.hasWebToken, false);
  assert.equal(h.page._webToken, '');
});

test('review account change during a private download clears displayed details and review authority', async () => {
  const h = harness(reviewPage, { admin: true });
  h.page.onLoad({ application_id: '12' });
  h.respond(h.requests.shift(), { application: pending() });
  await flush();
  h.page.setData({ licensePath: '/tmp/previous-reviewer.jpg', reviewReason: '上一账号的审核草稿' });
  h.app.globalData.access_token = 'session-two';
  h.downloads[0].success({ statusCode: 200, tempFilePath: '/tmp/stale-download.jpg' });
  await flush();
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.licensePath, '');
  assert.equal(h.page.data.reviewReason, '');
  assert.equal(h.page.data.canReview, false);
  h.page.approveApplication();
  assert.equal(h.modals.length, 0);
});

test('returning to a page under a different account immediately clears cached private data', async () => {
  const h = harness();
  await readyApplicant(h, pending());
  h.page.setData({ licensePath: '/tmp/previous-account.jpg' });
  h.app.globalData.access_token = 'session-two';
  h.page.onShow();
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.licensePath, '');
  assert.equal(h.page.data.canSubmit, false);
});

test('approval refreshes server profile but never silently approves the originating browser', async () => {
  const h = harness();
  h.page.onLoad({ webToken: token });
  h.respond(h.requests.shift(), { eligibility: { eligible: false }, application: approved() });
  await flush();
  assert.equal(h.page.data.profileReady, true);
  assert.equal(h.profileRefreshes(), 1);
  assert.deepEqual(plain(h.page.data.rootOrganization), { id: 77, name: '甲制造有限公司' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.navigations.length, 0);
  assert.equal(JSON.stringify(h.page.data).includes(token), false);
  h.page.confirmWebLogin();
  assert.equal(h.requests.length, 0);
  h.modals[0].success({ confirm: true });
  assert.equal(h.requests[0].url, 'https://example.test/pldp/web/portal/api/approve/');
  assert.deepEqual(plain(h.requests[0].data), { token });
});

test('expired browser QR leaves approved identity intact and directs a new scan', async () => {
  const h = harness();
  h.page.onLoad({ webToken: token });
  h.respond(h.requests.shift(), { eligibility: { eligible: false }, application: approved() });
  await flush();
  h.page.confirmWebLogin(); h.modals[0].success({ confirm: true });
  h.respond(h.requests.shift(), { error_code: 'EXPIRED' }, 410, 410);
  await flush();
  assert.equal(h.page.data.webNeedsRescan, true);
  assert.equal(h.page.data.profileReady, true);
  assert.equal(h.app.globalData.role, 'factory_admin');
  assert.equal(h.page._webToken, '');
  h.page.scanNewWebCode();
  assert.equal(h.navigations[0].url, '/pages/scan/scan/scan');
});

test('failure to refresh approved profile cannot open a workbench or authorize a computer', async () => {
  const h = harness(applicationPage, { profileFailure: true });
  h.page.onLoad({ webToken: token });
  h.respond(h.requests.shift(), { eligibility: { eligible: false }, application: approved() });
  await flush();
  h.page.confirmWebLogin();
  assert.equal(h.modals.length, 0);
  assert.equal(h.requests.length, 0);
  assert.equal(h.page.data.profileReady, false);
  assert.match(h.page.data.error, /身份刷新未完成/);
});

test('review list uses a cursor, filters history and removes stale data when authority is revoked', async () => {
  const h = harness(reviewPage, { admin: true });
  h.page.onLoad({});
  let query = h.requests.shift();
  assert.deepEqual(plain(query.data), { status: 'PENDING', limit: 50 });
  h.respond(query, { applications: [pending()], has_more: true, next_before_id: 12 });
  await flush();
  h.page.loadMore();
  query = h.requests.shift();
  assert.equal(query.data.before_id, 12);
  h.respond(query, { applications: [pending(), pending({ id: 9 })], has_more: false });
  await flush();
  assert.deepEqual(plain(h.page.data.applications.map(item => item.id)), [12, 9]);
  h.page.changeFilter({ currentTarget: { dataset: { status: 'ALL' } } });
  query = h.requests.shift();
  assert.equal(query.data.status, 'ALL');
  h.respond(query, { applications: [approved()] });
  await flush();
  h.page.reload();
  h.respond(h.requests.shift(), {}, 403, 403);
  await flush();
  assert.equal(h.page.data.applications.length, 0);
  assert.equal(h.page.data.application, null);
  assert.equal(h.page.data.canReview, false);
});

test('out-of-order queue responses cannot replace the chosen history filter', async () => {
  const h = harness(reviewPage, { admin: true });
  h.page.onLoad({});
  const old = h.requests.shift();
  h.page.changeFilter({ currentTarget: { dataset: { status: 'ALL' } } });
  const current = h.requests.shift();
  h.respond(current, { applications: [approved()] });
  h.respond(old, { applications: [pending({ id: 3 })] });
  await flush();
  assert.equal(h.page.data.applications[0].id, 12);
  assert.equal(h.page.data.applications[0].status, 'APPROVED');
});

test('review rejection needs a reason, honors cancellation, commits once and refreshes inbox', async () => {
  const h = harness(reviewPage, { admin: true, taskRefreshFailure: true });
  h.page.onLoad({ application_id: '12' });
  h.respond(h.requests.shift(), { application: pending() });
  await flush();
  h.page.rejectApplication();
  assert.equal(h.modals.length, 0);
  assert.equal(h.requests.length, 0);
  h.page.onReasonInput({ detail: { value: '  执照图片不完整  ' } });
  h.page.rejectApplication(); h.modals[0].success({ confirm: false });
  assert.equal(h.requests.length, 0);
  h.page.rejectApplication(); h.modals[1].success({ confirm: true });
  h.page.rejectApplication();
  assert.equal(h.requests.length, 1);
  const request = h.requests.shift();
  assert.deepEqual(plain(request.data), { decision: 'REJECT', reason: '执照图片不完整' });
  h.respond(request, { application: pending({ status: 'REJECTED', can_review: false }), changed: true });
  await flush();
  assert.equal(h.taskRefreshes(), 1);
  assert.equal(h.page.data.submitting, false);
  assert.equal(h.page.data.canReview, false);
  assert.equal(h.page.data.application.status, 'REJECTED');
});

test('review detail invalid identifiers do not issue a query', () => {
  for (const id of ['no', '-1', '1.2', '9007199254740993', '']) {
    const h = harness(reviewPage);
    h.page.onLoad({ application_id: id });
    assert.equal(h.requests.length, 0, id);
    assert.equal(h.page.data.loading, false, id);
  }
});

test('tourist Web scan is verified by the original backend endpoint before trial navigation', () => {
  const h = harness('pages/scan/scan/scan.js');
  h.page.setData({ scanning: true }); h.app.globalData._isScanning = true;
  h.page.approveWebPortalLogin(`PLDP_WEB_LOGIN|${token}`);
  assert.equal(h.navigations.length, 0);
  assert.match(h.modals[0].content, /已有权限则授权/);
  h.modals[0].success({ confirm: true });
  const request = h.requests.shift();
  assert.equal(request.url, 'https://example.test/pldp/web/portal/api/approve/');
  assert.deepEqual(plain(request.data), { token });
  assert.equal(h.navigations.length, 0);
  h.respond(request, { status: 'trial_required', trial_required: true });
  assert.equal(h.navigations[0].url, `/pages/account/root_application/root_application?webToken=${token}`);
  assert.equal(h.app.globalData._isScanning, false);
  assert.equal(h.page.data.scanning, false);
});

test('invalid or expired Web QR cannot enter an application through the scanning branch', () => {
  const invalid = harness('pages/scan/scan/scan.js');
  invalid.page.approveWebPortalLogin('PLDP_WEB_LOGIN|invalid');
  assert.equal(invalid.modals.length, 0);
  assert.equal(invalid.requests.length, 0);
  const expired = harness('pages/scan/scan/scan.js');
  expired.page.approveWebPortalLogin(`PLDP_WEB_LOGIN|${token}`);
  expired.modals[0].success({ confirm: true });
  expired.respond(expired.requests.shift(), {}, 410, 410);
  assert.equal(expired.navigations.length, 0);
});

test('superadministrator retains the original Web authorization and has a permanent review entry', () => {
  const h = harness('pages/scan/scan/scan.js', { admin: true });
  h.page.updateUserInfo();
  assert.equal(h.page.data.isPlatformAdmin, true);
  h.page.openRootTrialApplication();
  assert.equal(h.navigations.length, 0);
  h.page.approveWebPortalLogin(`PLDP_WEB_LOGIN|${token}`);
  assert.equal(h.modals[0].title, '授权电脑登录 PLDP');
  h.modals[0].success({ confirm: true });
  h.respond(h.requests.shift(), { organization_name: '平台', role_name: '超级管理员' });
  assert.equal(h.navigations.length, 0);
  const home = harness('pages/home/index/index.js', { admin: true });
  home.page.goRootTrialReview();
  assert.equal(home.navigations[0].url, '/pages/account/root_application_review/root_application_review');
  home.app.globalData.is_platform_admin = false;
  home.page.goRootTrialReview();
  assert.equal(home.navigations.length, 1);
});

test('existing installation invitation and print login QR routes keep their original destinations', () => {
  const invite = harness('pages/scan/scan/scan.js');
  invite.page.openScanner();
  invite.scans[0].success({ result: 'INSTALL_INVITE|original-invitation' });
  assert.equal(invite.navigations[0].url, '/pages/customer/invite/accept/accept?token=original-invitation');
  const print = harness('pages/scan/scan/scan.js');
  print.page.openScanner();
  print.scans[0].success({ result: `PLDP_PRINT_LOGIN|${token}` });
  print.modals[0].success({ confirm: true });
  assert.equal(print.requests[0].url, 'https://example.test/pldp/web/print/api/login/approve/');
  assert.equal(print.navigations.length, 0);
});

test('new feature pages are registered and remain explicit destinations after identity refresh', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const routes = [applicationPage.replace('.js', ''), reviewPage.replace('.js', '')];
  for (const route of routes) assert(manifest.pages.includes(route));
  let app;
  const navigations = [];
  let route = routes[0];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    App: value => { app = value; }, wx: { switchTab: navigation => navigations.push(navigation) },
    getCurrentPages: () => [{ route }]
  });
  app.globalData.role = 'factory_admin';
  app.autoRedirectIfLogged();
  route = routes[1]; app.globalData.is_platform_admin = true;
  app.autoRedirectIfLogged();
  assert.equal(navigations.length, 0);
});

test('trial headers show a proposed root or platform scope even when launched from a null-root task', () => {
  const h = harness(null);
  assert.deepEqual(plain(h.helper.applicationRoot(pending())), { state: 'pending_creation', name: '甲制造有限公司' });
  let component;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/theme-shell/index.js'), 'utf8'), {
    Component: value => { component = value; },
    getApp: () => ({ globalData: { factory_root_id: 999, factory_root_name: '管理员其他根组织' } }),
    require: () => ({ getRouteMeta() {} })
  });
  const shell = {
    data: { rootOrganization: { state: 'platform_review' }, businessContext: true, pageLevel: 'primary' },
    _openedFromTask: true, _taskRootOrganization: null,
    setData(value) { Object.assign(this.data, value); }
  };
  component.methods.resolveOrganizationLine.call(shell);
  assert.equal(shell.data.organizationName, '平台审核 · 厂家试用申请');
  shell.data.rootOrganization = h.helper.applicationRoot(pending());
  component.methods.resolveOrganizationLine.call(shell);
  assert.equal(shell.data.organizationName, '待建根组织 · 甲制造有限公司');
  shell.data.rootOrganization = h.helper.applicationRoot(approved());
  component.methods.resolveOrganizationLine.call(shell);
  assert.equal(shell.data.organizationName, '根组织 · 甲制造有限公司');
});
