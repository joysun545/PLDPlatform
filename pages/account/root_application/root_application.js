const app = getApp();
const trial = require('../../../utils/root-trial');

Page({
  data: {
    loading: true,
    submitting: false,
    uploading: false,
    refreshingProfile: false,
    authorizingWeb: false,
    eligible: false,
    canSubmit: false,
    organizationName: '',
    licenseId: null,
    licensePath: '',
    application: null,
    statusLabel: '尚未申请',
    reviewReason: '',
    reason: '',
    error: '',
    imageError: '',
    feedback: '',
    profileReady: false,
    hasWebToken: false,
    webApproved: false,
    webNeedsRescan: false,
    rootOrganization: { state: 'pending_creation', name: '待填写企业名称' }
  },

  onLoad(options = {}) {
    this._webToken = trial.validWebToken(options.webToken) ? options.webToken : '';
    this._requestId = trial.requestId();
    this.setData({ hasWebToken: !!this._webToken });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录状态失效，请重新进入小程序。' });
        return;
      }
      this._accountToken = app.globalData.access_token;
      this.loadContext();
    });
  },

  onShow() {
    if (this._initialized) {
      if (this._accountToken !== app.globalData.access_token) {
        this.clearRestrictedData();
        this._accountToken = app.globalData.access_token;
        this._requestId = trial.requestId();
      }
      this.loadContext({ preserveDraft: true });
    }
  },

  onUnload() {
    this._disposed = true;
    this._webToken = '';
  },

  clearRestrictedData() {
    this._webToken = '';
    this.setData({
      application: null, organizationName: '', reviewReason: '', licensePath: '', licenseId: null,
      eligible: false, canSubmit: false, profileReady: false, hasWebToken: false,
      feedback: '', imageError: '', rootOrganization: trial.applicationRoot(null)
    });
  },

  showError(error) {
    if (error.statusCode === 401 || error.statusCode === 403 || error.accountChanged) this.clearRestrictedData();
    this.setData({ error: error.message });
  },

  loadContext(options = {}) {
    if (this._loadingContext || this.data.submitting || this.data.uploading) return;
    this._loadingContext = true;
    this.setData({ loading: !options.preserveDraft, error: '' });
    trial.request('context/').then(data => {
      if (this._disposed) return;
      this.applyContext(data, !!options.preserveDraft);
      this._initialized = true;
    }).catch(error => {
      if (this._disposed) return;
      this.showError(error);
      this.setData({ canSubmit: false, profileReady: false });
    }).finally(() => {
      this._loadingContext = false;
      if (!this._disposed) this.setData({ loading: false });
    });
  },

  applyContext(data, preserveDraft) {
    const eligibility = data.eligibility || {};
    const application = data.application || null;
    const status = application && application.status;
    const editable = !!eligibility.eligible && eligibility.can_submit !== false &&
      (!application || (status === 'REJECTED' && application.can_resubmit !== false));
    const sameApplication = String((this.data.application || {}).id || '') === String((application || {}).id || '');
    const changes = {
      application,
      eligible: !!eligibility.eligible,
      canSubmit: editable,
      reason: eligibility.reason || '',
      statusLabel: trial.statusLabel(status),
      reviewReason: (application && (application.review_reason || application.reason)) || '',
      rootOrganization: trial.applicationRoot(application, preserveDraft && editable && sameApplication ? this.data.organizationName : ''),
      error: ''
    };
    if (!preserveDraft || !editable || !sameApplication) {
      changes.organizationName = (application && application.organization_name) || '';
      changes.licenseId = (application && application.license_upload_id) || null;
      changes.licensePath = '';
      changes.imageError = '';
    }
    this.setData(changes);
    if (this.data.licenseId && !this.data.licensePath) this.loadLicenseImage(this.data.licenseId);
    if (status === 'APPROVED') this.refreshApprovedProfile();
  },

  refreshStatus() {
    this.loadContext({ preserveDraft: true });
  },

  onOrganizationInput(event) {
    if (!this.data.canSubmit || this.data.submitting) return;
    this.setData({ organizationName: event.detail.value, feedback: '', rootOrganization: trial.applicationRoot(null, event.detail.value) });
    this._requestId = trial.requestId();
  },

  chooseLicense() {
    if (!this.data.canSubmit || this.data.uploading || this.data.submitting) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: result => {
        const file = (result.tempFiles || [])[0];
        if (!file || !file.tempFilePath) return;
        if (file.size > 5 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过5MB', icon: 'none' });
          return;
        }
        this.setData({ uploading: true, licenseId: null, licensePath: file.tempFilePath, imageError: '', feedback: '' });
        this._requestId = trial.requestId();
        trial.uploadLicense(file.tempFilePath).then(uploaded => {
          if (!this._disposed) this.setData({ licenseId: uploaded.id, licensePath: uploaded.filePath });
        }).catch(error => {
          if (!this._disposed) {
            this.showError(error);
            this.setData({ licenseId: null, imageError: error.message });
          }
        }).finally(() => {
          if (!this._disposed) this.setData({ uploading: false });
        });
      },
      fail: error => {
        if (!String((error && error.errMsg) || '').includes('cancel')) {
          wx.showToast({ title: '无法选择图片，请重试', icon: 'none' });
        }
      }
    });
  },

  removeLicense() {
    if (!this.data.canSubmit || this.data.uploading || this.data.submitting) return;
    this._requestId = trial.requestId();
    this.setData({ licenseId: null, licensePath: '', imageError: '', feedback: '' });
  },

  loadLicenseImage(id) {
    this.setData({ imageError: '' });
    trial.downloadLicense(id).then(filePath => {
      if (!this._disposed && String(this.data.licenseId) === String(id)) {
        this.setData({ licensePath: filePath, imageError: '' });
      }
    }).catch(error => {
      if (!this._disposed && String(this.data.licenseId) === String(id)) {
        if (error.statusCode === 401 || error.statusCode === 403 || error.accountChanged) this.showError(error);
        else this.setData({ imageError: error.message });
      }
    });
  },

  retryLicenseImage() {
    if (this.data.licenseId) this.loadLicenseImage(this.data.licenseId);
  },

  previewLicense() {
    if (this._accountToken !== app.globalData.access_token) {
      this.clearRestrictedData();
      this.setData({ error: '登录账号已变化，请刷新申请状态。' });
      return;
    }
    if (this.data.licensePath) wx.previewImage({ current: this.data.licensePath, urls: [this.data.licensePath] });
  },

  submitApplication() {
    if (!this.data.canSubmit || this.data.submitting || this.data.uploading) return;
    const organizationName = String(this.data.organizationName || '').trim();
    if (!organizationName || organizationName.length > 128) {
      wx.showToast({ title: '请填写128字以内的组织名称', icon: 'none' });
      return;
    }
    if (!this.data.licenseId) {
      wx.showToast({ title: '请先完成营业执照上传', icon: 'none' });
      return;
    }
    this.setData({ submitting: true, error: '', feedback: '' });
    trial.request('applications/', {
      method: 'POST',
      data: { organization_name: organizationName, license_upload_id: this.data.licenseId, request_id: this._requestId }
    }).then(data => {
      if (this._disposed) return;
      this.applyContext({ eligibility: { eligible: false }, application: data.application }, false);
      this._requestId = trial.requestId();
      this.setData({ feedback: '申请已提交，项目超级管理员审核后将通知你。' });
      trial.refreshTasks();
    }).catch(error => {
      if (!this._disposed) {
        this.showError(error);
        this.setData({ feedback: '请先刷新审核状态确认提交结果，再决定是否重试。' });
      }
    }).finally(() => {
      if (!this._disposed) this.setData({ submitting: false });
    });
  },

  refreshApprovedProfile() {
    if (this.data.refreshingProfile) return Promise.resolve(false);
    this.setData({ refreshingProfile: true, profileReady: false });
    return trial.refreshProfile().then(() => {
      if (!this._disposed) this.setData({ profileReady: true, error: '' });
      trial.refreshTasks();
      return true;
    }).catch(error => {
      if (!this._disposed) this.showError(error);
      return false;
    }).finally(() => {
      if (!this._disposed) this.setData({ refreshingProfile: false });
    });
  },

  enterWorkbench() {
    if (this.data.refreshingProfile || this.data.authorizingWeb) return;
    this.refreshApprovedProfile().then(ok => {
      if (ok && !this._disposed) wx.switchTab({ url: '/pages/home/index/index' });
    });
  },

  confirmWebLogin() {
    if (!this._webToken || this.data.authorizingWeb || this.data.refreshingProfile || !this.data.profileReady) return;
    wx.showModal({
      title: '确认登录原电脑？',
      content: '仅确认你本人电脑上的登录请求。申请通过不会自动授权电脑登录。',
      confirmText: '确认登录',
      success: result => {
        if (!result.confirm || this.data.authorizingWeb) return;
        this.setData({ authorizingWeb: true, error: '' });
        trial.approveWebLogin(this._webToken).then(data => {
          if (this._disposed) return;
          if (trial.isTrialRequired(data)) {
            this.setData({ error: '当前身份尚未就绪，请刷新审核状态后重试。', profileReady: false });
            return;
          }
          this.setData({ webApproved: true, feedback: '电脑登录已授权，请返回原电脑继续操作。' });
          this._webToken = '';
        }).catch(error => {
          if (this._disposed) return;
          this.showError(error);
          const expired = [400, 404, 409, 410].includes(error.statusCode);
          this.setData({ error: error.message, webNeedsRescan: expired });
          if (expired) this._webToken = '';
        }).finally(() => {
          if (!this._disposed) this.setData({ authorizingWeb: false });
        });
      }
    });
  },

  scanNewWebCode() {
    wx.switchTab({ url: '/pages/scan/scan/scan' });
  }
});
