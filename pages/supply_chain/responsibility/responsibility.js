const app = getApp();

Page({
  data: {
    loading: true,
    saving: false,
    errorMessage: '',
    supplier: null,
    ruleMessage: '',
    assignmentMode: '',
    managers: [],
    managerIndex: -1,
    selectedManager: null,
    targetOptions: [],
    selectedTargetIds: [],
    hasManagers: false,
    needsAssignment: false
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
          content: '只有供应商负责人账号可以配置销售物料责任',
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
    const assignmentMode = payload.assignment_mode || 'OWNER_ONLY';
    this._materials = payload.materials || [];
    this.setData({
      loading: false,
      supplier: payload.supplier || null,
      ruleMessage: payload.rule_message || '',
      assignmentMode,
      managers,
      hasManagers: managers.length > 0,
      needsAssignment: assignmentMode === 'MULTI_SALES_BY_MATERIAL',
      managerIndex,
      selectedManager,
      selectedTargetIds: selectedManager ? (selectedManager.target_ids || []).map(Number) : []
    });
    this.refreshTargetOptions();
  },

  onManagerChange(e) {
    const managerIndex = Number(e.detail.value);
    const selectedManager = this.data.managers[managerIndex];
    this.setData({
      managerIndex,
      selectedManager,
      selectedTargetIds: (selectedManager.target_ids || []).map(Number)
    });
    this.refreshTargetOptions();
  },

  onTargetsChange(e) {
    this.setData({ selectedTargetIds: (e.detail.value || []).map(Number) });
    this.refreshTargetOptions();
  },

  refreshTargetOptions() {
    const selected = new Set(this.data.selectedTargetIds.map(Number));
    const currentIdentityId = this.data.selectedManager
      ? this.data.selectedManager.identity_id
      : null;
    this.setData({
      targetOptions: (this._materials || []).map(item => ({
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
    if (!this.data.needsAssignment || !this.data.selectedManager || this.data.saving) return;
    const selected = new Set(this.data.selectedTargetIds.map(Number));
    const reassigned = this.data.targetOptions.filter(
      item => selected.has(Number(item.id)) && item.occupiedByOther
    );
    if (reassigned.length) {
      wx.showModal({
        title: '确认改派物料责任',
        content: `有 ${reassigned.length} 类物料当前由其他销售经理负责，保存后将改派给 ${this.data.selectedManager.name}。`,
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
        scope_type: 'MATERIAL',
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
        wx.showToast({ title: '物料责任已保存', icon: 'success' });
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
