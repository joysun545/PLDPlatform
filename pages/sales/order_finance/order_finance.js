const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function prepareDetail(detail) {
  return {
    ...detail,
    statement: {
      ...(detail.statement || {}),
      submittedText: formatDate(detail.statement && detail.statement.submitted_at)
    },
    payments: (detail.payments || []).map(payment => ({
      ...payment,
      uploadedText: formatDate(payment.uploaded_at),
      confirmedText: formatDate(payment.confirmed_at),
      confirmInput: ''
    }))
  };
}

Page({
  data: {
    orderPlanId: 0,
    loading: true,
    errorMessage: '',
    detail: null,
    selectedStatementPath: '',
    selectedVoucherPath: '',
    receivableAmount: '',
    submittingStatement: false,
    uploadingVoucher: false,
    confirmingPaymentId: 0
  },

  onLoad(options) {
    const orderPlanId = Number((options || {}).order_plan_id);
    if (!orderPlanId) {
      this.setData({ loading: false, errorMessage: '订单参数无效' });
      return;
    }
    this.setData({ orderPlanId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadDetail();
    });
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  loadDetail(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/finance/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '订单资金信息加载失败'
          });
          return;
        }
        this.setData({
          loading: false,
          detail: prepareDetail(body.data),
          selectedStatementPath: '',
          selectedVoucherPath: ''
        });
      },
      fail: () => {
        this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' });
      },
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadDetail();
  },

  onReceivableInput(e) {
    this.setData({ receivableAmount: e.detail.value || '' });
  },

  chooseStatement() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({ selectedStatementPath: file.tempFilePath });
        }
      }
    });
  },

  submitStatement() {
    const amount = (this.data.receivableAmount || '').trim();
    const filePath = this.data.selectedStatementPath;
    if (!amount) {
      wx.showToast({ title: '请填写应收总额', icon: 'none' });
      return;
    }
    if (!filePath) {
      wx.showToast({ title: '请上传订单清单截图', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '提交订单清单',
      content: `确认本订单应收总额为 ¥${amount}？提交后不能修改。`,
      confirmText: '确认提交',
      success: modal => modal.confirm && this.uploadStatement(filePath, amount)
    });
  },

  uploadStatement(filePath, amount) {
    if (this.data.submittingStatement) return;
    this.setData({ submittingStatement: true });
    wx.showLoading({ title: '正在提交...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/finance/statement/`,
      filePath,
      name: 'statement_image',
      header: app.authHeader(null),
      formData: { receivable_amount: amount },
      success: res => this.handleUploadResponse(res, '订单清单已提交'),
      fail: () => wx.showToast({ title: '订单清单上传失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submittingStatement: false });
      }
    });
  },

  chooseVoucher() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({ selectedVoucherPath: file.tempFilePath });
        }
      }
    });
  },

  submitVoucher() {
    const filePath = this.data.selectedVoucherPath;
    if (!filePath) {
      wx.showToast({ title: '请先选择付款凭证', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '上传付款凭证',
      content: '确认上传本次付款凭证？厂家销售助理将依据凭证填写实际到账金额。',
      confirmText: '确认上传',
      success: modal => modal.confirm && this.uploadVoucher(filePath)
    });
  },

  uploadVoucher(filePath) {
    if (this.data.uploadingVoucher) return;
    const clientRequestId = `payment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.setData({ uploadingVoucher: true });
    wx.showLoading({ title: '正在上传...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/finance/payments/`,
      filePath,
      name: 'voucher_image',
      header: app.authHeader(null),
      formData: { client_request_id: clientRequestId },
      success: res => this.handleUploadResponse(res, '付款凭证已上传'),
      fail: () => wx.showToast({ title: '付款凭证上传失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ uploadingVoucher: false });
      }
    });
  },

  handleUploadResponse(res, successText) {
    let body = {};
    try {
      body = JSON.parse(res.data || '{}');
    } catch (error) {
      wx.showToast({ title: '服务器返回数据格式错误', icon: 'none' });
      return;
    }
    if (body.code === 401) app.reauthenticate();
    if (body.code !== 0) {
      wx.showToast({ title: body.msg || '操作失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: body.msg || successText, icon: 'success' });
    app.refreshTasks && app.refreshTasks();
    this.loadDetail();
  },

  onConfirmAmountInput(e) {
    const paymentId = Number(e.currentTarget.dataset.id);
    const index = (this.data.detail.payments || []).findIndex(
      payment => payment.id === paymentId
    );
    if (index < 0) return;
    this.setData({ [`detail.payments[${index}].confirmInput`]: e.detail.value || '' });
  },

  confirmPayment(e) {
    const paymentId = Number(e.currentTarget.dataset.id);
    const payment = (this.data.detail.payments || []).find(
      item => item.id === paymentId
    );
    if (!payment || !payment.can_confirm || this.data.confirmingPaymentId) return;
    const amount = (payment.confirmInput || '').trim();
    if (!amount) {
      wx.showToast({ title: '请填写实际到账金额', icon: 'none' });
      return;
    }
    wx.showModal({
      title: `确认第${payment.sequence_no}笔收款`,
      content: `确认实际到账金额为 ¥${amount}？`,
      confirmText: '确认收款',
      success: modal => modal.confirm && this.submitPaymentConfirmation(paymentId, amount)
    });
  },

  submitPaymentConfirmation(paymentId, amount) {
    this.setData({ confirmingPaymentId: paymentId });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/finance/payments/${paymentId}/confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { confirmed_amount: amount },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) app.reauthenticate();
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '确认收款失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '收款已确认', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadDetail();
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ confirmingPaymentId: 0 });
      }
    });
  },

  previewStatement() {
    const path = this.data.detail && this.data.detail.statement.preview_path;
    if (path) this.downloadAndPreview(path);
  },

  previewVoucher(e) {
    const path = e.currentTarget.dataset.path || '';
    if (path) this.downloadAndPreview(path);
  },

  downloadAndPreview(path) {
    wx.showLoading({ title: '正在读取...', mask: true });
    wx.downloadFile({
      url: `${app.globalData.apiBase}${path}`,
      header: app.authHeader(null),
      success: res => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.showToast({ title: '图片读取失败', icon: 'none' });
          return;
        }
        wx.previewImage({ urls: [res.tempFilePath], current: res.tempFilePath });
      },
      fail: () => wx.showToast({ title: '图片读取失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  }
});
