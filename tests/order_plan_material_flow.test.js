const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadPage(route, app, wx) {
  let page;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, route), 'utf8'),
    {
      getApp: () => app,
      Page: value => { page = value; },
      wx,
      console,
      Date,
      Number,
      String,
      Array,
      Object,
      Math
    }
  );
  page.data = JSON.parse(JSON.stringify(page.data || {}));
  page.setData = (values, callback) => {
    Object.assign(page.data, values);
    if (callback) callback();
  };
  return page;
}

function expressions(source) {
  return [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(match => match[1]);
}

test('material-flow page is registered and its raw bindings are valid', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.ok(config.pages.includes('pages/sales/order_plan_detail/order_plan_detail'));
  const source = fs.readFileSync(
    path.join(root, 'pages/sales/order_plan_detail/order_plan_detail.wxml'),
    'utf8'
  );
  assert.ok(expressions(source).length > 0);
  for (const expression of expressions(source)) {
    assert.doesNotThrow(() => new vm.Script(`(${expression})`), expression);
  }
});

test('create page selects the default BOM and submits it to the material-flow endpoint', () => {
  const requests = [];
  const app = {
    globalData: { role: 'factory_sales', apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: callback => callback(true),
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      if (request.url.includes('reissue-options')) {
        request.success({ statusCode: 200, data: { code: 0, data: { available_count: 0 } } });
      } else if (request.method === 'POST') {
        request.success({ statusCode: 200, data: { code: 0, data: { id: 11, items: [] } } });
      }
    },
    showToast() {},
    showModal() {},
    pageScrollTo() {},
    navigateTo() {},
    stopPullDownRefresh() {}
  };
  const page = loadPage('pages/sales/create_plan/create_plan.js', app, wx);
  page.data.selectedMerchant = { id: 8, configured: true };
  page.data.selectedBrand = { id: 9 };
  page.data.bomOptionsByModel = {
    13: [{ id: 21, version: 'v1', is_default: true }]
  };
  page.data.productRows = [{
    ...page.data.productRows[0],
    categoryId: 3,
    models: [{ id: 13, name: '测试型号' }]
  }];

  page.onModelChange({ currentTarget: { dataset: { key: 1 } }, detail: { value: '0' } });
  assert.equal(page.data.productRows[0].sourceBomId, 21);

  page.submitPlan();
  const request = requests.find(item => item.method === 'POST');
  assert.ok(request);
  assert.match(request.url, /\/sales\/order-plans\/material-flow\/$/);
  assert.equal(request.data.items[0].source_bom_id, 21);
});

test('detail page renders only backend-provided actions and posts the declared action code', () => {
  const requests = [];
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: callback => callback(true),
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      if (request.method === 'GET') {
        request.success({
          statusCode: 200,
          data: {
            code: 0,
            data: {
              plan: {
                id: 25,
                plan_code: 'OP-25',
                factory: { name: '测试厂家' },
                merchant: { name: '测试商家' },
                brand: { name: '测试品牌' },
                sales_manager: { name: '销售经理' }
              },
              timeline: [{ code: 'CREATED', title: '订单创建', state: 'DONE' }],
              available_actions: [{
                code: 'warehouse-review',
                label: '核对物料',
                payload: { warehouse_note: 'checked' }
              }]
            }
          }
        });
      } else {
        request.success({ statusCode: 200, data: { code: 0, data: {} } });
      }
    },
    showModal: options => options.success({ confirm: true }),
    showLoading() {},
    hideLoading() {},
    showToast() {},
    stopPullDownRefresh() {}
  };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.onLoad({ order_plan_id: '25' });
  assert.equal(page.data.timeline.length, 1);
  assert.equal(page.data.actionButtons.length, 1);

  page.confirmAction({ currentTarget: { dataset: { index: '0' } } });
  const actionRequest = requests.find(item => (
    item.method === 'POST' && item.url.endsWith('/material-flow/warehouse-review/')
  ));
  assert.ok(actionRequest);
  assert.deepEqual(actionRequest.data, { warehouse_note: 'checked' });
});

