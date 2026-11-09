const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const own = { id: 1, name: '厂家甲' }, other = { id: 2, name: '厂家乙' };
const profile = (extra = {}) => ({
  openid: 'member-a', organization_id: 11, role: 'supplier_owner',
  factory_root_id: own.id, factory_root_name: own.name, ...extra
});
function row(id, extra = {}) {
  return { id, group_id: `group-${id}`, state: 'NEW', need_action: true,
    link: `/pages/sales/order_plan_detail/order_plan_detail?order_plan_id=${id}`,
    root_organization: own, title: `任务${id}`, ...extra };
}

function setup() {
  let app, page;
  const pending = [], intervals = new Map(), storage = new Map(), destinations = [], badges = [];
  let intervalId = 0;
  const wx = {
    request: request => { pending.push(request); return { abort() {} }; },
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    login: ({success}) => success({code: 'normal-login-code'}),
    setTabBarBadge: data => badges.push(data), removeTabBarBadge: data => badges.push(data),
    showToast() {}, showModal() {}, switchTab: ({url}) => destinations.push(url),
    navigateTo: ({url}) => destinations.push(url)
  };
  vm.runInNewContext(read('app.js'), {
    App: value => { app = value; }, wx, getCurrentPages: () => [],
    setInterval: fn => { const id = ++intervalId; intervals.set(id, fn); return id; },
    clearInterval: id => intervals.delete(id), console
  });
  app.autoRedirectIfLogged = () => {};
  app.globalData.apiBase = '/api';
  app.globalData.access_token = 'token-a';
  app.applyUserPayload(profile());
  vm.runInNewContext(read('pages/personal/task_list/task_list.js'), {
    getApp: () => app, Page: value => { page = value; }, wx, console
  });
  page.data = plain(page.data);
  page.setData = values => Object.assign(page.data, plain(values));
  page.onLoad();
  const request = suffix => {
    const index = pending.findIndex(item => item.url.endsWith(suffix));
    assert.notEqual(index, -1, suffix); return pending.splice(index, 1)[0];
  };
  const respond = (request, data, statusCode = 200, code = 0, msg = '') => {
    request.success({statusCode, data: {code, msg, data}});
    if (request.complete) request.complete();
  };
  const summary = (data = {}) => respond(request('/workflow/task/summary/'), {
    unread_count: 2, action_pending_count: 3, attention_count: 4, ...data
  });
  const list = (items, extra = {}) => respond(request('/workflow/task/list/'), {
    items, next_cursor: null, has_more: false, updates_available: false,
    group_count: items.length, unread_count: 2, ...extra
  });
  const first = (items, extra = {}) => {
    app.refreshTasks(); summary(); list(items, extra);
  };
  return { app, page, wx, pending, intervals, destinations, badges,
    request, respond, summary, list, first,
    tap(id) { page.openTask({currentTarget: {dataset: {id}}}); }
  };
}

test('display_state and complete business context reach the app cache and real page on every page and refresh', () => {
  const s = setup();
  const active = row(1, {state: 'DONE', need_action: false, group_kind: 'QUALITY_RECALL',
    display_state: '跟踪中', recall_context: {stage_summary: '本节点已交接，后续仍在处理'}});
  s.first([active], {has_more: true, next_cursor: 'opaque-page-two'});
  assert.equal(s.app.globalData.taskList[0].display_state, '跟踪中');
  assert.deepEqual(plain(s.app.globalData.taskList[0].recall_context), active.recall_context);
  assert.equal(s.page.data.taskList[0].stateText, '跟踪中');
  assert.equal(s.page.data.taskList[0].stateClass, 'stage');
  assert.equal(s.page.data.taskList[0].state, 'DONE');
  assert.equal(s.page.data.taskList[0].need_action, false);
  s.page.loadMore();
  s.list([row(2, {state: 'DONE', group_kind: 'QUALITY_RECALL', display_state: '本阶段待处理'})]);
  assert.equal(s.page.data.taskList[1].stateClass, 'stage');
  assert.equal(s.page.data.taskList[1].stateText, '本阶段待处理');
  s.page.refreshTaskList(); s.summary();
  s.list([{...active, display_state: '召回已完成'}]);
  assert.equal(s.page.data.taskList.length, 1);
  assert.equal(s.page.data.taskList[0].stateText, '召回已完成');
  assert.equal(s.app.globalData.taskCount, 4); // summary, never inferred from stage text
});

