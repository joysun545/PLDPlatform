const app = getApp();


function normalizeToken(value) {
  let token = '';
  try {
    token = decodeURIComponent(value || '').trim();
  } catch (e) {
    token = String(value || '').trim();
  }
  if (/^[0-9a-fA-F]{32}$/.test(token)) {
    return [
      token.slice(0, 8), token.slice(8, 12), token.slice(12, 16),
      token.slice(16, 20), token.slice(20)
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
    canAccept: false,
    canOpenDevices: false
  },

  onLoad(options) {
    this._unloaded = false;
    const token = normalizeToken(options && (options.token || options.scene));
    if (!token) {
      this.setData({ loading: false, error: '车辆分享参数缺失' });
      return;
    }
    this.setData({ token });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录失败，请重新打开分享链接' });
        return;
      }
      this.loadInvitation();
    });
  },

  onUnload() {
    this._unloaded = true;
    this._invitationRequestId = (this._invitationRequestId || 0) + 1;
    if (this._openDevicesTimer) clearTimeout(this._openDevicesTimer);
  },

  applyInvitationDetail(detail) {
    const blocked = !!String(detail.blocked_reason || '').trim();
    this.setData({
      loading: false,
      error: '',
      detail,
      canAccept: !blocked && detail.status === 'PENDING'
        && detail.acceptance_allowed === true,
      canOpenDevices: !blocked && detail.status === 'ACCEPTED'
        && detail.current_access_allowed === true
    });
  },

  invalidateInvitation(message) {
    this._invitationRequestId = (this._invitationRequestId || 0) + 1;
    this.setData({
      loading: false,
      error: message || '',
      detail: null,
      canAccept: false,
      canOpenDevices: false
    });
  },

  loadInvitation() {
    this.invalidateInvitation();
    const requestId = this._invitationRequestId;
    this.setData({ loading: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/driver-invitations/${this.data.token}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (this._unloaded || requestId !== this._invitationRequestId) return;
        if (res.statusCode === 401 || (res.data && res.data.code === 401)) {
          app.reauthenticate();
          this.setData({ loading: false, error: '登录已失效，请重新打开分享链接' });
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300
          || !res.data || res.data.code !== 0 || !res.data.data) {
          this.setData({
            loading: false,
            error: (res.data && res.data.msg) || '车辆分享链接无效'
          });
          return;
        }
        this.applyInvitationDetail(res.data.data);
      },
      fail: () => {
        if (this._unloaded || requestId !== this._invitationRequestId) return;
        this.setData({ loading: false, error: '网络请求失败' });
      }
    });
  },

  acceptInvitation() {
    const detail = this.data.detail;
    if (this._unloaded || this.data.loading || this.data.submitting
      || !this.data.canAccept || !detail || detail.status !== 'PENDING'
      || detail.acceptance_allowed !== true || detail.blocked_reason) return;
    // A subsequent response to an older preview must not restore stale access.
    this._invitationRequestId = (this._invitationRequestId || 0) + 1;
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在加入车辆...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/driver-invitations/${this.data.token}/accept/`,
      method: 'POST',
      header: app.authHeader(),
      success: res => {
        if (this._unloaded) return;
        if (res.statusCode === 401 || (res.data && res.data.code === 401)) {
          this.invalidateInvitation('登录已失效，请重新打开分享链接');
          app.reauthenticate();
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300
          || !res.data || res.data.code !== 0 || !res.data.data) {
          this.invalidateInvitation();
          wx.showToast({
            title: (res.data && res.data.msg) || '接受车辆邀请失败',
            icon: 'none'
          });
          this.loadInvitation();
          return;
        }
        this.applyInvitationDetail(res.data.data);
        if (!this.data.canOpenDevices) {
          wx.showToast({
            title: res.data.data.blocked_reason || '当前未获得车辆设备访问权限',
            icon: 'none'
          });
          this.loadInvitation();
          return;
        }
        const finish = () => {
          if (this._unloaded || !this.data.canOpenDevices) return;
          wx.showToast({ title: '车辆设备已加入', icon: 'success' });
          this._openDevicesTimer = setTimeout(() => this.openDevices(), 500);
        };
        if (typeof app.refreshUserProfile === 'function') {
          app.refreshUserProfile(ok => {
            if (this._unloaded) return;
            if (ok !== true) {
              this.invalidateInvitation('账号信息刷新失败，请重新打开分享链接');
              return;
            }
            finish();
          });
        } else {
          finish();
        }
      },
      fail: () => {
        if (this._unloaded) return;
        this.invalidateInvitation();
        wx.showToast({ title: '网络请求失败', icon: 'none' });
        this.loadInvitation();
      },
      complete: () => {
        wx.hideLoading();
        if (!this._unloaded) this.setData({ submitting: false });
      }
    });
  },

  openDevices() {
    const detail = this.data.detail;
    if (this._unloaded || this.data.loading || this.data.submitting
      || !this.data.canOpenDevices || !detail || detail.status !== 'ACCEPTED'
      || detail.current_access_allowed !== true || detail.blocked_reason) return;
    wx.redirectTo({ url: '/pages/customer/device/list/list' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index/index' });
  }
});