test('timeline dot lights only the explicit V2 backend active flag', () => {
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = { request() {}, showToast() {}, showModal() {}, showLoading() {}, hideLoading() {} };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.applyDetail({
    plan: { id: 27, plan_code: 'OP-27' },
    timeline: [
      // The backend may expose global physical progress for text/status, but
      // a viewer without the task must not light this dot.
      { code: 'MATERIAL_REVIEW', title: '物料库管核对', state: 'CURRENT', current: true, active: false },
      // A task owner or awareness recipient is explicitly lit by the API.
      { code: 'SUPPLY', title: '供应商配送', state: 'CURRENT', current: true, active: true },
      { code: 'ACCOUNTING', title: '销售助理入账', state: 'CURRENT', current: true, active: false }
    ]
  });

  assert.equal(page.data.timeline[0].stateClass, 'current');
  assert.equal(page.data.timeline[0].active, false);
  assert.equal(page.data.timeline[0].dotClass, '');
  assert.equal(page.data.timeline[1].active, true);
  assert.equal(page.data.timeline[1].dotClass, 'active');
  assert.equal(page.data.timeline[2].dotClass, '');

  const source = fs.readFileSync(
    path.join(root, 'pages/sales/order_plan_detail/order_plan_detail.wxml'),
    'utf8'
  );
  assert.match(source, /timeline-dot \{\{item\.dotClass\}\}/);
  assert.doesNotMatch(source, /timeline-dot[^\n]*stateClass/);
});

test('detail page preserves QR and shipment batch payload actions without inferring permissions', () => {
  const requests = [];
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: callback => callback(true),
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      if (request.method === 'GET') {
        request.success({
          statusCode: 200,
          data: {
            code: 0,
            data: {
              plan: {
                id: 26,
                plan_code: 'OP-26',
                factory: { name: '测试厂家' },
                merchant: { name: '测试商家' },
                brand: { name: '测试品牌' },
                sales_manager: { name: '销售经理' }
              },
              production_plans: [{
                id: 31,
                plan_label: '型号生产计划',
                plan_title: '测试型号生产计划',
                is_tail_split: false,
                quantity: 8,
                status: 'PRODUCTION_COMPLETED',
                status_name: '生产完成待打码',
                items: [{
                  id: 32,
                  product_model_name: '测试型号',
                  quantity: 8,
                  production_batch_code: 'PB-001',
                  qrcode_generated_at: '2026-09-10T10:00:00+00:00'
                }]
              }],
              qrcode_batches: [{
                id: 41,
                batch_code: 'QR-001',
                quantity: 8,
                state: 'GENERATED',
                state_name: '待打印',
                codes: [{ device_sn: 'SN-001', code: 'QR-CODE-001' }],
                available_actions: [{
                  code: 'qrcode-print-confirm',
                  label: '确认本批二维码已打印',
                  payload: { subplan_id: 31, qrcode_batch_id: 41 }
                }]
              }],
              shipments: [{
                id: 51,
                sequence_no: 1,
                total_quantity: 8,
                status: 'AUTHORIZED',
                status_name: '已授权待出库',
                items: [{ product_model_name: '测试型号', quantity: 8 }],
                available_actions: [{
                  code: 'shipment-outbound',
                  label: '确认本批出库',
                  payload: { shipment_id: 51 }
                }]
              }]
            }
          }
        });
      } else {
        request.success({ statusCode: 200, data: { code: 0, data: {} } });
      }
    },
    showModal: options => options.success({ confirm: true }),
    showLoading() {},
    hideLoading() {},
    showToast() {},
    stopPullDownRefresh() {}
  };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.onLoad({ order_plan_id: '26' });

  assert.equal(page.data.productionSubplans[0].quantityText, '8 台');
  assert.equal(page.data.productionSubplans[0].title, '测试型号生产计划');
  assert.equal(page.data.productionSubplans[0].planLabel, '型号生产计划');
  assert.equal(page.data.productionSubplans[0].stateClass, 'done');
  assert.equal(page.data.qrcodeBatches[0].codes[0].code, 'QR-CODE-001');
  assert.equal(page.data.shipments[0].items[0].quantityText, '8 台');

  const actionKey = page.data.qrcodeBatches[0].actions[0].key;
  page.confirmAction({ currentTarget: { dataset: { actionKey } } });
  const actionRequest = requests.find(item => (
    item.method === 'POST' && item.url.endsWith('/material-flow/qrcode-print-confirm/')
  ));
  assert.ok(actionRequest);
  assert.deepEqual(actionRequest.data, { subplan_id: 31, qrcode_batch_id: 41 });
});