test('ordinary NEW READ DONE labels, actions and full-summary badges keep their existing meaning', () => {
  const s = setup();
  s.first([row(1), row(2, {state: 'READ', need_action: false}), row(3, {state: 'DONE', need_action: false})]);
  assert.deepEqual(s.page.data.taskList.map(item => [item.stateText, item.stateClass, item.need_action]),
    [['未读', 'new', true], ['已读', 'read', false], ['已完成', 'done', false]]);
  assert.equal(s.page.data.attentionCount, 4);
  assert.equal(s.page.data.unreadCount, 2);
  assert.equal(s.page.data.actionPendingCount, 3);
});

test('page two appends whole groups and same group_id is updated once without duplicating a card', () => {
  const s = setup();
  s.first(Array.from({length: 50}, (_, i) => row(i + 1)), {has_more: true, next_cursor: 'signed:next', group_count: 51});
  s.page.onReachBottom();
  const request = s.request('/workflow/task/list/');
  assert.deepEqual(plain(request.data), {limit: 50, cursor: 'signed:next'});
  s.page.loadMore(); assert.equal(s.pending.filter(item => item.url.endsWith('/task/list/')).length, 0);
  s.respond(request, {items: [row(50, {child_count: 7000, title: '完整大任务组'}), row(51)],
    has_more: false, next_cursor: null, group_count: 51, updates_available: false});
  assert.equal(s.page.data.loadedCount, 51);
  assert.equal(s.page.data.taskList[49].child_count, 7000);
  assert.equal(s.page.data.taskList[49].title, '完整大任务组');
  assert.equal(s.page.data.hasMore, false);
  s.page.onReachBottom(); assert.equal(s.pending.length, 0);
});

test('append network failure preserves cards and cursor and retries the same page', () => {
  const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'retry-same'});
  s.page.loadMore(); s.request('/workflow/task/list/').fail();
  assert.equal(s.page.data.taskList.length, 1);
  assert.match(s.page.data.loadError, /网络/);
  assert.equal(s.page.data.loadingMore, false);
  assert.equal(s.app.globalData.taskNextCursor, 'retry-same');
  s.page.retryTaskList();
  assert.equal(s.pending[0].data.cursor, 'retry-same');
  s.list([row(2)]);
  assert.equal(s.page.data.taskList.length, 2); assert.equal(s.page.data.loadError, '');
});

test('first-page failure ends loading and summary notifications do not erase its retry state', () => {
  const s = setup(); s.page.onShow();
  s.request('/workflow/task/list/').fail();
  s.summary();
  assert.equal(s.page.data.loading, false); assert.match(s.page.data.loadError, /网络/);
  s.page.retryTaskList(); s.summary(); s.list([row(3)]);
  assert.equal(s.page.data.taskList[0].id, 3); assert.equal(s.page.data.loadError, '');
});

for (const status of [400, 409]) {
  test(`cursor ${status} refresh_required stops append and offers an explicit first-page refresh`, () => {
    const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'expired'});
    s.page.loadMore();
    s.respond(s.request('/workflow/task/list/'), {refresh_required: true}, status, 1, '任务已更新，请刷新');
    assert.equal(s.page.data.taskList[0].id, 1);
    assert.equal(s.app.globalData.taskNextCursor, '');
    assert.equal(s.page.data.hasMore, false); assert.equal(s.page.data.hasUpdates, true);
    s.page.loadMore(); assert.equal(s.pending.length, 0);
    s.page.retryTaskList(); s.summary();
    const first = s.request('/workflow/task/list/'); assert.equal(first.data.cursor, undefined);
    s.respond(first, {items: [row(4)], has_more: false, next_cursor: null});
    assert.deepEqual(s.page.data.taskList.map(item => item.id), [4]);
  });
}

test('summary-only 15-second polling and foreground restart preserve loaded pages and selected root', () => {
  const s = setup();
  s.first([row(1, {root_organization: other})], {has_more: true, next_cursor: 'second'});
  s.page.loadMore(); s.list([row(2)]);
  assert.equal(s.app.selectOperationRoot(other.id), true);
  s.app.startTaskPolling();
  assert.equal(s.pending.filter(item => item.url.endsWith('/task/list/')).length, 0);
  s.summary();
  [...s.intervals.values()][0](); s.summary({attention_count: 9});
  assert.equal(s.page.data.taskList.length, 2); assert.equal(s.page.data.hasUpdates, true);
  assert.equal(s.app.globalData.operationRoot.id, other.id);
  s.app.stopTaskPolling(); s.app.startTaskPolling(); s.summary();
  assert.equal(s.page.data.taskList.length, 2);
  assert.equal(s.pending.filter(item => item.url.endsWith('/task/list/')).length, 0);
});

