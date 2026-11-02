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
    equipmentExpanded: false,
    locationExpanded: false,
    plateExpanded: false,
    faultExpanded: false,
    faultDescription: '',
    locationName: '',
    locationAddress: '',
    location: null,
    locationConfirmed: false,
    media: [],
    existingMedia: [],
    remainingCount: 9,
    applicationId: null,
    submitting: false,
    activationMethod: 'VEHICLE_PLATE',
    presenceRequired: false,
    presenceVerified: false,
    presenceScanning: false,
    presenceMessage: '',
    deviceCodeVerificationToken: '',
    platePhotoPath: '',
    platePhotoUploaded: false,
    platePhotoUploading: false
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
        const activationMethod = (context.activation && context.activation.activation_method) || 'VEHICLE_PLATE';
        const presenceRequired = activationMethod === 'DEVICE_CODE';
        const existingApplicationMedia = (active && active.media) || [];
        const plateEvidence = existingApplicationMedia.find(item => (
          item.purpose === 'PLATE_PRESENCE_EVIDENCE' && item.media_type === 'IMAGE'
        ));
        const existingMedia = existingApplicationMedia.filter(item => (
          item.purpose !== 'PLATE_PRESENCE_EVIDENCE'
        ));
        // Device-code activation requires a fresh scan whenever this form is opened,
        // including when resuming a saved draft.
        const presenceVerified = !presenceRequired;
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
          activationMethod,
          presenceRequired,
          presenceVerified,
          presenceMessage: presenceVerified ? '' : '需要扫描激活时绑定的设备编码，确认设备在身边。',
          deviceCodeVerificationToken: '',
          platePhotoUploaded: !!plateEvidence,
          platePhotoPath: '',
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
        }, () => {
          if (presenceRequired && !presenceVerified) this.scanBoundDeviceCode();
        });
      })
      .catch(err => this.setData({ loading: false, error: err.message || '无法读取设备信息' }));
  },

  scanBoundDeviceCode() {
    if (this.data.presenceScanning || this.data.presenceVerified) return;
    this.setData({ presenceScanning: true, presenceMessage: '请扫描设备本体二维码。' });
    wx.scanCode({
      scanType: ['qrCode'],
      success: result => {
        const scannedCode = String(result && result.result || '').trim();
        if (!scannedCode) {
          this.setData({ presenceScanning: false, presenceMessage: '没有读取到设备编码，请重新扫码。' });
          return;
        }
        requestJson(
          '/lifecycle/customer/devices/' + this.data.deviceId + '/after-sales/verify-device-code/',
          'POST',
          { device_code: scannedCode }
        ).then(data => {
          this.setData({
            presenceScanning: false,
            presenceVerified: true,
            presenceMessage: '设备编码核验成功，设备已确认在身边。',
            deviceCodeVerificationToken: data.verification_token || ''
          });
        }).catch(err => {
          this.setData({ presenceScanning: false, presenceMessage: err.message || '设备编码核验失败，请重新扫码。' });
        });
      },
      fail: () => {
        this.setData({ presenceScanning: false, presenceMessage: '已取消扫码。继续申请前请重新扫描设备编码。' });
      }
    });
  },

  toggleBom() {
    this.setData({ bomExpanded: !this.data.bomExpanded });
  },

  toggleSection(e) {
    const field = e.currentTarget.dataset.field;
    if (!field || !Object.prototype.hasOwnProperty.call(this.data, field)) return;
    this.setData({ [field]: !this.data[field] });
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

  capturePlatePhoto() {
    if (this.data.submitting || this.data.platePhotoUploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      camera: 'back',
      success: result => {
        const file = result && result.tempFiles && result.tempFiles[0];
        if (!file || !file.tempFilePath) {
          wx.showToast({ title: '没有取得车牌照片，请重拍', icon: 'none' });
          return;
        }
        this.setData({ platePhotoPath: file.tempFilePath, platePhotoUploaded: false });
      },
      fail: () => wx.showToast({ title: '未拍摄车牌照片', icon: 'none' })
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
        location_confirmed: this.data.locationConfirmed,
        device_code_verification_token: this.data.deviceCodeVerificationToken
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

  uploadPlatePhoto(applicationId) {
    if (this.data.activationMethod !== 'VEHICLE_PLATE' || this.data.platePhotoUploaded || !this.data.platePhotoPath) {
      return Promise.resolve();
    }
    this.setData({ platePhotoUploading: true });
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: app.globalData.apiBase + '/lifecycle/after-sales/applications/' + applicationId + '/media/',
        filePath: this.data.platePhotoPath,
        name: 'file',
        header: app.authHeader(null),
        formData: {
          media_type: 'IMAGE',
          purpose: 'PLATE_PRESENCE_EVIDENCE',
          caption: '激活方式为车牌号时拍摄的实时在场照片'
        },
        success: res => {
          let body = null;
          try { body = JSON.parse(res.data || '{}'); } catch (err) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
            this.setData({ platePhotoUploaded: true, platePhotoPath: '' });
            resolve();
          } else {
            reject(new Error((body && body.msg) || '车牌照片上传失败'));
          }
        },
        fail: () => reject(new Error('车牌照片上传失败，请检查网络后重试')),
        complete: () => this.setData({ platePhotoUploading: false })
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
    if (this.data.presenceRequired && !this.data.presenceVerified) {
      wx.showToast({ title: '请先扫描设备编码，确认设备在身边', icon: 'none' });
      return;
    }
    if (!this.data.media.length && !this.data.existingMedia.length) {
      wx.showToast({ title: '请至少拍摄或上传一张图片或一段视频', icon: 'none' });
      return;
    }
    if (this.data.activationMethod === 'VEHICLE_PLATE' &&
        !this.data.platePhotoUploaded && !this.data.platePhotoPath) {
      wx.showToast({ title: '请拍摄并上传包含车牌号的实时照片', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    this.saveDraft()
      .then(draft => {
        const applicationId = draft.id;
        // The one-time verification proof is consumed by saveDraft. Preserve the
        // saved server-side proof for upload retries without reusing this token.
        this.setData({ applicationId, deviceCodeVerificationToken: '' });
        return this.uploadAll(applicationId)
          .then(() => this.uploadPlatePhoto(applicationId))
          .then(() => applicationId);
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
      .catch(err => {
        const message = err.message || '提交失败，请重试';
        if (this.data.presenceRequired && (
          message.indexOf('请先扫描设备本体二维码') >= 0 ||
          message.indexOf('设备编码核验已失效') >= 0 ||
          message.indexOf('请重新扫描设备本体二维码') >= 0
        )) {
          this.setData({
            presenceVerified: false,
            deviceCodeVerificationToken: '',
            presenceMessage: '设备编码核验已过期，请重新扫码。已填写的申请内容会保留。'
          }, () => {
            wx.showToast({ title: '请重新扫描设备编码', icon: 'none' });
            this.scanBoundDeviceCode();
          });
          return;
        }
        wx.showToast({ title: message, icon: 'none' });
      })
      .finally(() => this.setData({ submitting: false }));
  },

  goBack() {
    wx.navigateBack();
  }
});
