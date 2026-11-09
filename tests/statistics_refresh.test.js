const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function environment(name) {
  let page;
  const requests = [];
  const navigations = [];
  const timers = new Map();
  let nextTimer = 0;
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api', openid: 'a', access_token: 'token-a', organization_id: 1 },
    ensureLogin: done => done(true), authHeader: () => ({}), reauthenticate() { this.reauthentications++; }, reauthentications: 0
  };
  const wx = {
    request: request => requests.push(request),
    navigateTo: ({ url }) => navigations.push(url),
    setNavigationBarTitle() {}, stopPullDownRefresh() {}
  };
  const filename = path.join(__dirname, '..', 'pages', 'data_statistics', name, `${name}.js`);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    getApp: () => app, Page: value => { page = value; }, wx, require: createRequire(filename),
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id)
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = values => Object.assign(page.data, values);
  const reply = (index, statusCode, data) => {
    const request = requests[index];
    request.success({ statusCode, data });
    if (request.complete) request.complete();
  };
  const respond = (data, index = requests.length - 1) => reply(index, 200, { code: 0, data });
  return { page, requests, app, respond, reply, navigations, timers };
}

function dashboard(inventory) {
  return { sections: [{ domain: 'FLOW', metrics: { inventory_device_count: inventory } }] };
}

function merchantDashboard(received, chain, organization) {
  return { sections: [{ domain: 'FLOW', metrics: {
    received_device_count: received,
    channel_inventory_device_count: chain,
    organization_inventory_device_count: organization,
    inventory_device_count: chain
  } }] };
}

function flow(inventory, descendantInventory = 0) {
  return {
    responsibility_tree: {
      node_id: 'merchant18', node_type: 'ORGANIZATION', name: '商家02',
      display_scope: 'TOTAL', show_organization_inventory: true, has_subordinate_organizations: true,
      own: { market_inventory_device_count: inventory },
      total: { market_inventory_device_count: inventory + descendantInventory },
      children: [{
        node_id: 'child', node_type: 'ORGANIZATION', name: '下级商家',
        display_scope: 'TOTAL', show_organization_inventory: true,
        own: { market_inventory_device_count: descendantInventory },
        total: { market_inventory_device_count: descendantInventory }, children: []
      }]
    }
  };
}

test('dashboard refetches on return and displays newly received inventory', () => {
  const { page, requests, respond } = environment('dashboard');
  if (page.onLoad) page.onLoad({});
  page.onShow();
  assert.equal(requests.length, 1, 'initial lifecycle should issue one request');
  respond(dashboard(0));
  assert.equal(page.data.sections[0].metrics[0].value, 0);
  page.onShow();
  assert.equal(requests.length, 2, 'returning after receipt must fetch fresh values');
  respond(dashboard(50));
  assert.equal(page.data.sections[0].metrics[0].value, 50);
});

test('dashboard coalesces concurrent loads and allows retry after login failure', () => {
  const { page, requests, app, respond } = environment('dashboard');
  app.ensureLogin = done => done(false);
  page.onShow();
  assert.equal(requests.length, 0);
  app.ensureLogin = done => done(true);
  page.onShow();
  page.onShow();
  assert.equal(requests.length, 1);
  respond(dashboard(12));
  page.onShow();
  assert.equal(requests.length, 2);
});

test('merchant dashboard distinguishes received, chain and organization inventory', () => {
  const { page, respond } = environment('dashboard');
  page.onShow();
  respond(merchantDashboard(50, 49, 43));
  assert.deepEqual(
    Array.from(page.data.sections[0].metrics, row => `${row.name}:${row.value}`),
    ['入库设备:50', '链路库存:49', '组织库存:43']
  );
});

test('factory sales dashboard labels active order-plan flow stages', () => {
  const { page, respond } = environment('dashboard');
  page.onShow();
  respond({ sections: [{ domain: 'FLOW', metrics: {
    order_plan_count: 50,
    order_plan_pending_production_device_count: 3,
    order_plan_produced_pending_outbound_device_count: 4,
    order_plan_outbounded_pending_ship_device_count: 2,
    order_plan_shipped_device_count: 18,
    order_plan_shipped_pending_accounting_device_count: 11,
    order_plan_accounted_device_count: 7,
    channel_inventory_device_count: 6
  } }] });
  assert.deepEqual(
    Array.from(page.data.sections[0].metrics, row => `${row.name}:${row.value}`),
    [
      '有效计划设备:50',
      '计划未完成生产:3',
      '生产完成待出库:4',
      '已出库待确认发货:2',
      '累计已发货:18',
      '发货待下账:11',
      '物权已转移:7',
      '链路库存:6'
    ]
  );
});

