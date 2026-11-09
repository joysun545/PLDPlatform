const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const alpha = { id: 1, name: '整机厂甲' };
const beta = { id: 2, name: '整机厂乙' };

function session(storage = new Map()) {
  let app, page, theme;
  const pending = [];
  const toasts = [];
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    request: request => pending.push(request),
    login: ({ success }) => success({ code: 'test-code' }),
    showToast: toast => toasts.push(toast)
  };
  const context = vm.createContext({
    App: value => { app = value; },
    Page: value => { page = value; },
    module: { exports: {} },
    getApp: () => app,
    require: () => theme,
    wx
  });
  vm.runInContext(source('utils/theme.js'), context);
  theme = context.module.exports;
  vm.runInContext(source('app.js'), context);
  app.autoRedirectIfLogged = () => {};
  app.startTaskPolling = () => {};
  app.updateTabBarBadge = () => {};
  const respond = (suffix, data, method) => {
    // Task refreshes invalidate older login queries; deliver the latest one.
    const matches = item => item.url.endsWith(suffix) && (!method || item.method === method);
    const index = suffix.startsWith('/workflow/task/')
      ? pending.map(matches).lastIndexOf(true) : pending.findIndex(matches);
    assert.notEqual(index, -1, suffix);
    const [request] = pending.splice(index, 1);
    request.success({ statusCode: 200, data });
    if (request.complete) request.complete();
    return request;
  };
  function list(...roots) {
    app.refreshTasks();
    respond('/workflow/task/list/', {
      code: 0,
      data: { items: roots.map((item, index) => ({ id: index + 1, root_organization: item })) }
    });
  }
  return {
    app, theme, wx, pending, respond, list, toasts,
    login(data) {
      app.onLaunch();
      assert.equal(theme.get().option_code, 'jade-flow');
      respond('/account/login/', data);
    },
    editor(options) {
      vm.runInNewContext(source('pages/theme/setting/setting.js'), {
        Page: value => { page = value; },
        getApp: () => app,
        require: () => theme,
        wx
      });
      page.setData = values => Object.assign(page.data, values);
      page.onLoad(options);
      return page;
    }
  };
}

function profile({ openid = 'supplier', role = 'supplier_owner', orgId = 12 } = {}) {
  return {
    code: 0,
    openid,
    access_token: 'token-' + openid,
    organization_id: orgId,
    role,
    factory_root_id: orgId ? alpha.id : null,
    factory_root_name: orgId ? alpha.name : '',
    appearance: orgId ? {
      color_scheme: 'ocean',
      style_scheme: 'flow',
      owner_organization_id: alpha.id,
      owner_organization_name: alpha.name
    } : null
  };
}

function choose(page, color, style) {
  page.selectColor({ currentTarget: { dataset: { code: color } } });
  page.selectStyle({ currentTarget: { dataset: { code: style } } });
  page.save();
}

test('a supplier can independently set and switch themes for two roots', () => {
  const disk = new Map();
  const current = session(disk);
  current.login(profile());
  assert.equal(current.theme.get().option_code, 'ocean-flow');
  const first = current.editor();
  assert.equal(first.data.canManage, true);
  assert.equal(first.data.editingRoot.id, alpha.id);
  choose(first, 'amber', 'order');
  first.onUnload();
  assert.equal(current.theme.get().option_code, 'amber-order');

  current.list(beta);
  assert.equal(current.theme.get().option_code, 'amber-order');
  assert(current.app.selectOperationRoot(beta.id));
  assert.equal(current.theme.get().option_code, 'jade-flow');
  const second = current.editor();
  assert.equal(second.data.editingRoot.id, beta.id);
  choose(second, 'ocean', 'flow');
  second.onUnload();
  assert.equal(current.theme.get().option_code, 'ocean-flow');

  current.app.openUserTask(1, () => {}, { switchOperationRoot: true });
  current.respond('/workflow/task/open/', { code: 0, data: { root_organization: alpha } });
  assert.equal(current.theme.viewModel(current.theme.get()).className, 'theme-color-amber theme-style-order');
  assert.equal(current.app.globalData.appearance.option_code, 'amber-order');
  assert(!current.pending.some(request => request.url.endsWith('/account/appearance/')));

  const reopened = session(disk);
  reopened.login(profile());
  assert.equal(reopened.theme.get().option_code, 'amber-order');
  reopened.list(beta);
  assert(reopened.app.selectOperationRoot(beta.id));
  assert.equal(reopened.theme.get().option_code, 'ocean-flow');
});

