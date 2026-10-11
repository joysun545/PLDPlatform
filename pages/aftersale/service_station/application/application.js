const app = getApp();

const APPLICATION_URL = '/lifecycle/after-sales/service-station/application/';

Page({
  data: {
    loading: true,
    submitting: false,
    savingReceivingAddress: false,
    eligible: false,
    canSubmit: false,
    canEditReceivingAddress: false,
    reason: '',
    organizationName: '',
    application: null,
    serviceLocation: null,
    locationCapturedAt: '',
    locationCapturedAtLabel: '',
    receivingAddress: '',
    receivingContactName: '',
    receivingContactPhone: '',
    liaisonCandidates: [],
    selectedLiaisonIds: [],
    noticeItems: [],
    noticeAgreed: false,
    submitFeedback: '',
    submitFeedbackType: ''
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, reason: '登录状态失效，请重新进入小程序。' });
        return;
      }
      this.loadContext();
    });
  },

  loadContext(options = {}) {
    const silent = !!options.silent;
    if (!silent) this.setData({ loading: true });
    wx.request({
      url: `${app.globalData.apiBase}${APPLICATION_URL}`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (!res.data || res.data.code !== 0) {
          this.setData({ reason: (res.data && res.data.msg) || '无法读取服务站申请资料。' });
          return;
        }

        const data = res.data.data || {};
        const application = data.application || null;
        const savedLocation = application && application.service_location;
        const savedReceiving = application && application.receiving;
        const candidates = (data.liaison_candidates || []).map(item => ({
          ...item,
          selected: !!item.selected,
          phone: String(item.phone || '').trim()
        }));
        const selectedCandidate = candidates.find(item => item.selected) || candidates[0] || null;
        const selectedIds = selectedCandidate ? [Number(selectedCandidate.identity_id)] : [];
        if (selectedCandidate) {
          candidates.forEach(item => {
            item.selected = String(item.identity_id) === String(selectedCandidate.identity_id);
          });
        }
        const organization = data.organization || {};

        this.setData({
          eligible: !!data.eligible,
          canSubmit: !!data.can_submit,
          canEditReceivingAddress: !!data.can_edit_receiving_address,
          reason: data.reason || '',
          organizationName: (data.organization && data.organization.name) || '',
          application,
          serviceLocation: savedLocation ? {
            name: savedLocation.name || '',
            address: savedLocation.address || '',
            latitude: Number(savedLocation.latitude),
            longitude: Number(savedLocation.longitude)
          } : null,
          // Existing coordinates can be previewed, but every submission requires a fresh GPS capture.
          locationCapturedAt: '',
          locationCapturedAtLabel: '',
          receivingAddress: (savedReceiving && savedReceiving.address) || organization.address || '',
          // A selected member is the source of truth, even when their phone is
          // missing; never display the previous liaison's contact by fallback.
          receivingContactName: selectedCandidate
            ? (selectedCandidate.name || '')
            : ((savedReceiving && savedReceiving.contact_name) || ''),
          receivingContactPhone: selectedCandidate
            ? (selectedCandidate.phone || '')
            : ((savedReceiving && savedReceiving.contact_phone) || ''),
          liaisonCandidates: candidates,
          selectedLiaisonIds: selectedIds,
          noticeItems: (data.notice && data.notice.items) || [],
          noticeAgreed: false
        });
      },
      fail: () => this.setData({ reason: '网络错误，暂时无法读取服务站申请资料。' }),
      complete: () => {
        if (!silent) this.setData({ loading: false });
      }
    });
  },

  captureServiceLocation() {
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success: location => {
        if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
          wx.showToast({ title: '未获取到有效 GPS 定位，请重试', icon: 'none' });
          return;
        }
        const capturedAt = new Date();
        this.setData({
          serviceLocation: {
            name: '当前维修服务点',
            address: '',
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: Number(location.accuracy) || 0
          },
          locationCapturedAt: capturedAt.toISOString(),
          locationCapturedAtLabel: capturedAt.toLocaleString()
        });
        wx.showToast({ title: '已获取当前 GPS 定位', icon: 'success' });
      },
      fail: error => {
        const message = String((error && error.errMsg) || '').toLowerCase();
        wx.getSetting({
          success: setting => {
            if (setting.authSetting && setting.authSetting['scope.userLocation'] === false) {
              wx.showModal({
                title: '需要定位权限',
                content: '请允许小程序获取位置信息，用于确认实际提供维修服务的地点。',
                confirmText: '去设置',
                success: result => {
                  if (result.confirm) wx.openSetting({});
                }
              });
              return;
            }
            wx.showToast({
              title: message.includes('auth') || message.includes('permission')
                ? '请允许微信使用定位权限'
                : '无法获取当前位置，请检查设备定位服务后重试',
              icon: 'none',
              duration: 2600
            });
          },
          fail: () => wx.showToast({ title: '定位失败，请检查微信定位权限', icon: 'none' })
        });
      }
    });
  },

  openServiceLocation() {
    const location = this.data.serviceLocation;
    if (!location) return;
    wx.openLocation({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      name: location.name || this.data.organizationName || '维修服务点',
      address: location.address || '',
      scale: 17
    });
  },

  onReceivingAddressInput(e) {
    this.setData({ receivingAddress: e.detail.value });
  },

  saveApprovedReceivingAddress() {
    if (this.data.savingReceivingAddress || !this.data.canEditReceivingAddress) return;
    const address = (this.data.receivingAddress || '').trim();
    if (!address) {
      wx.showToast({ title: '请填写官方售后服务收件地址', icon: 'none' });
      return;
    }
    if (address.length > 255) {
      wx.showToast({ title: '地址不能超过255个字符', icon: 'none' });
      return;
    }

    this.setData({ savingReceivingAddress: true });
    wx.request({
      url: `${app.globalData.apiBase}${APPLICATION_URL}`,
      method: 'POST',
      header: app.authHeader(),
      data: {
        action: 'update_receiving_address',
        receiving_address: address
      },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '收件地址更新失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: '收件地址已更新', icon: 'success' });
        this.loadContext();
      },
      fail: () => wx.showToast({ title: '网络错误，地址未更新', icon: 'none' }),
      complete: () => this.setData({ savingReceivingAddress: false })
    });
  },

  onLiaisonChange(e) {
    const selectedId = String((e.detail && e.detail.value) || '');
    const selected = this.data.liaisonCandidates.find(item => String(item.identity_id) === selectedId);
    if (!selected) return;
    this.setData({
      selectedLiaisonIds: [Number(selected.identity_id)],
      receivingContactName: selected.name || '',
      receivingContactPhone: selected.phone || '',
      liaisonCandidates: this.data.liaisonCandidates.map(item => ({
        ...item,
        selected: String(item.identity_id) === selectedId
      }))
    });
  },

  onNoticeAgreeChange(e) {
    this.setData({ noticeAgreed: !!(e.detail && e.detail.value || []).length });
  },

  submitApplication() {
    if (this.data.submitting) return;
    if (!this.data.canSubmit) {
      const message = this.data.reason || '当前申请状态暂不允许提交，请刷新页面后重试。';
      this.setData({ submitFeedback: message, submitFeedbackType: 'error' });
      wx.showToast({ title: message, icon: 'none' });
      return;
    }
    const location = this.data.serviceLocation;
    const address = this.data.receivingAddress.trim();
    const selectedCandidate = this.data.liaisonCandidates.find(item => item.selected);

    if (!location || !this.data.locationCapturedAt) {
      this.showSubmitFeedback('请重新选择实际维修服务地点', 'error', true);
      return;
    }
    if (!address) {
      this.showSubmitFeedback('请填写官方售后服务收件地址', 'error', true);
      return;
    }
    if (!selectedCandidate) {
      this.showSubmitFeedback('请选择一名售后服务对接人员', 'error', true);
      return;
    }
    if (!String(selectedCandidate.phone || '').trim()) {
      this.showSubmitFeedback('所选对接人员尚未登记手机号', 'error', true);
      return;
    }
    if (!this.data.noticeAgreed) {
      this.showSubmitFeedback('请先阅读并确认申请须知', 'error', true);
      return;
    }

    this.setData({
      submitting: true,
      submitFeedback: '正在提交申请，请稍候…',
      submitFeedbackType: 'pending'
    });
    wx.request({
      url: `${app.globalData.apiBase}${APPLICATION_URL}`,
      method: 'POST',
      header: app.authHeader('application/json'),
      timeout: 20000,
      data: {
        service_location_name: location.name || '',
        service_location_address: location.address || '',
        service_latitude: location.latitude,
        service_longitude: location.longitude,
        location_captured_at: this.data.locationCapturedAt,
        receiving_address: address,
        liaison_identity_ids: this.data.selectedLiaisonIds,
        notice_agreed: this.data.noticeAgreed
      },
      success: res => {
        const body = res && res.data && typeof res.data === 'object' ? res.data : {};
        if (res.statusCode === 401 || body.code === 401) {
          this.showSubmitFeedback('登录状态已失效，请重新登录后再提交。', 'error');
          app.reauthenticate();
          return;
        }
        if (body.code !== 0) {
          const message = body.msg || `申请提交失败（HTTP ${res.statusCode || '未知'}）`;
          this.showSubmitFeedback(message, 'error');
          return;
        }
        this.setData({
          submitFeedback: '申请已提交，请查看页面上方的申请状态。',
          submitFeedbackType: 'success'
        });
        // Refresh the status without replacing the form with a loading screen.
        this.loadContext({ silent: true });
      },
      fail: error => {
        const message = String((error && error.errMsg) || '').toLowerCase().includes('timeout')
          ? '提交结果暂未确认，请刷新申请状态后再决定是否重试。'
          : '网络连接失败，提交结果暂未确认，请刷新申请状态后再试。';
        console.warn('[AfterSalesServiceStation] submit request failed', error);
        this.showSubmitFeedback(message, 'error');
      },
      complete: () => {
        this.setData({ submitting: false });
      }
    });
  },

  showSubmitFeedback(message, type = 'error', showToast = false) {
    this.setData({ submitFeedback: message, submitFeedbackType: type });
    if (showToast) wx.showToast({ title: message, icon: 'none' });
  }
});
