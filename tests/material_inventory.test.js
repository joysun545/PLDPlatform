const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));

function environment() {
  const storage = new Map();
  const app = { globalData: { openid: 'wx-test', organization_id: 2, role: 'factory_material_stock', apiBase: 'https://example.invalid/pldp/api' },
    ensureLogin: done => done(true), authHeader: () => ({}), reauthenticate() {} };
  const wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, copy(value)), removeStorageSync: key => storage.delete(key),
    stopPullDownRefresh() {}, setNavigationBarTitle() {}, redirectTo() {}, navigateTo() {},
    showModal: options => options.success({ confirm: true })
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/material_inventory.js'), 'utf8'), { module, getApp: () => app, wx, console });
  const api = module.exports;
  function page(relative) {
    let result;
    vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), { Page: p => { result = p; }, getApp: () => app, wx, require: () => api, console });
    result.data = copy(result.data);
    result.setData = values => Object.assign(result.data, copy(values));
    return result;
  }
  return { app, wx, api, page, storage };
}

const stock = { id: 12, supplier_id: 5, material_spec_id: 8, material_name: '控制器', spec_name: '规格A', spec_code: 'A', supplier_name: '供应商', unit: '件' };

test('新角色入口与原成品库管、供应商页面保持独立', () => {
  const env = environment();
  const home = env.page('pages/home/index/index.js');
  for (const role of ['factory_material_stock', 'factory_stock', 'supplier_owner', 'supplier_sales', 'factory_sales', 'customer_owner', 'driver']) {
    env.app.globalData.role = role;
    home.updateButtons();
    assert.equal(home.data.showMaterialInventory, ['factory_material_stock', 'supplier_owner', 'supplier_sales'].includes(role));
    if (role === 'factory_material_stock') {
      assert.equal(home.data.showCreateOrderPlan, false);
      assert.equal(home.data.showGoodsTransferList, false);
      assert.equal(home.data.showFactoryReturnInventory, false);
    }
    if (role === 'factory_stock') assert.equal(home.data.showFactoryReturnInventory, true);
    if (role === 'supplier_owner') assert.equal(home.data.showSupplierResponsibility, true);
    if (role === 'supplier_sales') assert.equal(home.data.showSupplierWarranty, true);
    if (role === 'customer_owner' || role === 'driver') assert.equal(home.data.showMyDevice, true);
  }
});

test('首次登录刷新角色后立即显示物料库入口', () => {
  const env = environment();
  env.app.globalData.role = 'tourist';
  env.app.ensureLogin = done => { env.app.globalData.role = 'factory_material_stock'; done(true); };
  env.wx.request = options => options.success({ statusCode: 200, data: { code: 0, data: { items: [] } } });
  const home = env.page('pages/home/index/index.js');
  home.refreshPage();
  assert.equal(home.data.showMaterialInventory, true);
});

test('成功响应丢失后重开表单，使用原提交标识核验且只入库一次', async () => {
  const env = environment();
  const applied = new Map();
  let receiptCount = 0;
  let loseFirst = true;
  env.wx.request = options => {
    if (options.method === 'GET') return options.success({ statusCode: 200, data: { code: 0, data: { factory_id: 2, stock, units: ['件', '千克'] } } });
    const payload = options.data;
    if (!applied.has(payload.request_id)) {
      applied.set(payload.request_id, copy(payload)); receiptCount++;
    } else assert.deepEqual(copy(payload), applied.get(payload.request_id));
    if (loseFirst) { loseFirst = false; return options.fail(); }
    options.success({ statusCode: 200, data: { code: 0, data: { already_applied: true, document: { stock_id: 12, quantity: '10', kind_label: '正常入库', batch_code: 'ML-ONE' } } } });
  };
  const form = env.page('pages/material_inventory/form/form.js');
  form.route = { kind: 'RECEIPT', stock_id: '12' };
  await form.load();
  form.quantity({ detail: { value: '10' } });
  await form.submit();
  assert.equal(form.data.pending, true);
  assert.equal(receiptCount, 1);
  const reopened = env.page('pages/material_inventory/form/form.js');
  reopened.route = { kind: 'RECEIPT' };
  await reopened.load();
  assert.equal(reopened.data.pending, true);
  assert.equal(reopened.data.quantity, '10');
  reopened.quantity({ detail: { value: '99' } });
  assert.equal(reopened.data.quantity, '10');
  await reopened.submit();
  assert.equal(receiptCount, 1);
  assert.equal(reopened.data.success.batch_code, 'ML-ONE');
  assert.equal(env.storage.size, 0);
});

