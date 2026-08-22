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
    loading: true,
    loaded: false,
    error: '',
    customer: null,
    total: 0,
    activatedCount: 0,
    pendingActivationCount: 0,
    devices: []
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录失败，请重新进入' });
        return;
      }
      this.loadDevices();
    });
  },

  onShow() {
    if (this.data.loaded) this.loadDevices(true);
  },

  onPullDownRefresh() {
    this.loadDevices(true, true);
  },

  loadDevices(silent = false, pullDown = false) {
    if (!silent) this.setData({ loading: true, error: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/customer/devices/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ loading: false, error: '登录已失效，请重新进入' });
          return;
        }
        if (!res.data || res.data.code !== 0 || !res.data.data) {
          this.setData({
            loading: false,
            error: (res.data && res.data.msg) || '无法读取设备清单'
          });
          return;
        }
        const payload = res.data.data;
        const devices = (payload.devices || []).map(item => ({
          ...item,
          accepted_at_text: formatDateTime(item.accepted_at),
          install_status_name: item.install_status === 'INSTALLED' ? '已安装' : '待安装',
          activation_status_name: item.activation_status === 'ACTIVATED' ? '已激活' : '待激活'
        }));
        this.setData({
          loading: false,
          loaded: true,
          error: '',
          customer: payload.customer || null,
          total: Number(payload.total) || 0,
          activatedCount: Number(payload.activated_count) || 0,
          pendingActivationCount: Number(payload.pending_activation_count) || 0,
          devices
        });
      },
      fail: () => this.setData({ loading: false, error: '网络请求失败' }),
      complete: () => {
        if (pullDown) wx.stopPullDownRefresh();
      }
    });
  },

  openDevice(e) {
    const deviceId = Number(e.currentTarget.dataset.id);
    if (!deviceId) return;
    wx.navigateTo({
      url: `/pages/customer/device/result/result?device_id=${deviceId}`
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index/index' });
  }
});