test('task-page hide and show preserve two loaded pages and cursor while first entry still loads page one', () => {
  const cached = setup(); cached.first([row(90)]);
  cached.page.onShow(); // this page instance must refresh a cache from elsewhere
  assert.equal(cached.pending.filter(request => request.url.endsWith('/task/list/')).length, 1);
  cached.summary(); cached.list([row(91)]);
  assert.deepEqual(cached.page.data.taskList.map(item => item.id), [91]);
  const s = setup();
  s.page.onShow();
  assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 1);
  s.summary(); s.list([row(1)], {has_more: true, next_cursor: 'page-two', revision: 'current'});
  s.page.loadMore(); s.list([row(2)], {has_more: true, next_cursor: 'page-three', revision: 'current'});
  const generation = s.app.globalData.taskListGeneration;
  s.page.onHide(); s.page.onShow();
  assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 0);
  s.summary({revision: 'current'});
  assert.deepEqual(s.page.data.taskList.map(item => item.id), [1, 2]);
  assert.equal(s.app.globalData.taskNextCursor, 'page-three');
  assert.equal(s.app.globalData.taskListGeneration, generation);
  s.page.loadMore(); assert.equal(s.request('/workflow/task/list/').data.cursor, 'page-three');
  s.page.onHide(); s.page.onShow(); // an in-flight next page is retained too
  assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 0);
  assert.equal(s.app.globalData.taskListGeneration, generation);
});

test('list updates_available is a notice, not a forced first-page replacement', () => {
  const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'more'});
  s.page.loadMore(); s.list([row(2)], {updates_available: true});
  assert.equal(s.page.data.taskList.length, 2); assert.equal(s.page.data.hasUpdates, true);
  assert.equal(s.pending.length, 0);
});

test('a new opaque revision with unchanged summary counts signals updates without truncating pages', () => {
  const s = setup();
  s.first([row(1)], {revision: 'revision-a', has_more: true, next_cursor: 'next'});
  s.page.loadMore(); s.list([row(2)], {revision: 'revision-a'});
  s.app.refreshTasks({summaryOnly: true}); s.summary({revision: 'revision-b'});
  assert.equal(s.page.data.hasUpdates, true);
  assert.equal(s.page.data.taskList.length, 2);
  assert.equal(s.app.globalData.taskListRevision, 'revision-a');
  s.page.refreshTaskList(); s.summary({revision: 'revision-b'}); s.list([row(3)], {revision: 'revision-b'});
  assert.equal(s.page.data.hasUpdates, false);
  assert.equal(s.app.globalData.taskListRevision, 'revision-b');
});

test('a summary issued for an older list version cannot mark the freshly replaced page stale', () => {
  const s = setup(); s.first([row(1)], {revision: 'revision-a'});
  s.app.refreshTaskSummary(); const oldSummary = s.request('/workflow/task/summary/');
  s.app.getTaskList(); s.list([row(2)], {revision: 'revision-b'});
  s.respond(oldSummary, {revision: 'revision-a', unread_count: 2, action_pending_count: 3, attention_count: 4});
  assert.equal(s.page.data.hasUpdates, false);
  assert.equal(s.app.globalData.taskListRevision, 'revision-b');
});

test('a same-generation summary for the replaced revision cannot overwrite badges, while a matching one can', () => {
  const s = setup(); s.first([row(1)], {revision: 'revision-a'});
  s.page.refreshTaskList(); const oldSnapshot = s.request('/workflow/task/summary/');
  s.list([row(2)], {revision: 'revision-b'});
  s.respond(oldSnapshot, {revision: 'revision-a', unread_count: 99, action_pending_count: 99, attention_count: 99});
  assert.equal(s.page.data.attentionCount, 4);
  assert.equal(s.page.data.unreadCount, 2);
  assert.equal(s.page.data.hasUpdates, false);
  s.page.refreshTaskList(); const currentSnapshot = s.request('/workflow/task/summary/');
  s.list([row(3)], {revision: 'revision-c'});
  s.respond(currentSnapshot, {revision: 'revision-c', unread_count: 5, action_pending_count: 6, attention_count: 7});
  assert.equal(s.page.data.attentionCount, 7);
  assert.equal(s.page.data.hasUpdates, false);
});

