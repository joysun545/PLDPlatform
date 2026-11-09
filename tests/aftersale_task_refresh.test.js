const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The optional root lets the same cases demonstrate the unmodified baseline.
const root = process.env.PLDP_FRONTEND_UNDER_TEST || path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const ownRoot = { id: 1, name: '厂家甲' };
const otherRoot = { id: 2, name: '厂家乙' };

function task(id = 77, extra = {}) {
  return {
    id, group_id: `aftersales-${id}`, group_kind: 'AFTERSALES',
    is_workorder: true, grouped: true, child_count: 2,
    state: 'READ', need_action: true, unread_count: 0, action_pending_count: 2,
    domain: 'AFTERSALE', root_organization: ownRoot,
    title: '用户换机已完成，旧机处置已满足，待归因结案',
    link: `/pages/aftersale/detail/detail?application_id=${id}`,
    ...extra
  };
}

function detailPayload(status, extra = {}) {
  return {
    application: { id: 77, status, execution_stage: status },
    actions: { can_factory_close: status !== 'CLOSED' },
    ...extra
  };
}

function setup() {
  let app, taskPage, detailPage;
  let route = 'pages/personal/task_list/task_list';
  const pending = [], calls = [], toasts = [], warnings = [], storage = new Map();
  const intervals = new Map();
  let intervalId = 0, throwTaskRequest = false;
  const wx = {
    request(request) {
      calls.push({ method: request.method || 'GET', url: request.url });
      if (throwTaskRequest && request.url.includes('/workflow/task/')) {
        throw new Error('task transport initialization failed');
      }
      pending.push(request);
      return { abort() {} };
    },
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    setTabBarBadge() {}, removeTabBarBadge() {},
    showToast: options => toasts.push(plain(options)),
    showModal() {}, switchTab() {}, navigateTo() {},
    login: ({ success }) => success({ code: 'wx-login-code' })
  };
  const quietConsole = { ...console, warn: (...args) => warnings.push(args.map(String)) };
  vm.runInNewContext(read('app.js'), {
    App: value => { app = value; }, wx,
    getCurrentPages: () => [{ route }], console: quietConsole,
    setInterval: fn => { const id = ++intervalId; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id)
  });
  app.globalData.apiBase = '/api';
  app.globalData.access_token = 'test-access-token';
  app.applyUserPayload({
    openid: 'factory-aftersales-user', organization_id: ownRoot.id,
    role: 'factory_aftersales', factory_root_id: ownRoot.id,
    factory_root_name: ownRoot.name
  });

  const loadPage = file => {
    let page;
    vm.runInNewContext(read(file), {
      getApp: () => app, Page: value => { page = value; },
      wx, console: quietConsole
    });
    page.data = plain(page.data);
    page.setData = (values, callback) => {
      Object.assign(page.data, plain(values));
      if (callback) callback();
    };
    return page;
  };
  taskPage = loadPage('pages/personal/task_list/task_list.js');
  detailPage = loadPage('pages/aftersale/detail/detail.js');
  taskPage.onLoad();

  function take(suffix) {
    const index = pending.findIndex(request => request.url.endsWith(suffix));
    assert.notEqual(index, -1, `Missing actual wx.request: ${suffix}`);
    return pending.splice(index, 1)[0];
  }
  function respond(request, data, statusCode = 200, code = 0, msg = '') {
    request.success({ statusCode, data: { code, msg, data } });
    if (request.complete) request.complete();
  }
  function finishTasks(items, {
    revision = 'before', actionPending = 2, attention = actionPending,
    hasMore = false, cursor = ''
  } = {}) {
    respond(take('/workflow/task/list/'), {
      items, group_count: items.length, revision,
      has_more: hasMore, next_cursor: cursor || null, updates_available: false
    });
    respond(take('/workflow/task/summary/'), {
      unread_count: 0, action_pending_count: actionPending,
      attention_count: attention, revision
    });
  }
  function seed(items = [task()], options) {
    taskPage.onShow();
    finishTasks(items, options);
    calls.length = 0;
  }
  async function enterDetail() {
    taskPage.onHide();
    route = 'pages/aftersale/detail/detail';
    detailPage.onLoad({ application_id: '77' });
    respond(take('/lifecycle/after-sales/applications/77/'), detailPayload('PROCESSING'));
    await tick();
    calls.length = 0;
  }
  async function beginAction(endpoint = '/factory-close/') {
    const promise = detailPage.runAction({
      endpoint, data: { solution_note: '已解决' }, success: '售后操作已完成'
    });
    await tick();
    return { promise, request: take(`/lifecycle/after-sales/applications/77${endpoint}`) };
  }
  function returnToTasks() {
    route = 'pages/personal/task_list/task_list';
    taskPage.onShow();
  }
  return {
    app, wx, taskPage, detailPage, pending, calls, toasts, warnings,
    take, respond, finishTasks, seed, enterDetail, beginAction, returnToTasks,
    throwTaskRequests(value) { throwTaskRequest = value; }
  };
}

