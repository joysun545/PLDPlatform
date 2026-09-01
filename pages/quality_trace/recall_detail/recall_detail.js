const app = getApp();
const qt = require('../../../utils/quality_trace');

const QUALITY_FACTORY = ['factory_admin', 'factory_chief_engineer'];
const FACTORY_VIEW = ['factory_admin', 'factory_chief_engineer', 'factory_sales', 'factory_logistics', 'factory_sales_assistant'];
const FACTORY_OPERATIONS = ['factory_logistics', 'factory_sales_assistant'];
const MERCHANT = ['merchant_owner', 'merchant_manager', 'merchant_senior_manager', 'merchant_sales', 'merchant_stock'];
const CUSTOMER = ['customer_owner', 'driver'];
const FOCUS_STAGE_LABELS = {
  BATCH_TRACKING: '召回批次全局跟踪',
  RETURN_LEG_CREATED: '已建立下一程返厂运输',
  RETURN_IN_TRANSIT: '召回设备正在返厂运输',
  FACTORY_PENDING_RECEIPT: '等待厂家物流经理确认收货',
  FACTORY_RECEIVED_PENDING_POSTING: '厂家已收货，等待销售助理入库记账',
  FACTORY_INVENTORY_POSTED: '该设备已完成入库记账',
  BATCH_POSTING_PENDING_CONFIRMATION: '等待销售助理确认整批入库记账',
  POST_RECALL_DISPOSITION_READY: '整批已入库，等待总工程师启动召回后处置'
};

