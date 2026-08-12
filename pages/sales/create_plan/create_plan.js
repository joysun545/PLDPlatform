const app = getApp();

function newClientRequestId() {
  return `order-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function emptyProductRow(key) {
  return {
    key,
    categoryIndex: -1,
    categoryId: '',
    categoryName: '',
    models: [],
    modelIndex: -1,
    productModelId: '',
    productModelName: '',
    quantity: '1'
  };
}

Page({
  data: {
    loading: true,
    submitting: false,
    loadError: '',
    factory: null,
    merchants: [],
    merchantIndex: -1,
    selectedMerchant: null,
    brands: [],
    catalogCategories: [],
    categories: [],

    channelEditing: false,
    regionDraft: '',
    brandIndex: -1,
    selectedBrand: null,
    savingChannel: false,

    productRows: [emptyProductRow(1)],
    nextRowKey: 2,
    remark: '',
    clientRequestId: newClientRequestId(),
    createdPlan: null
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, loadError: '登录失败，请重新进入小程序' });
        return;
      }
      if (app.globalData.role !== 'factory_sales') {
        wx.showModal({
          title: '无法进入',
          content: '只有厂家销售经理可以创建订单计划',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return;
      }
      this.loadOptions();
    });
  },

  onPullDownRefresh() {
    this.loadOptions(() => wx.stopPullDownRefresh());
  },

  loadOptions(done) {
    this.setData({ loading: true, loadError: '' });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/options/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, loadError: '登录状态已失效，请重新进入' });
          return;
        }
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, loadError: body.msg || '基础数据加载失败' });
          return;
        }
        const data = body.data;
        this.setData({
          loading: false,
          factory: data.factory || null,
          merchants: data.direct_merchants || [],
          brands: data.brands || [],
          catalogCategories: data.categories || []
        });
      },
      fail: () => {
        this.setData({ loading: false, loadError: '网络连接失败，请稍后重试' });
      },
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadOptions();
  },

  onMerchantChange(e) {
    const merchantIndex = Number(e.detail.value);
    const merchant = this.data.merchants[merchantIndex];
    if (!merchant) return;

    const brandIndex = merchant.brand
      ? this.data.brands.findIndex(item => item.id === merchant.brand.id)
      : -1;

    this.setData({
      merchantIndex,
      selectedMerchant: merchant,
      channelEditing: !merchant.configured,
      regionDraft: merchant.region || '',
      brandIndex,
      createdPlan: null
    });

    if (merchant.configured && brandIndex >= 0) {
      this.applyBrand(this.data.brands[brandIndex]);
    } else {
      this.applyBrand(null);
    }
  },

  editChannel() {
    if (!this.data.selectedMerchant) return;
    const merchant = this.data.selectedMerchant;
    const brandIndex = merchant.brand
      ? this.data.brands.findIndex(item => item.id === merchant.brand.id)
      : -1;
    this.setData({
      channelEditing: true,
      regionDraft: merchant.region || '',
      brandIndex
    });
  },

  cancelChannelEdit() {
    const merchant = this.data.selectedMerchant;
    if (!merchant || !merchant.configured) return;
    const brandIndex = this.data.brands.findIndex(item => item.id === merchant.brand.id);
    this.setData({
      channelEditing: false,
      regionDraft: merchant.region || '',
      brandIndex
    });
  },

  onRegionInput(e) {
    this.setData({ regionDraft: e.detail.value });
  },

  onBrandChange(e) {
    this.setData({ brandIndex: Number(e.detail.value) });
  },

  saveChannel() {
    const merchant = this.data.selectedMerchant;
    const brand = this.data.brands[this.data.brandIndex];
    const region = (this.data.regionDraft || '').trim();
    if (!merchant) {
      wx.showToast({ title: '请先选择直接商家', icon: 'none' });
      return;
    }
    if (!region) {
      wx.showToast({ title: '请填写负责区域', icon: 'none' });
      return;
    }
    if (!brand) {
      wx.showToast({ title: '请选择授权品牌', icon: 'none' });
      return;
    }

    this.setData({ savingChannel: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/direct-merchants/configure/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        merchant_id: merchant.id,
        brand_id: brand.id,
        region
      },
      success: res => {
        const body = res.data || {};
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '保存失败', icon: 'none' });
          return;
        }
        const saved = body.data || {};
        const merchants = this.data.merchants.map(item => (
          item.id === merchant.id
            ? {
                ...item,
                configured: true,
                region: saved.region,
                brand: saved.brand
              }
            : item
        ));
        const selectedMerchant = merchants.find(item => item.id === merchant.id);
        this.setData({
          merchants,
          selectedMerchant,
          channelEditing: false,
          regionDraft: saved.region || region
        });
        this.applyBrand(brand);
        wx.showToast({ title: '区域和品牌已保存', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => this.setData({ savingChannel: false })
    });
  },

  applyBrand(brand) {
    const catalogCategories = this.data.catalogCategories || [];
    this.setData({
      selectedBrand: brand || null,
      categories: brand
        ? (catalogCategories.length ? catalogCategories : (brand.categories || []))
        : [],
      productRows: [emptyProductRow(this.data.nextRowKey)],
      nextRowKey: this.data.nextRowKey + 1
    });
  },

  addProductRow() {
    const row = emptyProductRow(this.data.nextRowKey);
    this.setData({
      productRows: this.data.productRows.concat(row),
      nextRowKey: this.data.nextRowKey + 1
    });
  },

  removeProductRow(e) {
    if (this.data.productRows.length <= 1) {
      wx.showToast({ title: '至少保留一个产品型号', icon: 'none' });
      return;
    }
    const key = Number(e.currentTarget.dataset.key);
    this.setData({
      productRows: this.data.productRows.filter(item => item.key !== key)
    });
  },

  onCategoryChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const categoryIndex = Number(e.detail.value);
    const category = this.data.categories[categoryIndex];
    if (!category) return;
    const productRows = this.data.productRows.map(row => (
      row.key === key
        ? {
            ...row,
            categoryIndex,
            categoryId: category.id,
            categoryName: category.name,
            models: category.models || [],
            modelIndex: -1,
            productModelId: '',
            productModelName: ''
          }
        : row
    ));
    this.setData({ productRows });
  },

  onModelChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const modelIndex = Number(e.detail.value);
    const productRows = this.data.productRows.map(row => {
      if (row.key !== key) return row;
      const productModel = row.models[modelIndex];
      if (!productModel) return row;
      return {
        ...row,
        modelIndex,
        productModelId: productModel.id,
        productModelName: productModel.name
      };
    });
    this.setData({ productRows });
  },

  onQuantityInput(e) {
    const key = Number(e.currentTarget.dataset.key);
    const quantity = e.detail.value;
    this.setData({
      productRows: this.data.productRows.map(row => (
        row.key === key ? { ...row, quantity } : row
      ))
    });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  validatePlan() {
    const merchant = this.data.selectedMerchant;
    if (!merchant) return '请选择直接商家';
    if (!merchant.configured || !this.data.selectedBrand) return '请先保存商家的区域和品牌';

    const seen = {};
    for (let index = 0; index < this.data.productRows.length; index += 1) {
      const row = this.data.productRows[index];
      if (!row.categoryId) return `请选择第${index + 1}项品类`;
      if (!row.productModelId) return `请选择第${index + 1}项产品型号`;
      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return `第${index + 1}项数量必须是正整数`;
      }
      if (seen[row.productModelId]) return '同一个产品型号不能重复添加';
      seen[row.productModelId] = true;
    }
    return '';
  },

  submitPlan() {
    if (this.data.submitting) return;
    const validationError = this.validatePlan();
    if (validationError) {
      wx.showToast({ title: validationError, icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/create/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        merchant_id: this.data.selectedMerchant.id,
        client_request_id: this.data.clientRequestId,
        remark: this.data.remark,
        items: this.data.productRows.map(row => ({
          category_id: row.categoryId,
          product_model_id: row.productModelId,
          quantity: Number(row.quantity)
        }))
      },
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '订单计划创建失败', icon: 'none' });
          return;
        }
        this.setData({ createdPlan: body.data });
        app.refreshTasks();
        wx.pageScrollTo({ scrollTop: 0, duration: 300 });
      },
      fail: () => wx.showToast({ title: '网络连接失败，请稍后重试', icon: 'none' }),
      complete: () => this.setData({ submitting: false })
    });
  },

  createAnother() {
    this.setData({
      merchantIndex: -1,
      selectedMerchant: null,
      channelEditing: false,
      regionDraft: '',
      brandIndex: -1,
      selectedBrand: null,
      catalogCategories: this.data.catalogCategories,
      categories: [],
      productRows: [emptyProductRow(this.data.nextRowKey)],
      nextRowKey: this.data.nextRowKey + 1,
      remark: '',
      clientRequestId: newClientRequestId(),
      createdPlan: null
    });
  }
});
