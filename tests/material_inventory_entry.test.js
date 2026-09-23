const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

function environment(role) {
  const requests = [], navigations = [];
  const app = { globalData: { role, openid: 'test-wechat', organization_id: 2, apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: callback => callback(true), authHeader: () => ({}), reauthenticate() {} };
  const wx = {
    switchTab: options => navigations.push(options.url), stopPullDownRefresh() {},
    request: options => {
      requests.push(options);
      options.success({ statusCode: 200, data: { code: 0, data: { items: [], can_manage: false, next_cursor: null } } });
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/material_inventory.js'), 'utf8'), { getApp: () => app, module, wx });
  const api = module.exports;
  const page = route => {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, route + '.js'), 'utf8'), { getApp: () => app, Page: value => { result = value; }, wx, require: () => api, setTimeout });
    result.data = JSON.parse(JSON.stringify(result.data || {}));
    result.setData = values => Object.assign(result.data, values);
    return result;
  };
  return { app, wx, api, page, requests, navigations };
}

test('normal startup enters the existing landing page without querying a role-specific inventory', async () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const landing = config.entryPagePath || config.pages[0];
  for (const role of ['factory_logistics', 'factory_sales_assistant', 'factory_material_stock', 'factory_stock',
    'factory_sales', 'factory_admin', 'factory_chief_engineer', 'merchant_owner', 'supplier_owner', 'supplier_sales', 'customer_owner', 'driver']) {
    const env = environment(role);
    const page = env.page(landing);
    if (page.onLoad) page.onLoad({});
    if (page.onShow) await page.onShow();
    assert.equal(env.requests.filter(item => item.url.includes('/material-inventory/')).length, 0, role);
    assert.deepEqual(env.navigations, ['/pages/home/index/index'], role);
  }
  const visitor = environment('tourist');
  visitor.page(landing).onShow();
  assert.deepEqual(visitor.navigations, ['/pages/scan/scan/scan']);
  assert.equal(new Set(config.pages).size, config.pages.length);
  for (const page of ['list', 'detail', 'form', 'warranty_list']) {
    assert.ok(config.pages.includes(`pages/material_inventory/${page}/${page}`));
  }
});

test('queued requests use the role returned by login and stop before the network if access changed', async () => {
  const env = environment('factory_material_stock');
  env.app.ensureLogin = callback => { env.app.globalData.role = 'factory_logistics'; callback(true); };
  await assert.rejects(env.api.request(), /物料库/);
  assert.equal(env.requests.length, 0);

  env.app.ensureLogin = callback => { env.app.globalData.role = 'factory_material_stock'; callback(true); };
  await env.api.request();
  assert.equal(env.requests.length, 1);
});

test('only warehouse and supplier viewing roles request inventory; supplier roles never submit movements', async () => {
  for (const role of ['factory_material_stock', 'supplier_owner', 'supplier_sales', 'factory_logistics',
    'factory_stock', 'factory_sales', 'factory_sales_assistant', 'factory_admin', 'customer_owner', 'driver', 'tourist']) {
    const env = environment(role);
    const reader = ['factory_material_stock', 'supplier_owner', 'supplier_sales'].includes(role);
    if (reader) await env.api.request();
    else await assert.rejects(env.api.request(), /物料库/);
    assert.equal(env.requests.length, reader ? 1 : 0, role);
    for (const [endpoint, method] of [['catalog/', 'GET'], ['form/', 'GET'], ['documents/', 'POST']]) {
      const before = env.requests.length;
      if (role === 'factory_material_stock') await env.api.request(endpoint, method);
      else await assert.rejects(env.api.request(endpoint, method), /物料库管/);
      assert.equal(env.requests.length - before, role === 'factory_material_stock' ? 1 : 0, role);
    }
  }
});

test('returning from background preserves authorized material pages and redirects other roles', () => {
  let app;
  let currentRoute;
  const navigations = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    App: value => { app = value; }, getCurrentPages: () => [{ route: currentRoute }],
    wx: { switchTab: options => navigations.push(options.url) }
  });
  for (const role of ['factory_material_stock', 'supplier_owner', 'supplier_sales', 'factory_logistics', 'tourist']) {
    app.globalData.role = role;
    for (const name of ['list', 'detail', 'form', 'warranty_list']) {
      currentRoute = `pages/material_inventory/${name}/${name}`;
      navigations.length = 0;
      app.autoRedirectIfLogged();
      const allowed = role === 'factory_material_stock' || (name !== 'form' && ['supplier_owner', 'supplier_sales'].includes(role));
      assert.deepEqual(navigations, allowed ? [] : [role === 'tourist' ? '/pages/scan/scan/scan' : '/pages/home/index/index'], `${role} ${name}`);
    }
  }
  app.globalData.role = 'factory_logistics';
  for (const route of ['pages/sales/order_plan_list/order_plan_list', 'pages/quality_trace/recall_detail/recall_detail']) {
    currentRoute = route; navigations.length = 0;
    app.autoRedirectIfLogged();
    assert.deepEqual(navigations, []);
  }
});