Page({
  data: {
    campaignId: 0, recallDeviceId: 0, taskFocusDeviceId: 0, focusStage: '', focusStageText: '', campaign: null, devices: [], selected: null,
    role: '', organizationId: 0, loading: true, busy: false, error: '',
    isFactory: false, isQualityFactory: false, isFactoryOperations: false, isMerchant: false, isCustomer: false,
    changingMethod: false,
    provider: '', trackingNo: '', pickupAddress: '', pickupDate: '', pickupTime: '',
    contactName: '', contactPhone: '', note: '',
    disposition: 'PENDING_INSPECTION', isolationLocation: '', evidence: null
  },
  onLoad(options) {
    this.setData({
      campaignId: Number(options.campaign_id || 0),
      recallDeviceId: Number(options.recall_device_id || 0),
      taskFocusDeviceId: Number(options.recall_device_id || 0),
      focusStage: options.focus_stage || '',
      focusStageText: FOCUS_STAGE_LABELS[options.focus_stage] || '',
      role: app.globalData.role || '',
      organizationId: Number(app.globalData.organization_id || 0)
    });
    this.load();
  },
  onShow() { if (this.data.campaign || this.data.selected) this.load(); },
  decorateDevice(row) {
    const role = this.data.role;
    const orgId = this.data.organizationId;
    const legs = row.transport_legs || [];
    const latestLeg = legs[legs.length - 1] || null;
    const handover = row.handover;
    const actions = (handover && handover.available_actions) || {};
    const qrImageUrl = handover && handover.merchant_transfer_token
      ? `${app.globalData.apiBase}/quality-trace/recall-handovers/merchant-transfer/${handover.merchant_transfer_token}/qrcode/`
      : '';
    return {
      ...row,
      statusText: qt.statusLabels[row.status] || row.status,
      latestLeg,
      qrImageUrl,
      canSelectDelivery: !!actions.select_delivery_method,
      canSubmitDirect: !!actions.submit_direct_shipment,
      canSubmitFactoryPickupShipment: !!actions.submit_factory_pickup_shipment,
      canAcceptFactoryPickup: !!actions.accept_factory_pickup,
      canSchedule: MERCHANT.includes(role) && handover && handover.status === 'ACKNOWLEDGED',
      canMerchantReceive: MERCHANT.includes(role) && handover && handover.status === 'PICKUP_SCHEDULED',
      canCreateTransport: MERCHANT.includes(role) && handover && handover.status === 'MERCHANT_RECEIVED' && (!latestLeg || latestLeg.status === 'RECEIVED'),
      canDispatch: MERCHANT.includes(role) && latestLeg && latestLeg.status === 'PREPARING' && latestLeg.from_organization.id === orgId,
      canReceive: latestLeg && latestLeg.status === 'IN_TRANSIT' && latestLeg.to_organization.id === orgId && (!latestLeg.is_factory_destination || role === 'factory_logistics'),
      canIsolate: role === 'factory_sales_assistant' && latestLeg && latestLeg.status === 'RECEIVED' && latestLeg.is_factory_destination && !row.isolation
    };
  },
  async load() {
    this.setData({ loading: true, error: '' });
    try {
      let campaign = this.data.campaign;
      let devices = [];
      if (this.data.campaignId) {
        campaign = await qt.request(`/recalls/${this.data.campaignId}/`);
        campaign = { ...campaign, statusText: qt.statusLabels[campaign.status] || campaign.status };
        devices = campaign.devices || [];
      } else {
        devices = [await qt.request(`/recall-devices/${this.data.recallDeviceId}/`)];
      }
      devices = devices.map(row => this.decorateDevice(row));
      const selected = devices.find(row => row.id === this.data.recallDeviceId) || devices[0] || null;
      const role = this.data.role;
      this.setData({
        campaign, devices, selected,
        recallDeviceId: selected ? selected.id : this.data.recallDeviceId,
        isFactory: FACTORY_VIEW.includes(role),
        isQualityFactory: QUALITY_FACTORY.includes(role),
        isFactoryOperations: FACTORY_OPERATIONS.includes(role),
        isMerchant: MERCHANT.includes(role),
        isCustomer: CUSTOMER.includes(role)
      }, () => this.scrollToFocusedDevice());
    } catch (e) { this.setData({ error: e.message }); }
    this.setData({ loading: false });
  },
  scrollToFocusedDevice() {
    if (!this.data.taskFocusDeviceId) return;
    setTimeout(() => {
      wx.pageScrollTo({
        selector: `#recall-device-${this.data.taskFocusDeviceId}`,
        duration: 300,
        offsetTop: 120
      });
    }, 80);
  },
  selectDevice(e) {
    const selected = this.data.devices.find(row => row.id === Number(e.currentTarget.dataset.id));
    this.setData({ selected, recallDeviceId: selected.id, evidence: null, changingMethod: false });
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  pickDate(e) { this.setData({ pickupDate: e.detail.value }); },
  pickTime(e) { this.setData({ pickupTime: e.detail.value }); },
  async post(path, data, success) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '处理中' });
    try {
      await qt.request(path, 'POST', data || {});
      wx.showToast({ title: success || '操作成功' });
      await this.load();
    } catch (e) {
      wx.showModal({ title: '操作失败', content: e.message, showCancel: false });
    }
    wx.hideLoading();
    this.setData({ busy: false });
  },
  async chooseEvidence() {
    try {
      const file = await qt.chooseEvidence();
      wx.showLoading({ title: '上传中' });
      const evidence = await qt.uploadEvidence(file);
      this.setData({ evidence });
      wx.showToast({ title: '凭证已上传' });
    } catch (e) {
      if (e && e.errMsg && e.errMsg.includes('cancel')) return;
      wx.showToast({ title: e.message || '选择失败', icon: 'none' });
    } finally { wx.hideLoading(); }
  },
  launch() {
    wx.showModal({
      title: '发布召回批次',
      content: '发布后将自动建立已激活设备交接并向所属用户、关联司机和链路商家推送任务。',
      success: result => {
        if (result.confirm) this.post(`/recalls/${this.data.campaignId}/launch/`, {}, '召回已发布');
      }
    });
  },
  refreshProgress() { this.post(`/recalls/${this.data.campaignId}/progress/`, {}, '进度已更新'); },
  completeCampaign() {
    wx.showModal({ title: '完成召回', editable: true, placeholderText: '请输入完成说明', success: res => {
      if (res.confirm && res.content) this.post(`/recalls/${this.data.campaignId}/complete/`, { reason: res.content }, '召回执行已完成');
    }});
  },
  selectDelivery(e) {
    const method = e.currentTarget.dataset.method;
    const payload = { note: this.data.note };
    if (method === 'FACTORY_PICKUP') {
      if (!this.data.contactName || !this.data.contactPhone || !this.data.pickupAddress || !this.data.pickupDate || !this.data.pickupTime) {
        return wx.showToast({ title: '请完整填写取件信息', icon: 'none' });
      }
      Object.assign(payload, {
        contact_name: this.data.contactName,
        contact_phone: this.data.contactPhone,
        pickup_address: this.data.pickupAddress,
        pickup_time_window: `${this.data.pickupDate} ${this.data.pickupTime}`
      });
    }
    this.setData({ changingMethod: false, evidence: null });
    this.post(`/recall-handovers/${this.data.selected.handover.id}/delivery-method/`, {
      delivery_method: method, payload
    }, '交付方式已确认');
  },
  changeDelivery() { this.setData({ changingMethod: true, evidence: null }); },
  submitDirectShipment() {
    if (!this.data.provider || !this.data.trackingNo || !this.data.evidence) {
      return wx.showToast({ title: '请填写物流并上传包装或单据照片', icon: 'none' });
    }
    this.post(`/recall-handovers/${this.data.selected.handover.id}/direct-ship/`, {
      logistics_provider: this.data.provider,
      tracking_no: this.data.trackingNo,
      evidence: this.data.evidence,
      note: this.data.note
    }, '直寄物流已提交');
  },
  acceptFactoryPickup() {
    if (!this.data.pickupDate || !this.data.pickupTime) {
      return wx.showToast({ title: '请选择预约取件时间', icon: 'none' });
    }
    this.post(`/recall-handovers/${this.data.selected.handover.id}/factory-pickup/accept/`, {
      pickup_scheduled_at: `${this.data.pickupDate}T${this.data.pickupTime}:00+08:00`,
      logistics_provider: this.data.provider,
      note: this.data.note
    }, '取件申请已受理');
  },
  submitFactoryPickupShipment() {
    if (!this.data.provider || !this.data.evidence) {
      return wx.showToast({ title: '请填写承运方并上传取件凭证', icon: 'none' });
    }
    this.post(`/recall-handovers/${this.data.selected.handover.id}/factory-pickup/dispatched/`, {
      logistics_provider: this.data.provider,
      tracking_no: this.data.trackingNo,
      evidence: this.data.evidence
    }, '已确认设备交付物流');
  },
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
    const leg = this.data.selected.latestLeg;
    if (!leg || !this.data.provider || !this.data.trackingNo || !this.data.evidence) return wx.showToast({ title: '请填写物流并上传凭证', icon: 'none' });
    this.post(`/recall-transport-legs/${leg.id}/dispatch/`, { logistics_provider: this.data.provider, tracking_no: this.data.trackingNo, evidence: this.data.evidence }, '设备已发出');
  },
  receive() {
    const leg = this.data.selected.latestLeg;
    if (!leg || !this.data.evidence) return wx.showToast({ title: '请先上传验收凭证', icon: 'none' });
    this.post(`/recall-transport-legs/${leg.id}/receive/`, { evidence: this.data.evidence, receipt_note: '本节点已验收' }, '本程已验收');
  },
  isolate() {
    const leg = this.data.selected.latestLeg;
    if (!leg || !this.data.isolationLocation || !this.data.evidence) return wx.showToast({ title: '请填写隔离位置并上传凭证', icon: 'none' });
    this.post(`/recall-transport-legs/${leg.id}/isolate/`, { disposition: this.data.disposition, isolation_location: this.data.isolationLocation, evidence: this.data.evidence }, '入库记账完成');
  },
  confirmBatchPosting() {
    wx.showModal({ title: '确认整批入库记账', editable: true, placeholderText: '可填写核对说明', success: res => {
      if (res.confirm) this.post(`/recalls/${this.data.campaignId}/inventory-confirm/`, { note: res.content || '' }, '整批入库记账已确认');
    }});
  },
  decideUnreachable(e) {
    const decision = e.currentTarget.dataset.decision;
    wx.showModal({ title: decision === 'APPROVED' ? '批准例外' : '驳回例外', editable: true, placeholderText: '请输入审批依据', success: res => {
      if (res.confirm && res.content) this.post(`/recall-devices/${this.data.selected.id}/unreachable-decision/`, { decision, reason: res.content }, '审批已记录');
    }});
  }
});