test('an explicit refresh supersedes an append and old success or failure cannot overwrite the new page', () => {
  const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'old-next'});
  s.page.loadMore(); const old = s.request('/workflow/task/list/');
  s.page.refreshTaskList(); s.summary(); s.list([row(9)]);
  s.respond(old, {items: [row(2)], has_more: true, next_cursor: 'old-third'});
  old.fail();
  assert.deepEqual(s.page.data.taskList.map(item => item.id), [9]);
  assert.equal(s.page.data.loadError, ''); assert.equal(s.app.globalData.taskNextCursor, '');
});

test('a delayed same-account summary cannot restore pre-action badge counts', () => {
  const s = setup(); s.app.refreshTaskSummary(); const old = s.request('/workflow/task/summary/');
  s.app.refreshTaskSummary(); s.summary({unread_count: 1, action_pending_count: 0, attention_count: 1});
  s.respond(old, {unread_count: 0, action_pending_count: 0, attention_count: 0});
  assert.equal(s.app.globalData.taskCount, 1);
  assert.equal(s.app.globalData.taskUnreadCount, 1);
});

test('account change immediately clears old cards and cursor and discards delayed old list and summary', () => {
  const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'a-cursor'});
  s.page.loadMore(); const oldList = s.request('/workflow/task/list/');
  s.app.refreshTaskSummary(); const oldSummary = s.request('/workflow/task/summary/');
  s.app.globalData.access_token = 'token-b';
  s.app.applyUserPayload(profile({openid: 'member-b', organization_id: 12}));
  assert.equal(s.page.data.taskList.length, 0); assert.equal(s.app.globalData.taskNextCursor, '');
  s.respond(oldList, {items: [row(2)], next_cursor: 'wrong', has_more: true});
  s.respond(oldSummary, {unread_count: 99, attention_count: 99});
  assert.equal(s.page.data.taskList.length, 0); assert.equal(s.page.data.attentionCount, 0);
  s.first([row(7)]); assert.equal(s.page.data.taskList[0].id, 7);
});

test('same-account token or effective identity range change invalidates an old page', () => {
  for (const change of ['token', 'identity']) {
    const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'old'});
    s.page.loadMore(); const old = s.request('/workflow/task/list/');
    if (change === 'token') s.app.globalData.access_token = 'renewed-token';
    s.app.applyUserPayload(profile(change === 'identity' ? {organization_id: 13, role: 'supplier_sales'} : {}));
    assert.equal(s.page.data.taskList.length, 0);
    s.respond(old, {items: [row(2)]}); assert.equal(s.page.data.taskList.length, 0);
  }
});

test('manual operation-root selection neither resets a valid cursor nor changes the inbox query', () => {
  const s = setup(); s.first([row(1, {root_organization: other})], {has_more: true, next_cursor: 'same-query'});
  s.page.loadMore(); const request = s.request('/workflow/task/list/');
  s.app.selectOperationRoot(other.id);
  s.respond(request, {items: [row(2)], has_more: false, next_cursor: null});
  assert.equal(s.page.data.taskList.length, 2);
  assert.deepEqual(plain(request.data), {limit: 50, cursor: 'same-query'});
  assert.equal(s.app.globalData.operationRoot.id, other.id);
});

test('summary polling initializes the current identity inbox once after scope reset and preserves its later pages', () => {
  const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'old-next'});
  s.page.loadMore(); s.list([row(2)]);
  s.app.applyUserPayload(profile({organization_id: 13, role: 'supplier_sales'}));
  assert.equal(s.page.data.taskList.length, 0);
  s.app.refreshTasks({summaryOnly: true});
  assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 1);
  s.app.refreshTasks({summaryOnly: true});
  assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 1);
  s.list([row(8)], {has_more: true, next_cursor: 'current-next'});
  s.page.loadMore(); s.list([row(9)]);
  s.app.refreshTasks({summaryOnly: true});
  assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 0);
  assert.deepEqual(s.page.data.taskList.map(item => item.id), [8, 9]);
});

