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
    logistics_documents: (detail.logistics_documents || []).map(document => ({
      ...document,
      uploadedText: formatDate(document.uploaded_at)
    })),
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
    transferId: 0,
    loading: true,
    errorMessage: '',
    detail: null,
    selectedStatementPath: '',
    receivableAmount: '',
    selectedLogisticsPath: '',
    selectedLogisticsName: '',
    selectedLogisticsType: 'IMAGE',
    logisticsRemark: '',
    selectedVoucherPath: '',
    submittingStatement: false,
    uploadingLogistics: false,
    uploadingVoucher: false,
    confirmingPaymentId: 0
  },

  onLoad(options) {
    const transferId = Number((options || {}).transfer_id || 0);
    if (!transferId) {
      this.setData({ loading: false, errorMessage: '商品流转参数无效' });
      return;
    }
    this.setData({ transferId });
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
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/settlement/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '商品货款信息加载失败'
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
      fail: () => this.setData({
        loading: false,
        errorMessage: '网络连接失败，请稍后重试'
      }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadDetail();
  },

  onReceivableInput(e) {
    this.setData({ receivableAmount: e.detail.value || '' });
  },

  onLogisticsRemarkInput(e) {
    this.setData({ logisticsRemark: e.detail.value || '' });
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
      wx.showToast({ title: '请填写货品应收金额', icon: 'none' });
      return;
    }
    if (!filePath) {
      wx.showToast({ title: '请上传货品清单图片', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '提交货品清单',
      content: `确认本次商品流转应收货款为 ¥${amount}？提交后不能修改。`,
      confirmText: '确认提交',
      success: modal => modal.confirm && this.uploadStatement(filePath, amount)
    });
  },

  uploadStatement(filePath, amount) {
    if (this.data.submittingStatement) return;
    this.setData({ submittingStatement: true });
    wx.showLoading({ title: '正在提交...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/settlement/statement/`,
      filePath,
      name: 'statement_image',
      header: app.authHeader(null),
      formData: { receivable_amount: amount },
      success: res => this.handleUploadResponse(res, '货品清单已提交'),
      fail: () => wx.showToast({ title: '货品清单上传失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submittingStatement: false });
      }
    });
  },

  chooseLogisticsImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({
            selectedLogisticsPath: file.tempFilePath,
            selectedLogisticsName: '物流单据图片',
            selectedLogisticsType: 'IMAGE'
          });
        }
      }
    });
  },

  chooseLogisticsPdf() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.path) {
          this.setData({
            selectedLogisticsPath: file.path,
            selectedLogisticsName: file.name || '物流单据.pdf',
            selectedLogisticsType: 'PDF'
          });
        }
      }
    });
  },

  submitLogistics() {
    const filePath = this.data.selectedLogisticsPath;
    if (!filePath) {
      wx.showToast({ title: '请先选择物流单据', icon: 'none' });
      return;
    }
    if (this.data.uploadingLogistics) return;
    const clientRequestId = `logistics-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.setData({ uploadingLogistics: true });
    wx.showLoading({ title: '正在上传...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/settlement/logistics-documents/`,
      filePath,
      name: 'document_file',
      header: app.authHeader(null),
      formData: {
        client_request_id: clientRequestId,
        remark: (this.data.logisticsRemark || '').trim()
      },
      success: res => this.handleUploadResponse(res, '物流单据已上传'),
      fail: () => wx.showToast({ title: '物流单据上传失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ uploadingLogistics: false });
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
      content: '确认上传本次付款凭证？发货方将依据凭证填写实际到账金额。',
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
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/settlement/payments/`,
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
    this.setData({
      selectedLogisticsPath: '',
      selectedLogisticsName: '',
      logisticsRemark: ''
    });
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
    const payment = (this.data.detail.payments || []).find(item => item.id === paymentId);
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
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/settlement/payments/${paymentId}/confirm/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: { confirmed_amount: amount },
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
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
    if (path) this.downloadAndPreview(path, 'IMAGE');
  },

  previewLogistics(e) {
    this.downloadAndPreview(
      e.currentTarget.dataset.path || '',
      e.currentTarget.dataset.type || 'IMAGE'
    );
  },

  previewVoucher(e) {
    const path = e.currentTarget.dataset.path || '';
    if (path) this.downloadAndPreview(path, 'IMAGE');
  },

  downloadAndPreview(path, fileType) {
    if (!path) return;
    wx.showLoading({ title: '正在读取...', mask: true });
    wx.downloadFile({
      url: `${app.globalData.apiBase}${path}`,
      header: app.authHeader(null),
      success: res => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          wx.showToast({ title: '单据读取失败', icon: 'none' });
          return;
        }
        if (fileType === 'PDF') {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            fail: () => wx.showToast({ title: 'PDF打开失败', icon: 'none' })
          });
        } else {
          wx.previewImage({ urls: [res.tempFilePath], current: res.tempFilePath });
        }
      },
      fail: () => wx.showToast({ title: '单据读取失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  }
});
