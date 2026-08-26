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
    detail: null
  },

  onLoad(options) {
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

  loadInvitation() {
    this.setData({ loading: true, error: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/driver-invitations/${this.data.token}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, error: '登录已失效，请重新打开分享链接' });
          return;
        }
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          this.setData({
            loading: false,
            error: (res.data && res.data.msg) || '车辆分享链接无效'
          });
          return;
        }
        this.setData({ loading: false, detail: res.data.data });
      },
      fail: () => this.setData({ loading: false, error: '网络请求失败' })
    });
  },

  acceptInvitation() {
    if (this.data.submitting || !this.data.detail) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在加入车辆...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/driver-invitations/${this.data.token}/accept/`,
      method: 'POST',
      header: app.authHeader(),
      success: res => {
        if (!res.data || res.data.code !== 0) {
          wx.showToast({
            title: (res.data && res.data.msg) || '接受车辆邀请失败',
            icon: 'none'
          });
          return;
        }
        const finish = () => {
          wx.showToast({ title: '车辆设备已加入', icon: 'success' });
          setTimeout(() => this.openDevices(), 500);
        };
        if (typeof app.refreshUserProfile === 'function') {
          app.refreshUserProfile(() => finish());
        } else {
          finish();
        }
      },
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    });
  },

  openDevices() {
    wx.redirectTo({ url: '/pages/customer/device/list/list' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index/index' });
  }
});
