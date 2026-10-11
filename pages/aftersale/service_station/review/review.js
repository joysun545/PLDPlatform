const app = getApp();

const REVIEW_URL = '/lifecycle/after-sales/service-station/applications/';

Page({
  data: {
    loading: true,
    submitting: false,
    applicationId: 0,
    application: null,
    canReview: false,
    taskCompletedByName: '',
    reviewNote: '',
    error: ''
  },

  onLoad(options) {
    const applicationId = Number(options && options.application_id);
    if (!applicationId || !Number.isInteger(applicationId)) {
      this.setData({ loading: false, error: '申请编号无效，请从任务通知进入。' });
      return;
    }
    this.setData({ applicationId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, error: '登录状态失效，请重新进入小程序。' });
        return;
      }
      this.loadApplication();
    });
  },

  loadApplication() {
    const applicationId = this.data.applicationId;
    if (!applicationId) return;
    this.setData({ loading: true, error: '' });
    wx.request({
      url: `${app.globalData.apiBase}${REVIEW_URL}${applicationId}/review/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) {
          app.reauthenticate();
          this.setData({ error: '登录状态已失效，请重新进入小程序。' });
          return;
        }
        if (body.code !== 0) {
          this.setData({ error: body.msg || '当前账号无权查看此申请。' });
          return;
        }
        const data = body.data || {};
        this.setData({
          application: data.application || null,
          canReview: !!data.can_review,
          taskCompletedByName: data.task_completed_by_name || '',
          error: ''
        });
      },
      fail: () => this.setData({ error: '网络错误，暂时无法读取申请资料。' }),
      complete: () => this.setData({ loading: false })
    });
  },

  onReviewNoteInput(e) {
    this.setData({ reviewNote: (e.detail && e.detail.value) || '' });
  },

  rejectApplication() {
    this.decide('reject');
  },

  approveApplication() {
    this.decide('approve');
  },

  decide(actionOrEvent) {
    const action = typeof actionOrEvent === 'string'
      ? actionOrEvent
      : String((((actionOrEvent || {}).currentTarget || {}).dataset || {}).action || '');
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[service-station-review] tap received:', { action: action || '(missing action)', canReview: !!this.data.canReview, submitting: !!this.data.submitting });
    }
    if (!this.data.canReview || this.data.submitting || !['approve', 'reject'].includes(action)) return;
    const note = String(this.data.reviewNote || '').trim();
    if (action === 'reject' && !note) {
      wx.showToast({ title: '未通过申请时请填写审核说明', icon: 'none' });
      return;
    }

    const approving = action === 'approve';
    wx.showModal({
      title: approving ? '确认通过申请？' : '确认不予通过？',
      content: approving
        ? '确认该商家符合售后服务站申请要求吗？'
        : '申请方和相关组织将收到未通过通知及审核说明。',
      confirmText: approving ? '确认通过' : '不予通过',
      cancelText: '再检查',
      success: result => {
        console.info('[service-station-review] modal result:', {
          confirm: !!result.confirm,
          cancel: !!result.cancel
        });
        if (result.confirm) this.submitDecision(action, note);
      },
      fail: error => {
        const message = (error && error.errMsg) || 'unknown';
        console.error('[service-station-review] showModal failed:', message);
        wx.showToast({ title: '确认框调用失败', icon: 'none' });
      }
    });
  },

  submitDecision(action, note) {
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在提交审核' });
    wx.request({
      url: `${app.globalData.apiBase}${REVIEW_URL}${this.data.applicationId}/review/`,
      method: 'POST',
      header: app.authHeader(),
      data: { action, review_note: note },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '审核未完成，请刷新后重试', icon: 'none' });
          this.loadApplication();
          return;
        }
        const data = body.data || {};
        this.setData({
          application: data.application || this.data.application,
          canReview: !!data.can_review,
          taskCompletedByName: data.task_completed_by_name || '',
          reviewNote: ''
        });
        wx.showToast({ title: action === 'approve' ? '申请已通过' : '申请未通过', icon: 'success' });
      },
      fail: () => wx.showToast({ title: '网络错误，审核未提交', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    });
  },

  openServiceLocation() {
    const location = (this.data.application || {}).service_location;
    if (!location) return;
    wx.openLocation({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      name: location.name || (this.data.application.organization || {}).name || '维修服务点',
      address: location.address || '',
      scale: 17
    });
  }
});
