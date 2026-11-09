const app = getApp();
const theme = require('../../../utils/theme');
const tabBar = typeof require === 'function'
  ? require('../../../utils/tab-bar')
  : { sync() {} };


Page({
  data: {
    role: 'tourist',
    nickname: '',
    role_name: '',
    iconTheme: 'jade',
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
    const colorScheme = theme.get().color_scheme;
    this.setData({
      role: app.globalData.role || 'tourist',
      nickname: app.globalData.nickname || '用户',
      role_name: app.globalData.role_name || '游客',
      iconTheme: ['jade', 'ocean', 'amber'].includes(colorScheme) ? colorScheme : 'jade'
    });
  },

  controlTabBar() {
    tabBar.sync(this, 1, { hidden: this.data.role === 'tourist' });
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

        if (qrText.startsWith('PLDP_WEB_LOGIN|')) {
          this.approveWebPortalLogin(qrText);
          return;
        }

        if (qrText.startsWith('PLDP_DEVICE_CODE_LOGIN|')) {
          this.approveDeviceCodeRegistryLogin(qrText);
          return;
        }

        if (qrText.startsWith('PLDP_PRINT_LOGIN|')) {
          this.approvePrintCenterLogin(qrText);
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

  approveWebPortalLogin(qrText) {
    const match = /^PLDP_WEB_LOGIN\|([a-f0-9]{64})$/.exec(qrText);
    if (!match) {
      this.finishScanning();
      wx.showToast({ title: '网页登录二维码无效', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '授权电脑登录 PLDP',
      content: '允许当前电脑以你的小程序账号身份登录对应管理工作台？请仅在本人电脑上确认。',
      confirmText: '确认登录',
      success: result => {
        if (!result.confirm) { this.finishScanning(); return; }
        wx.showLoading({ title: '正在核验身份', mask: true });
        const webBase = app.globalData.apiBase.replace(/\/api\/?$/, '');
        wx.request({
          url: `${webBase}/web/portal/api/approve/`,
          method: 'POST',
          header: app.authHeader('application/json'),
          data: { token: match[1] },
          success: res => {
            const body = res.data || {};
            if (res.statusCode === 401) app.reauthenticate();
            if (res.statusCode < 200 || res.statusCode >= 300 || body.code !== 0) {
              wx.showModal({ title: '登录授权未完成', content: body.msg || '请确认角色权限，或刷新电脑二维码后重试。', showCancel: false });
              return;
            }
            const data = body.data || {};
            wx.showModal({ title: '电脑登录已授权', content: `${data.organization_name || ''} · ${data.role_name || ''}。请返回电脑继续操作，完成后退出登录。`, showCancel: false });
          },
          fail: () => wx.showToast({ title: '网络请求失败，请重试', icon: 'none' }),
          complete: () => { wx.hideLoading(); this.finishScanning(); }
        });
      },
      fail: () => this.finishScanning()
    });
  },

  approvePrintCenterLogin(qrText) {
    const match = /^PLDP_PRINT_LOGIN\|([a-f0-9]{64})$/.exec(qrText);
    if (!match) {
      this.finishScanning();
      wx.showToast({ title: '打印中心登录二维码无效', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '授权电脑进入打印中心',
      content: '允许当前电脑使用你获准的成品打印权限？仅在本人电脑上确认。',
      confirmText: '确认授权',
      success: result => {
        if (!result.confirm) {
          this.finishScanning();
          return;
        }
        wx.showLoading({ title: '正在核验身份', mask: true });
        const webBase = app.globalData.apiBase.replace(/\/api\/?$/, '');
        wx.request({
          url: `${webBase}/web/print/api/login/approve/`,
          method: 'POST',
          header: app.authHeader('application/json'),
          data: { token: match[1] },
          success: res => {
            const body = res.data || {};
            if (res.statusCode === 401) app.reauthenticate();
            if (res.statusCode < 200 || res.statusCode >= 300 || body.code !== 0) {
              wx.showModal({
                title: '授权未完成',
                content: body.msg || '请确认当前账号拥有成品打印权限，再刷新电脑二维码并扫码。',
                showCancel: false
              });
              return;
            }
            const data = body.data || {};
            wx.showModal({
              title: '打印中心已授权',
              content: `${data.organization_name || '当前厂家'} · ${data.role_name || '当前岗位'}。请返回电脑继续打印，完成后退出登录。`,
              showCancel: false
            });
          },
          fail: () => wx.showToast({ title: '网络请求失败，请查看电脑状态后重试', icon: 'none' }),
          complete: () => {
            wx.hideLoading();
            this.finishScanning();
          }
        });
      },
      fail: () => this.finishScanning()
    });
  },

  approveDeviceCodeRegistryLogin(qrText) {
    const match = /^PLDP_DEVICE_CODE_LOGIN\|([a-f0-9]{64})$/.exec(qrText);
    if (!match) {
      this.finishScanning();
      wx.showToast({ title: '设备编码发行页面登录二维码无效', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '授权进入设备编码发行页面',
      content: '允许当前电脑以你的厂家角色进入设备编码发行页面？该页面用于生成编码和第三方制作文件，不执行成品打印。',
      confirmText: '确认授权',
      success: result => {
        if (!result.confirm) {
          this.finishScanning();
          return;
        }
        wx.showLoading({ title: '正在核验身份', mask: true });
        const webBase = app.globalData.apiBase.replace(/\/api\/?$/, '');
        wx.request({
          url: `${webBase}/web/device-codes/api/login/approve/`,
          method: 'POST',
          header: app.authHeader('application/json'),
          data: { token: match[1] },
          success: res => {
            const body = res.data || {};
            if (res.statusCode === 401) app.reauthenticate();
            if (res.statusCode < 200 || res.statusCode >= 300 || body.code !== 0) {
              wx.showModal({
                title: '授权未完成',
                content: body.msg || '当前角色没有权限，或二维码已过期。请确认后返回网页刷新二维码。',
                showCancel: false
              });
              return;
            }
            const data = body.data || {};
            wx.showModal({
              title: '设备编码发行页面已授权',
              content: `${data.organization_name || '当前厂家'} · ${data.role_name || '厂家角色'}。请返回电脑继续操作，完成后退出登录。`,
              showCancel: false
            });
          },
          fail: () => wx.showToast({ title: '网络请求失败，请查看电脑状态后重试', icon: 'none' }),
          complete: () => {
            wx.hideLoading();
            this.finishScanning();
          }
        });
      },
      fail: () => this.finishScanning()
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
