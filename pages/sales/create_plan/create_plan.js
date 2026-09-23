const app = getApp();

function newClientRequestId() {
  return `order-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function asId(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
    bomOptions: [],
    bomIndex: -1,
    sourceBomId: '',
    selectedBom: null,
    selectedBomSourceName: '',
    materialEditorVisible: false,
    materialEditorLoading: false,
    materialEditorLoaded: false,
    materialEditorError: '',
    bomMaterials: [],
    quantity: '1',
    reissueLoading: false,
    reissueError: '',
    reissueInfo: null,
    useReturnInventory: false,
    returnInventoryQuantity: 0,
    productionQuantity: 1
  };
}

function normalizeBomOptions(productModel, bomOptionsByModel) {
  if (!productModel) return [];
  const optionBucket = bomOptionsByModel[productModel.id] ||
    bomOptionsByModel[String(productModel.id)] || [];
  const rawOptions = productModel.available_boms || productModel.bom_options ||
    productModel.boms || (Array.isArray(optionBucket) ? optionBucket : (
      optionBucket.items || optionBucket.boms || optionBucket.options || []
    ));
  const defaultBom = productModel.default_bom || productModel.defaultBom || null;
  const options = Array.isArray(rawOptions) ? rawOptions.slice() : [];
  const defaultId = productModel.recommended_bom_id ||
    productModel.recommendedBomId ||
    (optionBucket && optionBucket.recommended_bom_id) ||
    (optionBucket && optionBucket.recommendedBomId) ||
    productModel.default_bom_id || (defaultBom && defaultBom.id);
  if (defaultBom && !options.some(item => String(item.id) === String(defaultBom.id))) {
    options.push(defaultBom);
  }
  return options
    .filter(item => item && item.id)
    .map(item => ({
      ...item,
      is_recommended: !!(
        item.is_recommended || item.recommended ||
        String(item.id) === String(defaultId)
      ),
      display_name: item.display_name || item.name || (
        item.remark ? `${item.version} · ${item.remark}` : (item.version || `BOM #${item.id}`)
      ),
      is_default: !!(item.is_default || String(item.id) === String(defaultId))
    }));
}

function withSelectedBom(row, productModel, bomOptionsByModel) {
  const bomOptions = normalizeBomOptions(productModel, bomOptionsByModel);
  let bomIndex = bomOptions.findIndex(item => item.is_recommended);
  if (bomIndex < 0) bomIndex = bomOptions.findIndex(item => item.is_default);
  if (bomIndex < 0 && bomOptions.length) bomIndex = 0;
  const selectedBom = bomIndex >= 0 ? bomOptions[bomIndex] : null;
  return {
    ...row,
    bomOptions,
    bomIndex,
    sourceBomId: selectedBom ? selectedBom.id : '',
    selectedBom,
    selectedBomSourceName: selectedBom && (
      selectedBom.source === 'previous_order' || selectedBom.is_recommended
    ) ? '该商家最近订单冻结版本' : (
      selectedBom && selectedBom.source === 'latest_active'
        ? '最新有效版本'
        : '当前可选历史版本'
    ),
    materialEditorVisible: false,
    materialEditorLoading: false,
    materialEditorLoaded: false,
    materialEditorError: '',
    bomMaterials: []
  };
}

function prepareEditableMaterial(material) {
  const rawSpecs = Array.isArray(material && material.specs) ? material.specs : [];
  const specOptions = [
    { id: null, name: '请选择物料规格', suppliers: [] },
    ...rawSpecs.map(spec => ({ ...spec }))
  ];
  const materialId = asId(material && (material.material_id || material.id));
  const selectedSpecId = asId(material && material.selected_spec_id);
  let specIndex = specOptions.findIndex(option => asId(option.id) === selectedSpecId);
  if (selectedSpecId && specIndex < 0) {
    specOptions.push({
      id: selectedSpecId,
      name: material.selected_spec_name || '原BOM规格',
      suppliers: []
    });
    specIndex = specOptions.length - 1;
  }
  if (specIndex < 0) specIndex = 0;

  const selectedSpec = specOptions[specIndex] || specOptions[0];
  const supplierOptions = [
    { id: null, name: '请选择供应商' },
    ...((selectedSpec && selectedSpec.suppliers) || []).map(supplier => ({ ...supplier }))
  ];
  const selectedSupplierId = asId(material && material.selected_supplier_id);
  let supplierIndex = supplierOptions.findIndex(
    option => asId(option.id) === selectedSupplierId
  );
  if (selectedSupplierId && supplierIndex < 0) {
    supplierOptions.push({
      id: selectedSupplierId,
      name: material.selected_supplier_name || '原BOM供应商'
    });
    supplierIndex = supplierOptions.length - 1;
  }
  if (supplierIndex < 0) supplierIndex = 0;

  return {
    ...material,
    id: materialId,
    materialId,
    deleted: !!(material && material.deleted),
    selectedSpecId,
    selectedSupplierId,
    specOptions,
    specIndex,
    supplierOptions,
    supplierIndex,
    remark: (material && material.remark) || ''
  };
}

