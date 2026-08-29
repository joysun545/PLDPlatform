const app = getApp();
const qt = require('../../../utils/quality_trace');

const FACTORY = ['factory_admin', 'factory_chief_engineer'];
const MERCHANT = ['merchant_owner', 'merchant_manager', 'merchant_senior_manager', 'merchant_sales', 'merchant_stock'];

Page({
  data: {
    campaignId: 0, recallDeviceId: 0, campaign: null, devices: [], selected: null,
    role: '', organizationId: 0, loading: true, busy: false, error: '',
    isFactory: false, isMerchant: false, isCustomer: false,
    provider: '', trackingNo: '', pickupAddress: '', pickupDate: '', pickupTime: '',
    disposition: 'QUARANTINE', isolationLocation: '', evidence: null
  },
  onLoad(options) {
    this.setData({
      campaignId: Number(options.campaign_id || 0), recallDeviceId: Number(options.recall_device_id || 0),
      role: app.globalData.role || '', organizationId: Number(app.globalData.organization_id || 0)
    });
    this.load();
  },
  onShow() { if (this.data.campaign || this.data.selected) this.load(); },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      let campaign = this.data.campaign;
      let devices = [];
      if (this.data.campaignId) {
        campaign = await qt.request(`/recalls/${this.data.campaignId}/`);
        devices = campaign.devices || [];
      } else {
        const row = await qt.request(`/recall-devices/${this.data.recallDeviceId}/`);
        devices = [row];
      }
      devices = devices.map(x => ({ ...x, statusText: qt.statusLabels[x.status] || x.status }));
      let selected = devices.find(x => x.id === this.data.recallDeviceId) || devices[0] || null;
      const role = this.data.role;
      if (selected) {
        const legs = selected.transport_legs || [];
        const latestLeg = legs[legs.length - 1] || null;
        const handover = selected.handover;
        const orgId = this.data.organizationId;
        selected = { ...selected, latestLeg,
          canAcknowledge: role === 'customer_owner' && handover && handover.status === 'PENDING_CUSTOMER_ACK',
          canSchedule: MERCHANT.includes(role) && handover && handover.status === 'ACKNOWLEDGED',
          canMerchantReceive: MERCHANT.includes(role) && handover && handover.status === 'PICKUP_SCHEDULED',
          canCreateTransport: MERCHANT.includes(role) && handover && handover.status === 'MERCHANT_RECEIVED' && (!latestLeg || latestLeg.status === 'RECEIVED'),
          canDispatch: MERCHANT.includes(role) && latestLeg && latestLeg.status === 'PREPARING' && latestLeg.from_organization.id === orgId,
          canReceive: latestLeg && latestLeg.status === 'IN_TRANSIT' && latestLeg.to_organization.id === orgId,
          canIsolate: FACTORY.includes(role) && latestLeg && latestLeg.status === 'RECEIVED' && latestLeg.is_factory_destination && !selected.isolation
        };
      }
      this.setData({
        campaign, devices, selected,
        recallDeviceId: selected ? selected.id : this.data.recallDeviceId,
        isFactory: FACTORY.includes(role), isMerchant: MERCHANT.includes(role), isCustomer: role === 'customer_owner'
      });
    } catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  selectDevice(e) {
    const selected = this.data.devices.find(x => x.id === Number(e.currentTarget.dataset.id));
    this.setData({ selected, recallDeviceId: selected.id, evidence: null });
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  pickDate(e) { this.setData({ pickupDate: e.detail.value }); },
  pickTime(e) { this.setData({ pickupTime: e.detail.value }); },
  async post(path, data, success) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '处理中' });
    try { await qt.request(path, 'POST', data || {}); wx.showToast({ title: success || '操作成功' }); await this.load(); }
    catch (e) { wx.showModal({ title: '操作失败', content: e.message, showCancel: false }); }
    wx.hideLoading(); this.setData({ busy: false });
  },
  async chooseEvidence() {
    try {
      const file = await qt.chooseEvidence();
      wx.showLoading({ title: '上传中' });
      const evidence = await qt.uploadEvidence(file);
      this.setData({ evidence });
      wx.showToast({ title: '凭证已上传' });
    } catch (e) { if (e && e.errMsg && e.errMsg.includes('cancel')) return; wx.showToast({ title: e.message || '选择失败', icon: 'none' }); }
    finally { wx.hideLoading(); }
  },
  launch() { this.post(`/recalls/${this.data.campaignId}/launch/`, {}, '召回已发布'); },
  publishTasks() { this.post(`/recalls/${this.data.campaignId}/publish-tasks/`, {}, '任务已推送'); },
  refreshProgress() { this.post(`/recalls/${this.data.campaignId}/progress/`, {}, '进度已更新'); },
  completeCampaign() {
    wx.showModal({ title: '完成召回', editable: true, placeholderText: '请输入完成说明', success: res => {
      if (res.confirm && res.content) this.post(`/recalls/${this.data.campaignId}/complete/`, { reason: res.content }, '召回执行已完成');
    }});
  },
  initializeHandover() { this.post(`/recall-devices/${this.data.selected.id}/initialize-handover/`, {}, '交接单已建立'); },
  acknowledge() { this.post(`/recall-handovers/${this.data.selected.handover.id}/acknowledge/`, { note: '本人已阅读并确认召回通知' }, '已确认召回'); },
  schedulePickup() {
    if (!this.data.pickupDate || !this.data.pickupTime || !this.data.pickupAddress) return wx.showToast({ title: '请完整填写预约信息', icon: 'none' });
    this.post(`/recall-handovers/${this.data.selected.handover.id}/schedule-pickup/`, {
      pickup_scheduled_at: `${this.data.pickupDate}T${this.data.pickupTime}:00+08:00`, pickup_address: this.data.pickupAddress
    }, '取回预约已确认');
  },
  async merchantReceive() {
    if (!this.data.evidence) return wx.showToast({ title: '请先上传接管凭证', icon: 'none' });
    const id = this.data.selected.handover.id;
    try {
      await qt.request(`/recall-handovers/${id}/evidence/`, 'POST', { kind: 'MERCHANT_RECEIPT', client_request_id: `receipt-${Date.now()}`, evidence: this.data.evidence });
      await this.post(`/recall-handovers/${id}/receive/`, { receipt_note: '商家已核验并接管设备' }, '商家已接管');
    } catch (e) { wx.showModal({ title: '接管失败', content: e.message, showCancel: false }); }
  },
  createTransport() { this.post(`/recall-devices/${this.data.selected.id}/next-transport/`, {}, '下一程退回已建立'); },
  dispatch() {
    const legs = this.data.selected.transport_legs || []; const leg = legs[legs.length - 1];
    if (!leg || !this.data.provider || !this.data.trackingNo || !this.data.evidence) return wx.showToast({ title: '请填写物流并上传凭证', icon: 'none' });
    this.post(`/recall-transport-legs/${leg.id}/dispatch/`, { logistics_provider: this.data.provider, tracking_no: this.data.trackingNo, evidence: this.data.evidence }, '设备已发出');
  },
  receive() {
    const legs = this.data.selected.transport_legs || []; const leg = legs[legs.length - 1];
    if (!leg || !this.data.evidence) return wx.showToast({ title: '请先上传验收凭证', icon: 'none' });
    this.post(`/recall-transport-legs/${leg.id}/receive/`, { evidence: this.data.evidence, receipt_note: '本节点已验收' }, '本程已验收');
  },
  isolate() {
    const legs = this.data.selected.transport_legs || []; const leg = legs[legs.length - 1];
    if (!leg || !this.data.isolationLocation || !this.data.evidence) return wx.showToast({ title: '请填写隔离位置并上传凭证', icon: 'none' });
    this.post(`/recall-transport-legs/${leg.id}/isolate/`, { disposition: this.data.disposition, isolation_location: this.data.isolationLocation, evidence: this.data.evidence }, '厂家隔离完成');
  },
  decideUnreachable(e) {
    const decision = e.currentTarget.dataset.decision;
    wx.showModal({ title: decision === 'APPROVED' ? '批准例外' : '驳回例外', editable: true, placeholderText: '请输入审批依据', success: res => {
      if (res.confirm && res.content) this.post(`/recall-devices/${this.data.selected.id}/unreachable-decision/`, { decision, reason: res.content }, '审批已记录');
    }});
  }
});
