const app = getApp();

function asId(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

Page({
  data: {
    orderPlanId: null,
    plan: null,
    items: [],
    loading: true,
    switchingBom: false,
    submitting: false,
    errorMessage: ''
  },

  onLoad(options) {
    const orderPlanId = asId(options && options.order_plan_id);
    if (!orderPlanId) {
      this.setData({ loading: false, errorMessage: '订单计划参数无效' });
      return;
    }
    this.setData({ orderPlanId });
    app.ensureLogin((ok) => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录状态获取失败' });
        return;
      }
      this.loadPlan();
    });
  },

  onPullDownRefresh() {
    this.loadPlan(() => wx.stopPullDownRefresh());
  },

  loadPlan(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/matching/`,
      method: 'GET',
      header: app.authHeader(),
      success: (res) => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, errorMessage: '登录已失效，请重新进入' });
          return;
        }
        const payload = res.data || {};
        if (payload.code !== 0 || !payload.data) {
          this.setData({
            loading: false,
            errorMessage: payload.msg || '订单配套数据加载失败'
          });
          return;
        }
        this.applyPlan(payload.data);
      },
      fail: () => {
        this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' });
      },
      complete: () => done && done()
    });
  },

  applyPlan(plan) {
    const items = (plan.items || []).map(item => this.preparePlanItem(item));
    this.setData({ plan, items, loading: false, errorMessage: '' });
  },

  preparePlanItem(item) {
    const defaultBom = { ...(item.default_bom || {}) };
    const bomOptions = (item.available_boms || []).map(bom => ({
      ...bom,
      display_name: bom.remark
        ? `${bom.version} · ${bom.remark}`
        : bom.version
    }));
    let bomIndex = bomOptions.findIndex(
      option => asId(option.id) === asId(defaultBom.id)
    );
    if (defaultBom.id && bomIndex < 0) {
      bomOptions.push({
        ...defaultBom,
        display_name: defaultBom.version || '当前BOM版本'
      });
      bomIndex = bomOptions.length - 1;
    }
    if (bomIndex < 0) bomIndex = 0;

    return {
      ...item,
      bomOptions,
      bomIndex,
      selectedBomId: asId(defaultBom.id),
      selectedBom: defaultBom,
      selectedBomLabel: `默认 ${defaultBom.version || ''}`,
      selectedBomSourceName: defaultBom.source_name || '',
      materials: (item.materials || []).map(material => (
        this.prepareMaterial(material)
      ))
    };
  },

  prepareMaterial(material) {
    const specOptions = [
      { id: null, name: '请选择物料规格', suppliers: [] },
      ...(material.specs || []).map(spec => ({ ...spec }))
    ];
    let specIndex = specOptions.findIndex(
      option => asId(option.id) === asId(material.selected_spec_id)
    );
    if (material.selected_spec_id && specIndex < 0) {
      specOptions.push({
        id: material.selected_spec_id,
        name: material.selected_spec_name || '原BOM规格',
        suppliers: []
      });
      specIndex = specOptions.length - 1;
    }
    if (specIndex < 0) specIndex = 0;

    const selectedSpec = specOptions[specIndex] || specOptions[0];
    const supplierOptions = [
      { id: null, name: '请选择供应商' },
      ...((selectedSpec && selectedSpec.suppliers) || []).map(supplier => ({
        ...supplier
      }))
    ];
    let supplierIndex = supplierOptions.findIndex(
      option => asId(option.id) === asId(material.selected_supplier_id)
    );
    if (material.selected_supplier_id && supplierIndex < 0) {
      supplierOptions.push({
        id: material.selected_supplier_id,
        name: material.selected_supplier_name || '原BOM供应商'
      });
      supplierIndex = supplierOptions.length - 1;
    }
    if (supplierIndex < 0) supplierIndex = 0;

    return {
      ...material,
      deleted: !!material.deleted,
      selectedSpecId: asId(material.selected_spec_id),
      selectedSupplierId: asId(material.selected_supplier_id),
      specOptions,
      specIndex,
      supplierOptions,
      supplierIndex
    };
  },

  onBomVersionChange(e) {
    if (
      this.data.switchingBom ||
      (this.data.plan && this.data.plan.read_only)
    ) return;
    const itemIndex = Number(e.currentTarget.dataset.itemIndex);
    const bomIndex = Number(e.detail.value);
    const item = this.data.items[itemIndex];
    const option = item && item.bomOptions[bomIndex];
    if (!item || !option || !asId(option.id)) return;
    if (asId(option.id) === asId(item.selectedBomId)) return;

    wx.showModal({
      title: `切换到${option.version}`,
      content: '切换后，该产品当前未提交的物料修改将被清除，并按所选BOM版本重新展开全部物料。',
      confirmText: '确认切换',
      success: (result) => {
        if (result.confirm) this.loadBomVersion(itemIndex, bomIndex);
      }
    });
  },

  loadBomVersion(itemIndex, bomIndex) {
    const item = this.data.items[itemIndex];
    const option = item && item.bomOptions[bomIndex];
    if (!item || !option) return;

    this.setData({ switchingBom: true });
    wx.showLoading({ title: `加载${option.version}...`, mask: true });
    wx.request({
      url: (
        `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}` +
        `/matching/items/${item.id}/boms/${option.id}/`
      ),
      method: 'GET',
      header: app.authHeader(),
      success: (res) => {
        const payload = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录已失效', icon: 'none' });
          return;
        }
        if (payload.code !== 0 || !payload.data || !payload.data.bom) {
          wx.showToast({ title: payload.msg || 'BOM版本加载失败', icon: 'none' });
          return;
        }
        const bom = payload.data.bom;
        const isDefault = asId(bom.id) === asId(item.default_bom.id);
        const base = `items[${itemIndex}]`;
        this.setData({
          [`${base}.bomIndex`]: bomIndex,
          [`${base}.selectedBomId`]: asId(bom.id),
          [`${base}.selectedBom`]: bom,
          [`${base}.selectedBomLabel`]: `${isDefault ? '默认' : '已选'} ${bom.version}`,
          [`${base}.selectedBomSourceName`]: isDefault
            ? item.default_bom.source_name
            : '手动选择历史版本',
          [`${base}.materials`]: (payload.data.materials || []).map(material => (
            this.prepareMaterial(material)
          ))
        });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ switchingBom: false });
      }
    });
  },

  onDeleteChange(e) {
    if (this.data.plan && this.data.plan.read_only) return;
    const { itemIndex, materialIndex } = e.currentTarget.dataset;
    this.setData({
      [`items[${itemIndex}].materials[${materialIndex}].deleted`]: !!e.detail.value
    });
  },

  onSpecChange(e) {
    if (this.data.plan && this.data.plan.read_only) return;
    const { itemIndex, materialIndex } = e.currentTarget.dataset;
    const specIndex = Number(e.detail.value) || 0;
    const material = this.data.items[itemIndex].materials[materialIndex];
    const spec = material.specOptions[specIndex] || material.specOptions[0];
    const supplierOptions = [
      { id: null, name: '请选择供应商' },
      ...((spec && spec.suppliers) || []).map(supplier => ({ ...supplier }))
    ];
    const oldSupplierId = material.selectedSupplierId;
    let supplierIndex = supplierOptions.findIndex(
      option => asId(option.id) === asId(oldSupplierId)
    );
    if (supplierIndex < 0) supplierIndex = 0;
    const base = `items[${itemIndex}].materials[${materialIndex}]`;
    this.setData({
      [`${base}.specIndex`]: specIndex,
      [`${base}.selectedSpecId`]: asId(spec.id),
      [`${base}.supplierOptions`]: supplierOptions,
      [`${base}.supplierIndex`]: supplierIndex,
      [`${base}.selectedSupplierId`]: asId(supplierOptions[supplierIndex].id)
    });
  },

  onSupplierChange(e) {
    if (this.data.plan && this.data.plan.read_only) return;
    const { itemIndex, materialIndex } = e.currentTarget.dataset;
    const supplierIndex = Number(e.detail.value) || 0;
    const material = this.data.items[itemIndex].materials[materialIndex];
    const supplier = material.supplierOptions[supplierIndex] || { id: null };
    const base = `items[${itemIndex}].materials[${materialIndex}]`;
    this.setData({
      [`${base}.supplierIndex`]: supplierIndex,
      [`${base}.selectedSupplierId`]: asId(supplier.id)
    });
  },

  onRemarkInput(e) {
    if (this.data.plan && this.data.plan.read_only) return;
    const { itemIndex, materialIndex } = e.currentTarget.dataset;
    this.setData({
      [`items[${itemIndex}].materials[${materialIndex}].remark`]: e.detail.value
    });
  },

  submitConfirmation() {
    if (
      this.data.submitting ||
      this.data.switchingBom ||
      !this.data.plan ||
      this.data.plan.read_only
    ) return;
    wx.showModal({
      title: '确认全部产品BOM',
      content: '未修改的型号继续使用当前所选版本；有任何修改的型号将自动创建下一个BOM版本。确认后不能在本页撤回。',
      confirmText: '确认提交',
      success: (result) => {
        if (result.confirm) this.doSubmit();
      }
    });
  },

  doSubmit() {
    const items = this.data.items.map(item => ({
      order_plan_item_id: item.id,
      source_bom_id: item.selectedBomId,
      materials: item.materials.map(material => ({
        material_id: material.id,
        material_spec_id: material.selectedSpecId,
        supplier_id: material.selectedSupplierId,
        deleted: !!material.deleted,
        remark: material.remark || ''
      }))
    }));
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/matching/confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { items },
      success: (res) => {
        const payload = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录已失效', icon: 'none' });
          return;
        }
        if (payload.code !== 0 || !payload.data) {
          wx.showToast({ title: payload.msg || '确认失败', icon: 'none' });
          return;
        }
        this.applyPlan(payload.data);
        app.refreshTasks();
        wx.showToast({ title: '配套确认成功', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    });
  },

  retryLoad() {
    this.loadPlan();
  }
});
