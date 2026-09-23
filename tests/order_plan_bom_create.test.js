const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function loadPage(app, wx) {
  let page;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'pages/sales/create_plan/create_plan.js'), 'utf8'),
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
      Math,
      encodeURIComponent
    }
  );
  page.data = JSON.parse(JSON.stringify(page.data || {}));
  page.setData = (values, callback) => {
    Object.assign(page.data, values);
    if (callback) callback();
  };
  return page;
}

test('creation selects the recommended merchant BOM before generic v1', () => {
  const app = {
    globalData: { role: 'factory_sales', apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {}
  };
  const wx = {
    request: request => {
      if (request.url.includes('reissue-options')) {
        request.success({ statusCode: 200, data: { code: 0, data: { available_count: 0 } } });
      }
    },
    showToast() {},
    showModal() {},
    pageScrollTo() {}
  };
  const page = loadPage(app, wx);
  page.data.bomOptionsByModel = {
    13: [
      { id: 21, version: 'v1', is_default: false, source: 'v1' },
      { id: 22, version: 'v2', is_default: true, source: 'previous_order' }
    ]
  };
  page.data.productRows = [{
    ...page.data.productRows[0],
    categoryId: 3,
    models: [{ id: 13, name: '测试型号', recommended_bom_id: 22 }]
  }];

  page.onModelChange({ currentTarget: { dataset: { key: 1 } }, detail: { value: '0' } });
  assert.equal(page.data.productRows[0].sourceBomId, 22);
  assert.equal(page.data.productRows[0].selectedBomSourceName, '该商家最近订单冻结版本');
});

test('merchant selection refreshes only that merchant’s BOM recommendation before adding products', () => {
  const requests = [];
  const app = {
    globalData: { role: 'factory_sales', apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      request.success({
        statusCode: 200,
        data: {
          code: 0,
          data: {
            categories: [{ id: 3, name: '品类', models: [{
              id: 13,
              name: '测试型号',
              recommended_bom_id: 22,
              available_boms: [{ id: 22, version: 'v2', is_default: true, source: 'previous_order' }]
            }] }],
            bom_options_by_product_model: {
              13: [{ id: 22, version: 'v2', is_default: true, source: 'previous_order' }]
            }
          }
        }
      });
      request.complete && request.complete();
    },
    showToast() {},
    showModal() {},
    pageScrollTo() {}
  };
  const page = loadPage(app, wx);
  page.data.merchants = [{
    id: 8,
    name: '直属商家',
    configured: true,
    region: '四川',
    brand: { id: 9, name: '品牌' }
  }];
  page.data.brands = [{ id: 9, name: '品牌' }];

  page.onMerchantChange({ detail: { value: '0' } });
  assert.match(requests[0].url, /material-flow\/options\/\?merchant_id=8$/);
  assert.equal(page.data.selectedBrand.id, 9);
  assert.equal(page.data.categories[0].models[0].recommended_bom_id, 22);
});

test('creation BOM editor sends legacy-compatible material rows only after it has loaded', () => {
  const requests = [];
  const app = {
    globalData: { role: 'factory_sales', apiBase: 'https://example.invalid/pldp/api' },
    authHeader: () => ({}),
    reauthenticate() {},
    refreshTasks() {}
  };
  const wx = {
    request: request => {
      requests.push(request);
      if (request.url.includes('material-flow/bom-detail')) {
        request.success({
          statusCode: 200,
          data: {
            code: 0,
            data: {
              materials: [
                {
                  id: 301,
                  name: '定子',
                  code: 'MAT-001',
                  selected_spec_id: 401,
                  selected_supplier_id: 501,
                  quantity: 1,
                  remark: '原备注',
                  specs: [{
                    id: 401,
                    name: '24V',
                    suppliers: [{ id: 501, name: '南方供应商' }]
                  }]
                },
                {
                  id: 302,
                  name: '旧配件',
                  code: 'MAT-002',
                  deleted: true,
                  specs: []
                }
              ]
            }
          }
        });
        return;
      }
      if (request.method === 'POST') {
        request.success({ statusCode: 200, data: { code: 0, data: { id: 19, items: [] } } });
      }
    },
    showToast() {},
    showModal() {},
    pageScrollTo() {}
  };
  const page = loadPage(app, wx);
  page.data.selectedMerchant = { id: 8, configured: true };
  page.data.selectedBrand = { id: 9 };
  page.data.productRows = [{
    ...page.data.productRows[0],
    categoryId: 3,
    productModelId: 13,
    productModelName: '测试型号',
    sourceBomId: 21,
    selectedBom: { id: 21, version: 'v1' },
    bomOptions: [{ id: 21, version: 'v1' }],
    bomIndex: 0
  }];

  page.toggleBomEditor({ currentTarget: { dataset: { key: 1 } } });
  assert.equal(page.data.productRows[0].materialEditorLoaded, true);
  assert.equal(page.data.productRows[0].bomMaterials.length, 2);

  page.onMaterialRemarkInput({
    currentTarget: { dataset: { key: 1, materialIndex: 0 } },
    detail: { value: '交付前复核' }
  });
  page.submitPlan();
  const createRequest = requests.find(request => request.method === 'POST');
  assert.ok(createRequest);
  assert.match(createRequest.url, /\/sales\/order-plans\/material-flow\/$/);
  assert.deepEqual(JSON.parse(JSON.stringify(createRequest.data.items[0].materials)), [
    {
      material_id: 301,
      material_spec_id: 401,
      supplier_id: 501,
      deleted: false,
      remark: '交付前复核'
    },
    {
      material_id: 302,
      material_spec_id: null,
      supplier_id: null,
      deleted: true,
      remark: ''
    }
  ]);
});

test('creation page BOM editor bindings remain valid WXML expressions', () => {
  const source = fs.readFileSync(
    path.join(root, 'pages/sales/create_plan/create_plan.wxml'),
    'utf8'
  );
  const expressions = [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(match => match[1]);
  assert.ok(expressions.length > 0);
  for (const expression of expressions) {
    assert.doesNotThrow(() => new vm.Script(`(${expression})`), expression);
  }
});
