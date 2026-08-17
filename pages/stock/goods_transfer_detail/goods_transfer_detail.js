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
    }))
  };
}

Page({
  data: {
    transferId: 0,
    loading: true,
    errorMessage: '',
    detail: null,
    receiving: false
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

  confirmReceipt() {
    const detail = this.data.detail;
    if (!detail || !detail.actions || !detail.actions.can_receive || this.data.receiving) return;
    const factoryReturn = detail.flow_type === 'RETURN' && detail.to_organization.type === 'OWNER';
    const content = factoryReturn
      ? `确认 ${detail.item_count} 台退货设备已经入库？确认后物权转至厂家，同时终止这些设备的当前生命周期；再次出厂必须重新创建订单计划。`
      : `确认已收到 ${detail.item_count} 台设备并完成入库？确认后物权将从 ${detail.from_organization.name} 转至 ${detail.to_organization.name}。`;
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
          content: body.data.factory_lifecycle_terminated
            ? '设备已退回厂家，物权已转移，当前生命周期已经终止。'
            : '收货入库已确认，设备物权已经完成转移。',
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