test('flow domain refetches stock on return and retains expanded organizations', () => {
  const { page, requests, respond } = environment('domain');
  page.onLoad({ domain: 'FLOW' });
  page.onShow();
  assert.equal(requests.length, 1);
  respond(flow(0));
  page.toggleTreeNode({ currentTarget: { dataset: { id: 'merchant18' } } });
  assert.equal(page.data.treeNodes.length, 2);
  page.onShow();
  page.onShow();
  assert.equal(requests.length, 2);
  respond(flow(43, 6));
  assert.equal(page.data.treeNodes[0].ownInventory, 43);
  assert.equal(page.data.treeNodes[0].primaryInventory, 49);
  assert.equal(page.data.treeNodes[0].totalInventory, 49);
  assert.equal(page.data.treeNodes[0].inventoryLabel, '链路库存');
  assert.equal(page.data.treeNodes[0].showOrganizationInventory, true);
  assert.equal(page.data.treeNodes[0].expanded, true);
  assert.equal(page.data.treeNodes.length, 2);
});

test('invalid domain never requests an endpoint and network failure permits retry', () => {
  const invalid = environment('domain');
  invalid.page.onLoad({ domain: 'INVALID' });
  invalid.page.onShow();
  assert.equal(invalid.requests.length, 0);
  const { page, requests, respond } = environment('domain');
  page.onLoad({ domain: 'FLOW' });
  page.onShow();
  requests[0].fail();
  requests[0].complete();
  page.onShow();
  assert.equal(requests.length, 2);
  respond(flow(38));
  assert.equal(page.data.treeNodes[0].ownInventory, 38);
});

const denial = { code: 1, error_code: 'STATISTICS_ACCESS_DENIED', msg: '当前岗位无权查看' };
const tap = (dataset) => ({ currentTarget: { dataset } });

test('dashboard retains same-context data on a network error and clears it on access denial', () => {
  const { page, requests, respond, reply, navigations } = environment('dashboard');
  page.onShow();
  respond({ ...dashboard(5), identity: { organization_name: '厂一', role_name: '物料库管' }, generated_at: '2026-11-08T10:00:00' });
  page.openDomain(tap({ domain: 'FLOW' }));
  assert.equal(navigations.length, 1);
  page.onShow();
  page.openDomain(tap({ domain: 'FLOW' }));
  assert.equal(navigations.length, 1, 'a pending refresh must hide and disable old cards');
  requests[1].fail();
  requests[1].complete();
  assert.equal(page.data.sections.length, 1);
  page.onShow();
  reply(2, 200, denial);
  assert.equal(page.data.sections.length, 0);
  assert.equal(page.data.organizationName, '');
  assert.equal(page.data.roleName, '');
  assert.equal(page.data.generatedAt, '');
  assert.equal(page.data.error, denial.msg);
  page.openDomain(tap({ domain: 'FLOW' }));
  assert.equal(navigations.length, 1);
});

test('dashboard ignores old responses after root change and clears on 401 or failed login', () => {
  const { page, app, respond, reply } = environment('dashboard');
  app.globalData.operationRoot = { id: 1 };
  page.onShow();
  respond(dashboard(1));
  page.onShow();
  app.globalData.operationRoot = { id: 2 };
  page.onShow();
  assert.equal(page.data.sections.length, 0);
  respond(dashboard(2), 2);
  reply(1, 401, {});
  assert.equal(page.data.sections[0].metrics[0].value, 2);
  assert.equal(app.reauthentications, 0);
  page.onShow();
  reply(3, 401, {});
  assert.equal(page.data.sections.length, 0);
  assert.equal(app.reauthentications, 1);
  page.onShow();
  respond(dashboard(3));
  app.ensureLogin = done => done(false);
  page.onShow();
  assert.equal(page.data.sections.length, 0);
  assert.match(page.data.error, /登录状态无效/);
});

function material(canView) {
  return {
    can_view_warehouse_lots: canView,
    identity: { role_code: 'factory_material_stock' },
    metrics: { material_covered_device_count: 5 },
    charts: {
      supplier_distribution: [{ supplier_name: '供应商一', device_count: 4 }],
      material_distribution: [{ material_name: '控制器', device_count: 5 }]
    }
  };
}

