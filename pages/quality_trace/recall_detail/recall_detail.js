const app = getApp();
const qt = require('../../../utils/quality_trace');

const QUALITY_FACTORY = ['factory_chief_engineer'];
const FACTORY_VIEW = ['factory_chief_engineer', 'factory_logistics', 'factory_sales_assistant'];
const FACTORY_OBSERVER = ['factory_admin', 'factory_manager', 'factory_senior_manager'];
const FACTORY_OPERATIONS = ['factory_logistics', 'factory_sales_assistant'];
const MERCHANT = ['merchant_owner', 'merchant_manager', 'merchant_senior_manager', 'merchant_sales', 'merchant_stock'];
const CUSTOMER = ['customer_owner', 'driver'];
const FOCUS_STAGE_LABELS = {
  BATCH_TRACKING: '召回批次全局跟踪',
  RETURN_LEG_CREATED: '已建立下一程返厂运输',
  RETURN_IN_TRANSIT: '召回设备正在返厂运输',
  MERCHANT_PENDING_RECEIPT: '等待上级商家批量确认接收',
  UPSTREAM_MERCHANT_RECEIVED: '本组织已接管，可批量继续退回',
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
    isFactory: false, isObserver: false, isQualityFactory: false, isFactoryOperations: false, isMerchant: false, isCustomer: false,
    changingMethod: false,
    provider: '', trackingNo: '', pickupAddress: '', pickupDate: '', pickupTime: '',
    contactName: '', contactPhone: '', note: '',
    disposition: 'PENDING_INSPECTION', isolationLocation: '', evidence: null,
    batchEnabled: false, batchGroups: [], batchGroupIndex: 0, batchGroup: null,
    batchSelectedIds: [], batchSelectedCount: 0, batchAllSelected: false, batchExpanded: false,
    batchGuidance: '', batchEmptyMessage: '',
    batchBlocked: [], batchProvider: '', batchTrackingNo: '', batchLocation: '', batchEvidence: null
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
  onShow() { if (!this.data.busy && (this.data.campaign || this.data.selected)) this.load(); },
  decorateDevice(row, batchEnabled, campaignActive = true) {
    const role = this.data.role;
    const orgId = this.data.organizationId;
    const legs = (row.transport_legs || []).filter(leg => leg.status !== 'CANCELLED');
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
      canSchedule: !!actions.schedule_pickup,
      canMerchantReceive: !!actions.merchant_receive,
      canCreateTransport: campaignActive && !batchEnabled && MERCHANT.includes(role) && handover && handover.merchant_organization_id === orgId && handover.status === 'MERCHANT_RECEIVED' && (!latestLeg || latestLeg.status === 'RECEIVED'),
      canDispatch: campaignActive && !batchEnabled && MERCHANT.includes(role) && latestLeg && latestLeg.status === 'PREPARING' && latestLeg.from_organization.id === orgId,
      canReceive: campaignActive && !batchEnabled && (MERCHANT.includes(role) || role === 'factory_logistics') && latestLeg && latestLeg.status === 'IN_TRANSIT' && latestLeg.to_organization.id === orgId && (!latestLeg.is_factory_destination || role === 'factory_logistics'),
      canIsolate: campaignActive && !batchEnabled && role === 'factory_sales_assistant' && latestLeg && latestLeg.status === 'RECEIVED' && latestLeg.is_factory_destination && latestLeg.to_organization.id === orgId && !row.isolation
    };
  },
  async load() {
    const loadId = this._loadId = (this._loadId || 0) + 1;
    this.setData({ loading: true, error: '' });
    try {
      let campaign = this.data.campaign;
      let devices = [];
      if (this.data.campaignId) {
        campaign = await qt.request(`/recalls/${this.data.campaignId}/`);
        campaign = { ...campaign, statusText: qt.statusLabels[campaign.status] || campaign.status };
        devices = campaign.devices || [];
      } else {
        const device = await qt.request(`/recall-devices/${this.data.recallDeviceId}/`);
        if (device.campaign_id) {
          this.setData({ campaignId: device.campaign_id });
          campaign = await qt.request(`/recalls/${device.campaign_id}/`);
          campaign = { ...campaign, statusText: qt.statusLabels[campaign.status] || campaign.status };
          devices = campaign.devices || [];
        } else devices = [device];
      }
      if (loadId !== this._loadId) return;
      const viewer = campaign && campaign.viewer;
      if (viewer) {
        if (viewer.role !== this.data.role || Number(viewer.organization_id) !== this.data.organizationId) {
          this._batchRequest = null;
          this.setData({ batchGroup: null, batchSelectedIds: [], evidence: null, changingMethod: false,
            provider: '', trackingNo: '', pickupAddress: '', pickupDate: '', pickupTime: '',
            contactName: '', contactPhone: '', note: '', isolationLocation: '' });
        }
        this.setData({ role: viewer.role, organizationId: Number(viewer.organization_id) });
      }
      const flow = (campaign && campaign.batch_flow) || {};
      const batchState = this.prepareBatchState(flow);
      const batchDeviceIds = new Set((flow.groups || []).reduce((ids, group) => ids.concat(group.devices.map(item => item.recall_device_id)), []));
      devices = devices.map(row => ({
        ...this.decorateDevice(row, !!flow.enabled, !campaign || campaign.status === 'ACTIVE'),
        hasBatchAction: batchDeviceIds.has(row.id)
      }));
      const selected = devices.find(row => row.id === this.data.recallDeviceId) || devices[0] || null;
      if (this.data.selected && (!selected || selected.id !== this.data.selected.id)) {
        this.setData({ evidence: null, changingMethod: false, provider: '', trackingNo: '', note: '' });
      }
      const role = this.data.role;
      this.setData({
        campaign, devices, selected, ...batchState,
        taskFocusDeviceId: devices.some(row => row.id === this.data.taskFocusDeviceId) ? this.data.taskFocusDeviceId : 0,
        focusStageText: selected ? (selected.next_step || selected.current_stage_label || '') : '',
        batchGuidance: flow.guidance || '', batchEmptyMessage: flow.empty_message || '当前没有可批量办理的设备，请查看设备进度。',
        recallDeviceId: selected ? selected.id : this.data.recallDeviceId,
        isFactory: FACTORY_VIEW.includes(role) && (!viewer || viewer.full_campaign_access !== false),
        isObserver: FACTORY_OBSERVER.includes(role) || !!(viewer && viewer.observer_only),
        isQualityFactory: QUALITY_FACTORY.includes(role),
        isFactoryOperations: FACTORY_OPERATIONS.includes(role),
        isMerchant: MERCHANT.includes(role),
        isCustomer: CUSTOMER.includes(role)
      }, () => this.scrollToFocusedDevice());
    } catch (e) {
      if (loadId !== this._loadId) return;
      this.setData({ error: e.message, campaign: null, devices: [], selected: null,
        batchEnabled: false, batchGroup: null, batchSelectedIds: [], evidence: null });
    }
    if (loadId === this._loadId) this.setData({ loading: false });
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
    if (this.data.busy || this.data.loading) return;
    const selected = this.data.devices.find(row => row.id === Number(e.currentTarget.dataset.id));
    if (!selected) return;
    this.setData({ selected, recallDeviceId: selected.id, evidence: null, changingMethod: false, provider: '', trackingNo: '', pickupAddress: '', pickupDate: '', pickupTime: '', contactName: '', contactPhone: '', note: '', isolationLocation: '' });
  },
  prepareBatchState(flow) {
    const groups = (flow.groups || []).map(group => ({
      ...group, pickerLabel: `${group.title}（${group.device_count}台）${group.action === 'RECEIVE' && group.tracking_no ? ' · ' + group.tracking_no : ''}`
    }));
    let index = groups.findIndex(group => this.data.batchGroup && group.key === this.data.batchGroup.key);
    const sameGroup = index >= 0;
    if (!sameGroup) {
      const focusAction = {
        MERCHANT_PENDING_RECEIPT: 'RECEIVE', FACTORY_PENDING_RECEIPT: 'RECEIVE',
        UPSTREAM_MERCHANT_RECEIVED: 'DISPATCH', RETURN_LEG_CREATED: 'DISPATCH',
        FACTORY_RECEIVED_PENDING_POSTING: 'ISOLATE'
      }[this.data.focusStage];
      if (focusAction) index = groups.findIndex(group => group.action === focusAction);
    }
    if (index < 0) index = 0;
    const group = groups[index] || null;
    let ids = group ? group.devices.map(row => row.recall_device_id) : [];
    if (sameGroup) ids = ids.filter(id => this.data.batchSelectedIds.includes(id));
    const selectedIds = new Set(ids);
    const state = {
      batchEnabled: !!flow.enabled, batchGroups: groups, batchGroupIndex: index,
      batchGroup: group ? { ...group, devices: group.devices.map(row => ({ ...row, checked: selectedIds.has(row.recall_device_id) })) } : null,
      batchSelectedIds: ids, batchSelectedCount: ids.length,
      batchAllSelected: !!group && ids.length === group.devices.length,
      batchBlocked: flow.blocked_devices || []
    };
    if (!sameGroup) Object.assign(state, {
      batchProvider: '', batchTrackingNo: '', batchLocation: '', batchEvidence: null, batchExpanded: false
    });
    return state;
  },
  changeBatchGroup(e) {
    if (this.data.busy) return;
    const group = this.data.batchGroups[Number(e.detail.value)];
    if (!group || (this.data.batchGroup && group.key === this.data.batchGroup.key)) return;
    this._batchRequest = null;
    this.setData({ batchGroup: null }, () => {
      const state = this.prepareBatchState({ enabled: true, groups: [group], blocked_devices: this.data.batchBlocked });
      this.setData({ ...state, batchGroups: this.data.batchGroups, batchGroupIndex: Number(e.detail.value) });
    });
  },
  toggleBatchList() { this.setData({ batchExpanded: !this.data.batchExpanded }); },
  setBatchSelection(ids) {
    if (this.data.busy || this.data.loading || !this.data.batchGroup) return;
    const selected = new Set(ids);
    const devices = this.data.batchGroup.devices.map(row => ({ ...row, checked: selected.has(row.recall_device_id) }));
    const validIds = devices.filter(row => row.checked).map(row => row.recall_device_id);
    this._batchRequest = null;
    this.setData({
      batchGroup: { ...this.data.batchGroup, devices }, batchSelectedIds: validIds,
      batchSelectedCount: validIds.length, batchAllSelected: validIds.length === devices.length
    });
  },
  selectBatchDevices(e) { this.setBatchSelection(e.detail.value.map(Number)); },
  toggleBatchAll() {
    this.setBatchSelection(this.data.batchAllSelected ? [] : this.data.batchGroup.devices.map(row => row.recall_device_id));
  },
  batchInput(e) {
    if (this.data.busy) return;
    this._batchRequest = null;
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  async chooseBatchEvidence() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      const file = await qt.chooseEvidence();
      wx.showLoading({ title: '上传中' });
      const batchEvidence = await qt.uploadEvidence(file);
      this._batchRequest = null;
      this.setData({ batchEvidence });
    } catch (e) {
      if (!(e && e.errMsg && e.errMsg.includes('cancel'))) wx.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  async submitBatch() {
    if (this.data.busy || this.data.loading || !this.data.batchGroup) return;
    const group = this.data.batchGroup;
    const ids = this.data.batchSelectedIds.slice().sort((a, b) => a - b);
    if (!ids.length) return wx.showToast({ title: '请选择本次办理的设备', icon: 'none' });
    if (ids.length > 1000) return wx.showToast({ title: '每次最多办理1000台，请分批选择', icon: 'none' });
    if (!this.data.batchEvidence) return wx.showToast({ title: '请上传本次交接凭证', icon: 'none' });
    const payload = {
      action: group.action, recall_device_ids: ids, evidence: this.data.batchEvidence,
      logistics_provider: this.data.batchProvider.trim(), tracking_no: this.data.batchTrackingNo.trim(),
      isolation_location: this.data.batchLocation.trim()
    };
    if (group.action === 'DISPATCH' && (!payload.logistics_provider || !payload.tracking_no)) {
      return wx.showToast({ title: '请填写物流承运方和单号', icon: 'none' });
    }
    if (group.action === 'ISOLATE' && !payload.isolation_location) {
      return wx.showToast({ title: '请填写隔离库位', icon: 'none' });
    }
    const fingerprint = JSON.stringify(payload);
    if (!this._batchRequest || this._batchRequest.fingerprint !== fingerprint) {
      this._batchRequest = {
        fingerprint, payload: { ...payload, client_request_id: `rb-${Date.now()}-${Math.random().toString(36).slice(2, 12)}` }
      };
    }
    this.setData({ busy: true });
    try {
      const confirmed = await new Promise(resolve => wx.showModal({
        title: `${group.action_label}（${ids.length}台）`,
        content: `${group.title}。请确认已核对所选设备及本次共用凭证${group.action === 'DISPATCH' ? '，物流单号：' + payload.tracking_no : ''}。`,
        success: result => resolve(result.confirm), fail: () => resolve(false)
      }));
      if (!confirmed) return;
      wx.showLoading({ title: '批量处理中' });
      const result = await qt.request(`/recalls/${this.data.campaignId}/batch-operations/`, 'POST', this._batchRequest.payload);
      this._batchRequest = null;
      this.setData({ batchGroup: null, batchSelectedIds: [], batchEvidence: null });
      wx.showToast({ title: `已完成${result.processed_count}台`, icon: 'success' });
      await this.load();
    } catch (e) {
      wx.showModal({ title: '批量操作未确认完成', content: `${e.message}。可用相同清单重试；已成功的提交不会重复流转。`, showCancel: false });
    } finally { wx.hideLoading(); this.setData({ busy: false }); }
  },
  input(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  pickDate(e) { this.setData({ pickupDate: e.detail.value }); },
  pickTime(e) { this.setData({ pickupTime: e.detail.value }); },
  async post(path, data, success) {
    if (this.data.busy || this.data.loading || !this.data.campaign) return;
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
  startPostDisposition() {
    wx.navigateTo({
      url: `/pages/quality_trace/recall_disposition/recall_disposition?campaign_id=${this.data.campaignId}`
    });
  },
  completeDeviceDisposition() {
    const item = this.data.selected && this.data.selected.post_disposition;
    if (!item) return;
    wx.showModal({
      title: '确认本台设备处置完成',
      editable: true,
      placeholderText: '填写最终复核结论',
      success: result => {
        if (!result.confirm || !result.content) return;
        this.post(
          `/recall-dispositions/${item.id}/complete/`,
          { completion_note: result.content },
          '处置已确认，设备进入入库待流转'
        );
      }
    });
  },
  completeDispositionProduction() {
    const item = this.data.selected && this.data.selected.post_disposition;
    if (!item) return;
    wx.showModal({
      title: item.method === 'DISASSEMBLE' ? '确认拆机完成' : '确认维修完成',
      editable: true,
      placeholderText: '填写生产处置和检测结论',
      success: result => {
        if (result.confirm && result.content) this.post(
          `/recall-dispositions/${item.id}/production-complete/`,
          { completion_note: result.content },
          item.method === 'DISASSEMBLE' ? '拆机处置已完成' : '维修完成，已推送总工程师复核'
        );
      }
    });
  },
  confirmDispositionMatching() {
    const item = this.data.selected && this.data.selected.post_disposition;
    if (!item) return;
    wx.showModal({
      title: '确认换件配套方案', editable: true,
      placeholderText: '填写更换物料编号，多个用逗号分隔',
      success: result => {
        if (!result.confirm || !result.content) return;
        const parts = result.content.split(',')
          .map(value => ({ part_no: value.trim(), quantity: 1 }))
          .filter(row => row.part_no);
        this.post(`/recall-dispositions/${item.id}/matching-confirm/`, {
          replacement_parts: parts, note: '配套方案已核对'
        }, '配套确认完成，已推送生产经理');
      }
    });
  },
  confirmDispositionSupplier() {
    const item = this.data.selected && this.data.selected.post_disposition;
    if (!item) return;
    const confirmation = (item.supplier_confirmations || []).find(row => row.can_confirm);
    if (!confirmation) return wx.showToast({ title: '当前供应商已确认', icon: 'none' });
    wx.showModal({
      title: '确认换件维修协同', editable: true,
      placeholderText: '可填写供应协同说明',
      success: result => {
        if (result.confirm) this.post(
          `/recall-disposition-suppliers/${confirmation.id}/confirm/`,
          { note: result.content || '' }, '供应商确认完成'
        );
      }
    });
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