test('detail page also accepts service action maps and shipment-list aliases', () => {
  const requests = [];
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      request.success({ statusCode: 200, data: { code: 0, data: {} } });
    },
    showModal: options => options.success({ confirm: true }),
    showLoading() {},
    hideLoading() {},
    showToast() {}
  };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.setData({ orderPlanId: 88 });
  page.applyDetail({
    plan: { id: 88, plan_code: 'OP-V2-88' },
    shipment_list: [{
      shipment_id: 61,
      shipment_code: 'S-61',
      quantity: 5,
      available_actions: {
        'merchant-receipt': {
          label: '确认签收',
          payload: { shipment_id: 61 }
        }
      }
    }],
    actions: {
      cancel: { label: '取消订单', payload: { reason: 'test' }, danger: true }
    }
  });

  assert.equal(page.data.shipments[0].title, 'S-61');
  assert.equal(page.data.shipments[0].actions[0].code, 'merchant-receipt');
  assert.equal(page.data.actionButtons[0].code, 'cancel');

  page.confirmAction({ currentTarget: { dataset: { actionKey: page.data.shipments[0].actions[0].key } } });
  assert.ok(requests.some(item => (
    item.method === 'POST' && item.url.endsWith('/material-flow/merchant-receipt/')
  )));
});

test('sales can split a backend-authorized V2 shipment without front-end permission inference', () => {
  const requests = [];
  const app = {
    globalData: { role: 'merchant_owner', apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      if (request.method === 'POST') {
        request.success({ statusCode: 200, data: { code: 0, msg: '发货批次已创建', data: {} } });
      } else {
        request.success({ statusCode: 200, data: { code: 0, data: { plan: { id: 92, plan_code: 'OP-92' } } } });
      }
      request.complete && request.complete();
    },
    showModal: options => options.success({ confirm: true }),
    showLoading() {},
    hideLoading() {},
    showToast() {},
    stopPullDownRefresh() {}
  };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.setData({ orderPlanId: 92 });
  page.applyDetail({
    plan: { id: 92, plan_code: 'OP-92' },
    shipments: [{
      id: 71,
      production_subplan_id: 31,
      quantity: 10,
      items: [
        { id: 701, production_subplan_item_id: 301, order_plan_item_id: 201, product_model_name: '型号 A', quantity: 5 },
        { id: 702, production_subplan_item_id: 302, order_plan_item_id: 202, product_model_name: '型号 B', quantity: 5 }
      ],
      available_actions: [{
        code: 'shipment-create',
        label: '拆分本批发货',
        payload: { shipment_id: 71, production_subplan_id: 31 }
      }]
    }]
  });

  const actionKey = page.data.shipments[0].actions[0].key;
  page.confirmAction({ currentTarget: { dataset: { actionKey } } });
  assert.equal(page.data.splitDraft.items.length, 2);
  assert.equal(page.data.splitDraft.items[0].inputValue, '5');
  page.onSplitQuantityInput({ currentTarget: { dataset: { index: '0' } }, detail: { value: '2' } });
  page.onSplitQuantityInput({ currentTarget: { dataset: { index: '1' } }, detail: { value: '0' } });
  page.submitShipmentSplit();

  const request = requests.find(item => item.method === 'POST');
  assert.ok(request);
  assert.match(request.url, /\/material-flow\/shipment-create\/$/);
  assert.equal(request.data.shipment_id, 71);
  assert.equal(request.data.production_subplan_id, 31);
  assert.match(request.data.client_request_id, /^v2-split-/);
  assert.deepEqual(JSON.parse(JSON.stringify(request.data.items)), [
    { production_subplan_item_id: 301, quantity: 2 }
  ]);
});

