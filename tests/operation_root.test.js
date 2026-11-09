const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const own = { id: 1, name: '整机厂甲' };
const other = { id: 2, name: '整机厂乙' };
const another = { id: 3, name: '化油器厂' };

function session(storage = new Map()) {
  let app;
  const pending = [];
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    request: request => pending.push(request),
    login: ({ success }) => success({ code: 'test-code' })
  };
  vm.runInNewContext(source, { App: value => { app = value; }, wx });
  app.autoRedirectIfLogged = () => {};
  app.startTaskPolling = () => {};
  app.updateTabBarBadge = () => {};
  const request = suffix => {
    // An explicit refresh supersedes the still-pending login inbox request.
    // Complete the current query while keeping all root-choice assertions.
    const matches = item => item.url.endsWith(suffix);
    const index = suffix.startsWith('/workflow/task/')
      ? pending.map(matches).lastIndexOf(true) : pending.findIndex(matches);
    assert.notEqual(index, -1, suffix);
    return pending.splice(index, 1)[0];
  };
  const respond = (suffix, data, statusCode = 200) => request(suffix).success({ statusCode, data });
  return {
    app, request, respond,
    login(profile) {
      app.onLaunch();
      assert.equal(app.globalData.operationRoot, null);
      respond('/account/login/', profile);
    },
    pollTaskRoots(...roots) {
      app.refreshTasks();
      respond('/workflow/task/summary/', { code: 0, data: {} });
      respond('/workflow/task/list/', { code: 0, data: { items: roots.map((root, i) => ({
        id: i + 1,
        root_organization: root,
        state: 'NEW'
      })) } });
    },
    openTask(root, options, code = 0) {
      app.openUserTask(7, () => {}, options);
      respond('/workflow/task/open/', { code, data: { root_organization: root } });
    }
  };
}

function profile(organizationId, openid = 'member', factory = own) {
  return {
    code: 0,
    openid,
    access_token: 'test-token-' + openid,
    organization_id: organizationId,
    role: organizationId === factory.id ? 'factory_admin' : 'supplier_owner',
    factory_root_id: factory.id,
    factory_root_name: factory.name
  };
}

test('a root organization always starts its own chain at cold launch', () => {
  const storage = new Map();
  const first = session(storage);
  first.login(profile(own.id));
  first.openTask(other, { switchOperationRoot: true });
  assert.equal(first.app.globalData.operationRoot.id, other.id);
  assert.equal(first.app.globalData.factory_root_id, own.id);
  const next = session(storage);
  next.login(profile(own.id));
  assert.equal(next.app.globalData.operationRoot.id, own.id);
});

test('a non-root account resumes the last task or chosen root per identity', () => {
  const storage = new Map();
  const first = session(storage);
  first.login(profile(11));
  assert.equal(first.app.globalData.operationRoot.id, own.id);
  first.pollTaskRoots(other);
  assert(first.app.selectOperationRoot(other.id));
  const next = session(storage);
  next.login(profile(11));
  assert.equal(next.app.globalData.operationRoot.id, other.id);
  next.openTask(another, { switchOperationRoot: true });
  const again = session(storage);
  again.login(profile(11));
  assert.equal(again.app.globalData.operationRoot.id, another.id);
  const differentAccount = session(storage);
  differentAccount.login(profile(11, 'different-account'));
  assert.equal(differentAccount.app.globalData.operationRoot.id, own.id);
  const differentOrganization = session(storage);
  differentOrganization.login(profile(12));
  assert.equal(differentOrganization.app.globalData.operationRoot.id, own.id);
});

test('polling, foreground and same-identity profile refresh preserve the user choice', () => {
  const current = session();
  current.login(profile(11));
  current.pollTaskRoots(other);
  assert(current.app.selectOperationRoot(other.id));
  current.pollTaskRoots(another);
  current.app.onShow();
  current.app.refreshUserProfile();
  current.respond('/account/profile/', { code: 0, data: profile(11) });
  assert.equal(current.app.globalData.operationRoot.id, other.id);
  assert.equal(current.app.operationRootOptions().length, 3);
  assert.equal(current.app.selectOperationRoot(99), false);
  assert.equal(current.app.globalData.operationRoot.id, other.id);
});

