const qt = require('../../../utils/quality_trace');
Page({
  data: { id: 0, item: {}, loading: true, error: '', submitting: false },
  onLoad(options) { this.setData({ id: Number(options.id) }); this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ item: await qt.request(`/rules/${this.data.id}/`) }); }
    catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  evaluate() {
    wx.showModal({ title: '手动计算规则', content: '将使用当前数据重新计算该规则并保留指标快照。', success: async result => {
      if (!result.confirm) return;
      this.setData({ submitting: true });
      try { await qt.request('/rules/evaluate/', 'POST', { rule_id: this.data.id }); wx.showToast({ title: '计算完成' }); await this.load(); }
      catch (e) { wx.showModal({ title: '计算失败', content: e.message, showCancel: false }); }
      this.setData({ submitting: false });
    }});
  }
});
