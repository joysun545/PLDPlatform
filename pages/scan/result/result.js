const app = getApp();


function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


function countdownText(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remain = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}


Page({
  data: {
    loading: true,
    error: '',
    actionLoading: false,
    qrText: '',

    viewMode: 'public',
    viewModeName: '设备公开信息',
    viewerRelationName: '',
    viewerRelationSummary: '',
    capabilities: [],

    device: null,
    region: null,
    ownership: null,
    ownershipPath: [],
    upstreamAccountOwners: [],
    traceability: null,

    showRegion: false,
    showDeviceDetail: false,
    showOwnership: false,
    showTraceability: false,
    traceExpanded: false,
    canInstall: false,
    canCreateCustomerInvitation: false,
    isPendingActivation: false,
    isActivated: false,

    showInvitationModal: false,
    invitation: null,
    invitationExpired: false,
    invitationCountdown: '00:00'
  },

  onLoad(options) {
    const eventChannel = this.getOpenerEventChannel();
    eventChannel.on('scanResolved', payload => {
      this.applyResult(payload);
    });

    if (options && options.qr_text) {
      this.resolveQRCode(decodeURIComponent(options.qr_text));
    }
  },

  onShow() {
    if (this.data.device && this.data.qrText && !this.data.loading) {
      this.refreshCurrentResult(true);
    }
  },

  onUnload() {
    this.stopInvitationTimer();
    this.stopStatusPolling();
  },

  applyResult(payload) {
    if (!payload || !payload.device) {
      this.setData({ loading: false, error: '扫码结果无效' });
      return;
    }

    const capabilities = payload.capabilities || [];
    const device = Object.assign({}, payload.device);
    if (device.state) {
      device.state.last_event_time_text = formatDateTime(device.state.last_event_time);
    }
    if (device.installation) {
      device.installation.installed_at_text = formatDateTime(
        device.installation.installed_at
      );
    }

    const ownership = payload.ownership || null;
    const region = Object.assign(
      { name: '', owner: null },
      payload.region || {}
    );
    const rawOwnershipPath = ownership ? (
      ownership.organization_path || []
    ) : [];
    const ownershipPath = rawOwnershipPath.map((item, index) => ({
      ...item,
      isLast: index === rawOwnershipPath.length - 1
    }));
    const state = device.state || device.status_summary || {};
    const modeNames = {
      public: '设备公开信息',
      registered: '设备区域信息',
      chain: '设备链路信息'
    };
    const isActivated = state.activation_status === 'ACTIVATED';
    const isPendingActivation = (
      state.install_status === 'INSTALLED' && !isActivated
    );
    const relationNames = payload.viewer_relation_names || [];
    const customerInvitation = payload.customer_invitation || null;

    this.setData({
      loading: false,
      error: '',
      qrText: payload.qr_code || this.data.qrText,
      viewMode: payload.view_mode || 'public',
      viewModeName: modeNames[payload.view_mode] || '设备信息',
      viewerRelationName: payload.viewer_relation_name || '',
      viewerRelationSummary: relationNames.length ? (
        relationNames.join(' · ')
      ) : (payload.viewer_relation_name || ''),
      capabilities,
      device,
      region,
      ownership,
      ownershipPath,
      upstreamAccountOwners: ownership ? (
        ownership.upstream_account_owners || []
      ) : [],
      traceability: payload.traceability || null,
      showRegion: capabilities.includes('view_region_owner'),
      showDeviceDetail: capabilities.includes('view_device_detail'),
      showOwnership: capabilities.includes('view_ownership'),
      showTraceability: (
        capabilities.includes('view_traceability') && !!payload.traceability
      ),
      canInstall: capabilities.includes('install_device'),
      canCreateCustomerInvitation: capabilities.includes(
        'create_customer_invitation'
      ),
      isPendingActivation,
      isActivated
    });

    if (
      customerInvitation &&
      customerInvitation.status === 'ACCEPTED' &&
      this.data.showInvitationModal
    ) {
      this.closeInvitationModal();
      wx.showToast({ title: '用户负责人已接受邀请', icon: 'success' });
    } else if (isActivated && this.data.showInvitationModal) {
      this.closeInvitationModal();
      wx.showToast({ title: '用户已完成激活', icon: 'success' });
    }
  },

  resolveQRCode(qrText) {
    this.setData({ loading: true, error: '', qrText });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录失败，请返回后重新扫码' });
        return;
      }
      this.requestResolve(qrText, false);
    });
  },

  refreshCurrentResult(silent = true) {
    if (!this.data.qrText) return;
    this.requestResolve(this.data.qrText, silent);
  },

  requestResolve(qrText, silent) {
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/scan/resolve/`,
      method: 'POST',
      header: app.authHeader(),
      data: { qr_text: qrText },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
        }
        if (res.data && res.data.code === 0 && res.data.data) {
          this.applyResult(res.data.data);
          return;
        }
        if (!silent) {
          this.setData({
            loading: false,
            error: (res.data && res.data.msg) || '未识别到设备'
          });
        }
      },
      fail: () => {
        if (!silent) {
          this.setData({ loading: false, error: '网络请求失败' });
        }
      }
    });
  },

  toggleTraceability() {
    this.setData({ traceExpanded: !this.data.traceExpanded });
  },

  confirmInstall() {
    if (!this.data.canInstall || this.data.actionLoading) return;
    const device = this.data.device;
    wx.showModal({
      title: '确认完成装车',
      content: `产品：${device.product_model.name}\n设备编号：${device.sn}\n请确认实物设备已经完成装车。`,
      confirmText: '确认装车',
      success: res => {
        if (res.confirm) this.collectLocationAndInstall();
      }
    });
  },

  collectLocationAndInstall() {
    wx.getLocation({
      type: 'gcj02',
      success: location => {
        this.submitInstallation(
          `${location.latitude},${location.longitude}`
        );
      },
      fail: () => this.submitInstallation('')
    });
  },

  submitInstallation(location) {
    this.setData({ actionLoading: true });
    wx.showLoading({ title: '正在登记装车...', mask: true });

    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/scan/install/`,
      method: 'POST',
      header: app.authHeader(),
      data: {
        device_id: this.data.device.id,
        location: location || ''
      },
      success: res => this.handleInstallationResponse(res, '装车登记成功'),
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ actionLoading: false });
      }
    });
  },

  refreshCustomerInvitation() {
    if (this.data.actionLoading) return;
    this.setData({ actionLoading: true });
    wx.showLoading({ title: '生成邀请二维码...', mask: true });

    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/scan/customer-invitation/refresh/`,
      method: 'POST',
      header: app.authHeader(),
      data: { device_id: this.data.device.id },
      success: res => this.handleInstallationResponse(res, '邀请二维码已生成'),
      fail: () => wx.showToast({ title: '网络请求失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ actionLoading: false });
      }
    });
  },

  handleInstallationResponse(res, successTitle) {
    if (res.statusCode === 401) {
      app.reauthenticate();
      wx.showToast({ title: '登录已失效，请重新操作', icon: 'none' });
      return;
    }

    if (!res.data || res.data.code !== 0 || !res.data.data) {
      wx.showToast({
        title: (res.data && res.data.msg) || '操作失败',
        icon: 'none'
      });
      this.refreshCurrentResult(true);
      return;
    }

    const data = res.data.data;
    if (data.scan_result) this.applyResult(data.scan_result);
    if (data.invitation) this.openInvitationModal(data.invitation);
    wx.showToast({ title: successTitle, icon: 'success' });
  },

  openInvitationModal(invitation) {
    const seconds = Number(invitation.remaining_seconds) || 0;
    this.setData({
      showInvitationModal: true,
      invitation,
      invitationExpired: seconds <= 0,
      invitationCountdown: countdownText(seconds)
    });
    this.startInvitationTimer();
    this.startStatusPolling();
  },

  closeInvitationModal() {
    this.stopInvitationTimer();
    this.stopStatusPolling();
    this.setData({
      showInvitationModal: false,
      invitation: null,
      invitationExpired: false,
      invitationCountdown: '00:00'
    });
  },

  startInvitationTimer() {
    this.stopInvitationTimer();
    this._invitationTimer = setInterval(() => {
      const invitation = this.data.invitation;
      if (!invitation) return;
      const expiresAt = new Date(invitation.expires_at).getTime();
      const seconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      this.setData({
        invitationCountdown: countdownText(seconds),
        invitationExpired: seconds <= 0
      });
      if (seconds <= 0) this.stopInvitationTimer();
    }, 1000);
  },

  stopInvitationTimer() {
    if (this._invitationTimer) {
      clearInterval(this._invitationTimer);
      this._invitationTimer = null;
    }
  },

  startStatusPolling() {
    this.stopStatusPolling();
    this._statusTimer = setInterval(() => {
      if (this.data.showInvitationModal) this.refreshCurrentResult(true);
    }, 5000);
  },

  stopStatusPolling() {
    if (this._statusTimer) {
      clearInterval(this._statusTimer);
      this._statusTimer = null;
    }
  },

  stopTap() {},

  scanAgain() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: '/pages/scan/scan/scan' });
  }
});
