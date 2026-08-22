const app = getApp();


function secondsText(value) {
  const seconds = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}


function normalizeInvitationToken(value) {
  let token = '';
  try {
    token = decodeURIComponent(value || '').trim();
  } catch (e) {
    token = String(value || '').trim();
  }

  // 微信小程序码 scene 最多 32 个可见字符，因此后端传 UUID.hex。
  // 这里恢复为 Django <uuid:token> 路由可识别的标准 UUID。
  if (/^[0-9a-fA-F]{32}$/.test(token)) {
    return [
      token.slice(0, 8),
      token.slice(8, 12),
      token.slice(12, 16),
      token.slice(16, 20),
      token.slice(20)
    ].join('-').toLowerCase();
  }
  return token;
}


Page({
  data: {
    token: '',
    loading: true,
    submitting: false,
    error: '',
    detail: null,
    countdown: '00:00',
    expired: false,
    customerTypes: ['个人用户', '企业或车队'],
    customerTypeIndex: 0,
    existingCustomerIdentity: false,
    addingDevice: false,
    form: {
      customer_name: '',
      contact_name: '',
      phone: '',
      region: '',
      address: '',
      vehicle_no: ''
    },
    agreed: false
  },

  onLoad(options) {
    const token = normalizeInvitationToken(
      options && (options.scene || options.token)
    );
    if (!token) {
      this.setData({ loading: false, error: '邀请参数缺失' });
      return;
    }
    this.setData({ token });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录失败，请重新扫码' });
        return;
      }
      this.loadInvitation();
    });
  },

  onUnload() {
    this.stopCountdown();
  },

  loadInvitation() {
    this.setData({ loading: true, error: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/scan/customer-invitations/${this.data.token}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, error: '登录已失效，请重新扫码' });
          return;
        }
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          this.setData({
            loading: false,
            error: (res.data && res.data.msg) || '邀请二维码无效'
          });
          return;
        }
        const detail = res.data.data;
        if (detail.accepted_by_me) {
          this.openDeviceResult(detail.device.id);
          return;
        }
        const viewer = detail.viewer || {};
        const profile = detail.customer_profile || detail.customer_data || {};
        const addingDevice = detail.acceptance_mode === 'ADD_DEVICE';
        const existingCustomerIdentity = Boolean(
          viewer.has_identity && viewer.role === 'customer_owner'
        );
        const customerTypeIndex = String(
          profile.customer_type || 'PERSONAL'
        ).toUpperCase() === 'FLEET' ? 1 : 0;
        this.setData({
          loading: false,
          detail,
          existingCustomerIdentity,
          addingDevice,
          customerTypeIndex,
          form: {
            customer_name: profile.customer_name || viewer.organization_name || '',
            contact_name: profile.contact_name || viewer.nickname || '',
            phone: profile.phone || viewer.phone || '',
            region: profile.region || viewer.region || '',
            address: profile.address || '',
            vehicle_no: profile.vehicle_no || ''
          },
          expired: Number(detail.remaining_seconds) <= 0,
          countdown: secondsText(detail.remaining_seconds)
        });
        this.startCountdown();
      },
      fail: () => {
        this.setData({ loading: false, error: '网络请求失败' });
      }
    });
  },

  startCountdown() {
    this.stopCountdown();
    this._timer = setInterval(() => {
      const detail = this.data.detail;
      if (!detail) return;
      const expiresAt = new Date(detail.expires_at).getTime();
      const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      this.setData({ countdown: secondsText(seconds), expired: seconds <= 0 });
      if (seconds <= 0) this.stopCountdown();
    }, 1000);
  },

  stopCountdown() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  onCustomerTypeChange(e) {
    if (this.data.existingCustomerIdentity) return;
    this.setData({ customerTypeIndex: Number(e.detail.value) || 0 });
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onRegionChange(e) {
    const region = (e.detail.value || []).join(' ');
    this.setData({ 'form.region': region });
  },

  onAgreeChange(e) {
    this.setData({ agreed: (e.detail.value || []).includes('agree') });
  },

  validateForm() {
    const form = this.data.form;
    if (this.data.customerTypeIndex === 1 && !form.customer_name.trim()) {
      return '请填写企业或车队名称';
    }
    if (!form.contact_name.trim()) return '请填写联系人';
    if (!form.phone.trim()) return '请填写联系电话';
    if (!form.region.trim()) return '请选择所在地区';
    if (!form.vehicle_no.trim()) return '请填写装车车辆牌号';
    if (!this.data.agreed) return '请先确认资料并同意服务协议';
    return '';
  },

  acceptInvitation() {
    if (this.data.submitting || this.data.expired) return;
    if (!this.data.detail || !this.data.detail.acceptance_allowed) {
      wx.showToast({
        title: (this.data.detail && this.data.detail.blocked_reason) || '当前账号不能接受',
        icon: 'none'
      });
      return;
    }
    const error = this.validateForm();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    const form = this.data.form;
    this.setData({ submitting: true });
    wx.showLoading({
      title: this.data.addingDevice ? '正在添加设备...' : '正在建立用户身份...',
      mask: true
    });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/scan/customer-invitations/${this.data.token}/accept/`,
      method: 'POST',
      header: app.authHeader(),
      data: {
        customer_type: this.data.customerTypeIndex === 1 ? 'FLEET' : 'PERSONAL',
        customer_name: form.customer_name.trim(),
        contact_name: form.contact_name.trim(),
        phone: form.phone.trim(),
        region: form.region.trim(),
        address: form.address.trim(),
        vehicle_no: form.vehicle_no.trim()
      },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录已失效，请重新扫码', icon: 'none' });
          return;
        }
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          wx.showToast({
            title: (res.data && res.data.msg) || '接受邀请失败',
            icon: 'none'
          });
          return;
        }
        const deviceId = res.data.data.device_id;
        app.refreshUserProfile(() => {
          wx.showToast({
            title: this.data.addingDevice ? '设备添加成功' : '加入成功',
            icon: 'success'
          });
          setTimeout(() => this.openDeviceResult(deviceId), 500);
        });
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    });
  },

  openDeviceResult(deviceId) {
    wx.redirectTo({
      url: `/pages/customer/device/result/result?device_id=${deviceId}`
    });
  }
});
