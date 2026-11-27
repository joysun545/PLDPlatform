const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = process.env.PLDP_FRONTEND_UNDER_TEST || path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const homeRoute = '/pages/home/index/index';
const scanRoute = '/pages/scan/scan/scan';
const oldAdmin = { openid: 'wx-account-0B0M', access_token: 'verified-session', role: 'tourist', role_name: '游客', is_platform_admin: true, organization_id: null };
const newAdmin = { ...oldAdmin, role: 'platform_admin', role_name: '超级管理员' };
const guest = { ...oldAdmin, is_platform_admin: false };

function appHarness(cache) {
  let app;
  let currentRoute = 'pages/index/index';
  const store = new Map();
  if (cache) store.set('PLDP_USER_PROFILE_CACHE_V2', cache);
  const requests = [], navigations = [], modals = [];
  const wx = {
    getStorageSync: key => store.get(key), setStorageSync: (key, value) => store.set(key, value),
    removeStorageSync: key => store.delete(key),
    request: request => requests.push(request),
    switchTab: request => navigations.push(request),
    navigateTo: request => navigations.push(request),
    showModal: request => modals.push(request),
    setTabBarBadge() {}, removeTabBarBadge() {},
    login: request => request.success({ code: 'wechat-code' })
  };
  const getCurrentPages = () => [{ route: currentRoute }];
  vm.runInNewContext(read('app.js'), { App: value => { app = value; }, wx, getCurrentPages });
  return { app, wx, store, requests, navigations, modals, getCurrentPages, route: value => { currentRoute = value; } };
}

function tabSync(app) {
  const module = { exports: {} };
  vm.runInNewContext(read('utils/tab-bar.js'), { getApp: () => app, module });
  return module.exports.sync;
}

function loadPage(rel, app, wx, getCurrentPages = () => []) {
  let page;
  const sync = tabSync(app);
  vm.runInNewContext(read(rel), {
    Page: value => { page = value; }, getApp: () => app, wx, getCurrentPages,
    require: name => name.endsWith('/tab-bar') ? { sync } : name.endsWith('/theme') ? { get: () => ({ color_scheme: 'ash' }) } : {},
    console
  });
  page.data = plain(page.data || {});
  page.setData = value => Object.assign(page.data, plain(value));
  return page;
}

function bootstrap(profile = oldAdmin) {
  const h = appHarness();
  Object.assign(h.app.globalData, profile);
  const callbacks = [];
  h.app.ensureLogin = callback => callbacks.push(callback);
  h.page = loadPage('pages/index/index.js', h.app, h.wx);
  h.complete = (ok, data = profile) => { Object.assign(h.app.globalData, data); callbacks.shift()(ok); };
  h.callbacks = callbacks;
  return h;
}

function themeShell(profile, data = {}) {
  let definition;
  const app = { globalData: profile };
  const getCurrentPages = () => [{ route: 'pages/home/index/index' }];
  vm.runInNewContext(read('components/theme-shell/index.js'), {
    Component: value => { definition = value; }, getApp: () => app, getCurrentPages,
    require: name => name.endsWith('/theme-routes')
      ? { getRouteMeta: () => ({ title: '首页', level: 'tab' }) }
      : {}
  });
  const shell = {
    data: { ...plain(definition.data), businessContext: false, rootOrganization: null, ...data },
    ...definition.methods,
    setData(value) { Object.assign(this.data, value); }
  };
  return { shell, app };
}

test('startup authenticates first, then sends either old or new genuine admin payload to home', () => {
  for (const profile of [oldAdmin, newAdmin, { ...oldAdmin, role: '' }]) {
    const h = bootstrap(profile);
    h.page.onShow();
    assert.equal(h.callbacks.length, 1);
    assert.equal(h.navigations.length, 0, 'cached profile must not navigate before login');
    h.complete(true);
    assert.equal(h.navigations[0].url, homeRoute);
  }
});

test('a stale cached admin flag cannot navigate when current login fails; retry uses current result', () => {
  const h = bootstrap(oldAdmin);
  h.page.onShow(); h.complete(false);
  assert.equal(h.navigations.length, 0);
  assert.equal(h.modals.length, 1);
  h.modals[0].success({ confirm: true });
  h.complete(true, guest);
  assert.equal(h.navigations[0].url, scanRoute);
});

test('startup does not duplicate pending login or navigate after leaving the initializer', () => {
  const h = bootstrap();
  h.page.onShow(); h.page.onShow();
  assert.equal(h.callbacks.length, 1);
  h.page.onHide(); h.complete(true);
  assert.equal(h.navigations.length, 0);
});

test('a genuine guest still lands on the scanner after authentication', () => {
  const h = bootstrap(guest);
  h.page.onShow(); h.complete(true);
  assert.equal(h.navigations[0].url, scanRoute);
});

