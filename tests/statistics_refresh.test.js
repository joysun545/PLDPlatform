const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function environment(name) {
  let page;
  const requests = [];
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: done => done(true), authHeader: () => ({}), reauthenticate() {}
  };
  const wx = {
    request: request => requests.push(request),
    setNavigationBarTitle() {}, stopPullDownRefresh() {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'pages', 'data_statistics', name, `${name}.js`), 'utf8'), {
    getApp: () => app, Page: value => { page = value; }, wx, setTimeout, clearTimeout
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = values => Object.assign(page.data, values);
  const respond = data => {
    const request = requests[requests.length - 1];
    request.success({ statusCode: 200, data: { code: 0, data } });
    request.complete();
  };
  return { page, requests, app, respond };
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
      display_scope: 'TOTAL', show_organization_inventory: true,
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