test('material history follows explicit capability, cancels search and suppresses old page results when revoked', () => {
  const { page, app, requests, respond, timers } = environment('domain');
  page.onLoad({ domain: 'MATERIAL' });
  page.onShow();
  respond(material(undefined));
  assert.equal(page.data.showWarehouseLots, false, 'the local or returned role name grants no list capability');
  assert.equal(requests.length, 1);
  app.globalData.role = 'server-authorized-role';
  page.onShow();
  respond(material(true));
  assert.equal(page.data.showWarehouseLots, true);
  assert.match(requests[2].url, /material-warehouse-lots\/$/);
  assert.equal(page.data.charts[0].rows[0].label, '供应商一');
  assert.equal(page.data.charts[1].rows[0].label, '控制器');
  respond({ items: [{ id: 1 }], next_cursor: 'cursor' });
  page.moreWarehouseLots();
  assert.equal(requests[3].data.cursor, 'cursor');
  page.inputWarehouseQuery({ detail: { value: 'old supplier' } });
  assert.equal(timers.size, 1);
  page.onShow();
  respond(material(false));
  assert.equal(timers.size, 0);
  respond({ items: [{ id: 2 }], next_cursor: 'later' }, 3);
  assert.equal(page.data.showWarehouseLots, false);
  assert.equal(page.data.warehouseLots.length, 0);
  assert.equal(page.data.warehouseNextCursor, null);
  assert.equal(page.data.warehouseQuery, '');
  assert.equal(page.data.metrics[0].value, 5, 'authorized material summary remains');
});

test('a topical denial clears charts and the pending warehouse page cannot refill them', () => {
  const { page, respond, reply } = environment('domain');
  page.onLoad({ domain: 'MATERIAL' });
  page.onShow();
  respond(material(true));
  respond({ items: [{ id: 1 }], next_cursor: 'cursor' });
  page.moreWarehouseLots();
  page.onShow();
  reply(3, 403, {});
  respond({ items: [{ id: 2 }], next_cursor: 'stale' }, 2);
  assert.equal(page.data.metrics.length, 0);
  assert.equal(page.data.charts.length, 0);
  assert.equal(page.data.showWarehouseLots, false);
  assert.equal(page.data.warehouseLots.length, 0);
  assert.equal(page.data.warehouseNextCursor, null);
  assert.match(page.data.error, /无权/);
});

test('denial from a warehouse search wins over pending main and newer search responses', () => {
  const { page, requests, respond, reply } = environment('domain');
  page.onLoad({ domain: 'MATERIAL' });
  page.onShow();
  respond(material(true));
  respond({ items: [{ id: 1 }], next_cursor: 'cursor' });
  page.searchWarehouseLots();
  page.searchWarehouseLots();
  page.onShow();
  reply(2, 200, denial);
  respond(material(true), 4);
  respond({ items: [{ id: 2 }], next_cursor: 'stale' }, 3);
  assert.equal(page.data.error, denial.msg);
  assert.equal(page.data.metrics.length, 0);
  assert.equal(page.data.showWarehouseLots, false);
  assert.equal(page.data.warehouseLots.length, 0);
  assert.equal(page.data.warehouseLoading, false);
  page.searchWarehouseLots();
  assert.equal(requests.length, 5);
  page.onShow();
  respond(material(false));
  assert.equal(page.data.metrics.length, 1);
  assert.equal(page.data.error, '');
});

test('repair basis and expanded flow nodes cannot be used after a denied refresh', () => {
  const { page, requests, respond, reply, navigations } = environment('domain');
  page.onLoad({ domain: 'AFTERSALES' });
  page.onShow();
  respond({ can_view_repair_basis: true, repair_basis_scope: { title: '维修结算' }, metrics: { repair_basis_visits: 1 } });
  respond({ items: [{ application_id: 26 }], next_cursor: 26 });
  page.openRepairCase(tap({ id: 26 }));
  assert.equal(navigations.length, 1);
  page.moreRepairBasis();
  reply(2, 403, denial);
  page.openRepairCase(tap({ id: 26 }));
  page.moreRepairBasis();
  assert.equal(navigations.length, 1);
  assert.equal(requests.length, 3);
  assert.equal(page.data.basisRows.length, 0);
  assert.equal(page.data.basisNextCursor, null);
  assert.equal(page.data.repairBasisScopeTitle, '');

  const flowPage = environment('domain');
  flowPage.page.onLoad({ domain: 'FLOW' });
  flowPage.page.onShow();
  flowPage.respond(flow(5));
  flowPage.page.toggleTreeNode(tap({ id: 'merchant18' }));
  assert.equal(flowPage.page.data.treeNodes.length, 2);
  flowPage.page.onShow();
  flowPage.reply(1, 403, denial);
  flowPage.page.toggleTreeNode(tap({ id: 'merchant18' }));
  assert.equal(flowPage.page.data.treeNodes.length, 0);
  assert.equal(flowPage.page._allTreeNodes.length, 0);
});
