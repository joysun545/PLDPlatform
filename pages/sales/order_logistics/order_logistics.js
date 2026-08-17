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

function formatSize(value) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function prepareDetail(detail) {
  return {
    ...detail,
    documents: (detail.documents || []).map(document => ({
      ...document,
      uploadedText: formatDate(document.uploaded_at),
      fileSizeText: formatSize(document.file_size)
    }))
  };
}

Page({
  data: {
    orderPlanId: 0,
    loading: true,
    errorMessage: '',
    detail: null,
    selectedFile: null,
    remark: '',
    uploading: false
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
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/logistics/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '物流单据加载失败'
          });
          return;
        }
        this.setData({
          loading: false,
          detail: prepareDetail(body.data)
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

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (!file || !file.tempFilePath) return;
        const suffix = (file.fileType || 'image') === 'image' ? 'jpg' : 'jpg';
        this.setData({
          selectedFile: {
            path: file.tempFilePath,
            name: `物流单据-${Date.now()}.${suffix}`,
            type: 'IMAGE',
            sizeText: formatSize(file.size)
          }
        });
      }
    });
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
      success: res => {
        const file = (res.tempFiles || [])[0];
        if (!file || !file.path) return;
        const name = file.name || `物流单据-${Date.now()}`;
        const isPdf = name.toLowerCase().endsWith('.pdf');
        this.setData({
          selectedFile: {
            path: file.path,
            name,
            type: isPdf ? 'PDF' : 'IMAGE',
            sizeText: formatSize(file.size)
          }
        });
      }
    });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value || '' });
  },

  submitDocument() {
    const selectedFile = this.data.selectedFile;
    if (!selectedFile || !selectedFile.path) {
      wx.showToast({ title: '请先选择物流单据', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '上传物流单据',
      content: `确认上传“${selectedFile.name}”？上传后相关商家账号会收到知晓任务。`,
      confirmText: '确认上传',
      success: modal => modal.confirm && this.uploadDocument(selectedFile)
    });
  },

  uploadDocument(selectedFile) {
    if (this.data.uploading) return;
    const clientRequestId = `logistics-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.setData({ uploading: true });
    wx.showLoading({ title: '正在上传...', mask: true });
    wx.uploadFile({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/logistics/documents/`,
      filePath: selectedFile.path,
      name: 'document_file',
      header: app.authHeader(null),
      formData: {
        client_request_id: clientRequestId,
        remark: (this.data.remark || '').trim()
      },
      success: res => {
        let body = {};
        try {
          body = JSON.parse(res.data || '{}');
        } catch (error) {
          wx.showToast({ title: '服务器返回数据格式错误', icon: 'none' });
          return;
        }
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '物流单据上传失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '物流单据已上传', icon: 'success' });
        this.setData({ selectedFile: null, remark: '' });
        app.refreshTasks && app.refreshTasks();
        this.loadDetail();
      },
      fail: () => wx.showToast({ title: '物流单据上传失败', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ uploading: false });
      }
    });
  },

  previewDocument(e) {
    const path = e.currentTarget.dataset.path || '';
    const fileType = e.currentTarget.dataset.type || 'IMAGE';
    if (!path) return;
    wx.showLoading({ title: '正在读取...', mask: true });
    wx.downloadFile({
      url: `${app.globalData.apiBase}${path}`,
      header: app.authHeader(null),
      success: res => {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          if (res.statusCode === 401) app.reauthenticate();
          wx.showToast({ title: '物流单据读取失败', icon: 'none' });
          return;
        }
        if (fileType === 'PDF') {
          wx.openDocument({
            filePath: res.tempFilePath,
            fileType: 'pdf',
            showMenu: true,
            fail: () => wx.showToast({ title: 'PDF打开失败', icon: 'none' })
          });
          return;
        }
        wx.previewImage({
          urls: [res.tempFilePath],
          current: res.tempFilePath
        });
      },
      fail: () => wx.showToast({ title: '物流单据读取失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  }
});
