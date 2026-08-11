const app = getApp();

const SCOPE_TYPES = {
  CATEGORY: '按产品品类',
  MATERIAL: '按物料名称'
};

Page({
  data: {
    loading: true,
    saving: false,
    errorMessage: '',
    supplier: null,
    precedenceRule: '',
    managers: [],
    managerIndex: -1,
    selectedManager: null,
    scopeType: 'CATEGORY',
    scopeLabel: SCOPE_TYPES.CATEGORY,
    targetOptions: [],
    selectedTargetIds: [],
    hasManagers: false
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      if (app.globalData.role !== 'supplier_owner') {
        wx.showModal({
          title: '无法进入',
          content: '只有供应商负责人账号可以分配销售责任范围',
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
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/supply-chain/sales-responsibilities/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, errorMessage: '登录状态已失效' });
          return;
        }
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, errorMessage: body.msg || '责任范围加载失败' });
          return;
        }
        this.applyPayload(body.data);
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  applyPayload(payload) {
    const managers = payload.sales_managers || [];
    let managerIndex = this.data.managerIndex;
    if (managerIndex < 0 || managerIndex >= managers.length) {
      managerIndex = managers.length ? 0 : -1;
    }
    const selectedManager = managerIndex >= 0 ? managers[managerIndex] : null;
    const scopeType = selectedManager && selectedManager.scope_type
      ? selectedManager.scope_type
      : 'CATEGORY';
    this._categories = payload.categories || [];
    this._materials = payload.materials || [];
    this.setData({
      loading: false,
      supplier: payload.supplier || null,
      precedenceRule: payload.precedence_rule || '',
      managers,
      hasManagers: managers.length > 0,
      managerIndex,
      selectedManager,
      scopeType,
      scopeLabel: SCOPE_TYPES[scopeType],
      selectedTargetIds: selectedManager ? (selectedManager.target_ids || []).map(Number) : []
    });
    this.refreshTargetOptions();
  },

  onManagerChange(e) {
    const managerIndex = Number(e.detail.value);
    const selectedManager = this.data.managers[managerIndex];
    const scopeType = selectedManager.scope_type || 'CATEGORY';
    this.setData({
      managerIndex,
      selectedManager,
      scopeType,
      scopeLabel: SCOPE_TYPES[scopeType],
      selectedTargetIds: (selectedManager.target_ids || []).map(Number)
    });
    this.refreshTargetOptions();
  },

  onScopeChange(e) {
    const scopeType = e.detail.value;
    this.setData({
      scopeType,
      scopeLabel: SCOPE_TYPES[scopeType],
      selectedTargetIds: []
    });
    this.refreshTargetOptions();
  },

  onTargetsChange(e) {
    const selectedTargetIds = (e.detail.value || []).map(Number);
    this.setData({ selectedTargetIds });
    this.refreshTargetOptions();
  },

  refreshTargetOptions() {
    const source = this.data.scopeType === 'MATERIAL'
      ? (this._materials || [])
      : (this._categories || []);
    const selected = new Set(this.data.selectedTargetIds.map(Number));
    const currentIdentityId = this.data.selectedManager
      ? this.data.selectedManager.identity_id
      : null;
    this.setData({
      targetOptions: source.map(item => ({
        ...item,
        checked: selected.has(Number(item.id)),
        occupiedByOther: !!(
          item.assigned_manager &&
          item.assigned_manager.identity_id !== currentIdentityId
        ),
        assignedName: item.assigned_manager ? item.assigned_manager.name : ''
      }))
    });
  },

  saveResponsibilities() {
    if (!this.data.selectedManager || this.data.saving) return;
    const selected = new Set(this.data.selectedTargetIds.map(Number));
    const reassigned = this.data.targetOptions.filter(
      item => selected.has(Number(item.id)) && item.occupiedByOther
    );
    if (reassigned.length) {
      wx.showModal({
        title: '确认改派责任范围',
        content: `有 ${reassigned.length} 项当前由其他销售经理负责，保存后将改派给 ${this.data.selectedManager.name}。`,
        confirmText: '确认改派',
        success: result => {
          if (result.confirm) this.submitResponsibilities();
        }
      });
      return;
    }
    this.submitResponsibilities();
  },

  submitResponsibilities() {
    this.setData({ saving: true });
    wx.request({
      url: `${app.globalData.apiBase}/supply-chain/sales-responsibilities/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        sales_identity_id: this.data.selectedManager.identity_id,
        scope_type: this.data.scopeType,
        target_ids: this.data.selectedTargetIds
      },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '保存失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '责任范围已保存', icon: 'success' });
        this.applyPayload(body.data);
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => this.setData({ saving: false })
    });
  },

  retryLoad() {
    this.loadOptions();
  }
});
