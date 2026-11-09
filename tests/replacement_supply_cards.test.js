const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const order = 'pages/sales/order_plan_detail/order_plan_detail';
const transfer = 'pages/stock/goods_transfer_detail/goods_transfer_detail';
const aftersales = 'pages/aftersale/detail/detail';
const caseLink = '/pages/aftersale/detail/detail?application_id=91';

function setup(route) {
  let page;
  const requests = [];
  const routes = [];
  const scrolls = [];
  const identity = { openid: 'merchant-stock', access_token: 'access', organization_id: 18, role: 'merchant_stock',
    factory_root_id: 1, operationRoot: { id: 1 }, apiBase: '/api' };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../' + route + '.js'), 'utf8'), {
    getApp: () => ({ globalData: identity, authHeader: () => ({}), ensureLogin: done => done(true) }),
    Page: value => { page = value; },
    wx: {
      request: options => requests.push(options),
      navigateTo: options => routes.push(options.url),
      pageScrollTo: options => scrolls.push(options.selector)
    }
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (values, callback) => {
    Object.assign(page.data, values);
    if (callback) callback();
  };
  return { page, requests, routes, scrolls, identity };
}

function finish(request, data) {
  request.success({ statusCode: 200, data: { code: 0, data } });
  if (request.complete) request.complete();
}

function tap(id, legId, actionCode) {
  return { currentTarget: { dataset: { id, legId, actionCode } } };
}

const receive = { leg_id: 31, code: 'RECEIVE_REPLACEMENT_LEG', label: '签收本段补发机' };
const forward = { leg_id: 32, code: 'SEND_REPLACEMENT_LEG', label: '确认本段补发机转发' };
const card = {
  id: 12, application_id: 91, case_no: 'AS-91', model: '测试型号', quantity: 1,
  status: 'SENT', status_name: '在途', shipment_sequence_no: 1,
  from_name: '厂家', to_name: '直属商家', actions: [receive], link: caseLink
};

function orderDetail(rows, shipmentStatus = 'SHIPPED', pending = []) {
  return {
    plan: { id: 17, total_quantity: 10 },
    shipments: [{ id: 50, quantity: 10, status: shipmentStatus }],
    finance: { can_view: true, receivable_amount: '1000.00', outstanding_amount: '1000.00' },
    replacement_supply_items: rows,
    pending_replacement_demands: pending
  };
}

test('normal receipt and receivable keep 10 sales machines separate from the single linked replacement', () => {
  const s = setup(order);
  s.page.onLoad({ order_plan_id: 17 });
  finish(s.requests[0], orderDetail([card]));
  assert.equal(s.page.data.plan.total_quantity, 10);
  assert.equal(s.page.data.shipments[0].quantityText, '10 台');
  assert.equal(s.page.data.finance.receivable_amount, '1000.00');
  assert.equal(s.page.data.replacementSupplyItems[0].quantity, 1);
  s.page.openReplacementSupplyItem(tap(12, 31, receive.code));
  assert.deepEqual(s.routes, [caseLink + '&replacement_leg_id=31']);

  s.page.onShow();
  finish(s.requests[1], orderDetail([{ ...card, status: 'RECEIVED', actions: [forward] }], 'RECEIVED'));
  s.page.openReplacementSupplyItem(tap(12, 31, receive.code));
  assert.equal(s.routes.length, 1);
  s.page.openReplacementSupplyItem(tap(12, 32, forward.code));
  assert.equal(s.routes[1], caseLink + '&replacement_leg_id=32');
  assert.equal(s.page.data.shipments[0].status, 'RECEIVED');
  assert.equal(s.page.data.shipments[0].quantityText, '10 台');
  assert.equal(s.page.data.finance.receivable_amount, '1000.00');
});

test('only loaded and authorized rows can open a case, and the legacy alias cannot add a card', () => {
  const s = setup(order);
  const pending = { application_id: 92, leg_id: 33, link: '/pages/aftersale/detail/detail?application_id=92' };
  assert.doesNotThrow(() => s.page.openReplacementSupplyItem(tap(12, 31, receive.code)));
  s.page.onLoad({ order_plan_id: 17 });
  finish(s.requests[0], orderDetail([], 'SHIPPED', [pending]));
  s.page.openReplacementSupplyItem(tap(12, 31, receive.code));
  assert.equal(s.page.data.replacementSupplyItems.length, 0);
  assert.deepEqual(s.routes, []);

  s.page.applyDetail(orderDetail([{ ...card, actions: [], link: '' }]));
  s.page.openReplacementSupplyItem(tap(12));
  assert.equal(s.routes.length, 0);
  s.page.applyDetail(orderDetail([{ ...card, actions: [] }]));
  s.page.openReplacementSupplyItem(tap(12));
  assert.equal(s.routes[0], caseLink);
  s.identity.operationRoot = { id: 2 };
  s.page.openReplacementSupplyItem(tap(12));
  assert.equal(s.routes.length, 1);
  s.identity.operationRoot = { id: 1 };
  s.identity.factory_root_id = 2;
  s.page.openReplacementSupplyItem(tap(12));
  assert.equal(s.routes.length, 1);
  s.identity.factory_root_id = 1;
  s.identity.access_token = 'changed';
  s.page.openReplacementSupplyItem(tap(12));
  assert.equal(s.routes.length, 1);
  s.identity.access_token = 'access';
  s.page.onShow();
  s.requests[1].success({ statusCode: 409, data: { code: 1, msg: '当前账号无权查看该订单计划' } });
  s.requests[1].complete();
  assert.match(s.page.data.errorMessage, /无权查看/);
  s.page.openReplacementSupplyItem(tap(12));
  assert.equal(s.routes.length, 1);
});

test('downstream transfer shows and opens the exact linked replacement leg independently of normal receipt', () => {
  const s = setup(transfer);
  s.page.onLoad({ transfer_id: 22 });
  finish(s.requests[0], {
    item_count: 10,
    actions: { can_receive: true },
    replacement_supply_items: [{ ...card, actions: [{ ...receive, leg_id: 32 }] }]
  });
  assert.equal(s.page.data.detail.item_count, 10);
  assert.equal(s.page.data.detail.actions.can_receive, true);
  assert.equal(s.page.data.detail.replacement_supply_items[0].quantity, 1);
  s.page.openReplacementSupplyItem(tap(12, 32, receive.code));
  assert.deepEqual(s.routes, [caseLink + '&replacement_leg_id=32']);
  s.page.loadDetail();
  s.requests[1].fail();
  s.requests[1].complete();
  s.page.openReplacementSupplyItem(tap(12, 32, receive.code));
  assert.equal(s.routes.length, 1);
});

test('an action entry focuses the requested leg after the canonical case loads', async () => {
  const s = setup(aftersales);
  s.page.onLoad({ application_id: 91, replacement_leg_id: 32 });
  finish(s.requests[0], { replacement_flow: { legs: [{ id: 31 }, { id: 32, can_receive: true }] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.page.data.focusedReplacementLegId, 32);
  assert.deepEqual(s.scrolls, ['#replacement-leg-32']);
});