test('shipment logistics fields appear and submit only from the exact backend action schema', () => {
  const requests = [];
  const toasts = [];
  const app = {
    globalData: { role: 'factory_logistics', apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      if (request.method === 'POST') {
        request.success({ statusCode: 200, data: { code: 0, msg: '物流信息已确认', data: {} } });
      } else {
        request.success({ statusCode: 200, data: { code: 0, data: { plan: { id: 93, plan_code: 'OP-93' } } } });
      }
      request.complete && request.complete();
    },
    showModal: options => options.success({ confirm: true }),
    showLoading() {},
    hideLoading() {},
    pageScrollTo() {},
    showToast: options => toasts.push(options),
    stopPullDownRefresh() {}
  };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.setData({ orderPlanId: 93 });
  page.applyDetail({
    plan: { id: 93, plan_code: 'OP-93' },
    shipments: [{
      id: 72,
      quantity: 3,
      items: [{ id: 703, order_plan_item_id: 203, product_model_name: '型号 C', quantity: 3 }],
      available_actions: [{
        code: 'shipment-logistics-confirm',
        label: '填写本批物流信息',
        payload: { shipment_id: 72 },
        input_fields: [
          { name: 'logistics_company', label: '物流公司', required: true },
          { name: 'tracking_no', label: '物流单号', required: true }
        ]
      }]
    }]
  });
  const actionKey = page.data.shipments[0].actions[0].key;
  page.confirmAction({ currentTarget: { dataset: { actionKey } } });
  assert.equal(page.data.logisticsDraft.fields.length, 2);
  page.onLogisticsInput({ currentTarget: { dataset: { index: '0' } }, detail: { value: '中通快递' } });
  page.onLogisticsInput({ currentTarget: { dataset: { index: '1' } }, detail: { value: 'ZT-001' } });
  page.submitShipmentLogistics();
  const request = requests.find(item => item.method === 'POST');
  assert.ok(request);
  assert.match(request.url, /\/material-flow\/shipment-logistics-confirm\/$/);
  assert.deepEqual(JSON.parse(JSON.stringify(request.data)), {
    shipment_id: 72,
    logistics_company: '中通快递',
    tracking_no: 'ZT-001'
  });

  page.applyDetail({
    plan: { id: 93, plan_code: 'OP-93' },
    shipments: [{
      id: 73,
      quantity: 1,
      items: [{ id: 704, order_plan_item_id: 204, product_model_name: '型号 D', quantity: 1 }],
      available_actions: [{
        code: 'shipment-logistics-confirm',
        payload: { shipment_id: 73 },
        input_fields: [{ name: 'tracking_no', required: true }]
      }]
    }]
  });
  page.confirmAction({ currentTarget: { dataset: { actionKey: page.data.shipments[0].actions[0].key } } });
  assert.equal(page.data.logisticsDraft, null);
  assert.match(toasts.at(-1).title, /字段不完整/);
});

