const qt = require('../../../utils/quality_trace');
const conclusions = [
  { value: 'CONTINUE_WATCH', label: '继续观察' },
  { value: 'SUPPLIER_REVIEW', label: '供应商复核' },
  { value: 'TEMPORARY_HOLD', label: '建议临时拦截' },
  { value: 'CONFIRMED_DEFECT', label: '确认批次缺陷' },
  { value: 'FALSE_ALARM', label: '排除预警' }
];
Page({
  data: { id: 0, item: {}, loading: true, error: '', conclusions, conclusionIndex: 0, reason: '', submitting: false },
  onLoad(options) { this.setData({ id: Number(options.id) }); },
  onShow() { if (this.data.id) this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try { this.setData({ item: await qt.request(`/alerts/${this.data.id}/`) }); }
    catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  chooseConclusion(e) { this.setData({ conclusionIndex: Number(e.detail.value) }); },
  inputReason(e) { this.setData({ reason: e.detail.value }); },
  async assess() {
    const reason = this.data.reason.trim();
    if (!reason) return wx.showToast({ title: '请填写研判理由', icon: 'none' });
    const selected = conclusions[this.data.conclusionIndex];
    const confirmed = await this.confirm('提交人工研判', `研判结论：${selected.label}`);
    if (!confirmed) return;
    await this.submit(`/alerts/${this.data.id}/assess/`, { conclusion: selected.value, reason }, '研判已记录');
    this.setData({ reason: '' });
  },
  async openCase() {
    const reason = this.data.reason.trim();
    if (!reason) return wx.showToast({ title: '请填写立案理由', icon: 'none' });
    const confirmed = await this.confirm('建立质量案件', '立案后将冻结本次指标的完整设备证据集合。');
    if (!confirmed) return;
    try {
      this.setData({ submitting: true });
      const qualityCase = await qt.request(`/alerts/${this.data.id}/open-case/`, 'POST', { reason });
      wx.redirectTo({ url: `/pages/quality_trace/case_detail/case_detail?id=${qualityCase.id}` });
    } catch (e) { wx.showModal({ title: '立案失败', content: e.message, showCancel: false }); }
    this.setData({ submitting: false });
  },
  async submit(path, data, title) {
    try { this.setData({ submitting: true }); await qt.request(path, 'POST', data); wx.showToast({ title }); await this.load(); }
    catch (e) { wx.showModal({ title: '操作失败', content: e.message, showCancel: false }); }
    this.setData({ submitting: false });
  },
  confirm(title, content) { return new Promise(resolve => wx.showModal({ title, content, success: result => resolve(result.confirm) })); },
  goCase() { wx.navigateTo({ url: `/pages/quality_trace/case_detail/case_detail?id=${this.data.item.quality_case.id}` }); }
});
