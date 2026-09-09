const qt = require('../../../utils/quality_trace');

const METHODS = {
  DISASSEMBLE: '拆机',
  REPAIR_NO_PARTS: '不换件维修',
  REPAIR_WITH_PARTS: '换件维修'
};

Page({
  data: {
    campaignId: 0,
    campaign: null,
    devices: [],
    focusId: 0,
    selectedIds: [],
    loading: true,
    busy: false,
    error: ''
  },

  onLoad(options) {
    const campaignId = Number(options.campaign_id || 0);
    if (!campaignId) {
      this.setData({ loading: false, error: '缺少召回批次参数，请从召回详情进入。' });
      return;
    }
    this.setData({ campaignId });
    this.load();
  },

  onShow() {
    if (this.data.campaign) this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const campaign = await qt.request(`/recalls/${this.data.campaignId}/`);
      if (campaign.viewer && (campaign.viewer.role !== 'factory_chief_engineer' ||
          campaign.viewer.organization_type !== 'OWNER' || campaign.status !== 'ACTIVE')) {
        throw new Error('当前岗位或批次状态不允许分配召回后处置，请返回召回详情。');
      }
      const selected = new Set(this.data.selectedIds);
      const devices = (campaign.devices || []).map(row => ({
        ...row,
        assigned: !!row.post_disposition || ['UNREACHABLE', 'EXEMPTED'].includes(row.status),
        methodText: row.post_disposition
          ? (row.post_disposition.method_label || METHODS[row.post_disposition.method])
          : '待选择处置方式',
        selected: !row.post_disposition && selected.has(row.id)
      }));
      const validIds = devices.filter(row => row.selected).map(row => row.id);
      const focusExists = devices.some(row => row.id === this.data.focusId);
      this.setData({
        campaign,
        devices,
        selectedIds: validIds,
        focusId: focusExists ? this.data.focusId : (devices[0] ? devices[0].id : 0)
      });
    } catch (error) {
      this.setData({ error: error.message || '处置设备加载失败', campaign: null, devices: [], selectedIds: [] });
    }
    this.setData({ loading: false });
  },

  focusDevice(event) {
    this.setData({ focusId: Number(event.currentTarget.dataset.id) });
  },

  toggleSelect(event) {
    const id = Number(event.currentTarget.dataset.id);
    const row = this.data.devices.find(item => item.id === id);
    if (!row || row.assigned) return;
    const selected = new Set(this.data.selectedIds);
    selected.has(id) ? selected.delete(id) : selected.add(id);
    const selectedIds = Array.from(selected);
    this.setData({
      selectedIds,
      devices: this.data.devices.map(item => ({
        ...item,
        selected: selected.has(item.id)
      }))
    });
  },

  assignMethod(event) {
    const method = event.currentTarget.dataset.method;
    const label = METHODS[method];
    const ids = this.data.selectedIds;
    if (!ids.length) {
      wx.showToast({ title: '请先勾选设备', icon: 'none' });
      return;
    }
    wx.showModal({
      title: `确认${label}`,
      content: `将选中的${ids.length}台设备分配为“${label}”，确认后不可覆盖。`,
      success: result => {
        if (result.confirm) this.submit(method, label, ids);
      }
    });
  },

  async submit(method, label, ids) {
    if (this.data.busy || this.data.loading || !this.data.campaign) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '处理中' });
    try {
      await qt.request(
        `/recalls/${this.data.campaignId}/post-disposition/start/`,
        'POST',
        {
          method,
          recall_device_ids: ids,
          note: `厂家总工程师分配${label}`
        }
      );
      this.setData({ selectedIds: [] });
      wx.showToast({ title: '处置方式已分配' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 500);
    } catch (error) {
      wx.showModal({ title: '分配失败', content: error.message, showCancel: false });
    }
    wx.hideLoading();
    this.setData({ busy: false });
  }
});