test('V2 detail ignores legacy finance payload and preserves both logistics fields on the batch', () => {
  const app = {
    globalData: { apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request() {},
    showToast() {},
    showModal() {},
    showLoading() {},
    hideLoading() {}
  };
  const page = loadPage('pages/sales/order_plan_detail/order_plan_detail.js', app, wx);
  page.applyDetail({
    plan: { id: 94, plan_code: 'OP-94', flow_version: 2 },
    // A stale legacy cache must never recreate the finance task/card in the
    // V2 physical-flow detail.
    finance: { state_name: '待收款', receivable_amount: '100.00' },
    shipments: [{
      id: 74,
      quantity: 2,
      logistics_company: '中通快递',
      tracking_no: 'ZT-002',
      items: [{ id: 705, order_plan_item_id: 205, product_model_name: '型号 E', quantity: 2 }]
    }]
  });

  assert.equal(page.data.finance, null);
  assert.equal(page.data.shipments[0].logisticsCompanyText, '中通快递');
  assert.equal(page.data.shipments[0].trackingNoText, 'ZT-002');
  const source = fs.readFileSync(
    path.join(root, 'pages/sales/order_plan_detail/order_plan_detail.wxml'),
    'utf8'
  );
  assert.match(source, /物流公司<\/text><text>\{\{shipment\.logisticsCompanyText\}\}/);
  assert.match(source, /物流单号<\/text><text>\{\{shipment\.trackingNoText\}\}/);
  assert.doesNotMatch(source, /订单资金/);
});

test('order plan list delegates awareness-role visibility to the server', () => {
  const requests = [];
  const modals = [];
  const app = {
    globalData: { role: 'factory_chief_engineer', apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: callback => callback(true),
    authHeader: () => ({}),
    reauthenticate() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      request.success({
        statusCode: 200,
        data: { code: 0, data: { viewer: { role: 'factory_chief_engineer' }, items: [] } }
      });
      request.complete && request.complete();
    },
    showModal: options => modals.push(options),
    showToast() {},
    stopPullDownRefresh() {}
  };
  const page = loadPage('pages/sales/order_plan_list/order_plan_list.js', app, wx);
  page.onLoad();

  assert.equal(modals.length, 0);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/sales\/order-plans\/$/);
});

test('order plan list keeps wx:else separate from its repeated plan card', () => {
  const template = fs.readFileSync(
    path.join(root, 'pages/sales/order_plan_list/order_plan_list.wxml'),
    'utf8'
  );
  assert.match(template, /<block wx:else>\s*<view class="plan-card" wx:for=/);
  assert.doesNotMatch(template, /wx:else\s+wx:for=/);
});

test('all factory V2 awareness roles retain the order-plan entry on the home page', () => {
  let page;
  const app = {
    globalData: { role: 'factory_admin', role_name: '厂家负责人', nickname: '测试', real_name: '测试' },
    ensureLogin: callback => callback(false)
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'pages/home/index/index.js'), 'utf8'),
    {
      getApp: () => app,
      Page: value => { page = value; },
      wx: { request() {}, navigateTo() {}, showToast() {} },
      console,
      Array,
      Object
    }
  );
  page.data = JSON.parse(JSON.stringify(page.data || {}));
  page.setData = values => Object.assign(page.data, values);

  for (const role of ['factory_admin', 'factory_manager', 'factory_chief_engineer']) {
    app.globalData.role = role;
    page.updateButtons();
    assert.equal(page.data.showOrderPlanList, true, role);
  }
  const source = fs.readFileSync(path.join(root, 'pages/home/index/index.wxml'), 'utf8');
  assert.match(source, /厂家成品库存/);
});

test('registered material-flow detail remains protected from launch-time home redirection', () => {
  let application;
  let currentRoute = 'pages/sales/order_plan_detail/order_plan_detail';
  const navigations = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    App: value => { application = value; },
    getCurrentPages: () => [{ route: currentRoute }],
    wx: { switchTab: options => navigations.push(options.url) },
    setInterval,
    clearInterval
  });
  application.globalData.role = 'factory_material_stock';
  application.autoRedirectIfLogged();
  assert.deepEqual(navigations, []);

  currentRoute = 'pages/sales/order_plan_detail/order_plan_detail';
  application.globalData.role = 'supplier_sales';
  application.autoRedirectIfLogged();
  assert.deepEqual(navigations, []);
});