test('successful close refreshes real app list and summary before returning to the cached task page', async () => {
  const s = setup();
  s.seed();
  await s.enterDetail();
  const action = await s.beginAction();
  s.respond(action.request, { application_id: 77, status: 'CLOSED' });
  await tick();
  s.respond(s.take('/lifecycle/after-sales/applications/77/'), detailPayload('CLOSED'));
  await action.promise;
  s.finishTasks([task(77, {
    state: 'DONE', need_action: false, action_pending_count: 0,
    title: '售后服务已结案'
  })], { revision: 'closed', actionPending: 0 });

  s.returnToTasks();
  s.respond(s.take('/workflow/task/summary/'), {
    unread_count: 0, action_pending_count: 0, attention_count: 0, revision: 'closed'
  });
  assert.equal(s.detailPage.data.detail.application.status, 'CLOSED');
  assert.equal(s.taskPage.data.taskList[0].stateText, '已完成');
  assert.equal(s.taskPage.data.taskList[0].title, '售后服务已结案');
  assert.equal(s.taskPage.data.actionPendingCount, 0);
  assert.equal(s.pending.length, 0);
});

test('successful non-close action synchronizes the next server phase without marking it completed', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const action = await s.beginAction('/triage/');
  s.respond(action.request, { application_id: 77 });
  await tick();
  s.respond(s.take('/lifecycle/after-sales/applications/77/'), detailPayload('REPAIRING'));
  await action.promise;
  s.finishTasks([task(77, { title: '维修任务已派出，待现场处理' })], {
    revision: 'repairing', actionPending: 2
  });
  assert.equal(s.taskPage.data.taskList[0].title, '维修任务已派出，待现场处理');
  assert.equal(s.taskPage.data.taskList[0].stateText, '待处理');
  assert.equal(s.taskPage.data.taskList[0].need_action, true);
  assert.equal(s.taskPage.data.actionPendingCount, 2);
});

test('closing the application preserves independent old-device follow-up returned by the server', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const action = await s.beginAction();
  s.respond(action.request, { application_id: 77, status: 'CLOSED' });
  await tick();
  s.respond(s.take('/lifecycle/after-sales/applications/77/'), detailPayload('CLOSED'));
  await action.promise;
  const followUp = task(88, { title: '旧机返厂待收货', group_id: 'old-device-88' });
  s.finishTasks([
    task(77, { state: 'DONE', need_action: false, action_pending_count: 0 }), followUp
  ], { revision: 'closed-with-follow-up', actionPending: 2 });
  assert.equal(s.taskPage.data.taskList[0].stateText, '已完成');
  assert.equal(s.taskPage.data.taskList[1].stateText, '待处理');
  assert.equal(s.taskPage.data.taskList[1].need_action, true);
  assert.equal(s.taskPage.data.actionPendingCount, 2);
});

test('business rejection does not refresh tasks or locally finish the still-pending action', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const before = plain(s.app.globalData.taskList);
  const action = await s.beginAction();
  s.respond(action.request, {}, 409, 1, '当前条件不满足结案');
  await action.promise;
  assert.equal(s.calls.some(call => call.url.includes('/workflow/task/')), false);
  assert.deepEqual(plain(s.app.globalData.taskList), before);
  assert.equal(s.detailPage.data.detail.application.status, 'PROCESSING');
  assert.equal(s.detailPage.data.submitting, false);
  assert.deepEqual(s.toasts.map(toast => [toast.title, toast.icon]), [['当前条件不满足结案', 'none']]);
});

test('business transport failure does not pretend success or refresh the task list', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const action = await s.beginAction();
  action.request.fail({ errMsg: 'request:fail timeout' });
  await action.promise;
  assert.equal(s.calls.some(call => call.url.includes('/workflow/task/')), false);
  assert.equal(s.taskPage.data.taskList[0].stateText, '待处理');
  assert.equal(s.detailPage.data.detail.application.status, 'PROCESSING');
  assert.deepEqual(s.toasts.map(toast => toast.icon), ['none']);
});