function withInventorySplit(row) {
  const parsed = Number(row.quantity);
  const quantity = Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  const available = Number(
    row.reissueInfo && row.reissueInfo.available_count
  ) || 0;
  const returnInventoryQuantity = row.useReturnInventory
    ? Math.min(quantity, available)
    : 0;
  return {
    ...row,
    returnInventoryQuantity,
    productionQuantity: Math.max(quantity - returnInventoryQuantity, 0)
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
    bomOptionsByModel: {},
    bomRecommendationLoading: false,
    bomRecommendationError: '',

    channelEditing: false,
    regionDraft: '',
    brandIndex: -1,
    selectedBrand: null,
    savingChannel: false,

    productRows: [emptyProductRow(1)],
    nextRowKey: 2,
    remark: '',
    clientRequestId: newClientRequestId(),
    createdPlan: null,
    createdSuccessTip: ''
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
    const merchant = this.data.selectedMerchant;
    const brand = this.data.selectedBrand;
    if (merchant && merchant.configured && brand) {
      this.loadMerchantBomOptions(
        merchant,
        brand,
        () => wx.stopPullDownRefresh(),
        true
      );
      return;
    }
    this.loadOptions(() => wx.stopPullDownRefresh());
  },

  loadOptions(done) {
    this.setData({ loading: true, loadError: '' });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/material-flow/options/`,
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
          catalogCategories: data.categories || [],
          bomOptionsByModel: data.bom_options_by_product_model ||
            data.available_boms_by_product_model || data.boms_by_product_model || {}
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
      createdPlan: null,
      bomRecommendationError: ''
    });

    if (merchant.configured && brandIndex >= 0) {
      // Do not leave the previous merchant's brand, rows, or BOM recommendation
      // editable while the merchant-specific recommendation is loading.
      this.applyBrand(null);
      this.loadMerchantBomOptions(merchant, this.data.brands[brandIndex]);
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
        this.applyBrand(null);
        this.loadMerchantBomOptions(selectedMerchant, brand);
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

  loadMerchantBomOptions(merchant, brand, done, preserveRows) {
    if (!merchant || !merchant.id) {
      if (!preserveRows) this.applyBrand(brand || null);
      if (done) done();
      return;
    }
    this.setData({ bomRecommendationLoading: true, bomRecommendationError: '' });
    wx.request({
      url: (
        `${app.globalData.apiBase}/sales/order-plans/material-flow/options/` +
        `?merchant_id=${encodeURIComponent(merchant.id)}`
      ),
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        const currentMerchant = this.data.selectedMerchant;
        if (!currentMerchant || String(currentMerchant.id) !== String(merchant.id)) return;
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ bomRecommendationError: '登录状态已失效，已按通用BOM显示' });
          if (!preserveRows) this.applyBrand(brand || null);
          return;
        }
        if (body.code !== 0 || !body.data) {
          this.setData({ bomRecommendationError: body.msg || '商家历史BOM加载失败，已按通用BOM显示' });
          if (!preserveRows) this.applyBrand(brand || null);
          return;
        }
        const data = body.data;
        this.setData({
          catalogCategories: data.categories || this.data.catalogCategories,
          bomOptionsByModel: data.bom_options_by_product_model ||
            data.available_boms_by_product_model || data.boms_by_product_model ||
            this.data.bomOptionsByModel,
          bomRecommendationError: ''
        }, () => {
          if (!preserveRows) this.applyBrand(brand || null);
        });
      },
      fail: () => {
        const currentMerchant = this.data.selectedMerchant;
        if (!currentMerchant || String(currentMerchant.id) !== String(merchant.id)) return;
        this.setData({ bomRecommendationError: '商家历史BOM网络请求失败，已按通用BOM显示' });
        if (!preserveRows) this.applyBrand(brand || null);
      },
      complete: () => {
        const currentMerchant = this.data.selectedMerchant;
        if (currentMerchant && String(currentMerchant.id) === String(merchant.id)) {
          this.setData({ bomRecommendationLoading: false });
        }
        if (done) done();
      }
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
            productModelName: '',
            bomOptions: [],
            bomIndex: -1,
            sourceBomId: '',
            selectedBom: null,
            selectedBomSourceName: '',
            materialEditorVisible: false,
            materialEditorLoading: false,
            materialEditorLoaded: false,
            materialEditorError: '',
            bomMaterials: [],
            reissueLoading: false,
            reissueError: '',
            reissueInfo: null,
            useReturnInventory: false,
            returnInventoryQuantity: 0,
            productionQuantity: Number(row.quantity) || 0
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
      return withSelectedBom({
        ...row,
        modelIndex,
        productModelId: productModel.id,
        productModelName: productModel.name,
        reissueLoading: true,
        reissueError: '',
        reissueInfo: null,
        useReturnInventory: false,
        returnInventoryQuantity: 0,
        productionQuantity: Number(row.quantity) || 0
      }, productModel, this.data.bomOptionsByModel || {});
    });
    this.setData({ productRows }, () => this.loadReissueOptions(key));
  },

  onBomChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const bomIndex = Number(e.detail.value);
    const row = this.data.productRows.find(item => item.key === key);
    const selectedBom = row && row.bomOptions[bomIndex];
    if (!row || !selectedBom || String(row.sourceBomId) === String(selectedBom.id)) return;

    const applySelection = () => {
      const productRows = this.data.productRows.map(current => (
        current.key === key
          ? {
              ...current,
              bomIndex,
              sourceBomId: selectedBom.id,
              selectedBom,
              selectedBomSourceName: (
                selectedBom.source === 'previous_order' || selectedBom.is_recommended
              ) ? '该商家最近订单冻结版本' : (
                selectedBom.source === 'latest_active' ? '最新有效版本' : '手动选择历史版本'
              ),
              materialEditorLoading: false,
              materialEditorLoaded: false,
              materialEditorError: '',
              bomMaterials: []
            }
          : current
      ));
      this.setData({ productRows }, () => {
        const current = this.data.productRows.find(item => item.key === key);
        if (current && current.materialEditorVisible) this.loadBomMaterials(key);
      });
    };

    if (row.materialEditorLoaded || row.bomMaterials.length) {
      wx.showModal({
        title: `切换到${selectedBom.version || '该BOM版本'}`,
        content: '切换会清除本次尚未提交的物料修改，并按新版本重新展开物料。',
        confirmText: '确认切换',
        success: result => {
          if (result.confirm) applySelection();
        }
      });
      return;
    }
    applySelection();
  },

  toggleBomEditor(e) {
    const key = Number(e.currentTarget.dataset.key);
    const row = this.data.productRows.find(item => item.key === key);
    if (!row || !row.productModelId || !row.sourceBomId) {
      wx.showToast({ title: '请先选择产品型号和BOM版本', icon: 'none' });
      return;
    }
    const materialEditorVisible = !row.materialEditorVisible;
    const productRows = this.data.productRows.map(current => (
      current.key === key ? { ...current, materialEditorVisible } : current
    ));
    this.setData({ productRows }, () => {
      const current = this.data.productRows.find(item => item.key === key);
      if (materialEditorVisible && current && !current.materialEditorLoaded && !current.materialEditorLoading) {
        this.loadBomMaterials(key);
      }
    });
  },

  reloadBomMaterials(e) {
    const key = Number(e.currentTarget.dataset.key);
    this.loadBomMaterials(key, true);
  },

  loadBomMaterials(key, forceReload) {
    const row = this.data.productRows.find(item => item.key === key);
    if (!row || !row.categoryId || !row.productModelId || !row.sourceBomId) return;
    if (row.materialEditorLoading || (row.materialEditorLoaded && !forceReload)) return;
    const expected = {
      categoryId: row.categoryId,
      productModelId: row.productModelId,
      sourceBomId: row.sourceBomId
    };
    this.updateBomEditorRow(key, {
      materialEditorLoading: true,
      materialEditorError: ''
    });
    wx.request({
      url: (
        `${app.globalData.apiBase}/sales/order-plans/material-flow/bom-detail/` +
        `?category_id=${encodeURIComponent(expected.categoryId)}` +
        `&product_model_id=${encodeURIComponent(expected.productModelId)}` +
        `&source_bom_id=${encodeURIComponent(expected.sourceBomId)}`
      ),
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        const current = this.data.productRows.find(item => item.key === key);
        if (!current ||
          String(current.categoryId) !== String(expected.categoryId) ||
          String(current.productModelId) !== String(expected.productModelId) ||
          String(current.sourceBomId) !== String(expected.sourceBomId)) return;
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.updateBomEditorRow(key, {
            materialEditorLoading: false,
            materialEditorError: '登录已失效，请重新进入'
          });
          return;
        }
        if (body.code !== 0 || !body.data || !Array.isArray(body.data.materials)) {
          this.updateBomEditorRow(key, {
            materialEditorLoading: false,
            materialEditorError: body.msg || 'BOM物料清单加载失败'
          });
          return;
        }
        this.updateBomEditorRow(key, {
          materialEditorLoading: false,
          materialEditorLoaded: true,
          materialEditorError: '',
          bomMaterials: body.data.materials.map(material => prepareEditableMaterial(material))
        });
      },
      fail: () => this.updateBomEditorRow(key, {
        materialEditorLoading: false,
        materialEditorError: 'BOM物料清单网络请求失败'
      })
    });
  },

  updateBomEditorRow(key, updates) {
    const productRows = this.data.productRows.map(row => (
      row.key === key ? { ...row, ...updates } : row
    ));
    this.setData({ productRows });
  },

  onMaterialDeleteChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const materialIndex = Number(e.currentTarget.dataset.materialIndex);
    this.updateBomMaterial(key, materialIndex, { deleted: !!e.detail.value });
  },

  onMaterialSpecChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const materialIndex = Number(e.currentTarget.dataset.materialIndex);
    const row = this.data.productRows.find(item => item.key === key);
    const material = row && row.bomMaterials[materialIndex];
    if (!material) return;
    const specIndex = Number(e.detail.value) || 0;
    const spec = material.specOptions[specIndex] || material.specOptions[0];
    const supplierOptions = [
      { id: null, name: '请选择供应商' },
      ...((spec && spec.suppliers) || []).map(supplier => ({ ...supplier }))
    ];
    let supplierIndex = supplierOptions.findIndex(
      option => asId(option.id) === asId(material.selectedSupplierId)
    );
    if (supplierIndex < 0) supplierIndex = 0;
    this.updateBomMaterial(key, materialIndex, {
      specIndex,
      selectedSpecId: asId(spec && spec.id),
      supplierOptions,
      supplierIndex,
      selectedSupplierId: asId(supplierOptions[supplierIndex].id)
    });
  },

  onMaterialSupplierChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const materialIndex = Number(e.currentTarget.dataset.materialIndex);
    const row = this.data.productRows.find(item => item.key === key);
    const material = row && row.bomMaterials[materialIndex];
    if (!material) return;
    const supplierIndex = Number(e.detail.value) || 0;
    const supplier = material.supplierOptions[supplierIndex] || { id: null };
    this.updateBomMaterial(key, materialIndex, {
      supplierIndex,
      selectedSupplierId: asId(supplier.id)
    });
  },

  onMaterialRemarkInput(e) {
    const key = Number(e.currentTarget.dataset.key);
    const materialIndex = Number(e.currentTarget.dataset.materialIndex);
    this.updateBomMaterial(key, materialIndex, { remark: e.detail.value });
  },

  updateBomMaterial(key, materialIndex, updates) {
    const productRows = this.data.productRows.map(row => {
      if (row.key !== key) return row;
      return {
        ...row,
        bomMaterials: row.bomMaterials.map((material, index) => (
          index === materialIndex ? { ...material, ...updates } : material
        ))
      };
    });
    this.setData({ productRows });
  },

  loadReissueOptions(key) {
    const merchant = this.data.selectedMerchant;
    const row = this.data.productRows.find(item => item.key === key);
    if (!merchant || !row || !row.productModelId) return;
    const requestedModelId = row.productModelId;
    wx.request({
      url: (
        `${app.globalData.apiBase}/sales/order-plans/reissue-options/` +
        `?merchant_id=${encodeURIComponent(merchant.id)}` +
        `&product_model_id=${encodeURIComponent(requestedModelId)}`
      ),
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const payload = res.data || {};
        const current = this.data.productRows.find(item => item.key === key);
        if (!current || String(current.productModelId) !== String(requestedModelId)) return;
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.updateReissueRow(key, null, '登录已失效，请重新进入');
          return;
        }
        if (payload.code !== 0 || !payload.data) {
          this.updateReissueRow(key, null, payload.msg || '成品库存查询失败');
          return;
        }
        this.updateReissueRow(key, payload.data, '');
      },
      fail: () => this.updateReissueRow(key, null, '成品库存网络请求失败')
    });
  },

  updateReissueRow(key, reissueInfo, reissueError) {
    const productRows = this.data.productRows.map(row => {
      if (row.key !== key) return row;
      return withInventorySplit({
        ...row,
        reissueLoading: false,
        reissueError,
        reissueInfo,
        useReturnInventory: reissueInfo && reissueInfo.available_count > 0
          ? row.useReturnInventory
          : false
      });
    });
    this.setData({ productRows });
  },

  onUseReturnInventoryChange(e) {
    const key = Number(e.currentTarget.dataset.key);
    const productRows = this.data.productRows.map(row => (
      row.key === key
        ? withInventorySplit({ ...row, useReturnInventory: !!e.detail.value })
        : row
    ));
    this.setData({ productRows });
  },

  onQuantityInput(e) {
    const key = Number(e.currentTarget.dataset.key);
    const quantity = e.detail.value;
    this.setData({
      productRows: this.data.productRows.map(row => (
        row.key === key ? withInventorySplit({ ...row, quantity }) : row
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
      if (!row.sourceBomId) return `请选择第${index + 1}项产品的BOM版本`;
      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return `第${index + 1}项数量必须是正整数`;
      }
      if (row.materialEditorLoading) {
        return `第${index + 1}项BOM物料仍在加载，请稍候`;
      }
      if (row.materialEditorLoaded) {
        const activeMaterials = row.bomMaterials.filter(material => !material.deleted);
        if (!activeMaterials.length) {
          return `第${index + 1}项不能删除全部BOM物料`;
        }
        const incomplete = activeMaterials.find(material => (
          !material.materialId || !material.selectedSpecId || !material.selectedSupplierId
        ));
        if (incomplete) {
          return `请为第${index + 1}项的物料“${incomplete.name || ''}”选择规格和供应商`;
        }
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
      url: `${app.globalData.apiBase}/sales/order-plans/material-flow/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        merchant_id: this.data.selectedMerchant.id,
        client_request_id: this.data.clientRequestId,
        remark: this.data.remark,
        items: this.data.productRows.map(row => {
          const item = {
            category_id: row.categoryId,
            product_model_id: row.productModelId,
            quantity: Number(row.quantity),
            use_return_inventory: !!row.useReturnInventory,
            source_bom_id: row.sourceBomId
          };
          if (row.materialEditorLoaded) {
            item.materials = row.bomMaterials.map(material => ({
              material_id: material.materialId,
              material_spec_id: material.selectedSpecId,
              supplier_id: material.selectedSupplierId,
              deleted: !!material.deleted,
              remark: material.remark || ''
            }));
          }
          return item;
        })
      },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效，请重新进入', icon: 'none' });
          return;
        }
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '订单计划创建失败', icon: 'none' });
          return;
        }
        const createdPlan = body.data.plan || body.data.order_plan || body.data;
        const productionQuantity = (createdPlan.items || []).reduce(
          (sum, item) => sum + (Number(item.production_quantity) || 0),
          0
        );
        const returnInventoryQuantity = (createdPlan.items || []).reduce(
          (sum, item) => sum + (Number(item.return_inventory_quantity) || 0),
          0
        );
        const createdSuccessTip = productionQuantity > 0
          ? `新生产${productionQuantity}台已生成物料预占与到料计划，总订单已同步相关岗位`
          : `全部调用成品库存${returnInventoryQuantity}台，订单已同步相关岗位`;
        this.setData({ createdPlan, createdSuccessTip });
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
      createdPlan: null,
      createdSuccessTip: ''
    });
  },

  openCreatedPlan() {
    const createdPlan = this.data.createdPlan;
    if (!createdPlan || !createdPlan.id) return;
    wx.navigateTo({
      url: `/pages/sales/order_plan_detail/order_plan_detail?order_plan_id=${createdPlan.id}`,
      fail: () => wx.showToast({ title: '订单详情打开失败', icon: 'none' })
    });
  }
});
