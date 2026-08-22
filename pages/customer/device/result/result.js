const app = getApp();


function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


Page({
  data: {
    deviceId: null,
    loading: true,
    activating: false,
    error: '',
    device: null,
    asset: null,
    production: null,
    parameters: [],
    lifecycle: [],
    customer: null,
    region: null,
    ownership: null,
    vehicleNo: '',
    baseCanActivate: false,
    canActivate: false,
    isActivated: false,
    canApplyAftersale: false,
    documentGate: null,
    documents: [],
    telemetry: null,
    telemetryLoading: false
  },

  onLoad(options) {
    const deviceId = Number(options && options.device_id);
    if (!deviceId) {
      this.setData({ loading: false, error: '设备参数无效' });
      return;
    }
    this.setData({ deviceId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录失败，请重新进入' });
        return;
      }
      this.loadDevice();
    });
  },

  onShow() {
    if (this.data.deviceId && this.data.device && !this.data.activating) {
      this.loadDevice(true);
      this.loadDocuments();
      this.loadTelemetry();
    }
  },

  loadDevice(silent = false) {
    if (!silent) this.setData({ loading: true, error: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, error: '登录已失效，请重新进入' });
          return;
        }
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          if (!silent) {
            this.setData({
              loading: false,
              error: (res.data && res.data.msg) || '无法读取用户设备'
            });
          }
          return;
        }
        this.applyPayload(res.data.data);
        this.loadDocuments();
        this.loadTelemetry();
      },
      fail: () => {
        if (!silent) this.setData({ loading: false, error: '网络请求失败' });
      }
    });
  },

  applyPayload(payload) {
    const scan = payload.scan_result || {};
    const device = scan.device || {};
    const customer = payload.customer || {};
    const profile = customer.profile || {};
    const production = payload.production || {};
    const lifecycle = (payload.lifecycle || []).map(item => ({
      ...item,
      created_at_text: formatDateTime(item.created_at)
    }));
    if (device.installation) {
      device.installation.installed_at_text = formatDateTime(
        device.installation.installed_at
      );
    }
    const state = device.state || device.status_summary || {};
    const capabilities = scan.capabilities || [];
    const actions = payload.actions || {};
    const baseCanActivate = capabilities.includes('activate_device') &&
      actions.can_activate !== false;
    const gate = this.data.documentGate;
    this.setData({
      loading: false,
      error: '',
      device,
      asset: payload.asset || null,
      production: {
        ...production,
        production_date_text: production.production_date || ''
      },
      parameters: payload.parameters || [],
      lifecycle,
      customer,
      region: scan.region || null,
      ownership: scan.ownership || null,
      vehicleNo: profile.vehicle_no || this.data.vehicleNo || '',
      baseCanActivate,
      canActivate: baseCanActivate && (!gate || gate.activation_allowed !== false),
      isActivated: state.activation_status === 'ACTIVATED',
      canApplyAftersale: actions.can_apply_aftersale === true ||
        state.activation_status === 'ACTIVATED'
    });
  },

  loadDocuments() {
    if (!this.data.deviceId) return;
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/documents/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (!res.data || res.data.code !== 0 || !res.data.data) return;
        const gate = res.data.data;
        this.setData({
          documentGate: gate,
          documents: gate.documents || [],
          canActivate: this.data.baseCanActivate && gate.activation_allowed !== false
        });
      }
    });
  },

  loadTelemetry() {
    if (!this.data.deviceId || this.data.telemetryLoading) return;
    this.setData({ telemetryLoading: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/telemetry/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.data && res.data.code === 0 && res.data.data) {
          this.setData({ telemetry: res.data.data });
        }
      },
      complete: () => this.setData({ telemetryLoading: false })
    });
  },

  openDocument(e) {
    const documentId = Number(e.currentTarget.dataset.id);
    if (!documentId) return;
    wx.navigateTo({
      url: `/pages/customer/document/reader/reader?device_id=${this.data.deviceId}&document_id=${documentId}`
    });
  },

  onVehicleNoInput(e) {
    this.setData({ vehicleNo: e.detail.value });
  },

  confirmActivation() {
    if (this.data.activating) return;
    if (!this.data.canActivate) {
      const gate = this.data.documentGate;
      wx.showToast({
        title: (gate && gate.message) || '当前不能激活设备',
        icon: 'none'
      });
      return;
    }
    const vehicleNo = this.data.vehicleNo.trim();
    if (!vehicleNo) {
      wx.showToast({ title: '请填写车辆牌号', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认激活设备',
      content: `设备：${this.data.device.sn}\n车辆：${vehicleNo}\n激活后将正式进入使用状态。`,
      confirmText: '确认激活',
      success: res => {
        if (res.confirm) this.collectLocationAndActivate(vehicleNo);
      }
    });
  },

  goAftersale() {
    wx.navigateTo({
      url: `/pages/customer/aftersale/request/request?device_id=${this.data.deviceId}`
    });
  },

  goDeviceList() {
    wx.redirectTo({ url: '/pages/customer/device/list/list' });
  },

  collectLocationAndActivate(vehicleNo) {
    wx.getLocation({
      type: 'gcj02',
      success: location => {
        this.activateDevice(
          vehicleNo,
          `${location.latitude},${location.longitude}`
        );
      },
      fail: () => this.activateDevice(vehicleNo, '')
    });
  },

  activateDevice(vehicleNo, location) {
    this.setData({ activating: true });
    wx.showLoading({ title: '正在激活设备...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/activate/`,
      method: 'POST',
      header: app.authHeader(),
      data: { vehicle_no: vehicleNo, location: location || '' },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录已失效', icon: 'none' });
          return;
        }
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          wx.showToast({
            title: (res.data && res.data.msg) || '激活失败',
            icon: 'none'
          });
          return;
        }
        this.applyPayload(res.data.data);
        wx.showToast({ title: '设备激活成功', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ activating: false });
      }
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index/index' });
  }
});
