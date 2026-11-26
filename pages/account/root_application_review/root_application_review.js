const app = getApp();
const trial = require('../../../utils/root-trial');

Page({
  data: {
    applicationId: 0,
    application: null,
    applications: [],
    filterStatus: 'PENDING',
    loading: true,
    loadingMore: false,
    hasMore: false,
    nextBeforeId: null,
    submitting: false,
    canReview: false,
    reviewReason: '',
    licenseId: null,
    licensePath: '',
    imageError: '',
    error: '',
    feedback: '',
    rootOrganization: { state: 'platform_review' }
  },

  onLoad(options = {}) {
    const supplied = options.application_id;
    if (supplied !== undefined && (!/^[1-9][0-9]*$/.test(String(supplied)) || !Number.isSafeInteger(Number(supplied)))) {
      this.setData({ loading: false, error: '申请编号无效，请从审核列表重新进入。' });
      return;
    }
    this.setData({ applicationId: supplied ? Number(supplied) : 0 });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录状态失效，请重新进入小程序。' });
        return;
      }
      this._accountToken = app.globalData.access_token;
      this._initialized = true;
      this.reload();
    });
  },

  onShow() {
    if (this._initialized && this._accountToken !== app.globalData.access_token) {
      this.clearRestrictedData();
      this._accountToken = app.globalData.access_token;
    }
    if (this._initialized && !this.data.loading) this.reload();
  },

  onUnload() {
    this._disposed = true;
    this._listEpoch = (this._listEpoch || 0) + 1;
  },

  reload() {
    if (this.data.submitting) return;
    if (this.data.applicationId) this.loadDetail();
    else this.loadList(false);
  },

  clearRestrictedData() {
    this.setData({ application: null, applications: [], canReview: false, licenseId: null, licensePath: '', reviewReason: '', feedback: '', imageError: '', hasMore: false, nextBeforeId: null, rootOrganization: { state: 'platform_review' } });
  },

  loadDetail() {
    if (this._loadingDetail) return;
    this._loadingDetail = true;
    this.setData({ loading: true, error: '' });
    trial.request(`applications/${this.data.applicationId}/`).then(data => {
      if (this._disposed) return;
      this.applyApplication(data.application || null);
    }).catch(error => {
      if (this._disposed) return;
      this.clearRestrictedData();
      this.setData({ error: error.message });
    }).finally(() => {
      this._loadingDetail = false;
      if (!this._disposed) this.setData({ loading: false });
    });
  },

  applyApplication(application) {
    const id = application && application.license_upload_id;
    const keepImage = id && String(id) === String(this.data.licenseId);
    this.setData({
      application: application ? { ...application, status_label: trial.statusLabel(application.status) } : null,
      canReview: !!(application && application.can_review),
      licenseId: id || null,
      licensePath: keepImage ? this.data.licensePath : '',
      imageError: '',
      rootOrganization: application ? trial.applicationRoot(application) : { state: 'platform_review' },
      error: ''
    });
    if (id && !this.data.licensePath) this.loadLicenseImage();
  },

  loadList(append) {
    if (append && (this.data.loading || this.data.loadingMore || !this.data.hasMore)) return;
    const epoch = this._listEpoch = (this._listEpoch || 0) + 1;
    const filter = this.data.filterStatus;
    const query = { status: filter, limit: 50 };
    if (append && this.data.nextBeforeId) query.before_id = this.data.nextBeforeId;
    this.setData({ loading: !append, loadingMore: !!append, error: '' });
    trial.request('applications/', { data: query }).then(data => {
      if (this._disposed || epoch !== this._listEpoch) return;
      const incoming = (data.applications || []).map(item => ({ ...item, status_label: trial.statusLabel(item.status) }));
      const previous = append ? this.data.applications : [];
      const ids = new Set(previous.map(item => String(item.id)));
      this.setData({
        applications: previous.concat(incoming.filter(item => !ids.has(String(item.id)))),
        hasMore: !!data.has_more,
        nextBeforeId: data.next_before_id || null
      });
    }).catch(error => {
      if (this._disposed || epoch !== this._listEpoch) return;
      if (error.statusCode === 401 || error.statusCode === 403 || !append) this.clearRestrictedData();
      this.setData({ error: error.message });
    }).finally(() => {
      if (!this._disposed && epoch === this._listEpoch) this.setData({ loading: false, loadingMore: false });
    });
  },

  changeFilter(event) {
    const value = event.currentTarget.dataset.status;
    if (!['PENDING', 'ALL'].includes(value) || value === this.data.filterStatus) return;
    this.setData({ filterStatus: value, applications: [], hasMore: false, nextBeforeId: null });
    this.loadList(false);
  },

  loadMore() {
    this.loadList(true);
  },

  openApplication(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    wx.navigateTo({ url: `${trial.REVIEW_PAGE}?application_id=${id}` });
  },

  loadLicenseImage() {
    const id = this.data.licenseId;
    if (!id) return;
    this.setData({ imageError: '' });
    trial.downloadLicense(id).then(filePath => {
      if (!this._disposed && String(this.data.licenseId) === String(id)) this.setData({ licensePath: filePath });
    }).catch(error => {
      if (!this._disposed && String(this.data.licenseId) === String(id)) {
        if (error.statusCode === 401 || error.statusCode === 403 || error.accountChanged) this.clearRestrictedData();
        this.setData({ imageError: error.message });
      }
    });
  },

  previewLicense() {
    if (this._accountToken !== app.globalData.access_token) {
      this.clearRestrictedData();
      this.setData({ error: '登录账号已变化，请重新读取申请。' });
      return;
    }
    if (this.data.licensePath) wx.previewImage({ current: this.data.licensePath, urls: [this.data.licensePath] });
  },

  onReasonInput(event) {
    this.setData({ reviewReason: event.detail.value });
  },

  approveApplication() {
    this.confirmDecision('APPROVE');
  },

  rejectApplication() {
    this.confirmDecision('REJECT');
  },

  confirmDecision(decision) {
    if (!this.data.canReview || this.data.submitting || this._confirming) return;
    const reason = String(this.data.reviewReason || '').trim();
    if (decision === 'REJECT' && !reason) {
      wx.showToast({ title: '请填写未通过的具体原因', icon: 'none' });
      return;
    }
    this._confirming = true;
    const approving = decision === 'APPROVE';
    wx.showModal({
      title: approving ? '确认通过申请？' : '确认不予通过？',
      content: approving
        ? '通过后将为申请人创建独立的厂家根组织，并授予该组织厂家负责人权限。请核对企业名称及营业执照。'
        : '申请人将收到未通过通知，并可根据审核说明修改后重新提交。',
      confirmText: approving ? '确认通过' : '不予通过',
      success: result => {
        this._confirming = false;
        if (result.confirm) this.submitDecision(decision, reason);
      },
      fail: () => { this._confirming = false; }
    });
  },

  submitDecision(decision, reason) {
    if (!this.data.canReview || this.data.submitting) return;
    this.setData({ submitting: true, error: '', feedback: '' });
    trial.request(`applications/${this.data.applicationId}/review/`, {
      method: 'POST', data: { decision, reason }
    }).then(data => {
      if (this._disposed) return;
      this.applyApplication(data.application || null);
      this.setData({ reviewReason: '', feedback: decision === 'APPROVE' ? '申请已通过，厂家根组织及负责人身份已创建。' : '审核结果已保存。' });
      trial.refreshTasks();
    }).catch(error => {
      if (this._disposed) return;
      if (error.statusCode === 401 || error.statusCode === 403) this.clearRestrictedData();
      this.setData({ error: error.message, feedback: '审核结果暂未确认，请刷新状态后再决定是否重试。' });
    }).finally(() => {
      if (!this._disposed) this.setData({ submitting: false });
    });
  }
});