test('app foreground navigation ignores cached admin or merchant identity until a token exists', () => {
  for (const profile of [oldAdmin, { ...guest, role: 'merchant_owner', organization_id: 18 }]) {
    const h = appHarness();
    Object.assign(h.app.globalData, profile, { access_token: '' });
    h.app.startTaskPolling = () => {};
    h.app.onShow();
    assert.equal(h.navigations.length, 0);
    h.app.globalData.access_token = 'authenticated-session';
    h.app.autoRedirectIfLogged();
    assert.equal(h.navigations[0].url, homeRoute);
  }
});

test('shared tab sync and custom component show keep all tabs visible for no-organization admins', () => {
  for (const profile of [oldAdmin, newAdmin]) {
    const app = { globalData: { ...profile, taskCount: 4 } };
    let state = {};
    tabSync(app)({ getTabBar: () => ({ setData: value => { state = plain(value); } }) }, 2);
    assert.deepEqual(state, { selected: 2, hidden: false, badge: 4 });
    let definition;
    vm.runInNewContext(read('custom-tab-bar/index.js'), {
      Component: value => { definition = value; }, getApp: () => app,
      getCurrentPages: () => [{ route: 'pages/personal/center/center' }], require: () => ({}), wx: {}
    });
    const bar = { data: {}, setData(value) { Object.assign(this.data, value); } };
    definition.methods.syncState.call(bar);
    assert.equal(bar.data.hidden, false);
    assert.equal(bar.data.selected, 2);
    assert.equal(bar.data.badge, 4);
  }
});

test('scanner no longer explicitly hides an admin tab bar, while true guests remain hidden', () => {
  for (const [profile, hidden] of [[oldAdmin, false], [newAdmin, false], [guest, true]]) {
    const app = { globalData: profile };
    const page = loadPage('pages/scan/scan/scan.js', app, {});
    let state;
    page.getTabBar = () => ({ setData: value => { state = plain(value); } });
    page.updateUserInfo(); page.controlTabBar();
    assert.equal(state.hidden, hidden);
  }
});

test('profile application and cache restore normalize only real no-organization admin role labels', () => {
  for (const profile of [oldAdmin, newAdmin, guest,
    { ...newAdmin, is_platform_admin: false, role_name: '普通账号' },
    { ...oldAdmin, organization_id: 2, role: 'factory_admin', role_name: '厂家负责人' }]) {
    const h = appHarness(profile);
    h.app.restoreUserFromCache();
    const expected = profile.is_platform_admin && !profile.organization_id ? '超级管理员' : profile.role_name;
    assert.equal(h.app.globalData.role_name, expected);
    h.app.applyUserPayload(profile);
    assert.equal(h.app.globalData.role_name, expected);
    assert.equal(h.app.globalData.role, profile.role, 'compatibility does not assign a business role');
    assert.equal(h.app.globalData.organization_id, profile.organization_id);
    assert.equal(h.app.globalData.is_platform_admin, profile.is_platform_admin);
  }
});

test('same OpenID handover clears merchant root, task cache and late task responses before admin landing', () => {
  const merchant = {
    ...oldAdmin, role: 'merchant_owner', role_name: '商家负责人', is_platform_admin: false,
    organization_id: 18, organization_name: '原直属商家', company_name: '原直属商家',
    factory_root_id: 2, factory_root_name: '原厂家',
    appearance: { color_scheme: 'ash', style_scheme: 'flow', owner_organization_id: 18, owner_organization_name: '原直属商家' }
  };
  const h = appHarness(merchant);
  h.app.restoreUserFromCache();
  h.app.syncOperationRoot(merchant);
  h.app._ensureTaskScope();
  Object.assign(h.app.globalData, {
    taskList: [{ id: 991, title: '旧商家任务' }], taskCount: 9, taskUnreadCount: 3,
    taskActionPendingCount: 6, taskNextCursor: 'old-merchant-cursor', taskHasMore: true, taskListLoaded: true
  });
  h.app.getTaskList(); h.app.refreshTaskSummary();
  const [oldList, oldSummary] = h.requests.splice(0);
  h.app.applyUserPayload({ ...newAdmin, factory_root_id: null, factory_root_name: '', organization_name: '', company_name: '' });
  const g = h.app.globalData;
  assert.equal(g.openid, merchant.openid);
  assert.equal(g.role, 'platform_admin');
  assert.equal(g.role_name, '超级管理员');
  assert.equal(g.is_platform_admin, true);
  assert.equal(g.organization_id, null);
  assert.equal(g.organization_name, '');
  assert.equal(g.company_name, '');
  assert.equal(g.factory_root_id, null);
  assert.equal(g.factory_root_name, '');
  assert.equal(g.operationRoot, null);
  assert.deepEqual(plain(h.app.operationRootOptions()), []);
  assert.equal(g.taskList.length, 0);
  assert.equal(g.taskCount, 0);
  assert.equal(g.taskNextCursor, '');
  assert.equal(g.taskHasMore, false);
  oldList.success({ statusCode: 200, data: { code: 0, data: { items: [{ id: 991, title: '旧商家任务' }], next_cursor: 'stale', has_more: true } } });
  oldSummary.success({ statusCode: 200, data: { code: 0, data: { unread_count: 3, action_pending_count: 6, attention_count: 9 } } });
  assert.equal(g.taskList.length, 0);
  assert.equal(g.taskCount, 0);
  assert.equal(g.taskNextCursor, '');
  h.app.autoRedirectIfLogged();
  assert.equal(h.navigations[0].url, homeRoute);
  let tabState;
  tabSync(h.app)({ getTabBar: () => ({ setData: value => { tabState = value; } }) }, 0);
  assert.equal(tabState.hidden, false);
  const { shell } = themeShell(g);
  shell.resolveRoute();
  assert.equal(shell.data.roleName, '超级管理员');
  assert.equal(shell.data.organizationName, '平台管理');
});

