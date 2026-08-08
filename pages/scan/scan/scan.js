const app = getApp();


Page({
  data: {
    role: 'tourist',
    nickname: '',
    role_name: '',
    scanning: false
  },

  onLoad() {
    this.updateUserInfo();
    app.ensureLogin((ok) => {
      if (ok) this.updateUserInfo();
    });
  },

  onShow() {
    this.updateUserInfo();
    this.controlTabBar();
  },

  onUnload() {
    this.finishScanning();
  },

  updateUserInfo() {
    this.setData({
      role: app.globalData.role || 'tourist',
      nickname: app.globalData.nickname || '用户',
      role_name: app.globalData.role_name || '游客'
    });
  },

  controlTabBar() {
    if (this.data.role === 'tourist') {
      wx.hideTabBar();
    } else {
      wx.showTabBar();
    }
  },

  directScan() {
    if (this.data.scanning || app.globalData._isScanning) return;

    app.ensureLogin((ok) => {
      if (!ok) {
        wx.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
        return;
      }
      this.openScanner();
    });
  },

  openScanner() {
    this.setData({ scanning: true });
    app.globalData._isScanning = true;

    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode'],
      success: (res) => {
        const qrText = (res.result || '').trim();
        if (!qrText) {
          this.finishScanning();
          wx.showToast({ title: '二维码无效', icon: 'none' });
          return;
        }

        if (qrText.startsWith('INSTALL_INVITE|')) {
          this.finishScanning();
          const token = qrText.split('|')[1];
          if (!token) {
            wx.showToast({ title: '邀请二维码无效', icon: 'none' });
            return;
          }
          wx.navigateTo({
            url: '/pages/customer/invite/accept/accept' +
              `?token=${encodeURIComponent(token)}`
          });
          return;
        }

        this.resolveDeviceQRCode(qrText);
      },
      fail: (err) => {
        this.finishScanning();
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  resolveDeviceQRCode(qrText) {
    wx.showLoading({ title: '识别设备...', mask: true });

    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/scan/resolve/`,
      method: 'POST',
      header: app.authHeader(),
      data: { qr_text: qrText },
      success: (res) => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录已失效，请重新扫码', icon: 'none' });
          return;
        }

        if (!res.data || res.data.code !== 0 || !res.data.data) {
          wx.showToast({
            title: (res.data && res.data.msg) || '未识别到设备',
            icon: 'none'
          });
          return;
        }

        const scanData = res.data.data;
        if (
          scanData.role === 'customer_owner' &&
          scanData.viewer_relation === 'direct_owner' &&
          scanData.device && scanData.device.id
        ) {
          wx.navigateTo({
            url: `/pages/customer/device/result/result?device_id=${scanData.device.id}`,
            fail: () => {
              wx.showToast({ title: '无法打开用户设备页面', icon: 'none' });
            }
          });
          return;
        }

        wx.navigateTo({
          url: '/pages/scan/result/result',
          success: (navigation) => {
            navigation.eventChannel.emit('scanResolved', scanData);
          },
          fail: () => {
            wx.showToast({ title: '无法打开扫码结果', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
        this.finishScanning();
      }
    });
  },

  finishScanning() {
    app.globalData._isScanning = false;
    if (this.data.scanning) {
      this.setData({ scanning: false });
    }
  }
});