test('permission denial and reauthentication clear task cards, cursor and badges', () => {
  for (const status of [401, 403]) {
    const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'private'});
    s.page.loadMore(); s.respond(s.request('/workflow/task/list/'), {}, status, status, '身份失效');
    assert.equal(s.page.data.taskList.length, 0); assert.equal(s.page.data.attentionCount, 0);
    assert.equal(s.app.globalData.taskNextCursor, ''); assert.equal(s.page.data.loadingMore, false);
  }
});

test('opening a current task preserves the established root switch and refreshes page one after processing', () => {
  const s = setup(); s.first([row(1)], {has_more: true, next_cursor: 'old'});
  s.page.loadMore(); const oldAppend = s.request('/workflow/task/list/');
  s.tap(1);
  s.respond(s.request('/workflow/task/open/'), {root_organization: other});
  assert.equal(s.app.globalData.operationRoot.id, other.id);
  assert.equal(s.destinations.length, 1);
  s.summary(); s.list([row(1, {state: 'DONE', need_action: false})]);
  s.respond(oldAppend, {items: [row(2)], has_more: true, next_cursor: 'stale'});
  assert.equal(s.page.data.taskList.length, 1); assert.equal(s.page.data.taskList[0].state, 'DONE');
});

test('unloaded or replaced task-page context cannot navigate from an old open callback', () => {
  for (const change of ['unload', 'account', 'refresh']) {
    const s = setup(); s.first([row(1)]); s.tap(1);
    const old = s.request('/workflow/task/open/');
    if (change === 'unload') s.page.onUnload();
    if (change === 'account') {
      s.app.globalData.access_token = 'b'; s.app.applyUserPayload(profile({openid: 'b', organization_id: 12}));
    }
    if (change === 'refresh') s.page.refreshTaskList();
    s.respond(old, {root_organization: other});
    assert.equal(s.destinations.length, 0, change);
    assert.equal(s.app.globalData.operationRoot.id, own.id, change);
  }
});

test('a late login callback cannot refresh after unload or supersede a newer page-show request', () => {
  for (const change of ['unload', 'hide', 'new-show']) {
    const s = setup(), callbacks = [];
    s.app.ensureLogin = callback => callbacks.push(callback);
    s.page.onShow();
    if (change === 'unload') s.page.onUnload();
    if (change === 'hide') s.page.onHide();
    if (change === 'new-show') s.page.onShow();
    callbacks[0](true);
    assert.equal(s.pending.length, 0, change);
    if (change === 'new-show') {
      callbacks[1](true);
      assert.equal(s.pending.filter(request => request.url.endsWith('/task/list/')).length, 1);
    }
  }
});

test('an open permission denial releases the old opening indicator before a later legal task can open', () => {
  const s = setup(); s.first([row(1)]); s.tap(1);
  s.respond(s.request('/workflow/task/open/'), {}, 403, 403, '当前无权打开');
  assert.equal(s.page.data.openingId, null);
  assert.equal(s.page.data.taskList.length, 0);
  s.first([row(2)]); s.tap(2);
  assert.equal(s.request('/workflow/task/open/').data.usertask_id, 2);
});

test('an older actionable task and a very large group remain usable exactly as returned by the server', () => {
  const s = setup();
  s.first([row(1, {cursor_time: '2020-01-01', state: 'READ', need_action: true, child_count: 10001}),
    row(2, {state: 'DONE', need_action: false, group_kind: 'QUALITY_RECALL', display_state: '跟踪中'})]);
  assert.equal(s.page.data.taskList[0].child_count, 10001);
  assert.equal(s.page.data.taskList[0].need_action, true);
  s.tap(1); assert.equal(s.request('/workflow/task/open/').data.usertask_id, 1);
  assert.equal(s.page.data.taskList[1].need_action, false);
});

test('page controls expose refresh retry and load-more while stage styles stay independent of completed cards', () => {
  const wxml = read('pages/personal/task_list/task_list.wxml');
  const css = read('pages/personal/task_list/task_list.wxss');
  for (const action of ['refreshTaskList', 'retryTaskList', 'loadMore']) assert.match(wxml, new RegExp(`bindtap="${action}"`));
  assert.match(wxml, /任务有更新，刷新查看/); assert.match(wxml, /本次列表已加载完/);
  assert.match(css, /\.task-card\.stage\s*\{[^}]*opacity:\s*1;/);
  assert.match(css, /\.state\.stage\s*\{/); assert.match(css, /\.task-card\.done\s*\{[^}]*opacity:\s*0\.78/);
});
