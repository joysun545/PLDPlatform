const app = getApp();

function requestJson(url, method, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + url,
      method,
      data,
      header: app.authHeader('application/json'),
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          reject(new Error((res.data && res.data.msg) || '请求失败'));
        }
      },
      fail: () => reject(new Error('网络连接失败，请稍后重试'))
    });
  });
}

Page({
  data: {
    deviceId: null,
    context: null,
    loading: true,
    error: '',
    bomExpanded: false,
    faultDescription: '',
    locationName: '',
    locationAddress: '',
    location: null,
    locationConfirmed: false,
    media: [],
    existingMedia: [],
    remainingCount: 9,
    applicationId: null,
    submitting: false
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
      this.loadContext();
    });
  },

  loadContext() {
    this.setData({ loading: true, error: '' });
    requestJson('/lifecycle/customer/devices/' + this.data.deviceId + '/after-sales/context/', 'GET')
      .then(context => {
        const active = context.active_application || null;
        if (active && active.owned_by_another_applicant) {
          this.setData({
            context,
            loading: false,
            error: '该设备已有其他发起人正在处理的售后申请（' + active.case_no + '）'
          });
          return;
        }
        if (active && active.status && active.status !== 'DRAFT') {
          wx.redirectTo({
            url: '/pages/aftersale/detail/detail?application_id=' + active.id
          });
          return;
        }
        const existingMedia = (active && active.media) || [];
        const hasDraftCoordinates = !!(
          active &&
          active.location &&
          active.location.latitude !== '' &&
          active.location.latitude !== null &&
          active.location.latitude !== undefined &&
          active.location.longitude !== '' &&
          active.location.longitude !== null &&
          active.location.longitude !== undefined
        );
        this.setData({
          context,
          loading: false,
          applicationId: active ? active.id : null,
          faultDescription: active ? (active.fault_description || '') : '',
          locationName: active && active.location ? (active.location.name || '') : '',
          locationAddress: active && active.location ? (active.location.address || '') : '',
          location: hasDraftCoordinates ? {
            latitude: active.location.latitude,
            longitude: active.location.longitude
          } : null,
          locationConfirmed: !!(active && active.location && active.location.confirmed),
          existingMedia,
          remainingCount: Math.max(0, 9 - existingMedia.length)
        });
      })
      .catch(err => this.setData({ loading: false, error: err.message || '无法读取设备信息' }));
  },

  toggleBom() {
    this.setData({ bomExpanded: !this.data.bomExpanded });
  },

  onFaultDescription(e) {
    this.setData({ faultDescription: e.detail.value });
  },

  onLocationName(e) {
    this.setData({ locationName: e.detail.value, locationConfirmed: false });
  },

  onLocationAddress(e) {
    this.setData({ locationAddress: e.detail.value, locationConfirmed: false });
  },

  obtainLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: res => {
        this.setData({
          location: {
            latitude: Number(res.latitude).toFixed(7),
            longitude: Number(res.longitude).toFixed(7)
          },
          locationConfirmed: false
        });
        wx.showToast({ title: '已获取坐标，请填写现场名称和地址后确认', icon: 'none' });
      },
      fail: () => {
        wx.showModal({
          title: '需要真实位置',
          content: '售后申请必须确认当前真实位置。请允许定位权限后重试。',
          confirmText: '打开设置',
          success: modal => {
            if (modal.confirm) wx.openSetting({});
          }
        });
      }
    });
  },

  confirmLocation() {
    if (!this.data.location) {
      wx.showToast({ title: '请先获取当前位置', icon: 'none' });
      return;
    }
    if (!this.data.locationName.trim() && !this.data.locationAddress.trim()) {
      wx.showToast({ title: '请填写现场名称或详细地址', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认真实位置',
      content: '确认后将把当前GPS坐标与填写的位置一并提交到售后单。',
      success: modal => {
        if (modal.confirm) this.setData({ locationConfirmed: true });
      }
    });
  },

  onMediaChange(e) {
    this.setData({ media: e.detail.files || [] });
  },

  onMediaRetry(e) {
    const index = Number(e.detail.index);
    const media = this.data.media.slice();
    if (media[index]) {
      media[index] = { ...media[index], status: 'PENDING', error: '' };
      this.setData({ media });
    }
  },

  updateMedia(index, patch) {
    const media = this.data.media.slice();
    if (!media[index]) return;
    media[index] = { ...media[index], ...patch };
    this.setData({ media });
  },

  saveDraft() {
    const location = this.data.location || {};
    return requestJson(
      '/lifecycle/customer/devices/' + this.data.deviceId + '/after-sales/applications/',
      'POST',
      {
        fault_description: this.data.faultDescription.trim(),
        location_name: this.data.locationName.trim(),
        location_address: this.data.locationAddress.trim(),
        location_latitude: location.latitude || '',
        location_longitude: location.longitude || '',
        location_confirmed: this.data.locationConfirmed
      }
    );
  },

  uploadOne(applicationId, item, index) {
    this.updateMedia(index, { status: 'UPLOADING', error: '' });
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: app.globalData.apiBase + '/lifecycle/after-sales/applications/' + applicationId + '/media/',
        filePath: item.path,
        name: 'file',
        header: app.authHeader(null),
        formData: {
          media_type: item.media_type,
          purpose: 'APPLICATION_EVIDENCE',
          duration_seconds: item.duration_seconds || '',
          caption: ''
        },
        success: res => {
          let body = null;
          try {
            body = JSON.parse(res.data || '{}');
          } catch (err) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            this.updateMedia(index, { status: 'SUCCESS', serverMediaId: body.data && body.data.id });
            resolve();
          } else {
            const message = (body && body.msg) || '附件上传失败';
            this.updateMedia(index, { status: 'FAILED', error: message });
            reject(new Error(message));
          }
        },
        fail: () => {
          this.updateMedia(index, { status: 'FAILED', error: '网络上传失败' });
          reject(new Error('附件上传失败，请检查网络后重试'));
        }
      });
    });
  },

  uploadAll(applicationId) {
    const next = index => {
      const item = this.data.media[index];
      if (!item) return Promise.resolve();
      if (item.status === 'SUCCESS') return next(index + 1);
      return this.uploadOne(applicationId, item, index).then(() => next(index + 1));
    };
    return next(0);
  },

  submit() {
    if (this.data.submitting) return;
    if (!this.data.faultDescription.trim()) {
      wx.showToast({ title: '请填写故障文字描述', icon: 'none' });
      return;
    }
    if (!this.data.locationConfirmed) {
      wx.showToast({ title: '请先确认真实位置', icon: 'none' });
      return;
    }
    if (!this.data.media.length && !this.data.existingMedia.length) {
      wx.showToast({ title: '请至少拍摄或上传一张图片或一段视频', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    this.saveDraft()
      .then(draft => {
        const applicationId = draft.id;
        this.setData({ applicationId });
        return this.uploadAll(applicationId).then(() => applicationId);
      })
      .then(applicationId => requestJson(
        '/lifecycle/after-sales/applications/' + applicationId + '/submit/',
        'POST',
        {}
      ).then(() => applicationId))
      .then(applicationId => {
        wx.showToast({ title: '申请已提交', icon: 'success' });
        setTimeout(() => {
          wx.redirectTo({
            url: '/pages/aftersale/detail/detail?application_id=' + applicationId
          });
        }, 350);
      })
      .catch(err => wx.showToast({ title: err.message || '提交失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ submitting: false }));
  },

  goBack() {
    wx.navigateBack();
  }
});
