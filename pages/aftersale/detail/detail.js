const app = getApp();

function uploadFailureMessage(res, body) {
  if (res && res.statusCode === 413) return '视频超过服务器上传限制，请联系管理员调整上传容量';
  if (res && (res.statusCode === 502 || res.statusCode === 504)) return '视频上传超时，请检查网络后重试';
  if (body && body.msg) return body.msg;
  return '附件上传失败（HTTP ' + ((res && res.statusCode) || '未知') + '）';
}

function apiRequest(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + url,
      method,
      data,
      header: app.authHeader(data === null ? null : 'application/json'),
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.code === 0) {
          resolve(res.data.data);
        } else {
          reject(new Error((res.data && res.data.msg) || '请求失败'));
        }
      },
      fail: () => reject(new Error('网络连接失败，请稍后重试'))
    });
  });
}

function localDateTime() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
}

function clientUploadId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

Page({
  data: {
    applicationId: null,
    focusedReplacementLegId: null,
    loading: true,
    error: '',
    detail: null,
    bomExpanded: false,
    summaryExpanded: false,
    reportExpanded: false,
    dispatchExpanded: false,
    triageExpanded: true,
    applicantShipmentExpanded: true,
    repairReceiptExpanded: true,
    repairCompleteExpanded: true,
    returnShipmentExpanded: true,
    applicantConfirmExpanded: true,
    thirdPartyMaterialShipmentExpanded: true,
    thirdPartyExpenseExpanded: true,
    thirdPartyFaultMaterialReturnExpanded: true,
    factoryCloseExpanded: true,
    finalResultExpanded: false,
    lifecycleHistoryExpanded: false,
    afterSalesHistoryExpanded: false,
    mediaFiles: [],
    factoryReturnRoute:'DIRECT',
    actionMedia: [],
    oldReturnDeviceMedia: [], oldReturnLogisticsMedia: [],
    actionEvidenceScopeKey: '',
    evidenceMediaByScope: {},
    evidenceMaxByScope: {},
    oldReturnLegId: null,
    oldReturnDeviceMaxCount: 8,
    oldReturnLogisticsMaxCount: 8,
    submitting: false,
    triage: {
      faultIndex: -1,
      routeIndex: -1,
      route: '',
      candidates: [],
      candidateIndex: -1,
      preliminaryMaterials: [],
      preliminaryMaterialOptions: [],
      stationRecommendationMessage: '',
      stationRecommendationsLoading: false,
      originalInstallerCheck: null,
      originalInstallerLoading: false,
      diagnosisNote: '',
      repairPlan: '',
      thirdPartyName: '',
      thirdPartyContactName: '',
      thirdPartyPhone: '',
      thirdPartyAddress: ''
    },
    shipmentCompany: '',
    shipmentTrackingNo: '',
    receiptNote: '',
    repairActionMode: 'COMPLETE',
    onsiteServiceMode: '',
    recoveryNote: '',
    disassemblyRows: [],
    replacementExecutionMode: 'LOCAL',
    replacementNote: '',
    replacementCompany: '',
    replacementTracking: '',
    replacementShipmentId: '',
    replacementShipmentOptions: [{id:'',label:'单独补发，不关联销售批次'}],
    replacementShipmentIndex: 0,
    replacementHandoverMethod: 'SHIPMENT',
    escalationRequested: 'REPLACEMENT',
    escalationHolder: 'EXECUTOR',
    escalationReason: '',
    escalationAddress: '',
    escalationNote: '',
    escalationHandoverMethod: 'SHIPMENT',
    escalationHandoverNote: '',
    escalationCompany: '',
    escalationTracking: '',
    escalationReceipt: '',
    escalationNewSN: '',
    escalationDeliveryNote: '',
    repairSummary: '', 
    repairMaterialReplaced: false,
    repairMaterials: [],
    repairQuantityRows: [],
    actualProcessedAt: localDateTime(),
    returnCompany: '',
    returnTrackingNo: '',
    applicantFeedback: '',
    finalForm: {
      faultIndex: -1,
      solutionIndex: -1,
      materials: [],
      causes: {},
      causeRows: [],
      solutionNote: ''
    },
    thirdCompany: '',
    thirdTrackingNo: '',
    thirdMaterials: [],
    thirdAmount: '',
    thirdRemark: '',
    thirdReturnCompany: '',
    thirdReturnTrackingNo: ''
  },

  onLoad(options) {
    const applicationId = Number(options && options.application_id);
    if (!applicationId) {
      this.setData({ loading: false, error: '售后申请参数缺失' });
      return;
    }
    const legId = Number(options && options.replacement_leg_id);
    if (Number.isSafeInteger(legId) && legId > 0) this._replacementFocus = legId;
    this.setData({ applicationId });
    app.ensureLogin(ok => {
      if (!ok) return this.setData({ loading: false, error: '登录失败，请重新进入' });
      this.loadDetail();
    });
  },

  onShow() {
    if (this.data.applicationId && !this.data.submitting && this.data.detail) {
      this.loadDetail(true);
    }
  },

  loadDetail(silent = false) {
    if (!silent) this.setData({ loading: true, error: '' });
    return apiRequest('/lifecycle/after-sales/applications/' + this.data.applicationId + '/')
      .then(detail => {
        const dispatch = detail.dispatch || {};
        const currentTriage = this.data.triage;
        const replacementOptions=[{id:'',label:(detail.replacement_flow || {}).supply_normal_order_id ? '请选择本订单已发货批次' : '单独补发，不关联销售批次'}].concat((detail.replacement_flow || {}).shared_shipments || []);
        const previousCarrier=silent ? this.data.replacementShipmentId : '';
        const replacementIndex=Math.max(0,replacementOptions.findIndex(row=>String(row.id || '')===String(previousCarrier || '')));
        const nextData = {
          detail,
          disassemblyRows: ((detail.bom || {}).items || []).map(item=>Object.assign({},item,{actualQuantity:((this.data.disassemblyRows || []).find(row=>row.bom_item_id===item.bom_item_id)||{}).actualQuantity || ''})),
          replacementShipmentOptions:replacementOptions,
          replacementShipmentIndex:replacementIndex, replacementShipmentId:String(replacementOptions[replacementIndex].id || ''),
          mediaFiles: (detail.media || []).map(item => ({
            ...item,
            key: String(item.id),
            loading: false,
            localPath: ''
          })),
          loading: false,
          error: '',
          triage: {
            ...currentTriage,
            diagnosisNote: dispatch.diagnosis_note || currentTriage.diagnosisNote || '',
            repairPlan: dispatch.repair_plan || currentTriage.repairPlan || ''
          }
        };
        // Returning from the album/file picker can trigger onShow(). Preserve
        // the files selected for the current action during a silent refresh.
        Object.assign(nextData, this.restoreActionEvidence(detail, silent));
        if ((detail.dispatch || {}).route === 'FACTORY_AFTERSALES') nextData.replacementExecutionMode = 'FACTORY';
        if (!silent || !(detail.actions || {}).can_escalation_request) nextData.repairActionMode = 'COMPLETE';
        const legId = this._replacementFocus;
        const legs = (detail.replacement_flow || {}).legs || [];
        if (legId && legs.some(leg => leg.id === legId)) {
          this._replacementFocus = null;
          nextData.focusedReplacementLegId = legId;
          this.setData(nextData, () => {
            this.downloadRestoredEvidence();
            wx.pageScrollTo({ selector: `#replacement-leg-${legId}`, duration: 250 });
          });
        } else {
          this.setData(nextData, () => this.downloadRestoredEvidence());
        }
      })
      .catch(err => {
        if (!silent) this.setData({ loading: false, error: err.message || '无法读取售后申请' });
      });
  },

  toggleBom() {
    this.setData({ bomExpanded: !this.data.bomExpanded });
  },

  toggleSection(e) {
    const field = e.currentTarget.dataset.field;
    if (!field || !Object.prototype.hasOwnProperty.call(this.data, field)) return;
    this.setData({ [field]: !this.data[field] });
  },

  getTriageOptions() {
    return (this.data.detail && this.data.detail.triage_options) || {
      preliminary_fault_types: [],
      routes: [],
      candidates: []
    };
  },

  onTriageFault(e) {
    const faultIndex = Number(e.detail.value);
    const fault = (this.getTriageOptions().preliminary_fault_types || [])[faultIndex];
    const isComponentSuspected = fault && fault.value === 'COMPONENT_SUSPECTED';
    const selected = isComponentSuspected ? this.data.triage.preliminaryMaterials : [];
    const preliminaryMaterialOptions = isComponentSuspected
      ? (((this.data.detail && this.data.detail.bom && this.data.detail.bom.items) || []).map(item => {
        const value = String(item.bom_item_id || item.material_id || '');
        return { ...item, selection_value: value, selected: selected.includes(value) };
      }))
      : [];
    this.setData({
      'triage.faultIndex': faultIndex,
      'triage.isComponentSuspected': Boolean(isComponentSuspected),
      'triage.preliminaryMaterials': selected,
      'triage.preliminaryMaterialOptions': preliminaryMaterialOptions
    });
    if (this.data.triage.route === 'SERVICE_STATION') this.loadStationRecommendations();
    if (this.data.triage.route === 'ORIGINAL_INSTALLER') this.loadOriginalInstallerCheck();
  },

  onTriageMaterials(e) {
    const selected = (e.detail.value || []).map(String);
    const options = (this.data.triage.preliminaryMaterialOptions || []).map(item => ({
      ...item,
      selected: selected.includes(String(item.selection_value))
    }));
    this.setData({
      'triage.preliminaryMaterials': selected,
      'triage.preliminaryMaterialOptions': options,
      'triage.candidateIndex': -1
    });
    if (this.data.triage.route === 'SERVICE_STATION') this.loadStationRecommendations();
    if (this.data.triage.route === 'ORIGINAL_INSTALLER') this.loadOriginalInstallerCheck();
  },

  onTriageNote(e) {
    this.setData({ 'triage.diagnosisNote': e.detail.value });
  },

  onTriagePlan(e) {
    this.setData({ 'triage.repairPlan': e.detail.value });
  },

  onTriageRoute(e) {
    const routeIndex = Number(e.detail.value);
    const options = this.getTriageOptions();
    const route = (options.routes || [])[routeIndex] || {};
    const candidates = route.value === 'SERVICE_STATION'
      ? []
      : (options.candidates || []).filter(item => item.route === route.value);
    if (route.value !== 'SERVICE_STATION') {
      this._stationRecommendationsRequest = (this._stationRecommendationsRequest || 0) + 1;
    }
    this.setData({
      'triage.originalInstallerCheck': null,
      'triage.originalInstallerLoading': false,
      'triage.routeIndex': routeIndex,
      'triage.route': route.value || '',
      'triage.candidates': candidates,
      'triage.candidateIndex': -1,
      'triage.stationRecommendationMessage': route.value === 'SERVICE_STATION'
        ? '正在按厂家、物料库存和距离筛选服务站…'
        : '',
      'triage.stationRecommendationsLoading': route.value === 'SERVICE_STATION'
    });
    this._installerCheckRequest = (this._installerCheckRequest || 0) + 1;
    if (route.value === 'SERVICE_STATION') this.loadStationRecommendations();
    if (route.value === 'ORIGINAL_INSTALLER') this.loadOriginalInstallerCheck();
  },

  loadOriginalInstallerCheck() {
    const triage = this.data.triage;
    if (triage.route !== 'ORIGINAL_INSTALLER') return Promise.resolve();
    const requestId = (this._installerCheckRequest || 0) + 1;
    this._installerCheckRequest = requestId;
    const applicationId = this.data.applicationId;
    const fault = (this.getTriageOptions().preliminary_fault_types || [])[triage.faultIndex];
    this.setData({'triage.originalInstallerCheck': null, 'triage.originalInstallerLoading': true,
      'triage.candidates': [], 'triage.candidateIndex': -1});
    const query = 'dispatch_route=ORIGINAL_INSTALLER&preliminary_fault_type=' + encodeURIComponent(fault ? fault.value : '') +
      '&preliminary_materials=' + encodeURIComponent((triage.preliminaryMaterials || []).join(','));
    return apiRequest('/lifecycle/after-sales/applications/' + applicationId + '/triage-options/?' + query)
      .then(result => {
        if (requestId !== this._installerCheckRequest || this.data.triage.route !== 'ORIGINAL_INSTALLER' || this.data.applicationId !== applicationId) return;
        const check = result.original_installer_check || {status:'ERROR', message:'未取得原装车库存校验结果，请重新选择处理路径。'};
        const ready = check.status === 'READY' && check.original_installer;
        this.setData({'triage.originalInstallerCheck':check, 'triage.originalInstallerLoading':false,
          'triage.candidates':ready ? [check.original_installer] : [], 'triage.candidateIndex':ready ? 0 : -1});
      }).catch(error => {
        if (requestId !== this._installerCheckRequest || this.data.triage.route !== 'ORIGINAL_INSTALLER') return;
        this.setData({'triage.originalInstallerLoading':false,
          'triage.originalInstallerCheck':{status:'ERROR', message:error.message || '库存校验失败，请重试。'}});
      });
  },

  confirmOriginalInstallerFallback() {
    if (this.data.submitting || this.data.triage.originalInstallerLoading) return;
    const triage = this.data.triage;
    const check = triage.originalInstallerCheck;
    const fault = (this.getTriageOptions().preliminary_fault_types || [])[triage.faultIndex];
    if (triage.route !== 'ORIGINAL_INSTALLER' || !check || check.status !== 'MISSING_PARTS' || !check.nearest_station || !check.confirmation_token || !fault) return;
    if (!triage.diagnosisNote.trim() || !triage.repairPlan.trim()) {
      wx.showToast({title:'请先填写故障认定依据和维修方案',icon:'none'}); return;
    }
    const station = check.nearest_station;
    const requestId = this._installerCheckRequest;
    const applicationId = this.data.applicationId;
    const data = {preliminary_fault_type:fault.value, preliminary_fault_materials:(triage.preliminaryMaterials || []).slice(),
      diagnosis_note:triage.diagnosisNote.trim(),repair_plan:triage.repairPlan.trim(),dispatch_route:'SERVICE_STATION',
      service_station_application_id:station.station_application_id,
      original_installer_fallback_confirmed:true,original_installer_fallback_token:check.confirmation_token};
    wx.showModal({title:'确认改派最近服务站',
      content:check.message + '\n推荐：' + station.organization + '（' + station.distance_label + '）。确认后才发出维修任务。',
      confirmText:'确认改派',cancelText:'暂不改派',
      success:res => {
        if (!res.confirm || this.data.submitting) return;
        if (requestId !== this._installerCheckRequest || this.data.applicationId !== applicationId || this.data.triage.route !== 'ORIGINAL_INSTALLER') {
          wx.showToast({title:'选择已变化，请重新校验',icon:'none'}); return;
        }
        this.runAction({endpoint:'/triage/',data,success:'已确认改派最近服务站'});
      }
    });
  },

  callFallbackStation() {
    const check = this.data.triage.originalInstallerCheck;
    const station = check && check.nearest_station;
    if (station && station.phone) wx.makePhoneCall({phoneNumber:station.phone});
  },

  loadStationRecommendations() {
    const triage = this.data.triage;
    if (triage.route !== 'SERVICE_STATION') return Promise.resolve();
    const requestId = (this._stationRecommendationsRequest || 0) + 1;
    this._stationRecommendationsRequest = requestId;
    const options = this.getTriageOptions();
    const fault = (options.preliminary_fault_types || [])[triage.faultIndex];
    if (!fault) {
      this.setData({
        'triage.candidates': [],
        'triage.candidateIndex': -1,
        'triage.stationRecommendationsLoading': false,
        'triage.stationRecommendationMessage': '请先选择初步故障认定，再按物料库存和距离筛选服务站。'
      });
      return Promise.resolve();
    }
    if (fault.value === 'COMPONENT_SUSPECTED' && !triage.preliminaryMaterials.length) {
      this.setData({
        'triage.candidates': [],
        'triage.candidateIndex': -1,
        'triage.stationRecommendationsLoading': false,
        'triage.stationRecommendationMessage': '请先勾选可能需要更换的BOM物料，再查看库存匹配的服务站。'
      });
      return Promise.resolve();
    }
    const query = [
      'dispatch_route=SERVICE_STATION',
      'preliminary_fault_type=' + encodeURIComponent(fault ? fault.value : ''),
      'preliminary_materials=' + encodeURIComponent((triage.preliminaryMaterials || []).join(','))
    ].join('&');
    this.setData({
      'triage.stationRecommendationsLoading': true,
      'triage.stationRecommendationMessage': '正在按厂家、物料库存和距离筛选服务站…'
    });
    return apiRequest(
      '/lifecycle/after-sales/applications/' + this.data.applicationId + '/triage-options/?' + query
    ).then(result => {
      if (requestId !== this._stationRecommendationsRequest) return;
      this.setData({
        'triage.candidates': result.service_station_recommendations || [],
        'triage.candidateIndex': -1,
        'triage.stationRecommendationMessage': result.service_station_recommendation_message || '暂无符合条件的服务站。',
        'triage.stationRecommendationsLoading': false
      });
    }).catch(error => {
      if (requestId !== this._stationRecommendationsRequest) return;
      this.setData({
        'triage.candidates': [],
        'triage.candidateIndex': -1,
        'triage.stationRecommendationMessage': error.message || '服务站筛选失败，请稍后重试。',
        'triage.stationRecommendationsLoading': false
      });
    });
  },

  onTriageCandidate(e) {
    this.setData({ 'triage.candidateIndex': Number(e.detail.value) });
  },

  callServiceStation(e) {
    const index = Number(e.currentTarget.dataset.index);
    const candidate = (this.data.triage.candidates || [])[index];
    if (!candidate || !candidate.phone) {
      wx.showToast({ title: '该服务站未登记联系电话', icon: 'none' });
      return;
    }
    wx.makePhoneCall({ phoneNumber: candidate.phone });
  },

  onTriageThirdInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['triage.' + field]: e.detail.value });
  },

  onActionMediaChange(e) {
    const context = this.actionEvidenceContext(e.currentTarget && e.currentTarget.dataset);
    this.setActionEvidence(context, e.detail.files || []);
  },

  onActionMediaRetry(e) {
    const context = this.actionEvidenceContext(e.currentTarget && e.currentTarget.dataset);
    if (context) this.selectActionEvidence(context);
    const index = Number(e.detail.index);
    const actionMedia = this.data.actionMedia.slice();
    if (actionMedia[index]) {
      actionMedia[index] = { ...actionMedia[index], status: 'PENDING', error: '' };
      this.setActionEvidence(this._actionEvidenceContext || null, actionMedia);
    }
  },

  actionEvidenceContext(data, detail = this.data.detail || {}) {
    data = data || {};
    const action = data.evidenceAction || data.evidence_action || data.action;
    if (action === 'FACTORY_TRANSPORT_SEND') {
      const transport = detail.factory_transport || {};
      const direction = data.direction;
      const index = Number(data.index);
      const transportId = data.transport_id || data.transportId || transport.transport_id;
      if (!transportId || !['inbound', 'outbound'].includes(direction) || !Number.isInteger(index) || index < 0) return null;
      const row = (transport.legs || []).find(item => item.direction === direction && Number(item.index) === index);
      return { key: (row && row.evidence_scope_key) || `ft:${transportId}:${direction}:${index}:send`, row,
        formData: { evidence_action: action, transport_id: transportId, direction, index } };
    }
    if (action === 'SEND_REPLACEMENT_LEG') {
      const legId = Number(data.leg_id || data.legId || data.id);
      const row = ((detail.replacement_flow || {}).legs || []).find(item => Number(item.id) === legId);
      if (!Number.isInteger(legId) || legId < 1 || (!data.old_return_upload && (!row || row.direction !== 'OLD'))) return null;
      return { key: (row && row.evidence_scope_key) || `old:${legId}:send`, row,
        formData: { evidence_action: action, leg_id: legId } };
    }
    return null;
  },

  evidenceContexts(detail) {
    const transport = detail.factory_transport || {};
    const contexts = (transport.legs || []).map(row => this.actionEvidenceContext({
      action: 'FACTORY_TRANSPORT_SEND', transport_id: transport.transport_id, direction: row.direction, index: row.index
    }, detail));
    if (!detail.factory_transport) {
      ((detail.replacement_flow || {}).legs || []).filter(row => row.direction === 'OLD').forEach(row => {
        contexts.push(this.actionEvidenceContext({ action: 'SEND_REPLACEMENT_LEG', leg_id: row.id }, detail));
      });
    }
    return contexts.filter(Boolean);
  },

  scopeFiles(context, files) {
    return files.reduce((result, source) => {
      const item = { ...source };
      const sameScope = context && item.evidenceScopeKey === context.key;
      if ((context || item.evidenceScopeKey) && !sameScope && (item.serverMediaId || item.evidenceScopeKey)) {
        // A downloaded server record belongs to its original leg. A newly
        // selected local file can be uploaded again, with a fresh request key.
        if (item.restoredFromServer || !item.path) return result;
        delete item.serverMediaId;
        delete item.clientUploadId;
        item.status = 'PENDING';
        item.error = '';
      }
      if (context) {
        item.evidenceScopeKey = context.key;
        item.clientUploadId = item.clientUploadId || clientUploadId();
        item.evidenceKind = context.formData.evidence_action === 'FACTORY_TRANSPORT_SEND'
          ? 'LOGISTICS' : (item.evidenceKind || item.oldReturnKind);
        if (context.formData.evidence_action === 'SEND_REPLACEMENT_LEG') item.oldReturnKind = item.evidenceKind;
        else delete item.oldReturnKind;
      } else {
        delete item.evidenceScopeKey;
        delete item.evidenceKind;
        delete item.clientUploadId;
      }
      result.push(item);
      return result;
    }, []);
  },

  mergeServerEvidence(context, localFiles) {
    const files = this.scopeFiles(context, localFiles || []);
    ((context.row || {}).evidence_media || []).forEach(media => {
      if (media.evidence_scope_key !== context.key) return;
      const index = files.findIndex(item => Number(item.serverMediaId) === Number(media.id)
        || (media.client_upload_id && item.clientUploadId === media.client_upload_id));
      const previous = index < 0 ? {} : files[index];
      const item = { ...previous, key: previous.key || `server-${media.id}`, path: previous.path || '',
        name: media.original_name, media_type: media.media_type, status: 'SUCCESS', error: '',
        serverMediaId: media.id, clientUploadId: media.client_upload_id,
        evidenceScopeKey: context.key, evidenceKind: media.evidence_kind, url: media.url,
        restoredFromServer: previous.restoredFromServer || !previous.path };
      if (context.formData.evidence_action === 'SEND_REPLACEMENT_LEG') item.oldReturnKind = media.evidence_kind;
      if (index < 0) files.push(item); else files[index] = item;
    });
    return files;
  },

  evidenceCapacity(context, files) {
    const row = context.row || {};
    const existingIds = new Set((row.evidence_media || []).filter(media => media.evidence_scope_key === context.key).map(media => Number(media.id)));
    const selectedExisting = files.filter(item => item.evidenceScopeKey === context.key && existingIds.has(Number(item.serverMediaId))).length;
    const remaining = Number.isInteger(row.evidence_remaining) ? Math.max(0, row.evidence_remaining) : 9;
    return Math.min(9, remaining + selectedExisting);
  },

  setActionEvidence(context, files) {
    files = this.scopeFiles(context, files);
    const patch = { actionMedia: files, actionEvidenceScopeKey: context ? context.key : '',
      oldReturnDeviceMedia: files.filter(item => item.oldReturnKind === 'DEVICE'),
      oldReturnLogisticsMedia: files.filter(item => item.oldReturnKind === 'LOGISTICS') };
    this._actionEvidenceContext = context;
    if (context) {
      const capacity = this.evidenceCapacity(context, files);
      patch.evidenceMediaByScope = { ...this.data.evidenceMediaByScope, [context.key]: files };
      patch.evidenceMaxByScope = { ...this.data.evidenceMaxByScope, [context.key]: capacity };
      if (context.formData.evidence_action === 'SEND_REPLACEMENT_LEG') {
        patch.oldReturnLegId = context.formData.leg_id;
        patch.oldReturnDeviceMaxCount = Math.max(patch.oldReturnDeviceMedia.length, capacity - Math.max(1, patch.oldReturnLogisticsMedia.length));
        patch.oldReturnLogisticsMaxCount = Math.max(patch.oldReturnLogisticsMedia.length, capacity - Math.max(1, patch.oldReturnDeviceMedia.length));
      }
    }
    this.setData(patch);
    return files;
  },

  selectActionEvidence(context) {
    if (!context) {
      if (this.data.actionEvidenceScopeKey) this.setActionEvidence(null, this.data.actionMedia);
      return this.data.actionMedia;
    }
    let files = this.data.evidenceMediaByScope[context.key];
    if (!files) files = !this.data.actionEvidenceScopeKey ? this.data.actionMedia : [];
    return this.setActionEvidence(context, this.mergeServerEvidence(context, files));
  },

  restoreActionEvidence(detail, silent) {
    const contexts = this.evidenceContexts(detail);
    const media = {}, limits = {};
    contexts.forEach(context => {
      media[context.key] = this.mergeServerEvidence(context, silent ? this.data.evidenceMediaByScope[context.key] : []);
      limits[context.key] = this.evidenceCapacity(context, media[context.key]);
    });
    const preferredLeg = Number(this._replacementFocus || this.data.focusedReplacementLegId);
    const preserveUnscoped = silent && !this.data.actionEvidenceScopeKey && this.data.actionMedia.length;
    const selected = !preserveUnscoped && (contexts.find(context => context.key === this.data.actionEvidenceScopeKey && (context.row || {}).can_send)
      || contexts.find(context => context.formData.leg_id === preferredLeg && (context.row || {}).can_send)
      || contexts.find(context => (context.row || {}).can_send));
    this._actionEvidenceContext = selected || null;
    const files = selected ? media[selected.key] : (silent && !this.data.actionEvidenceScopeKey ? this.data.actionMedia : []);
    const deviceFiles = files.filter(item => item.oldReturnKind === 'DEVICE');
    const logisticsFiles = files.filter(item => item.oldReturnKind === 'LOGISTICS');
    const oldContext = selected && selected.formData.evidence_action === 'SEND_REPLACEMENT_LEG' ? selected : null;
    const capacity = oldContext ? limits[oldContext.key] : 9;
    return { actionMedia: files, actionEvidenceScopeKey: selected ? selected.key : '',
      evidenceMediaByScope: media, evidenceMaxByScope: limits,
      oldReturnDeviceMedia: deviceFiles, oldReturnLogisticsMedia: logisticsFiles,
      oldReturnLegId: oldContext ? oldContext.formData.leg_id : null,
      oldReturnDeviceMaxCount: Math.max(deviceFiles.length, capacity - Math.max(1, logisticsFiles.length)),
      oldReturnLogisticsMaxCount: Math.max(logisticsFiles.length, capacity - Math.max(1, deviceFiles.length)) };
  },

  downloadRestoredEvidence() {
    if (typeof wx.downloadFile !== 'function') return;
    const apiRoot = String(app.globalData.apiBase || '').replace(/\/api\/?$/, '');
    Object.keys(this.data.evidenceMediaByScope).forEach(scope => {
      this.data.evidenceMediaByScope[scope].filter(item => item.restoredFromServer && !item.path && item.url).forEach(item => {
        wx.downloadFile({ url: apiRoot + item.url, header: app.authHeader(), success: response => {
          if (response.statusCode !== 200) return;
          const files = this.data.evidenceMediaByScope[scope];
          if (!files) return;
          const index = files.findIndex(file => file.serverMediaId === item.serverMediaId && file.evidenceScopeKey === scope);
          if (index < 0) return;
          const updated = files.map((file, n) => n === index ? { ...file, path: response.tempFilePath } : file);
          if (this.data.actionEvidenceScopeKey === scope) this.setActionEvidence(this._actionEvidenceContext, updated);
          else this.setData({ evidenceMediaByScope: { ...this.data.evidenceMediaByScope, [scope]: updated } });
        } });
      });
    });
  },

  updateActionMedia(index, patch) {
    const actionMedia = this.data.actionMedia.slice();
    if (!actionMedia[index]) return;
    actionMedia[index] = { ...actionMedia[index], ...patch };
    this.setActionEvidence(this._actionEvidenceContext || null, actionMedia);
  },

  uploadActionOne(purpose, item, index, context) {
    this.updateActionMedia(index, { status: 'UPLOADING', error: '' });
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: app.globalData.apiBase + '/lifecycle/after-sales/applications/' + this.data.applicationId + '/media/',
        filePath: item.path,
        name: 'file',
        timeout: 180000,
        header: app.authHeader(null),
        formData: {
          media_type: item.media_type,
          purpose,
          duration_seconds: item.duration_seconds || '',
          caption: item.oldReturnKind || '',
          ...(context ? { ...context.formData, evidence_kind: item.evidenceKind,
            client_upload_id: item.clientUploadId } : {})
        },
        success: res => {
          let body = null;
          try {
            body = JSON.parse(res.data || '{}');
          } catch (err) {}
          if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0 && body.data && body.data.id
              && (!context || body.data.evidence_scope_key === context.key)) {
            if (context && context.row) {
              const known = context.row.evidence_media || [];
              if (!known.some(media => Number(media.id) === Number(body.data.id))) {
                context.row.evidence_media = known.concat(body.data);
                context.row.evidence_count = Number(context.row.evidence_count || 0) + 1;
                context.row.evidence_remaining = Math.max(0, 9 - context.row.evidence_count);
              }
            }
            this.updateActionMedia(index, { status: 'SUCCESS', serverMediaId: body.data.id,
              ...(context ? { evidenceScopeKey: body.data.evidence_scope_key, evidenceKind: body.data.evidence_kind } : {}) });
            resolve();
          } else {
            const message = uploadFailureMessage(res, body);
            this.updateActionMedia(index, { status: 'FAILED', error: message });
            reject(new Error(message));
          }
        },
        fail: err => {
          const message = (err && err.errMsg && err.errMsg.includes('timeout'))
            ? '视频上传超时，请保持网络稳定后重试'
            : '附件上传失败，请检查网络后重试';
          this.updateActionMedia(index, { status: 'FAILED', error: message });
          reject(new Error(message));
        }
      });
    });
  },

  uploadActionMedia(purpose, context) {
    if (!purpose) return Promise.resolve();
    if (context) {
      const files = this.data.actionMedia;
      if (files.length > this.evidenceCapacity(context, files)) return Promise.reject(new Error('本段附件合计最多9个，请刷新后核对剩余额度'));
      if (!files.length) return Promise.reject(new Error('请添加本段凭证'));
      if (context.formData.evidence_action === 'SEND_REPLACEMENT_LEG'
          && (!files.some(item => item.evidenceKind === 'DEVICE') || !files.some(item => item.evidenceKind === 'LOGISTICS'))) {
        return Promise.reject(new Error('请分别添加本段物流单和设备图片'));
      }
    }
    const next = index => {
      const item = this.data.actionMedia[index];
      if (!item) return Promise.resolve();
      if (item.status === 'SUCCESS' && (!context || item.evidenceScopeKey === context.key)) return next(index + 1);
      return this.uploadActionOne(purpose, item, index, context).then(() => next(index + 1));
    };
    return next(0);
  },

  runAction(options) {
    if (this.data.submitting) return;
    const context = this.actionEvidenceContext(options.data);
    if ((options.data.factory_transport_upload || options.data.old_return_upload) && !context) {
      wx.showToast({ title: '本段信息已变化，请刷新后重试', icon: 'none' });
      return Promise.resolve();
    }
    this.selectActionEvidence(context);
    this.setData({ submitting: true });
    return this.uploadActionMedia(options.purpose, context)
      .then(() => {
        if (options.data.factory_transport_upload) {
          options.data.document_ids=this.data.actionMedia.map(x=>x.serverMediaId);
          delete options.data.factory_transport_upload;
        }
        if (options.data.old_return_upload) {
          options.data.device_image_ids=this.data.actionMedia.filter(x=>x.oldReturnKind==='DEVICE').map(x=>x.serverMediaId);
          options.data.logistics_document_ids=this.data.actionMedia.filter(x=>x.oldReturnKind==='LOGISTICS').map(x=>x.serverMediaId);
          delete options.data.old_return_upload;
        }
        return apiRequest(
        '/lifecycle/after-sales/applications/' + this.data.applicationId + options.endpoint,
        'POST',
        options.data
      ); })
      .then(() => {
        wx.showToast({ title: options.success || '操作已完成', icon: 'success' });
        this.setData({ actionMedia: [] });
        // A committed business action invalidates the cached inbox. Ordinary
        // page/background returns still preserve the user's loaded task pages.
        try {
          app.refreshTasks();
        } catch (error) {
          // Inbox refresh cannot undo a successful business submission.
          console.warn('售后操作已成功，任务刷新失败，请在任务页重试。', error);
        }
        return this.loadDetail();
      })
      .catch(err => wx.showToast({ title: err.message || '操作失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ submitting: false }));
  },

  finalPayload() {
    const detail = this.data.detail || {};
    const finalForm = this.data.finalForm;
    const fault = (detail.final_fault_types || [])[finalForm.faultIndex];
    const solution = (detail.solution_types || [])[finalForm.solutionIndex];
    if (!fault || !solution || !finalForm.solutionNote.trim()) {
      wx.showToast({ title: '请完整选择最终故障类型、方案并填写说明', icon: 'none' });
      return null;
    }
    return {
      final_fault_type: fault.value,
      final_fault_materials: finalForm.materials || [],
      final_fault_causes: finalForm.causes || {},
      final_solution_type: solution.value,
      final_solution_note: finalForm.solutionNote.trim()
    };
  },

  submitTriage() {
    const triage = this.data.triage;
    const options = this.getTriageOptions();
    const fault = (options.preliminary_fault_types || [])[triage.faultIndex];
    const route = (options.routes || [])[triage.routeIndex];
    if (!fault || !route || !triage.diagnosisNote.trim() || !triage.repairPlan.trim()) {
      wx.showToast({ title: '请完整填写初步故障认定、依据、方案与处理路径', icon: 'none' });
      return;
    }
    const data = {
      preliminary_fault_type: fault.value,
      preliminary_fault_materials: triage.preliminaryMaterials || [],
      diagnosis_note: triage.diagnosisNote.trim(),
      repair_plan: triage.repairPlan.trim(),
      dispatch_route: route.value
    };
    if (route.value === 'SERVICE_STATION') {
      const candidate = triage.candidates[triage.candidateIndex];
      if (!candidate) {
        wx.showToast({ title: '请先联系并确认一家推荐服务站', icon: 'none' });
        return;
      }
      if (fault.value === 'COMPONENT_SUSPECTED' && !triage.preliminaryMaterials.length) {
        wx.showToast({ title: '请勾选可能需要更换的BOM物料', icon: 'none' });
        return;
      }
      data.service_station_application_id = candidate.station_application_id;
    }
    if (route.value === 'ORIGINAL_INSTALLER' && (triage.originalInstallerLoading ||
        !triage.originalInstallerCheck || triage.originalInstallerCheck.status !== 'READY')) {
      wx.showToast({title:'原装车库存校验未通过，请查看提示',icon:'none'}); return;
    }
    if (['ORIGINAL_INSTALLER', 'MERCHANT_ELECTRICIAN', 'FACTORY_AFTERSALES'].includes(route.value)) {
      const candidate = triage.candidates[triage.candidateIndex];
      if (!candidate) {
        wx.showToast({ title: '请选择实际维修执行人', icon: 'none' });
        return;
      }
      if (!candidate.available) {
        wx.showToast({ title: candidate.unavailable_reason || '该执行人暂不可派送', icon: 'none' });
        return;
      }
      data.assigned_user_id = candidate.user_id;
    }
    if (route.value === 'THIRD_PARTY') {
      if (!triage.thirdPartyName.trim() || !triage.thirdPartyPhone.trim() || !triage.thirdPartyAddress.trim()) {
        wx.showToast({ title: '请填写第三方维修店名称、电话和详细地址', icon: 'none' });
        return;
      }
      data.third_party_name = triage.thirdPartyName.trim();
      data.third_party_contact_name = triage.thirdPartyContactName.trim();
      data.third_party_phone = triage.thirdPartyPhone.trim();
      data.third_party_address = triage.thirdPartyAddress.trim();
    }
    if (route.value === 'FACTORY_AFTERSALES') data.factory_transport_version=1;
    if (route.value === 'REMOTE') {
      const finalData = this.finalPayload();
      if (!finalData) return;
      Object.assign(data, finalData);
    }
    this.runAction({
      endpoint: '/triage/',
      data,
      success: route.value === 'REMOTE'
        ? '远程排障已结案'
        : route.value === 'SERVICE_STATION'
          ? '已通知厂家与服务站'
          : '判断与派单已完成'
    });
  },

  onShipmentInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  submitApplicantShipment() {
    if (!this.data.shipmentCompany.trim() || !this.data.shipmentTrackingNo.trim()) {
      wx.showToast({ title: '请填写物流公司和物流单号', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'APPLICANT_SHIPMENT_DOCUMENT',
      endpoint: '/applicant-shipment/',
      data: {
        logistics_company: this.data.shipmentCompany.trim(),
        tracking_no: this.data.shipmentTrackingNo.trim()
      },
      success: '寄送信息已提交'
    });
  },

  submitRepairReceipt() {
    this.runAction({
      endpoint: '/repair-receipt/',
      data: { receipt_note: this.data.receiptNote.trim() },
      success: '已确认收件'
    });
  },

  onRepairInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onRepairReplaced(e) {
    this.setData({ repairMaterialReplaced: !!e.detail.value });
  },

  onRepairMaterials(e) {
    const selected = e.detail.value || [];
    const previous = {};
    (this.data.repairQuantityRows || []).forEach(row => { previous[row.key] = row.quantity; });
    const items = ((this.data.detail || {}).bom || {}).items || [];
    const rows = items.filter(item => selected.includes(String(item.bom_item_id || item.material_id)))
      .map(item => ({ key: String(item.bom_item_id || item.material_id),
        bom_item_id: item.bom_item_id, material_id: item.material_id,
        name: [item.material_name, item.specification_name].filter(Boolean).join(' '),
        quantity: previous[String(item.bom_item_id || item.material_id)] || '' }));
    this.setData({ repairMaterials: selected, repairQuantityRows: rows });
  },

  onRepairQuantity(e) {
    const rows = (this.data.repairQuantityRows || []).map(row => row.key === String(e.currentTarget.dataset.key)
      ? Object.assign({}, row, {quantity: e.detail.value}) : row);
    this.setData({repairQuantityRows: rows});
  },

  showUnableRepair() {
    if (this.data.submitting || !((this.data.detail || {}).actions || {}).can_escalation_request) return;
    this.setData({repairActionMode: 'UNABLE'});
  },

  showRepairComplete() {
    if (this.data.submitting) return;
    this.setData({repairActionMode: 'COMPLETE', repairCompleteExpanded: true});
  },

  onEscalationChoice(e) {
    const allowed = ['escalationRequested', 'escalationHolder', 'escalationHandoverMethod', 'replacementExecutionMode','replacementHandoverMethod','onsiteServiceMode','factoryReturnRoute'];
    if (allowed.includes(e.currentTarget.dataset.field)) this.setData({[e.currentTarget.dataset.field]: e.detail.value});
  },

  escalationAction(action, data, purpose) {
    return this.runAction({endpoint: '/escalation/', purpose,
      data: Object.assign({action}, data), success: '售后处理变更已提交'});
  },

  submitUnableRepair() {
    if (!this.data.escalationReason.trim()) return wx.showToast({title:'请填写无法维修原因',icon:'none'});
    wx.showModal({title:'确认无法维修', content:'提交后暂停当前维修，等待厂家确认换新或返厂，不再退回您继续维修。',
      success: res => {if (res.confirm) this.escalationAction('REQUEST', {
        requested:this.data.escalationRequested, holder:this.data.escalationHolder,
        reason:this.data.escalationReason.trim(),factory_return_route:this.data.factoryReturnRoute}, 'REPAIR_EVIDENCE');}});
  },

  submitEscalationDecision(e) {
    if (!this.data.escalationAddress.trim()) return wx.showToast({title:'请填写厂家接收地址、联系人和电话',icon:'none'});
    const decision=e.currentTarget.dataset.decision;
    wx.showModal({title:decision==='REPLACEMENT'?'同意售后换新':'确认转返厂维修',
      content:decision==='REPLACEMENT'?'确认换新方式，后续按渠道逐段发出和签收；用户换机与退旧补发分别跟踪。':'通知原任务接收方安排返厂，由厂家维修。',
      success:res=>{if(res.confirm) this.escalationAction('DECIDE', {decision,
        receiving_address:this.data.escalationAddress.trim(), note:this.data.escalationNote.trim(),
        replacement_flow_version:3, factory_transport_version:1,execution_mode:this.data.replacementExecutionMode});}});
  },

  submitEscalationHandover() {
    if (!this.data.escalationHandoverNote.trim()) return wx.showToast({title:'请填写交接说明',icon:'none'});
    if (this.data.escalationHandoverMethod==='SHIPMENT' && (!this.data.escalationCompany.trim() || !this.data.escalationTracking.trim()))
      return wx.showToast({title:'请填写物流公司和单号',icon:'none'});
    this.escalationAction('HANDOVER', {handover_method:this.data.escalationHandoverMethod,
      handover_note:this.data.escalationHandoverNote.trim(), logistics_company:this.data.escalationCompany.trim(),
      tracking_no:this.data.escalationTracking.trim()}, 'APPLICANT_SHIPMENT_DOCUMENT');
  },

  submitEscalationReceipt() {
    const es=(this.data.detail || {}).escalation || {};
    const direct=es.requires_replacement_flow_v6 && es.decision==='FACTORY_REPAIR';
    if (!direct && !this.data.escalationReceipt.trim()) return wx.showToast({title:'请填写厂家收件检查说明',icon:'none'});
    this.escalationAction('RECEIVE',{receipt_note:this.data.escalationReceipt.trim() || '已线下核对实物并取货',confirmed:true});
  },

  enableCurrentReplacementFlow() {
    wx.showModal({title:'按现行换新方式办理',content:'当前没有实物交接记录，将重建尚未执行的退旧、补机待办，保留原审批记录。',success:r=>{if(r.confirm)this.escalationAction('UPGRADE_REPLACEMENT_PROTOCOL',{});}});
  },

  confirmOnsiteService() {
    if (!this.data.onsiteServiceMode) return wx.showToast({title:'请选择上门服务或店内服务',icon:'none'});
    this.escalationAction('CONFIRM_REPLACEMENT_SERVICE',{service_mode:this.data.onsiteServiceMode});
  },

  onOldReturnDeviceMedia(e) {
    const files=(e.detail.files || []).map(x=>Object.assign({},x,{oldReturnKind:'DEVICE'}));
    const context = this.oldReturnEvidenceContext(e);
    this.setActionEvidence(context, files.concat(this.data.oldReturnLogisticsMedia));
  },
  onOldReturnLogisticsMedia(e) {
    const files=(e.detail.files || []).map(x=>Object.assign({},x,{oldReturnKind:'LOGISTICS'}));
    const context = this.oldReturnEvidenceContext(e);
    this.setActionEvidence(context, this.data.oldReturnDeviceMedia.concat(files));
  },
  oldReturnEvidenceContext(e) {
    const dataset = (e.currentTarget || {}).dataset || {};
    const row = (((this.data.detail || {}).replacement_flow || {}).legs || []).find(item => item.direction === 'OLD' && item.can_send)
      || (((this.data.detail || {}).replacement_flow || {}).legs || []).find(item => item.direction === 'OLD');
    return this.actionEvidenceContext({ action: 'SEND_REPLACEMENT_LEG', old_return_upload: true,
      leg_id: dataset.legId || this.data.oldReturnLegId || (row && row.id) });
  },
  sendOldReplacementLeg(e) {
    if (this.data.submitting) return;
    const context = this.actionEvidenceContext({ action: 'SEND_REPLACEMENT_LEG', old_return_upload: true, leg_id: Number(e.currentTarget.dataset.id) });
    this.selectActionEvidence(context);
    if (!this.data.oldReturnDeviceMedia.length || !this.data.oldReturnLogisticsMedia.length)
      return wx.showToast({title:'请分别添加物流单和设备图片',icon:'none'});
    if (this.data.oldReturnDeviceMedia.some(x=>x.media_type!=='IMAGE') || this.data.oldReturnLogisticsMedia.some(x=>!['IMAGE','DOCUMENT'].includes(x.media_type)))
      return wx.showToast({title:'设备须为图片，物流单须为图片或单据',icon:'none'});
    return this.escalationAction('SEND_REPLACEMENT_LEG',{leg_id:Number(e.currentTarget.dataset.id),old_return_upload:true,confirmed:true},'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  },

  oldMachineAction(e) {
    if (this.data.submitting) return;
    const action=e.currentTarget.dataset.action;
    const legId=Number(e.currentTarget.dataset.id || 0);
    if(action==='SEND_REPLACEMENT_LEG') return this.sendOldReplacementLeg(e);
    wx.showModal({title:action==='SEND_REPLACEMENT_LEG'?'确认旧机已交出':(action==='FACTORY_PICKUP'?'确认物流已取货':'确认已线下核对接收'),
      content:'请实际核对设备后确认；接收后可暂存，退回上级需另行操作。',
      success:r=>{if(r.confirm)this.escalationAction(action,{leg_id:legId,confirmed:true,note:'已线下核对实物'});}});
  },

  recoveryDecide(e) {
    if (!this.data.recoveryNote.trim()) return wx.showToast({title:'请填写旧机研判说明',icon:'none'});
    this.escalationAction('RECOVERY_DECIDE',{decision:e.currentTarget.dataset.decision,note:this.data.recoveryNote.trim()});
  },

  recoveryRepairComplete(e) {
    if (!this.data.recoveryNote.trim()) return wx.showToast({title:'请填写修复说明',icon:'none'});
    this.escalationAction('RECOVERY_REPAIR_COMPLETE',{stock_target:e.currentTarget.dataset.target,note:this.data.recoveryNote.trim()},'REPAIR_EVIDENCE');
  },

  onDisassemblyQuantity(e) {
    const id=Number(e.currentTarget.dataset.id);
    this.setData({disassemblyRows:this.data.disassemblyRows.map(row=>row.bom_item_id===id?Object.assign({},row,{actualQuantity:e.detail.value}):row)});
  },

  completeDisassembly() {
    const parts=this.data.disassemblyRows.filter(row=>String(row.actualQuantity).trim()!=='').map(row=>({bom_item_id:row.bom_item_id,quantity:row.actualQuantity}));
    if (!parts.length) return wx.showToast({title:'请填写实际拆下退料数量',icon:'none'});
    this.escalationAction('RECOVERY_DISASSEMBLY_COMPLETE',{parts,note:this.data.recoveryNote.trim()},'REPAIR_EVIDENCE');
  },

  sendWarrantyPart(e) {
    this.escalationAction('SEND_WARRANTY_PART',Object.assign(this.replacementLogistics(),{part_id:Number(e.currentTarget.dataset.id)}),'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  },

  startFactoryTransport() {
    wx.showModal({title:'接入厂家物流返件',content:'保留已发生的寄送记录，后续由厂家物流收货、售后处理归因、物流发回。',success:r=>{if(r.confirm)this.escalationAction('START_FACTORY_TRANSPORT',{});}});
  },
  factoryTransportPrepare() {
    if(this.data.submitting)return;
    wx.scanCode({onlyFromCamera:true,scanType:['qrCode'],success:r=>this.escalationAction('FACTORY_TRANSPORT_PREPARE_SWAP',{qr_text:r.result}),fail:()=>wx.showToast({title:'未完成扫码',icon:'none'})});
  },
  factoryTransportSend(e) {
    if(this.data.submitting)return;
    const transportId = ((this.data.detail || {}).factory_transport || {}).transport_id;
    const target = { action: 'FACTORY_TRANSPORT_SEND', transport_id: transportId,
      direction: e.currentTarget.dataset.direction, index: Number(e.currentTarget.dataset.index) };
    const context = this.actionEvidenceContext(target);
    if (!context) return wx.showToast({title:'本段信息已变化，请刷新后重试',icon:'none'});
    this.selectActionEvidence(context);
    if(!this.data.replacementCompany.trim() || !this.data.replacementTracking.trim() || !this.data.actionMedia.length)
      return wx.showToast({title:'请填写物流并添加本段凭证',icon:'none'});
    return this.escalationAction('FACTORY_TRANSPORT_SEND',{transport_id:transportId,direction:target.direction,index:target.index,factory_transport_upload:true,
      logistics_company:this.data.replacementCompany.trim(),tracking_no:this.data.replacementTracking.trim()},'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  },
  factoryTransportReceive(e) {
    if(this.data.submitting)return;
    const d=e.currentTarget.dataset;
    wx.showModal({title:'确认实物已收到',content:'请实际核对设备后确认。本操作会记录接收人及时间。',success:r=>{if(r.confirm)this.escalationAction(d.action || 'FACTORY_TRANSPORT_RECEIVE',{direction:d.direction,index:Number(d.index),confirmed:true});}});
  },

  openReplacementSupplyPlans() {wx.navigateTo({url:'/pages/sales/replacement_supply/replacement_supply'});},

  openRecoveredStock() {wx.navigateTo({url:'/pages/stock/recovered_machine/recovered_machine'});},

  chooseReplacementShipment(e) {
    const index=Number(e.detail.value);
    const row=this.data.replacementShipmentOptions[index];
    if (row) this.setData({replacementShipmentIndex:index,replacementShipmentId:String(row.id || '')});
  },

  replacementLogistics() {
    return {handover_method:((this.data.detail || {}).replacement_flow || {}).factory_logistics_only ? 'SHIPMENT' : this.data.replacementHandoverMethod,
      note:this.data.replacementNote.trim(), logistics_company:this.data.replacementCompany.trim(),
      tracking_no:this.data.replacementTracking.trim(), shipment_id:this.data.replacementShipmentId.trim() || null};
  },

  scanReplacementStock() {
    if (this.data.submitting) return;
    if ((this.data.detail || {}).replacement_flow && this.data.detail.replacement_flow.protocol_version===6 && this.data.detail.replacement_flow.mode==='LOCAL') {
      wx.scanCode({onlyFromCamera:true,scanType:['qrCode'],success:res=>this.escalationAction('SCAN_SWAP',{qr_text:res.result}),
        fail:()=>wx.showToast({title:'未完成扫码',icon:'none'})});
      return;
    }
    wx.scanCode({onlyFromCamera:true,scanType:['qrCode'],success:res=>{
      this.escalationAction('SCAN_SWAP',Object.assign(this.replacementLogistics(),{qr_text:res.result}), 'REPAIR_RETURN_SHIPMENT_DOCUMENT');
    },fail:()=>wx.showToast({title:'未完成扫码',icon:'none'})});
  },

  sendReplacementLeg(e) {
    if (this.data.submitting) return;
    const id=Number(e.currentTarget.dataset.id);
    const leg=(((this.data.detail || {}).replacement_flow || {}).legs || []).find(x=>x.id===id);
    if(leg && leg.direction==='OLD') return this.sendOldReplacementLeg(e);
    wx.scanCode({onlyFromCamera:true,scanType:['qrCode'],success:res=>{
      this.escalationAction('SEND_REPLACEMENT_LEG',Object.assign(this.replacementLogistics(),{leg_id:id,qr_text:res.result}),
        this.data.replacementShipmentId.trim() ? null : 'REPAIR_RETURN_SHIPMENT_DOCUMENT');
    },fail:()=>wx.showToast({title:'未完成扫码',icon:'none'})});
  },

  receiveReplacementLeg(e) {
    if (this.data.submitting) return;
    const leg=((this.data.detail.replacement_flow || {}).legs || []).find(x=>x.id===Number(e.currentTarget.dataset.id));
    if (!leg) return;
    if (!this.data.replacementNote.trim()) return wx.showToast({title:'请填写签收核对说明',icon:'none'});
    const finish=qr=>wx.showModal({title:'确认签收',content:leg.from_name+' → '+leg.to_name+'，设备：'+leg.device_sn,
      success:res=>{if(res.confirm) this.escalationAction('RECEIVE_REPLACEMENT_LEG',{leg_id:leg.id,confirmed:true,
        receipt_note:this.data.replacementNote.trim(),qr_text:qr},'REPAIR_RETURN_SHIPMENT_DOCUMENT');}});
    if (leg.direction==='USER') wx.scanCode({onlyFromCamera:true,scanType:['qrCode'],success:r=>finish(r.result)});
    else finish('');
  },

  submitReplacementDelivery() {
    if (!this.data.escalationNewSN.trim() || !this.data.escalationDeliveryNote.trim())
      return wx.showToast({title:'请填写新设备SN及交付说明',icon:'none'});
    this.escalationAction('DELIVER_REPLACEMENT', {new_device_sn:this.data.escalationNewSN.trim(),
      delivery_note:this.data.escalationDeliveryNote.trim()}, 'REPAIR_RETURN_SHIPMENT_DOCUMENT');
  },

  submitReplacementConfirm() {
    const es=(this.data.detail || {}).escalation || {};
    if (this.data.escalationNewSN.trim()!==es.new_device_sn) return wx.showToast({title:'请填写实际收到的新设备SN并核对',icon:'none'});
    wx.showModal({title:'确认换新收货',content:'确认实际收到新设备：'+es.new_device_sn+'？',
      success:res=>{if(res.confirm) this.escalationAction('CONFIRM_REPLACEMENT',{
        confirmed:true,new_device_sn:this.data.escalationNewSN.trim()});}});
  },

  submitRepairComplete() {
    if (!this.data.repairSummary.trim()) {
      wx.showToast({ title: '请填写处理说明', icon: 'none' });
      return;
    }
    const rows = this.data.repairMaterialReplaced ? (this.data.repairQuantityRows || []) : [];
    if (this.data.repairMaterialReplaced && (!rows.length || rows.some(row =>
      !/^[0-9]+$/.test(String(row.quantity)) || Number(row.quantity) < 1 || Number(row.quantity) > 100000))) {
      wx.showToast({title: '请填写每项实际更换件数', icon: 'none'});
      return;
    }
    const replacementMaterials = rows.map(row => ({bom_item_id: row.bom_item_id,
      material_id: row.material_id, replacement_quantity: Number(row.quantity)}));
    this.runAction({
      purpose: 'REPAIR_EVIDENCE',
      endpoint: '/repair-complete/',
      data: {
        repair_summary: this.data.repairSummary.trim(),
        repair_material_replaced: this.data.repairMaterialReplaced,
        repair_materials: replacementMaterials,
        actual_processed_at: this.data.actualProcessedAt
      },
      success: '维修完成已提交'
    });
  },

  submitReturnShipment() {
    if (!this.data.returnCompany.trim() || !this.data.returnTrackingNo.trim()) {
      wx.showToast({ title: '请填写物流公司和物流单号', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'REPAIR_RETURN_SHIPMENT_DOCUMENT',
      endpoint: '/return-shipment/',
      data: {
        logistics_company: this.data.returnCompany.trim(),
        tracking_no: this.data.returnTrackingNo.trim()
      },
      success: '返件信息已提交'
    });
  },

  onApplicantFeedback(e) {
    this.setData({ applicantFeedback: e.detail.value });
  },

  submitApplicantConfirm(e) {
    const confirmed = String(e.currentTarget.dataset.confirmed) !== 'false';
    this.runAction({
      endpoint: '/applicant-confirm/',
      data: {
        confirmed,
        feedback: this.data.applicantFeedback.trim()
      },
      success: confirmed ? '售后结果已确认' : '反馈已提交厂家复核'
    });
  },

  onFinalFault(e) {
    this.setData({ 'finalForm.faultIndex': Number(e.detail.value) });
  },

  onFinalSolution(e) {
    this.setData({ 'finalForm.solutionIndex': Number(e.detail.value) });
  },

  onFinalMaterials(e) {
    const materials = e.detail.value || [];
    const selected = new Set(materials.map(String));
    const causes = { ...(this.data.finalForm.causes || {}) };
    const causeRows = (this.data.detail.final_material_options || [])
      .filter(item => selected.has(String(item.bom_item_id || item.material_id)))
      .map(item => ({
        key: String(item.bom_item_id || item.material_id),
        materialId: item.material_id,
        materialName: item.material_name,
        specificationName: item.specification_name || '',
        causes: item.fault_causes || [],
        causeIndex: (item.fault_causes || []).findIndex(row => String(row.id) === String(causes[item.material_id] || ''))
      }));
    Object.keys(causes).forEach(key => {
      if (!causeRows.some(row => String(row.materialId) === String(key))) delete causes[key];
    });
    this.setData({ 'finalForm.materials': materials, 'finalForm.causes': causes, 'finalForm.causeRows': causeRows });
  },

  onFinalCause(e) {
    const materialId = e.currentTarget.dataset.materialId;
    const row = (this.data.finalForm.causeRows || []).find(item => String(item.materialId) === String(materialId));
    const cause = row && row.causes[Number(e.detail.value)];
    if (!cause) return;
    const causes = { ...(this.data.finalForm.causes || {}), [materialId]: cause.id };
    const causeRows = (this.data.finalForm.causeRows || []).map(item => (
      String(item.materialId) === String(materialId) ? { ...item, causeIndex: Number(e.detail.value) } : item
    ));
    this.setData({ 'finalForm.causes': causes, 'finalForm.causeRows': causeRows });
  },

  onFinalNote(e) {
    this.setData({ 'finalForm.solutionNote': e.detail.value });
  },

  submitFactoryClose() {
    const data = this.finalPayload();
    if (!data) return;
    if ((this.data.detail || {}).factory_transport) return this.escalationAction('FACTORY_TRANSPORT_FINALIZE',data);
    this.runAction({
      endpoint: '/factory-close/',
      data,
      success: '售后服务已结案'
    });
  },

  onThirdInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  onThirdMaterials(e) {
    this.setData({ thirdMaterials: e.detail.value || [] });
  },

  submitThirdMaterialShipment() {
    if (!this.data.thirdCompany.trim() || !this.data.thirdTrackingNo.trim() || !this.data.thirdMaterials.length) {
      wx.showToast({ title: '请填写物流信息并选择寄送物料', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'THIRD_PARTY_MATERIAL_SHIPMENT_DOCUMENT',
      endpoint: '/third-party/material-shipment/',
      data: {
        logistics_company: this.data.thirdCompany.trim(),
        tracking_no: this.data.thirdTrackingNo.trim(),
        materials: this.data.thirdMaterials
      },
      success: '备件寄送已登记'
    });
  },

  submitThirdExpense() {
    if (!String(this.data.thirdAmount).trim()) {
      wx.showToast({ title: '请填写第三方维修费用', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'THIRD_PARTY_FEE_VOUCHER',
      endpoint: '/third-party/expense/',
      data: {
        amount: this.data.thirdAmount,
        remark: this.data.thirdRemark.trim()
      },
      success: '第三方费用已登记'
    });
  },

  submitThirdFaultReturn() {
    if (!this.data.thirdReturnCompany.trim() || !this.data.thirdReturnTrackingNo.trim()) {
      wx.showToast({ title: '请填写故障物料返还物流信息', icon: 'none' });
      return;
    }
    this.runAction({
      purpose: 'THIRD_PARTY_FAULT_MATERIAL_RETURN_DOCUMENT',
      endpoint: '/third-party/fault-material-return/',
      data: {
        logistics_company: this.data.thirdReturnCompany.trim(),
        tracking_no: this.data.thirdReturnTrackingNo.trim()
      },
      success: '故障物料返还已登记'
    });
  },

  openMedia(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.mediaFiles[index];
    if (!item || item.loading) return;
    if (item.localPath) return this.showMedia(item);
    this.setData({ ['mediaFiles[' + index + '].loading']: true });
    const apiRoot = String(app.globalData.apiBase || '').replace(/\/api\/?$/, '');
    wx.downloadFile({
      url: apiRoot + item.url,
      header: app.authHeader(),
      success: res => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: '附件读取失败', icon: 'none' });
          return;
        }
        const ready = { ...item, localPath: res.tempFilePath, loading: false };
        this.setData({ ['mediaFiles[' + index + ']']: ready });
        this.showMedia(ready);
      },
      fail: () => wx.showToast({ title: '附件读取失败', icon: 'none' }),
      complete: () => this.setData({ ['mediaFiles[' + index + '].loading']: false })
    });
  },

  showMedia(item) {
    if (item.media_type === 'IMAGE') {
      return wx.previewImage({ current: item.localPath, urls: [item.localPath] });
    }
    if (item.media_type === 'VIDEO' && wx.previewMedia) {
      return wx.previewMedia({ sources: [{ url: item.localPath, type: 'video' }] });
    }
    wx.openDocument({
      filePath: item.localPath,
      showMenu: true,
      fail: () => wx.showToast({ title: '当前文件无法预览', icon: 'none' })
    });
  },

  backHome() {
    wx.reLaunch({ url: '/pages/home/index/index' });
  }
});