test('only an explicit successful task open with a confirmed root switches it', () => {
  const current = session();
  current.login(profile(11));
  current.openTask(other);
  current.openTask(other, { switchOperationRoot: true }, 1);
  current.openTask(null, { switchOperationRoot: true });
  current.openTask({ id: null, name: '待建根组织' }, { switchOperationRoot: true });
  assert.equal(current.app.globalData.operationRoot.id, own.id);
  current.openTask(other, { switchOperationRoot: true });
  assert.equal(current.app.globalData.operationRoot.id, other.id);
});

test('a delayed response cannot override a later manual choice or changed identity', () => {
  const current = session();
  current.login(profile(11));
  current.pollTaskRoots(other);
  current.app.openUserTask(1, () => {}, { switchOperationRoot: true });
  const oldOpen = current.request('/workflow/task/open/');
  assert(current.app.selectOperationRoot(other.id));
  oldOpen.success({ statusCode: 200, data: { code: 0, data: { root_organization: another } } });
  assert.equal(current.app.globalData.operationRoot.id, other.id);

  current.app.refreshTasks();
  const oldList = current.request('/workflow/task/list/');
  current.app.openUserTask(2, () => {}, { switchOperationRoot: true });
  const oldIdentityOpen = current.request('/workflow/task/open/');
  current.app.applyUserPayload(profile(12));
  oldList.success({ statusCode: 200, data: { code: 0, data: { items: [{ id: 1, root_organization: another }] } } });
  oldIdentityOpen.success({ statusCode: 200, data: { code: 0, data: { root_organization: another } } });
  assert.equal(current.app.globalData.operationRoot.id, own.id);
  assert.equal(current.app.operationRootOptions().length, 1);
});

function page(route, app) {
  const filename = path.join(__dirname, '..', 'pages', route, path.basename(route) + '.js');
  let instance;
  const destinations = [];
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Page: definition => { instance = definition; },
    getApp: () => app,
    wx: { navigateTo: ({ url }) => destinations.push(url) }
  });
  instance.setData = values => Object.assign(instance.data, values);
  return { instance, destinations };
}

test('the picker chooses a listed root and opening a real inbox entry switches it', () => {
  const current = session();
  current.login(profile(11));
  current.pollTaskRoots(other, another);
  const center = page('personal/center', current.app).instance;
  center.syncOperationRoot();
  center.onOperationRootChange({ detail: { value: '1' } });
  assert.equal(current.app.globalData.operationRoot.id, other.id);

  const tasks = page('personal/task_list', current.app);
  const route = '/pages/sales/order_plan_detail/order_plan_detail?order_plan_id=8';
  tasks.instance.data.taskList = [{ id: 1, url: route }];
  tasks.instance.openTask({ currentTarget: { dataset: { id: 1 } } });
  current.respond('/workflow/task/open/', { code: 0, data: { root_organization: another } });
  assert.equal(current.app.globalData.operationRoot.id, another.id);
  assert.deepEqual(tasks.destinations, [route]);

  tasks.instance.data.taskList = [{ id: 2, url: '/pages/personal/task_group/task_group?group_id=mixed' }];
  tasks.instance.openTask({ currentTarget: { dataset: { id: 2 } } });
  current.respond('/workflow/task/open/', { code: 0, data: { root_organization: own } });
  assert.equal(current.app.globalData.operationRoot.id, another.id);

  const group = page('personal/task_group', current.app);
  group.instance.data.tasks = [{ id: 2, link: route }];
  group.instance.openChildTask({ currentTarget: { dataset: { id: 2 } } });
  current.respond('/workflow/task/open/', { code: 0, data: { root_organization: own } });
  assert.equal(current.app.globalData.operationRoot.id, own.id);
  assert.deepEqual(group.destinations, [route]);
});