test('连续点击只发送一笔业务请求', async () => {
  const env = environment();
  let posts = 0;
  env.wx.request = options => {
    if (options.method === 'GET') return options.success({ statusCode: 200, data: { code: 0, data: { factory_id: 2, stock, units: ['件'] } } });
    posts++;
    options.success({ statusCode: 200, data: { code: 0, data: { document: { stock_id: 12 } } } });
  };
  const form = env.page('pages/material_inventory/form/form.js');
  form.route = { kind: 'RECEIPT', stock_id: '12' };
  await form.load(); form.quantity({ detail: { value: '10' } });
  await Promise.all([form.submit(), form.submit(), form.submit()]);
  assert.equal(posts, 1);
  await form.submit(); assert.equal(posts, 1);
});

test('非法数量和暂存失败均不发送入库请求', async () => {
  const env = environment();
  let posts = 0;
  env.wx.request = options => {
    if (options.method === 'GET') return options.success({ statusCode: 200, data: { code: 0, data: { factory_id: 2, stock, units: ['件'] } } });
    posts++;
  };
  const form = env.page('pages/material_inventory/form/form.js');
  form.route = { kind: 'RECEIPT', stock_id: '12' }; await form.load();
  for (const quantity of ['', '0', '-1', '0.0001', 'NaN', '1000000001']) {
    form.quantity({ detail: { value: quantity } }); await form.submit();
  }
  assert.equal(posts, 0);
  env.wx.setStorageSync = () => { throw new Error('full'); };
  form.quantity({ detail: { value: '10' } }); await form.submit();
  assert.equal(posts, 0);
  assert.match(form.data.error, /尚未提交/);
});

test('供应商的详情响应始终关闭办理按钮，权限失败清除旧库存', async () => {
  const env = environment();
  const detail = env.page('pages/material_inventory/detail/detail.js');
  detail.stockId = 12;
  env.wx.request = options => options.success({ statusCode: 200, data: { code: 0, data: { stock, items: [], next_cursor: null, can_manage: false } } });
  detail.setData({ canManage: true }); await detail.load(false);
  assert.equal(detail.data.canManage, false);
  env.wx.request = options => options.success({ statusCode: 403, data: { code: 403, msg: '无权查看' } });
  await detail.load(false);
  assert.equal(detail.data.stock, null);
  assert.equal(detail.data.canManage, false);
});

test('旧查询晚返回不会覆盖切换后的库存查询', async () => {
  const env = environment(); const responses = [];
  env.wx.request = options => responses.push(options);
  const page = env.page('pages/material_inventory/list/list.js');
  const first = page.load(false); page.setData({ query: '新查询' }); const second = page.load(false);
  responses[1].success({ statusCode: 200, data: { code: 0, data: { items: [{ id: 2 }], can_manage: false, next_cursor: null } } });
  await second;
  responses[0].success({ statusCode: 200, data: { code: 0, data: { items: [{ id: 1 }], can_manage: true, next_cursor: null } } });
  await first;
  assert.deepEqual(copy(page.data.items), [{ id: 2 }]); assert.equal(page.data.canManage, false);
});

test('不同微信和组织之间不恢复对方待核验操作', () => {
  const env = environment(); env.api.savePending({ payload: { request_id: 'one' } });
  env.app.globalData.organization_id = 3; assert.equal(env.api.readPending(), null);
  env.app.globalData.organization_id = 2; env.app.globalData.openid = 'other'; assert.equal(env.api.readPending(), null);
  env.app.globalData.openid = 'wx-test'; assert.equal(env.api.readPending().payload.request_id, 'one');
});