test('an account with no organization can save its own theme and it does not follow another login', () => {
  const disk = new Map();
  const guest = session(disk);
  guest.login(profile({ openid: 'guest', role: 'tourist', orgId: null }));
  const editor = guest.editor();
  assert.equal(editor.data.editingRoot, null);
  assert.equal(editor.data.canManage, true);
  choose(editor, 'amber', 'order');
  assert.equal(guest.theme.get().option_code, 'amber-order');
  assert.match(source('pages/scan/scan/scan.wxml'), /role === 'tourist'[^\n]+\/pages\/theme\/setting\/setting/);
  const next = session(disk);
  next.login(profile({ openid: 'second', role: 'merchant_stock', orgId: 11 }));
  assert.equal(next.theme.get().option_code, 'ocean-flow');
});

test('a pending edit cannot save to a different root, and a failed save keeps the old theme', () => {
  const current = session();
  current.login(profile());
  current.list(beta);
  const editor = current.editor();
  const previousKey = current.app.personalAppearanceKey();
  editor.selectColor({ currentTarget: { dataset: { code: 'amber' } } });
  current.app.selectOperationRoot(beta.id);
  assert.equal(editor.data.editingRoot.id, beta.id);
  assert.equal(editor.data.selectedColor, 'jade');
  assert.equal(current.app.savePersonalAppearance(previousKey, { color_scheme: 'amber', style_scheme: 'order' }), false);
  assert.equal(current.app.savePersonalAppearance(current.app.personalAppearanceKey(), { color_scheme: '__proto__', style_scheme: 'order' }), false);
  current.wx.setStorageSync = () => { throw Error('storage full'); };
  choose(editor, 'amber', 'order');
  assert.equal(editor.data.errorMessage, '个人主题保存失败，请重试');
  assert.equal(current.theme.get().option_code, 'jade-flow');
});

test('only the organization settings path uses the protected shared-theme write', () => {
  const current = session();
  current.login(profile({ role: 'factory_admin', orgId: 1 }));
  const personal = current.editor();
  choose(personal, 'amber', 'order');
  personal.onUnload();
  const manager = current.editor({ scope: 'organization' });
  current.respond('/account/appearance/', {
    code: 0, data: { can_manage: true, appearance: profile().appearance }
  }, 'GET');
  assert.equal(manager.data.selectedColor, 'ocean');
  const shared = { ...profile().appearance, color_scheme: 'jade', style_scheme: 'order' };
  choose(manager, shared.color_scheme, shared.style_scheme);
  const posted = current.respond('/account/appearance/', {
    code: 0, data: { appearance: shared }
  }, 'POST');
  assert.equal(posted.data.color_scheme, 'jade');
  assert.equal(current.app.globalData.organizationAppearance.option_code, 'jade-order');
  assert.equal(current.theme.get().option_code, 'amber-order');

  const keeper = session();
  keeper.login(profile({ role: 'merchant_stock', orgId: 15 }));
  const readOnly = keeper.editor({ scope: 'organization' });
  keeper.respond('/account/appearance/', {
    code: 0, data: { can_manage: false, appearance: profile().appearance }
  }, 'GET');
  choose(readOnly, 'amber', 'order');
  assert(!keeper.pending.some(request => request.url.endsWith('/account/appearance/') && request.method === 'POST'));
});
