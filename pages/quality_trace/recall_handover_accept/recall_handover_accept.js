const qt = require('../../../utils/quality_trace');

Page({
  data: { token: '', receiptNote: '', busy: false, error: '' },
  onLoad(options) {
    const scene = decodeURIComponent(options.scene || '');
    this.setData({ token: options.token || scene });
  },
  input(e) { this.setData({ receiptNote: e.detail.value }); },
  async accept() {
    if (!this.data.token) return wx.showToast({ title: '召回流转码无效', icon: 'none' });
    if (!this.data.receiptNote.trim()) return wx.showToast({ title: '请填写接管说明', icon: 'none' });
    if (this.data.busy) return;
    this.setData({ busy: true, error: '' });
    try {
      const result = await qt.request('/recall-handovers/merchant-transfer/accept/', 'POST', {
        token: this.data.token,
        receipt_note: this.data.receiptNote
      });
      wx.showToast({ title: '接管成功' });
      setTimeout(() => wx.redirectTo({
        url: `/pages/quality_trace/recall_detail/recall_detail?recall_device_id=${result.recall_device_id}`
      }), 500);
    } catch (e) {
      this.setData({ error: e.message });
    }
    this.setData({ busy: false });
  }
});
