const app = getApp();

const RETURN_DOCUMENT_CONFIG = {
  LOGISTICS: {
    prefix: 'logistics',
    endpoint: 'logistics-documents',
    label: '物流单据'
  },
  GOODS_LIST: {
    prefix: 'goodsList',
    endpoint: 'goods-list-documents',
    label: '货品清单'
  }
};

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
  if (!detail) return null;
  return {
    ...detail,
    createdText: formatDate(detail.created_at),
    submittedText: formatDate(detail.submitted_at),
    receivedText: formatDate(detail.received_at),
    completedText: formatDate(detail.completed_at),
    items: (detail.items || []).map(item => ({
      ...item,
      scannedText: formatDate(item.scanned_at),
      completedText: formatDate(item.completed_at)
    })),
    factory_return_logistics_documents: (
      detail.factory_return_logistics_documents || []
    ).map(document => ({
      ...document,
      uploadedText: formatDate(document.uploaded_at)
    })),
    factory_return_goods_list_documents: (
      detail.factory_return_goods_list_documents || []
    ).map(document => ({
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
    receiving: false,
    logisticsSelectedPath: '',
    logisticsSelectedName: '',
    logisticsRemark: '',
    logisticsUploading: false,
    goodsListSelectedPath: '',
    goodsListSelectedName: '',
    goodsListRemark: '',
    goodsListUploading: false
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

  onShow() {
    if (this.data.transferId && app.globalData.access_token && !this.data.loading) {
      this.loadDetail();
    }
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  loadDetail(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({ loading: false, errorMessage: body.msg || '商品流转详情加载失败' });
          return;
        }
        this.setData({ loading: false, detail: prepareDetail(body.data) });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadDetail();
  },

  continueScanning() {
    wx.navigateTo({
      url: `/pages/stock/goods_transfer/goods_transfer?transfer_id=${this.data.transferId}`
    });
  },

  openSettlement() {
    wx.navigateTo({
      url: `/pages/stock/goods_transfer_settlement/goods_transfer_settlement?transfer_id=${this.data.transferId}`
    });
  },

  openAccounts() {
    wx.navigateTo({
      url: `/pages/stock/goods_transfer_accounts/goods_transfer_accounts?transfer_id=${this.data.transferId}`
    });
  },

  openFactoryReturnProcess() {
    wx.navigateTo({
      url: `/pages/stock/factory_return_process/factory_return_process?transfer_id=${this.data.transferId}`
    });
  },

  documentConfig(event) {
    const kind = String((event.currentTarget.dataset || {}).kind || '').toUpperCase();
    return { kind, config: RETURN_DOCUMENT_CONFIG[kind] || null };
  },

  chooseReturnDocumentImage(event) {
    const { config } = this.documentConfig(event);
    if (!config) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.tempFilePath) {
          this.setData({
            [`${config.prefix}SelectedPath`]: file.tempFilePath,
            [`${config.prefix}SelectedName`]: `退货${config.label}图片`
          });
        }
      }
    });
  },

  chooseReturnDocumentPdf(event) {
    const { config } = this.documentConfig(event);
    if (!config) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (file && file.path) {
          this.setData({
            [`${config.prefix}SelectedPath`]: file.path,
            [`${config.prefix}SelectedName`]: file.name || `退货${config.label}.pdf`
          });
        }
      }
    });
  },

  onReturnDocumentRemarkInput(event) {
    const { config } = this.documentConfig(event);
    if (!config) return;
    this.setData({ [`${config.prefix}Remark`]: event.detail.value || '' });
  },

  submitReturnDocument(event) {
    const { kind, config } = this.documentConfig(event);
    if (!config) return;
    const filePath = this.data[`${config.prefix}SelectedPath`];
    if (!filePath) {
      wx.showToast({ title: `请先选择${config.label}`, icon: 'none' });
      return;
    }
    if (this.data[`${config.prefix}Uploading`]) return;
    const clientRequestId = (
      `return-${config.endpoint}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    this.setData({ [`${config.prefix}Uploading`]: true });
    wx.showLoading({ title: '正在上传...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/factory-return/${config.endpoint}/`,
      filePath,
      name: 'document_file',
      header: app.authHeader(null),
      formData: {
        client_request_id: clientRequestId,
        remark: (this.data[`${config.prefix}Remark`] || '').trim()
      },
      success: res => this.handleReturnDocumentUploadResponse(res, kind),
      fail: () => wx.showToast({ title: `${config.label}上传失败`, icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ [`${config.prefix}Uploading`]: false });
      }
    });
  },

  handleReturnDocumentUploadResponse(res, kind) {
    const config = RETURN_DOCUMENT_CONFIG[kind];
    if (!config) return;
    let body = {};
    try {
      body = JSON.parse(res.data || '{}');
    } catch (error) {
      wx.showToast({ title: '服务器返回数据格式错误', icon: 'none' });
      return;
    }
    if (body.code === 401) app.reauthenticate();
    if (body.code !== 0) {
      wx.showToast({ title: body.msg || `${config.label}上传失败`, icon: 'none' });
      return;
    }
    this.setData({
      [`${config.prefix}SelectedPath`]: '',
      [`${config.prefix}SelectedName`]: '',
      [`${config.prefix}Remark`]: ''
    });
    if (typeof app.refreshTasks === 'function') app.refreshTasks();
    wx.showToast({ title: body.msg || `${config.label}已上传`, icon: 'success' });
    this.loadDetail();
  },

  previewReturnDocument(event) {
    const path = event.currentTarget.dataset.path || '';
    const fileType = event.currentTarget.dataset.type || 'IMAGE';
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
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          });
        }
      },
      fail: () => wx.showToast({ title: '单据读取失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  },

  confirmReceipt() {
    const detail = this.data.detail;
    if (!detail || !detail.actions || !detail.actions.can_receive || this.data.receiving) return;
    const content = `确认已收到 ${detail.item_count} 台设备并完成入库？确认后物权将从 ${detail.from_organization.name} 转至 ${detail.to_organization.name}。`;
    wx.showModal({
      title: '确认商品入库',
      content,
      confirmText: '确认入库',
      success: modal => modal.confirm && this.doConfirmReceipt()
    });
  },

  doConfirmReceipt() {
    this.setData({ receiving: true });
    wx.showLoading({ title: '正在确认...', mask: true });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${this.data.transferId}/receipt/`,
      method: 'POST',
      header: app.authHeader(),
      data: {},
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '商品入库确认失败', icon: 'none' });
          return;
        }
        this.setData({ detail: prepareDetail(body.data) });
        if (typeof app.refreshTasks === 'function') app.refreshTasks();
        wx.showModal({
          title: '入库完成',
          content: '收货入库已确认，设备物权已经完成转移。',
          showCancel: false
        });
      },
      fail: () => wx.showToast({ title: '网络连接失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ receiving: false });
      }
    });
  }
});
