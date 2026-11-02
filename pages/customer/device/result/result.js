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
    activationMethod: 'VEHICLE_PLATE',
    physicalDeviceCode: '',
    verifyingDeviceCode: false,
    activation: null,
    baseCanActivate: false,
    canActivate: false,
    isActivated: false,
    canApplyAftersale: false,
    documentGate: null,
    documents: [],
    telemetry: null,
    telemetryLoading: false,
    parametersExpanded: false,
    productionExpanded: false,
    identityExpanded: false,
    statusExpanded: false,
    documentsExpanded: false,
    telemetryExpanded: false,
    lifecycleExpanded: false
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
    const activation = payload.activation || null;
    const activationMethod = activation && activation.activation_method
      ? activation.activation_method
      : (this.data.activationMethod || 'VEHICLE_PLATE');
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
      vehicleNo: activation && activation.vehicle_no
        ? activation.vehicle_no
        : (profile.vehicle_no || this.data.vehicleNo || ''),
      activationMethod,
      physicalDeviceCode: activation && activation.physical_device_code
        ? activation.physical_device_code
        : (device.physical_device_code || ''),
      activation,
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

  toggleInfoSection(event) {
    const key = event.currentTarget.dataset.key;
    const allowedKeys = [
      'parametersExpanded',
      'productionExpanded',
      'identityExpanded',
      'statusExpanded',
      'documentsExpanded',
      'telemetryExpanded',
      'lifecycleExpanded'
    ];
    if (!allowedKeys.includes(key)) return;
    this.setData({ [key]: !this.data[key] });
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

  onActivationMethodChange(e) {
    const method = e.detail.value === 'DEVICE_CODE' ? 'DEVICE_CODE' : 'VEHICLE_PLATE';
    this.setData({ activationMethod: method, physicalDeviceCode: '' });
  },

  scanPhysicalDeviceCode() {
    if (this.data.activating || this.data.verifyingDeviceCode) return;
    wx.scanCode({
      scanType: ['qrCode'],
      success: result => {
        const code = String(result && result.result || '').trim();
        if (!code) {
          wx.showToast({ title: '没有读取到设备编码', icon: 'none' });
          return;
        }
        this.setData({ verifyingDeviceCode: true, physicalDeviceCode: '' });
        wx.request({
          url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/activation-code/verify/`,
          method: 'POST',
          header: app.authHeader(),
          data: { device_code: code },
          success: response => {
            if (response.statusCode === 401) {
              app.reauthenticate();
              wx.showToast({ title: '登录已失效，请重新进入', icon: 'none' });
              return;
            }
            const payload = response.data && response.data.data;
            if (response.data && response.data.code === 0 && payload && payload.verified) {
              this.setData({ physicalDeviceCode: payload.device_code || '' });
              wx.showToast({ title: '设备编码验证通过', icon: 'success' });
              return;
            }
            this.setData({ physicalDeviceCode: '' });
            wx.showModal({
              title: '设备编码验证失败',
              content: (response.data && response.data.msg) || '该编码未登记或不可用于此设备，请联系厂家核实。',
              showCancel: false
            });
          },
          fail: () => {
            this.setData({ physicalDeviceCode: '' });
            wx.showToast({ title: '设备编码验证请求失败，请重试', icon: 'none' });
          },
          complete: () => this.setData({ verifyingDeviceCode: false })
        });
      },
      fail: () => wx.showToast({ title: '未完成扫码，可重试或选择车牌号方式', icon: 'none' })
    });
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
    const activationMethod = this.data.activationMethod || 'VEHICLE_PLATE';
    const vehicleNo = activationMethod === 'VEHICLE_PLATE'
      ? this.data.vehicleNo.trim()
      : '';
    const physicalDeviceCode = activationMethod === 'DEVICE_CODE'
      ? this.data.physicalDeviceCode.trim()
      : '';
    if (activationMethod === 'VEHICLE_PLATE' && !vehicleNo) {
      wx.showToast({ title: '请填写车辆牌号', icon: 'none' });
      return;
    }
    if (activationMethod === 'DEVICE_CODE' && !physicalDeviceCode) {
      wx.showToast({ title: '请先扫描设备编码二维码', icon: 'none' });
      return;
    }
    const bindingText = activationMethod === 'DEVICE_CODE'
      ? `设备编码：${physicalDeviceCode}`
      : `车辆：${vehicleNo}`;
    wx.showModal({
      title: '确认激活设备',
      content: `生命周期编码：${this.data.device.lifecycle_code || '-'}\n${bindingText}\n激活后将正式进入使用状态。`,
      confirmText: '确认激活',
      success: res => {
        if (res.confirm) {
          this.collectLocationAndActivate(
            activationMethod,
            vehicleNo,
            physicalDeviceCode
          );
        }
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

  collectLocationAndActivate(activationMethod, vehicleNo, physicalDeviceCode) {
    wx.getLocation({
      type: 'gcj02',
      success: location => {
        this.activateDevice(
          activationMethod,
          vehicleNo,
          physicalDeviceCode,
          `${location.latitude},${location.longitude}`
        );
      },
      fail: () => this.activateDevice(activationMethod, vehicleNo, physicalDeviceCode, '')
    });
  },

  activateDevice(activationMethod, vehicleNo, physicalDeviceCode, location) {
    this.setData({ activating: true });
    wx.showLoading({ title: '正在激活设备...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/${this.data.deviceId}/activate/`,
      method: 'POST',
      header: app.authHeader(),
      data: {
        activation_method: activationMethod,
        vehicle_no: vehicleNo || '',
        physical_device_code: physicalDeviceCode || '',
        location: location || ''
      },
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
