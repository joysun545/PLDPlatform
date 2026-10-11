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

function statusClass(status) {
  if (status === 'COMPLETED') return 'completed';
  if (status === 'PENDING_RECEIPT') return 'pending';
  if (status === 'CANCELLED') return 'cancelled';
  return 'scanning';
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    viewer: null,
    headerSubtitle: '当前组织',
    deletingTransferId: 0,
    items: []
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadList();
    });
  },

  onShow() {
    if (app.globalData.access_token && !this.data.loading) this.loadList();
  },

  onPullDownRefresh() {
    this.loadList(() => wx.stopPullDownRefresh());
  },

  loadList(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/goods-transfers/?limit=100`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '商品流转列表加载失败'
          });
          return;
        }
        const items = (body.data.items || []).map(item => ({
          ...item,
          createdText: formatDate(item.created_at),
          statusClass: statusClass(item.status),
          actionText: item.actions && item.actions.can_receive
            ? '待你确认入库'
            : (item.actions && item.actions.can_scan ? '继续扫码' : '查看详情')
        }));
        const viewer = body.data.viewer || null;
        const headerSubtitle = viewer
          ? [viewer.organization_name, viewer.role_name].filter(Boolean).join(' · ')
          : '当前组织';
        this.setData({
          loading: false,
          viewer,
          headerSubtitle,
          items
        });
      },
      fail: () => this.setData({ loading: false, errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadList();
  },

  openItem(e) {
    const transferId = Number(e.currentTarget.dataset.id);
    if (!transferId) return;
    const item = this.data.items.find(row => Number(row.id) === transferId);
    const page = item && item.actions && item.actions.can_scan
      ? 'goods_transfer/goods_transfer'
      : 'goods_transfer_detail/goods_transfer_detail';
    wx.navigateTo({
      url: `/pages/stock/${page}?transfer_id=${transferId}`
    });
  },

  deleteDraft(e) {
    const transferId = Number(e.currentTarget.dataset.id || 0);
    if (!transferId || this.data.deletingTransferId) return;
    const item = this.data.items.find(row => Number(row.id) === transferId);
    if (!item || !item.actions || !item.actions.can_delete) return;

    wx.showModal({
      title: '删除未完成流转？',
      content: `删除 ${item.flow_no} 及其未提交扫码记录。设备库存和生命周期记录不会改变。`,
      confirmText: '删除',
      confirmColor: '#b42318',
      success: modal => {
        if (!modal.confirm) return;
        this.setData({ deletingTransferId: transferId });
        wx.request({
          url: `${app.globalData.apiBase}/lifecycle/goods-transfers/${transferId}/`,
          method: 'DELETE',
          header: app.authHeader(),
          success: res => {
            const body = res.data || {};
            if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
            if (body.code !== 0) {
              wx.showToast({ title: body.msg || '删除未完成流转失败', icon: 'none' });
              return;
            }
            wx.showToast({ title: '未完成流转已删除', icon: 'none' });
            this.loadList();
          },
          fail: () => wx.showToast({ title: '网络连接失败，请稍后重试', icon: 'none' }),
          complete: () => this.setData({ deletingTransferId: 0 })
        });
      }
    });
  },

});
