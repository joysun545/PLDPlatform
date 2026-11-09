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
    selectedLogisticsPath: '',
    selectedLogisticsName: '',
    selectedLogisticsType: 'IMAGE',
    logisticsRemark: '',
    submittingStatement: false,
    uploadingLogistics: false
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
    this.loadDetail(() => wx.stopPullDownRefresh(), true);
  },

  onShow() {
    if (this.data.transferId && this.data.detail && !this.data.loading &&
        !this.data.submittingStatement && !this.data.uploadingLogistics) {
      this.loadDetail(null, true);
    }
  },

  loadDetail(done, preserveDrafts = false) {
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
            errorMessage: body.msg || '商品单据信息加载失败'
          });
          return;
        }
        const detail = prepareDetail(body.data);
        const values = {
          loading: false,
          detail
        };
        if (!preserveDrafts || detail.statement.submitted) values.selectedStatementPath = '';
        this.setData(values);
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

  openTransferDetail() {
    wx.redirectTo({
      url: `/pages/stock/goods_transfer_detail/goods_transfer_detail?transfer_id=${this.data.transferId}`
    });
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

  documentActionAllowed(action) {
    const detail = this.data.detail;
    return Boolean(!this.data.loading && detail && detail.actions && detail.actions[action]);
  },

  submitStatement() {
    if (!this.documentActionAllowed('can_submit_statement')) return;
    const filePath = this.data.selectedStatementPath;
    if (!filePath) {
      wx.showToast({ title: '请上传货品清单图片', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '提交货品清单',
      content: '确认上传本次发货的货品清单？清单仅作单据留存，不生成应收账款。',
      confirmText: '确认提交',
      success: modal => modal.confirm && this.uploadStatement(filePath)
    });
  },

  uploadStatement(filePath) {
    if (this.data.submittingStatement || !this.documentActionAllowed('can_submit_statement')) return;
    this.setData({ submittingStatement: true });
    wx.showLoading({ title: '正在提交...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/settlement/statement/`,
      filePath,
      name: 'statement_image',
      header: app.authHeader(null),
      formData: {},
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
    if (!this.documentActionAllowed('can_upload_logistics')) return;
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

  showPaymentUnavailable() {
    wx.showToast({ title: '商家下发仅留存单据，不办理货款', icon: 'none' });
  },

  // Old hot-loaded event handlers remain harmless while the new page removes the forms.
  chooseVoucher() { this.showPaymentUnavailable(); },
  submitVoucher() { this.showPaymentUnavailable(); },
  uploadVoucher() { this.showPaymentUnavailable(); },
  confirmPayment() { this.showPaymentUnavailable(); },
  submitPaymentConfirmation() { this.showPaymentUnavailable(); },

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

  previewVoucher() { this.showPaymentUnavailable(); },

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
