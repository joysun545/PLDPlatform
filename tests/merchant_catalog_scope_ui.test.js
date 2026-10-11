const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(
  require('path').join(__dirname, '../pages/home/edit/edit.js'),
  'utf8'
);
const templateSource = fs.readFileSync(
  require('path').join(__dirname, '../pages/home/edit/edit.wxml'),
  'utf8'
);

function createPage() {
  let definition;
  const scrollRequests = [];
  const wx = {
    showToast() {},
    getWindowInfo() { return { statusBarHeight: 20, windowWidth: 375 }; },
    pageScrollTo(options) { scrollRequests.push(options); },
    showModal(options) {
      options.success({ confirm: true });
    }
  };
  vm.runInNewContext(source, {
    Page(value) { definition = value; },
    getApp() { return { globalData: {} }; },
    wx,
    Set,
    Array,
    Number,
    console
  });
  const instance = {
    ...definition,
    data: {},
    setData(values, callback) {
      this.data = { ...this.data, ...values };
      if (typeof callback === 'function') callback();
    },
    scrollRequests
  };
  return instance;
}

const categories = [
  {
    id: 11,
    name: '发电机',
    models: [
      { id: 101, name: '型号 A', code: 'A' },
      { id: 102, name: '型号 B', code: 'B' }
    ]
  },
  {
    id: 12,
    name: '驻车空调',
    models: [{ id: 201, name: '型号 C', code: 'C' }]
  }
];

{
  const page = createPage();
  const brands = [{ id: 1, name: '航添', categories }];
  page.data.catalogEditor = {
    organizationId: 33,
    brands,
    availableBrands: brands,
    draft: [],
    brandIndex: -1,
    currentCategories: [],
    currentModels: [],
    selectedCategoryIds: [],
    selectedModelIds: []
  };
  page.onCatalogBrandChange({ detail: { value: 0 } });
  page.onCatalogCategoryChange({ detail: { value: ['11'] } });
  page.onCatalogModelChange({ detail: { value: ['102'] } });
  page.confirmCatalogBrand();

  assert.strictEqual(
    page.scrollRequests.length,
    1,
    'confirming an added scope should scroll to the currently edited merchant'
  );
  assert.strictEqual(
    page.scrollRequests[0].selector,
    '#merchant-catalog-focus-33',
    'focus must remain on the merchant whose catalog is being edited'
  );
  assert.strictEqual(page.scrollRequests[0].offsetTop, -235);
  assert.match(
    templateSource,
    /id="merchant-catalog-focus-\{\{item\.organization\.id\}\}"/,
    'the scroll target must be the current subordinate account row'
  );

  assert.strictEqual(
    page.data.catalogEditor.availableBrands.length,
    1,
    'a brand with remaining categories must remain selectable after one category is confirmed'
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.draft[0].categories.map(row => row.category_id))),
    [11],
    'first confirmation should add only the chosen category'
  );

  // Select the same brand again, remove the already configured category from
  // this step, and add the other category. The existing model subset survives.
  page.onCatalogBrandChange({ detail: { value: 0 } });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentCategories.map(row => row.checked))),
    [true, false],
    'reopening a brand should show all categories and mark its saved category'
  );
  page.onCatalogCategoryChange({ detail: { value: ['12'] } });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentModels.map(row => row.checked))),
    [true],
    'a new single category should default to all of its models'
  );
  page.confirmCatalogBrand();

  const confirmed = page.data.catalogEditor.draft[0];
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(confirmed.categories.map(row => row.category_id))),
    [11, 12],
    'confirming another category under the same brand should merge rather than duplicate the brand'
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(confirmed.categories.map(row => row.product_model_ids))),
    [[102], [201]],
    'adding another category should preserve the first category model subset'
  );
}

{
  const page = createPage();
  const brands = [{ id: 1, name: '航添', categories }];
  page.data.catalogEditor = {
    brands,
    availableBrands: brands,
    draft: [],
    brandIndex: -1,
    currentCategories: [],
    currentModels: [],
    selectedCategoryIds: [],
    selectedModelIds: []
  };
  page.onCatalogBrandChange({ detail: { value: 0 } });
  page.onCatalogCategoryChange({ detail: { value: ['11', '12'] } });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentCategories.map(row => row.checked))),
    [true, true],
    'category checkbox state must be precomputed for WXML'
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentModels.map(row => row.checked))),
    [true, true, true],
    'multi-category selection must mark every included model as selected'
  );
  page.confirmCatalogBrand();
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.draft[0].categories.map(row => row.product_model_ids))),
    [[101, 102], [201]],
    'multiple categories must include all models in each selected category'
  );
}

{
  const page = createPage();
  page.data.catalogEditor = {
    brands: [{ id: 1, name: '劲龙', categories }],
    availableBrands: [{ id: 1, name: '劲龙', categories }],
    draft: [],
    brandIndex: -1,
    currentCategories: [],
    currentModels: [],
    selectedCategoryIds: [],
    selectedModelIds: []
  };
  page.onCatalogBrandChange({ detail: { value: 0 } });
  page.onCatalogCategoryChange({ detail: { value: ['11'] } });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentModels.map(row => row.checked))),
    [true, true],
    'single-category selection defaults every model checkbox to selected'
  );
  page.onCatalogModelChange({ detail: { value: ['102'] } });
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentModels.map(row => row.checked))),
    [false, true],
    'model checkbox state must match the selected model IDs'
  );
  page.confirmCatalogBrand();

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.draft[0].categories[0].product_model_ids)),
    [102],
    'a single category must preserve the chosen model subset'
  );
}

{
  const page = createPage();
  const brands = [{ id: 1, name: '劲龙', categories }];
  page.data.catalogEditor = {
    brands,
    availableBrands: brands,
    draft: [{
      brand_id: 1,
      brand_name: '劲龙',
      categories: [{
        category_id: 11,
        category_name: '发电机',
        product_model_ids: [102],
        product_models: [categories[0].models[1]]
      }]
    }],
    brandIndex: -1,
    currentCategories: [],
    currentModels: [],
    selectedCategoryIds: [],
    selectedModelIds: []
  };

  page.onCatalogBrandChange({ detail: { value: 0 } });
  assert.strictEqual(page.data.catalogEditor.availableBrands.length, 1);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentCategories.map(row => row.name))),
    ['发电机', '驻车空调'],
    'editing an existing merchant must expose the full permitted category list'
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.selectedModelIds)),
    [102],
    'editing a saved single-category scope should restore its selected models'
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.currentModels.map(row => row.checked))),
    [false, true],
    'saved product model choices should be visible when editing'
  );

  page.onCatalogCategoryChange({ detail: { value: ['11'] } });
  page.onCatalogModelChange({ detail: { value: ['101'] } });
  page.confirmCatalogBrand();
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(page.data.catalogEditor.draft[0].categories[0].product_model_ids)),
    [101],
    'editing the same brand/category should replace its model selection'
  );
}

console.log('merchant_catalog_scope_ui.test.js passed');
