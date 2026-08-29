const qt = require('../../../utils/quality_trace');

Page({
  data: {
    campaignId: 0,
    loading: true,
    error: '',
    task: null,
    campaign: null,
    scope: null
  },
  onLoad(options) {
    this.setData({ campaignId: Number(options.campaign_id || 0) });
    this.load();
  },
  onShow() {
    if (this.data.task) this.load();
  },
  async load() {
    if (!this.data.campaignId) {
      this.setData({ loading: false, error: '缺少召回批次参数' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const task = await qt.request(`/recalls/${this.data.campaignId}/task-scope/`);
      const campaign = {
        ...(task.campaign || {}),
        statusText: qt.statusLabels[(task.campaign || {}).status] || (task.campaign || {}).status
      };
      this.setData({ task, campaign, scope: task.scope || {} });
    } catch (e) {
      this.setData({ error: e.message });
    }
    this.setData({ loading: false });
  },
  openRecallDetail() {
    wx.navigateTo({
      url: `/pages/quality_trace/recall_detail/recall_detail?campaign_id=${this.data.campaignId}`
    });
  }
});
