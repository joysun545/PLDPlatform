const app = getApp();
const qt = require('../../../utils/quality_trace');

Page({
  data: { token: '', receiptNote: '', busy: false, loading: true, error: '', preview: null },
  onLoad(options) {
    let scene = '';
    try { scene = decodeURIComponent(options.scene || ''); } catch (e) { /* Invalid code is handled below. */ }
    this.setData({ token: options.token || scene });
    if (typeof app.ensureLogin === 'function') {
      app.ensureLogin(ok => {
        if (ok) this.loadPreview();
        else this.setData({ loading: false, error: '请先完成微信登录，再扫描召回流转码。' });
      });
    } else this.loadPreview();
  },
  onShow() { if (this.data.preview && !this.data.busy) this.loadPreview(); },
  async loadPreview() {
    if (!this.data.token) return this.setData({ loading: false, preview: null, error: '召回流转码无效' });
    this.setData({ loading: true, preview: null, error: '' });
    try {
      const preview = await qt.request(`/recall-handovers/merchant-transfer/accept/?token=${encodeURIComponent(this.data.token)}`);
      this.setData({ preview });
    } catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  input(e) { this.setData({ receiptNote: e.detail.value }); },
  async accept() {
    if (this.data.busy || this.data.loading || !this.data.preview || !this.data.preview.can_accept) return;
    if (!this.data.receiptNote.trim()) return wx.showToast({ title: '请填写接管说明', icon: 'none' });
    this.setData({ busy: true, error: '' });
    try {
      const result = await qt.request('/recall-handovers/merchant-transfer/accept/', 'POST', {
        token: this.data.token, receipt_note: this.data.receiptNote
      });
      wx.showToast({ title: '接管成功' });
      this.setData({ preview: { ...this.data.preview, can_accept: false, already_received: true } });
      wx.redirectTo({ url: `/pages/quality_trace/recall_detail/recall_detail?recall_device_id=${result.recall_device_id}` });
    } catch (e) { this.setData({ error: e.message }); }
    this.setData({ busy: false });
  },
  openDetail() {
    if (this.data.preview) wx.redirectTo({ url: `/pages/quality_trace/recall_detail/recall_detail?recall_device_id=${this.data.preview.recall_device_id}` });
  }
});