test('no-root administrator header uses platform scope without inventing an organization', () => {
  for (const profile of [oldAdmin, newAdmin]) {
    const { shell, app } = themeShell(profile);
    shell.resolveRoute();
    assert.equal(shell.data.organizationName, '平台管理');
    assert.equal(shell.data.roleName, '超级管理员');
    assert.equal(app.globalData.organization_id, null);
  }
});

test('explicit task roots and incomplete business roots retain their existing meanings for admins', () => {
  const { shell } = themeShell(oldAdmin, { businessContext: true, rootOrganization: { id: 7, name: '任务所属厂家' } });
  shell.resolveRoute();
  assert.equal(shell.data.organizationName, '根组织 · 任务所属厂家');
  shell.data.rootOrganization = { state: 'pending_creation', name: '待审企业' };
  shell.resolveOrganizationLine();
  assert.equal(shell.data.organizationName, '待建根组织 · 待审企业');
  shell.data.rootOrganization = null;
  shell.resolveOrganizationLine();
  assert.equal(shell.data.organizationName, '根组织未确认');
});

test('ordinary root organizations and guests retain their own identity and header behavior', () => {
  const organization = { ...oldAdmin, is_platform_admin: true, organization_id: 2, role_name: '厂家负责人', operationRoot: { id: 2, name: '本组织厂家' } };
  const member = themeShell(organization);
  member.shell.resolveRoute();
  assert.equal(member.shell.data.roleName, '厂家负责人');
  assert.equal(member.shell.data.organizationName, '根组织 · 本组织厂家');
  const visitor = themeShell(guest);
  visitor.shell.resolveRoute();
  assert.equal(visitor.shell.data.roleName, '游客');
  assert.equal(visitor.shell.data.organizationName, '');
});

test('admin home invitation and personal task entry remain reachable without a business identity', () => {
  const h = appHarness();
  Object.assign(h.app.globalData, oldAdmin);
  h.app.applyUserPayload(oldAdmin);
  h.app.ensureLogin = callback => callback(true);
  const home = loadPage('pages/home/index/index.js', h.app, h.wx);
  home.updateUserInfo();
  home.updateInviteCapability();
  assert.equal(home.data.isPlatformAdmin, true);
  assert.equal(home.data.showInvite, true);
  home.goInvite();
  assert.equal(h.navigations[0].url, '/pages/home/invite/invite/invite');
  const personal = loadPage('pages/personal/center/center.js', h.app, h.wx);
  personal.loadUserInfo();
  assert.equal(personal.data.role_name, '超级管理员');
  personal.gotoTaskList();
  assert.equal(h.navigations[1].url, '/pages/personal/task_list/task_list');
});

test('platform_admin role text alone cannot grant local platform administration entries', () => {
  const h = appHarness();
  Object.assign(h.app.globalData, { ...newAdmin, is_platform_admin: false });
  h.app.ensureLogin = callback => callback(true);
  const home = loadPage('pages/home/index/index.js', h.app, h.wx);
  home.updateUserInfo(); home.updateInviteCapability();
  assert.equal(home.data.isPlatformAdmin, false);
  assert.equal(home.data.showInvite, false);
  if (home.goRootTrialReview) home.goRootTrialReview();
  assert.equal(h.navigations.length, 0);
  assert.equal(h.requests.some(request => request.url.includes('invitation_roles')), true, 'backend still decides normal account invitation capability');
});

test('unauthorized material page returns genuine admins home without granting material permission', () => {
  for (const [profile, destination] of [[oldAdmin, homeRoute], [guest, scanRoute]]) {
    const h = appHarness();
    Object.assign(h.app.globalData, profile);
    h.route('pages/material_inventory/form/form');
    h.app.autoRedirectIfLogged();
    assert.equal(h.navigations[0].url, destination);
  }
});