test('task refresh network failure keeps successful close and offers the existing list retry', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const action = await s.beginAction();
  s.respond(action.request, { application_id: 77, status: 'CLOSED' });
  await tick();
  s.take('/workflow/task/list/').fail({ errMsg: 'request:fail timeout' });
  const summary = s.take('/workflow/task/summary/');
  if (summary.fail) summary.fail({ errMsg: 'request:fail timeout' });
  s.respond(s.take('/lifecycle/after-sales/applications/77/'), detailPayload('CLOSED'));
  await action.promise;
  assert.equal(s.detailPage.data.detail.application.status, 'CLOSED');
  assert.equal(s.detailPage.data.submitting, false);
  assert.deepEqual(s.toasts.map(toast => toast.icon), ['success']);
  assert.match(s.taskPage.data.loadError, /网络/);
  assert.equal(s.taskPage.data.taskList[0].stateText, '待处理'); // no fabricated DONE

  s.taskPage.retryTaskList();
  s.finishTasks([task(77, { state: 'DONE', need_action: false, action_pending_count: 0 })], {
    revision: 'closed', actionPending: 0
  });
  assert.equal(s.taskPage.data.taskList[0].stateText, '已完成');
  assert.equal(s.taskPage.data.loadError, '');
});

test('synchronous task transport exception cannot turn the committed action into a failure toast', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const action = await s.beginAction();
  s.throwTaskRequests(true);
  s.respond(action.request, { application_id: 77, status: 'CLOSED' });
  await tick();
  s.respond(s.take('/lifecycle/after-sales/applications/77/'), detailPayload('CLOSED'));
  await action.promise;
  assert.equal(s.detailPage.data.detail.application.status, 'CLOSED');
  assert.equal(s.detailPage.data.submitting, false);
  assert.deepEqual(s.toasts.map(toast => toast.icon), ['success']);
  assert.equal(s.warnings.length, 1);
  assert.equal(s.taskPage.data.taskList[0].need_action, true);

  s.throwTaskRequests(false);
  s.taskPage.refreshTaskList();
  s.finishTasks([task(77, { state: 'DONE', need_action: false, action_pending_count: 0 })], {
    revision: 'closed', actionPending: 0
  });
  assert.equal(s.taskPage.data.taskList[0].stateText, '已完成');
});

test('detail reload failure after a successful action does not suppress the independent task refresh', async () => {
  const s = setup(); s.seed(); await s.enterDetail();
  const action = await s.beginAction();
  s.respond(action.request, { application_id: 77, status: 'CLOSED' });
  await tick();
  s.respond(s.take('/lifecycle/after-sales/applications/77/'), {}, 503, 1, '详情暂时无法读取');
  await action.promise;
  s.finishTasks([task(77, { state: 'DONE', need_action: false, action_pending_count: 0 })], {
    revision: 'closed', actionPending: 0
  });
  assert.equal(s.taskPage.data.taskList[0].stateText, '已完成');
  assert.equal(s.detailPage.data.error, '详情暂时无法读取');
  assert.deepEqual(s.toasts.map(toast => toast.icon), ['success']);
});

test('ordinary background and foreground without an action preserve loaded pages, cursor and chosen root', () => {
  const s = setup();
  s.seed([task()], { hasMore: true, cursor: 'second-page', revision: 'same' });
  s.taskPage.loadMore();
  s.respond(s.take('/workflow/task/list/'), {
    items: [task(88, { root_organization: otherRoot })], group_count: 3,
    revision: 'same', has_more: true, next_cursor: 'third-page', updates_available: false
  });
  assert.equal(s.app.selectOperationRoot(otherRoot.id), true);
  const before = plain({
    cards: s.app.globalData.taskList, cursor: s.app.globalData.taskNextCursor,
    generation: s.app.globalData.taskListGeneration, root: s.app.globalData.operationRoot
  });
  s.calls.length = 0;
  s.taskPage.onHide(); s.app.onHide(); s.app.onShow(); s.returnToTasks();
  for (const request of s.pending.splice(0)) {
    assert.equal(request.url.endsWith('/workflow/task/summary/'), true);
    s.respond(request, { unread_count: 0, action_pending_count: 2, attention_count: 2, revision: 'same' });
  }
  assert.equal(s.calls.some(call => call.url.endsWith('/workflow/task/list/')), false);
  assert.deepEqual(plain({
    cards: s.app.globalData.taskList, cursor: s.app.globalData.taskNextCursor,
    generation: s.app.globalData.taskListGeneration, root: s.app.globalData.operationRoot
  }), before);
  s.app.onHide();
});
