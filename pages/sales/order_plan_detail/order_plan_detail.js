const app = getApp();

function asId(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = number => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function quantityText(row, key, fallbackUnit) {
  if (!row) return '--';
  const displayKeys = [
    `${key}_display`,
    `${key}_text`,
    `${key}_quantity`,
    key
  ];
  let value = '';
  for (const displayKey of displayKeys) {
    if (row[displayKey] !== null && row[displayKey] !== undefined && row[displayKey] !== '') {
      value = row[displayKey];
      break;
    }
  }
  if (value === '') return '--';
  const text = String(value);
  const unit = row.unit || fallbackUnit || '';
  return unit && text.indexOf(unit) < 0 ? `${text} ${unit}` : text;
}

function quantityTextAny(row, keys, fallbackUnit) {
  const candidates = asArray(keys);
  for (const key of candidates) {
    const value = quantityText(row, key, fallbackUnit);
    if (value !== '--') return value;
  }
  return '--';
}

function normalizeStatus(value) {
  const normalized = String(value || '').toUpperCase();
  const hasState = values => values.some(state => (
    normalized === state || normalized.endsWith(`_${state}`)
  ));
  if (hasState(['DONE', 'COMPLETED', 'CONFIRMED', 'READY', 'RECEIVED', 'SHIPPED', 'SUCCESS', 'PRINTED'])) {
    return 'done';
  }
  if (hasState(['CURRENT', 'ACTIVE', 'PROCESSING', 'PENDING', 'OPEN', 'WAITING', 'IN_PROGRESS', 'AUTHORIZED', 'OUTBOUNDED', 'GENERATED'])) {
    return 'current';
  }
  if (hasState(['CANCELLED', 'CANCELED', 'FAILED', 'REJECTED'])) {
    return 'cancelled';
  }
  return 'waiting';
}

function normalizeTimeline(rows) {
  return asArray(rows).map((row, index) => {
    const state = row.state || row.status || row.status_code || '';
    const stateClass = normalizeStatus(state);
    const completed = !!(row.completed || row.done || row.is_done);
    // Timeline ownership is decided by the V2 detail API.  In particular,
    // ``current`` is the order's global physical position, not permission for
    // this viewer; never light it on the client just because the user can see
    // the shared dynamic card.
    const active = row.active === true;
    return {
      ...row,
      key: row.id || row.code || row.key || `${index}-${row.title || row.name || ''}`,
      title: row.title || row.name || row.label || '流程节点',
      description: row.description || row.summary || row.detail || row.status_name || '',
      timeText: formatDate(row.completed_at || row.updated_at || row.occurred_at || row.created_at || row.time),
      stateText: row.state_name || row.status_name || row.state_label || '',
      stateClass,
      active,
      completed,
      dotClass: completed
        ? 'done'
        : stateClass === 'cancelled'
          ? 'cancelled'
          : active
            ? 'active'
            : ''
    };
  });
}

function normalizeFinishedInventory(rows) {
  return asArray(rows).map((row, index) => ({
    ...row,
    key: row.id || row.order_plan_item_id || `${row.product_model_id || ''}-${index}`,
    productName: row.product_model_name || (row.product_model && row.product_model.name) || row.name || '产品型号',
    totalText: quantityText(row, 'quantity', '台'),
    usedText: quantityText(row, 'used_quantity', '台'),
    productionText: quantityText(row, 'production_quantity', '台'),
    sourceText: row.source_summary || row.inventory_source_name || row.note || ''
  }));
}

function normalizeBomSelections(rows) {
  return asArray(rows).map((row, index) => ({
    ...row,
    key: row.id || row.order_plan_item_id || `${row.product_model_id || ''}-${index}`,
    productName: row.product_model_name || (row.product_model && row.product_model.name) || row.name || '产品型号',
    productCode: row.product_model_code || (row.product_model && row.product_model.code) || '',
    version: row.bom_version || row.version || (row.bom && row.bom.version) || '未选择',
    sourceText: row.source_name || row.source_label || row.selection_source_name || '',
    changedText: row.has_changes ? '本次已生成新版本' : (row.confirmed ? '已冻结' : ''),
    materials: asArray(row.materials || row.bom_items).map((material, materialIndex) => ({
      ...material,
      key: material.id || material.bom_item_id || `${index}-${materialIndex}`,
      name: material.material_name || (material.material && material.material.name) || material.name || '物料',
      specName: material.material_spec_name || (material.material_spec && material.material_spec.name) || material.spec_name || '',
      supplierName: material.supplier_name || (material.supplier && material.supplier.name) || '',
      quantityText: quantityText(material, 'quantity_per_device', ''),
      deleted: !!material.deleted
    }))
  }));
}

function normalizeRequirements(rows) {
  return asArray(rows).map((row, index) => ({
    ...row,
    key: row.id || `${row.material_id || ''}-${row.material_spec_id || ''}-${index}`,
    materialName: row.material_name || (row.material && row.material.name) || row.name || '物料',
    specName: row.material_spec_name || (row.material_spec && row.material_spec.name) || row.spec_name || '',
    supplierName: row.supplier_name || (row.supplier && row.supplier.name) || '',
    requiredText: quantityText(row, 'required', row.unit),
    reservedText: quantityText(row, 'reserved', row.unit),
    shortageText: quantityText(row, 'shortfall', row.unit),
    stateText: row.state_name || row.reservation_status_name || row.status_name || '',
    stateClass: normalizeStatus(row.state || row.reservation_status || row.status),
    allocations: asArray(row.allocations || row.lot_allocations).map((allocation, allocationIndex) => ({
      ...allocation,
      key: allocation.id || `${index}-${allocationIndex}`,
      lotCode: allocation.lot_code || (allocation.lot && allocation.lot.batch_code) || allocation.batch_code || '物料批次',
      quantityText: quantityText(allocation, 'quantity', row.unit),
      stateText: allocation.state_name || allocation.status_name || ''
    }))
  }));
}

function normalizeDeliveries(rows) {
  return asArray(rows).map((row, index) => ({
    ...row,
    key: row.id || `${row.supplier_id || ''}-${index}`,
    supplierName: row.supplier_name || (row.supplier && row.supplier.name) || '供应商',
    stateText: row.state_name || row.status_name || '待处理',
    stateClass: normalizeStatus(row.state || row.status),
    scheduledText: formatDate(row.scheduled_for || row.scheduled_at || row.dispatch_at),
    confirmedByText: row.confirmed_by_name || row.processed_by_text || '',
    lines: asArray(row.lines || row.materials).map((line, lineIndex) => ({
      ...line,
      key: line.id || `${index}-${lineIndex}`,
      materialName: line.material_name || (line.material && line.material.name) || line.name || '物料',
      specName: line.material_spec_name || (line.material_spec && line.material_spec.name) || line.spec_name || '',
      requestedText: quantityText(line, 'requested', line.unit),
      receivedText: quantityText(line, 'received', line.unit),
      stateText: line.state_name || line.status_name || ''
    }))
  }));
}

function normalizeActionPayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function actionRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map(code => {
    const row = value[code];
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return { ...row, code: row.code || row.action || row.key || code };
    }
    if (typeof row === 'string') return { code, label: row };
    return { code };
  });
}

function inputFieldRows(value) {
  if (Array.isArray(value)) return value.filter(row => row && typeof row === 'object');
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).map(name => {
    const row = value[name];
    return row && typeof row === 'object' && !Array.isArray(row)
      ? { ...row, name: row.name || row.key || row.code || name }
      : { name, label: typeof row === 'string' ? row : name };
  });
}

function normalizeActions(actions, keyPrefix) {
  const prefix = keyPrefix || 'plan-action';
  return actionRows(actions)
    .map((action, index) => {
      if (typeof action === 'string') {
        return {
          code: action,
          label: action,
          method: 'POST',
          payload: {},
          key: `${prefix}-${action}-${index}`
        };
      }
      if (!action || typeof action !== 'object') return null;
      const code = action.code || action.action || action.key;
      if (!code || action.enabled === false || action.available === false) return null;
      return {
        ...action,
        key: `${prefix}-${action.id || code}-${index}`,
        code,
        label: code === 'shipment-qrcode-print'
          ? '电脑打印并确认贴包'
          : action.label || action.name || action.title || '确认操作',
        method: String(action.method || 'POST').toUpperCase(),
        payload: normalizeActionPayload(
          action.payload || action.request_payload || action.request_data || action.data
        ),
        loadingText: action.loading_text || action.loadingText || '正在提交…',
        confirmTitle: action.confirm_title || action.confirmTitle || action.label || action.name || '确认操作',
        confirmText: action.confirm_text || action.confirmText || action.description || '请确认线下工作已经完成。',
        confirmButtonText: action.confirm_button_text || action.confirmButtonText || '确认',
        hint: action.hint || action.action_hint || '',
        inputFields: inputFieldRows(action.input_fields || action.inputFields || action.fields),
        danger: !!(action.danger || code === 'cancel')
      };
    })
    .filter(Boolean);
}

function normalizeCodes(rows, batchIndex) {
  return asArray(rows)
    .filter(row => typeof row === 'string' || (row && typeof row === 'object'))
    .map((row, index) => {
      const data = typeof row === 'string' ? { code: row } : row;
      return {
        ...data,
        key: data.id || data.code || data.qrcode || data.qr_code || `${batchIndex}-${index}`,
        deviceSn: data.device_sn || data.sn || data.device_code || '',
        code: data.code || data.qrcode || data.qr_code || data.lifecycle_code || '',
        stateText: data.state_name || data.status_name || '',
        stateClass: normalizeStatus(data.state || data.status)
      };
    });
}

function normalizeQrcodeBatches(rows, keyPrefix) {
  const prefix = keyPrefix || 'qrcode';
  return asArray(rows).filter(row => row && typeof row === 'object').map((row, index) => {
    const codes = normalizeCodes(row.codes || row.qrcodes || row.qr_codes || row.code_list, index);
    const key = row.id || row.batch_id || row.batch_code || row.qrcode_batch_code || `${prefix}-${index}`;
    return {
      ...row,
      key,
      title: row.title || row.name || row.qrcode_batch_code || row.batch_code ||
        row.production_batch_code || `二维码批次 ${index + 1}`,
      subplanText: row.subplan_code || row.production_subplan_code || row.subplan_name || '',
      quantityText: quantityTextAny(row, ['quantity', 'total_quantity', 'planned_total_quantity', 'qrcode_count', 'count'], '张'),
      generatedText: formatDate(row.generated_at || row.qrcode_generated_at),
      printedText: formatDate(row.printed_at || row.qrcode_printed_at || row.completed_at),
      stateText: row.state_name || row.status_name || '待生成',
      stateClass: normalizeStatus(row.state || row.status),
      codes,
      actions: normalizeActions(row.available_actions || row.actions, `${prefix}-${key}`)
    };
  });
}

function normalizeShipments(rows, keyPrefix) {
  const prefix = keyPrefix || 'shipment';
  return asArray(rows).filter(row => row && typeof row === 'object').map((row, index) => {
    const key = row.id || row.shipment_id || row.shipment_code || row.batch_code || `${prefix}-${index}`;
    return {
      ...row,
      key,
      title: row.title || row.name || row.shipment_code || row.batch_code ||
        (row.sequence_no ? `发货批次 ${row.sequence_no}` : `发货批次 ${index + 1}`),
      subplanText: row.subplan_code || row.production_subplan_code || row.subplan_name || '',
      quantityText: quantityTextAny(row, ['quantity', 'total_quantity', 'planned_total_quantity'], '台'),
      stateText: row.state_name || row.status_name || '待发货',
      stateClass: normalizeStatus(row.state || row.status),
      authorizedText: formatDate(row.shipment_authorized_at || row.authorized_at),
      outboundText: formatDate(row.outbound_at),
      shippedText: formatDate(row.shipped_at),
      receivedText: formatDate(row.received_at),
      // A V2 shipment records both values on the exact batch.  Keeping them
      // separate prevents the logistics company from disappearing after the
      // task is completed.
      logisticsCompanyText: row.logistics_company || row.logistics_company_name || '',
      trackingNoText: row.tracking_no || row.logistics_no || row.logistics_number || row.tracking_number || '',
      logisticsDocument: row.logistics_document || null,
      items: asArray(row.items || row.item_lines).map((item, itemIndex) => ({
        ...item,
        key: item.id || `${key}-${itemIndex}`,
        productName: item.product_model_name || (item.product_model && item.product_model.name) || item.name || '产品型号',
        quantityText: quantityText(item, 'quantity', '台'),
        stateText: item.state_name || item.status_name || '',
        splitSourceKey: item.production_subplan_item_id
          ? 'production_subplan_item_id'
          : (item.order_plan_item_id ? 'order_plan_item_id' : ''),
        splitSourceId: item.production_subplan_item_id || item.order_plan_item_id || null,
        splitMaximum: Number(item.quantity || 0)
      })),
      actions: normalizeActions(row.available_actions || row.actions, `${prefix}-${key}`)
    };
  });
}

function normalizeSubplans(rows) {
  return asArray(rows).filter(row => row && typeof row === 'object').map((row, index) => {
    const key = row.id || row.code || `subplan-${index}`;
    const items = asArray(row.items || row.item_lines).map((item, itemIndex) => ({
      ...item,
      key: item.id || `${key}-${itemIndex}`,
      productName: item.product_model_name || (item.product_model && item.product_model.name) || item.name || '产品型号',
      quantityText: quantityText(item, 'quantity', '台'),
      productionBatchCode: item.production_batch_code || item.batch_code || '',
      qrcodeGeneratedText: formatDate(item.qrcode_generated_at || item.qr_code_generated_at),
      qrcodePrintedText: formatDate(item.qrcode_printed_at || item.qr_code_printed_at),
      stateText: item.state_name || item.status_name || ''
    }));
    return {
      ...row,
      key,
      isTailSplit: row.is_tail_split === true,
      planLabel: row.plan_label || (row.is_tail_split ? '尾货子计划' : '型号生产计划'),
      title: row.plan_title || row.name || row.subplan_code || row.code || `型号生产计划 ${index + 1}`,
      quantityText: quantityTextAny(row, ['quantity', 'planned_total_quantity', 'total_quantity'], '台'),
      stateText: row.state_name || row.status_name || '待生产',
      stateClass: normalizeStatus(row.state || row.status),
      productionReleasedText: formatDate(row.production_released_at || row.released_at),
      productionCompletedText: formatDate(row.production_completed_at || row.completed_at),
      qrcodeBatches: normalizeQrcodeBatches(
        row.qrcode_batches || row.qr_code_batches || row.qrcode_print_batches,
        `subplan-${key}-qrcode`
      ),
      shipments: normalizeShipments(
        row.shipments || row.shipment_batches || row.shipment_list,
        `subplan-${key}-shipment`
      ),
      actions: normalizeActions(row.available_actions || row.actions, `subplan-${key}`),
      items
    };
  });
}

function normalizePlan(raw) {
  const plan = raw && typeof raw === 'object' ? raw : {};
  return {
    ...plan,
    plan_code: plan.plan_code || plan.code || '--',
    status_name: plan.status_name || plan.state_name || '处理中',
    factory: plan.factory || { name: plan.factory_name || '' },
    merchant: plan.merchant || { name: plan.merchant_name || '' },
    brand: plan.brand || { name: plan.brand_name || '' },
    sales_manager: plan.sales_manager || { name: plan.sales_manager_name || '' },
    total_quantity: plan.total_quantity || plan.quantity || '--',
    submittedText: formatDate(plan.submitted_at || plan.created_at)
  };
}

function buildActionLookup(planActions, subplans, qrcodeBatches, shipments) {
  const actionsByKey = {};
  const add = actions => {
    asArray(actions).forEach(action => {
      if (action && action.key) actionsByKey[action.key] = action;
    });
  };
  const addQrcodeBatches = batches => {
    asArray(batches).forEach(batch => add(batch.actions));
  };
  const addShipments = batches => {
    asArray(batches).forEach(batch => add(batch.actions));
  };

  add(planActions);
  addQrcodeBatches(qrcodeBatches);
  addShipments(shipments);
  asArray(subplans).forEach(subplan => {
    add(subplan.actions);
    addQrcodeBatches(subplan.qrcodeBatches);
    addShipments(subplan.shipments);
  });
  return actionsByKey;
}

function shipmentActionContext(shipments, subplans) {
  const contextByActionKey = {};
  const add = rows => {
    asArray(rows).forEach(shipment => {
      asArray(shipment.actions).forEach(action => {
        if (action && action.key) contextByActionKey[action.key] = shipment;
      });
    });
  };
  add(shipments);
  asArray(subplans).forEach(subplan => add(subplan.shipments));
  return contextByActionKey;
}

function newClientRequestId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `v2-split-${Date.now()}-${random}`;
}

function newFinanceRequestId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 3) | 8).toString(16);
  });
}

function splitDraftFor(action, shipment) {
  if (
    !shipment || !shipment.id || !action || !action.payload ||
    !action.payload.shipment_id || String(action.payload.shipment_id) !== String(shipment.id)
  ) return null;
  const items = asArray(shipment.items)
    .filter(item => item && item.splitSourceKey && item.splitSourceId && item.splitMaximum > 0)
    .map((item, index) => ({
      key: item.key || `${shipment.key}-${index}`,
      productName: item.productName,
      sourceKey: item.splitSourceKey,
      sourceId: item.splitSourceId,
      maximum: item.splitMaximum,
      inputValue: String(item.splitMaximum)
    }));
  if (!items.length) return null;
  return {
    actionKey: action.key,
    shipmentKey: shipment.key,
    shipmentId: shipment.id,
    productionSubplanId: action.payload.production_subplan_id || shipment.production_subplan_id || null,
    title: shipment.title,
    clientRequestId: newClientRequestId(),
    items,
    errorMessage: ''
  };
}

function logisticsDraftFor(action, shipment) {
  if (
    !shipment || !shipment.id || !action || !action.payload ||
    !action.payload.shipment_id || String(action.payload.shipment_id) !== String(shipment.id)
  ) return null;
  const fields = asArray(action.inputFields);
  const expected = ['logistics_company', 'tracking_no'];
  if (
    expected.some(name => !fields.some(field => field && field.name === name && field.required === true))
  ) {
    return null;
  }
  return {
    actionKey: action.key,
    shipmentKey: shipment.key,
    shipmentId: shipment.id,
    shipmentIds: [shipment.id],
    shipments: [{ id: shipment.id, title: shipment.title, quantityText: shipment.quantityText }],
    title: shipment.title,
    batchMode: false,
    document: null,
    documentLocalPath: '',
    documentRequestId: '',
    documentError: '',
    fields: expected.map(name => {
      const source = fields.find(field => field.name === name) || {};
      return {
        name,
        label: source.label || (name === 'logistics_company' ? '物流公司' : '物流单号'),
        placeholder: source.placeholder || (name === 'logistics_company' ? '请输入物流公司' : '请输入物流单号'),
        maxlength: Number(source.maxlength || source.max_length || 128),
        inputValue: ''
      };
    }),
    errorMessage: ''
  };
}

function logisticsCandidatesFor(shipments, subplans) {
  const candidates = [];
  const seen = {};
  const add = rows => asArray(rows).forEach(shipment => {
    if (!shipment.id || seen[shipment.id]) return;
    const action = asArray(shipment.actions).find(item => item.code === 'shipment-logistics-confirm');
    if (!action || !logisticsDraftFor(action, shipment)) return;
    seen[shipment.id] = true;
    candidates.push({
      id: shipment.id,
      value: String(shipment.id),
      title: shipment.title,
      subplanText: shipment.subplanText,
      quantityText: shipment.quantityText,
      actionKey: action.key,
      selected: false
    });
  });
  add(shipments);
  asArray(subplans).forEach(subplan => add(subplan.shipments));
  return candidates;
}

// Private evidence must be fetched with Authorization; never forward a token
// to an arbitrary origin supplied in a file URL.
function sameOriginFileUrl(value) {
  const base = String(app.globalData.apiBase || '').match(/^(https?:\/\/[^/]+)/i);
  const url = String(value || '');
  if (!base || !url || /[\\\r\n]/.test(url)) return '';
  if (url[0] === '/' && url[1] !== '/') return `${base[1]}${url}`;
  const absolute = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  return absolute && absolute[1].toLowerCase() === base[1].toLowerCase() ? url : '';
}

function normalizeFinance(value, orderPlanId) {
  if (!value || value.can_view !== true) return null;
  const sourceRolling = value.rolling_receivables;
  const rolling = sourceRolling && sourceRolling.enabled === true ? {
    ...sourceRolling,
    orders: asArray(sourceRolling.orders)
  } : null;
  const activeId = rolling && Number(rolling.active_order_plan_id);
  const hasActiveEntry = Number.isSafeInteger(activeId) && activeId > 0;
  const isCurrent = !rolling || (rolling.is_current === true && hasActiveEntry && activeId === Number(orderPlanId));
  return {
    ...value,
    rolling_receivables: rolling,
    isCurrentReceivable: isCurrent,
    showCurrentFinanceLink: !!(rolling && hasActiveEntry && activeId !== Number(orderPlanId)),
    can_upload_payment: isCurrent && value.can_upload_payment === true,
    statementSubmittedText: formatDate(value.statement_submitted_at),
    payments: asArray(value.payments).map(row => ({
      ...row,
      can_confirm: isCurrent && row.can_confirm === true,
      allocations: asArray(row.allocations),
      uploadedText: formatDate(row.uploaded_at),
      confirmedText: formatDate(row.confirmed_at)
    }))
  };
}

function financeDraftAllowed(draft, finance) {
  if (!draft || !finance) return false;
  if (draft.action === 'statement') return finance.can_submit_statement === true;
  if (draft.action === 'payment') return finance.can_upload_payment === true &&
    (draft.sequenceNo === undefined || Number(draft.sequenceNo) === Number(finance.next_sequence_no));
  return draft.action === 'confirm' && finance.payments.some(row => (
    Number(row.id) === draft.paymentId && row.can_confirm === true
  ));
}

function parseSplitQuantity(value) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : null;
}

Page({
  data: {
    orderPlanId: null,
    loading: true,
    refreshing: false,
    errorMessage: '',
    plan: null,
    viewer: null,
    timeline: [],
    finishedInventory: [],
    bomSelections: [],
    materialRequirements: [],
    supplyDeliveries: [],
    productionSubplans: [],
    qrcodeBatches: [],
    shipments: [],
    finance: null,
    financeDraft: null,
    financeOrdersExpanded: false,
    actionButtons: [],
    submittingActionKey: '',
    splitDraft: null,
    logisticsDraft: null,
    logisticsCandidates: [],
    selectedLogisticsCount: 0,
    uploadingLogisticsDocument: false,
    downloadingDocumentId: null
  },

  onLoad(options) {
    const orderPlanId = asId(options && options.order_plan_id);
    if (!orderPlanId) {
      this.setData({ loading: false, errorMessage: '订单计划参数无效' });
      return;
    }
    this.setData({ orderPlanId });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadDetail();
    });
  },

  onShow() {
    const refreshPlanId = Number(app.globalData.orderDeliveryReceiptRefreshPlanId);
    if (refreshPlanId && refreshPlanId === this.data.orderPlanId) {
      app.globalData.orderDeliveryReceiptRefreshPlanId = null;
    }
    // Another participant may have priced a newer order while this page was
    // hidden. Refresh permissions as well as balances; onLoad owns first load.
    if (!this.data.plan || this.logisticsBusy()) return;
    this.loadDetail();
  },

  onUnload() {
    this._unloaded = true;
    if (this._logisticsUploadTask) this._logisticsUploadTask.abort();
    if (this._financeUploadTask) this._financeUploadTask.abort();
  },

  onPullDownRefresh() {
    this.loadDetail(() => wx.stopPullDownRefresh());
  },

  reload() {
    this.loadDetail();
  },

  loadDetail(done) {
    if (!this.data.orderPlanId || this._loadingDetail || this.data.uploadingLogisticsDocument ||
      this._logisticsConfirming || this._financeConfirming || this._actionConfirming || this._splitConfirming) {
      done && done();
      return;
    }
    this._loadingDetail = true;
    this.setData({ loading: !this.data.plan, refreshing: !!this.data.plan, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/material-flow/detail/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({ errorMessage: '登录状态已失效，请重新进入' });
          return;
        }
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({ errorMessage: body.msg || '订单计划详情加载失败' });
          return;
        }
        this.applyDetail(body.data);
      },
      fail: () => this.setData({ errorMessage: '网络连接失败，请稍后重试' }),
      complete: () => {
        this._loadingDetail = false;
        this.setData({ loading: false, refreshing: false });
        done && done();
      }
    });
  },

  applyDetail(payload) {
    const plan = normalizePlan(payload.plan || payload.order_plan || payload);
    const productionSubplans = normalizeSubplans(
      payload.production_plans || plan.production_plans ||
      payload.production_subplans || plan.production_subplans
    );
    let qrcodeBatches = normalizeQrcodeBatches(
      payload.qrcode_batches || payload.qr_code_batches || payload.qrcode_print_batches ||
      plan.qrcode_batches || plan.qr_code_batches || plan.qrcode_print_batches
    );
    if (!qrcodeBatches.length) {
      const directCodes = payload.qrcodes || payload.qr_codes || plan.qrcodes || plan.qr_codes;
      if (asArray(directCodes).length) {
        qrcodeBatches = normalizeQrcodeBatches([{
          title: '本订单二维码',
          qrcode_count: asArray(directCodes).length,
          codes: directCodes,
          state: payload.qrcode_status || plan.qrcode_status,
          state_name: payload.qrcode_status_name || plan.qrcode_status_name
        }]);
      }
    }
    const shipments = normalizeShipments(
      payload.shipments || payload.shipment_batches || payload.shipment_list ||
      plan.shipments || plan.shipment_batches || plan.shipment_list
    );
    const actionButtons = normalizeActions(
      payload.available_actions || plan.available_actions || payload.actions || plan.actions,
      'plan-action'
    );
    this._actionsByKey = buildActionLookup(
      actionButtons, productionSubplans, qrcodeBatches, shipments
    );
    this._shipmentByActionKey = shipmentActionContext(shipments, productionSubplans);
    const finance = normalizeFinance(payload.finance, this.data.orderPlanId || plan.id);
    const previouslySelected = {};
    asArray(this.data.logisticsCandidates).forEach(row => {
      if (row.selected) previouslySelected[row.id] = true;
    });
    const logisticsCandidates = logisticsCandidatesFor(shipments, productionSubplans)
      .map(row => ({ ...row, selected: !!previouslySelected[row.id] }));
    const oldDraft = this.data.logisticsDraft;
    let logisticsDraft = null;
    if (oldDraft) {
      const remaining = logisticsCandidates.filter(row => oldDraft.shipmentIds.indexOf(row.id) >= 0);
      if (remaining.length) {
        logisticsDraft = {
          ...oldDraft,
          actionKey: remaining[0].actionKey,
          shipmentId: remaining[0].id,
          shipmentIds: remaining.map(row => row.id),
          shipments: remaining,
          title: remaining.map(row => row.title).join('、'),
          errorMessage: remaining.length === oldDraft.shipmentIds.length
            ? oldDraft.errorMessage
            : '部分批次已由其他人处理，已移除。请核对剩余批次后提交。'
        };
      }
    }
    this.setData({
      plan,
      viewer: payload.viewer || plan.viewer || null,
      timeline: normalizeTimeline(payload.timeline || plan.timeline || payload.flow_timeline),
      finishedInventory: normalizeFinishedInventory(
        payload.finished_inventory || payload.finished_goods_inventory || plan.finished_inventory || plan.return_inventory_allocations
      ),
      bomSelections: normalizeBomSelections(payload.bom_selections || plan.bom_selections || plan.items),
      materialRequirements: normalizeRequirements(payload.material_requirements || plan.material_requirements),
      supplyDeliveries: normalizeDeliveries(payload.supply_deliveries || plan.supply_deliveries),
      productionSubplans,
      qrcodeBatches,
      shipments,
      finance,
      financeDraft: financeDraftAllowed(this.data.financeDraft, finance) ? this.data.financeDraft : null,
      actionButtons,
      splitDraft: null,
      logisticsDraft,
      logisticsCandidates,
      selectedLogisticsCount: logisticsCandidates.filter(row => row.selected).length,
      errorMessage: ''
    });
  },

  confirmAction(e) {
    const actionKey = e.currentTarget.dataset.actionKey;
    const action = actionKey
      ? ((this._actionsByKey || {})[actionKey])
      : this.data.actionButtons[Number(e.currentTarget.dataset.index)];
    if (!action || this.logisticsBusy()) return;
    if (action.code === 'shipment-qrcode-print') {
      const url = `${app.globalData.apiBase.replace(/\/api\/?$/, '')}/web/print/`;
      wx.showModal({
        title: '在电脑打印并确认贴包',
        content: '电脑打开打印中心后，用小程序“扫一扫”扫描登录二维码。打印并贴到包装后，在电脑确认贴包；已确认批次将从待打印列表移除。',
        confirmText: '复制地址',
        success: result => {
          if (result.confirm) wx.setClipboardData({ data: url });
        }
      });
      return;
    }
    if (action.code === 'shipment-create') {
      this.openShipmentSplit(action);
      return;
    }
    if (action.code === 'shipment-logistics-confirm') {
      this.openShipmentLogistics(action);
      return;
    }
    if (action.code === 'order-delivery-receipt') {
      // This is a navigation action, not an ordinary order-plan POST.  The
      // receipt page is prefilled from the order and submits all arrived
      // delivery lines together, so it must never fall through to the generic
      // action endpoint.
      wx.navigateTo({ url: action.url });
      return;
    }
    this._actionConfirming = true;
    wx.showModal({
      title: action.confirmTitle,
      content: action.confirmText,
      confirmText: action.confirmButtonText,
      confirmColor: action.danger ? '#c75151' : '#07a85a',
      success: result => {
        this._actionConfirming = false;
        if (result.confirm) this.submitAction(action);
      },
      fail: () => {
        this._actionConfirming = false;
        wx.showToast({ title: '确认窗口打开失败，请重试', icon: 'none' });
      }
    });
  },

  openShipmentSplit(action) {
    // The entry is intentionally activated only by the backend-provided
    // ``shipment-create`` action.  The frontend never infers sales rights
    // from the current role or a shipment status.
    const shipment = (this._shipmentByActionKey || {})[action.key];
    const draft = splitDraftFor(action, shipment);
    if (!draft) {
      wx.showToast({ title: '当前批次缺少可拆分的产品数据，请刷新后重试', icon: 'none' });
      return;
    }
    this.setData({ splitDraft: draft, logisticsDraft: null });
  },

  cancelShipmentSplit() {
    if (this.data.submittingActionKey) return;
    this.setData({ splitDraft: null });
  },

  logisticsBusy() {
    return !!(this.data.submittingActionKey || this.data.uploadingLogisticsDocument ||
      this.data.refreshing || this._logisticsConfirming || this._financeConfirming ||
      this._actionConfirming || this._splitConfirming);
  },

  onLogisticsSelectionChange(e) {
    if (this.logisticsBusy() || this.data.logisticsDraft) return;
    const ids = asArray(e.detail.value);
    const logisticsCandidates = this.data.logisticsCandidates.map(row => ({
      ...row, selected: ids.indexOf(String(row.id)) >= 0
    }));
    this.setData({
      logisticsCandidates,
      selectedLogisticsCount: logisticsCandidates.filter(row => row.selected).length
    });
  },

  selectAllLogistics() {
    if (this.logisticsBusy() || this.data.logisticsDraft) return;
    const select = this.data.selectedLogisticsCount !== this.data.logisticsCandidates.length;
    this.setData({
      logisticsCandidates: this.data.logisticsCandidates.map(row => ({ ...row, selected: select })),
      selectedLogisticsCount: select ? this.data.logisticsCandidates.length : 0
    });
  },

  openSelectedShipmentLogistics() {
    if (this.logisticsBusy() || this.data.logisticsDraft) return;
    const selected = this.data.logisticsCandidates.filter(row => row.selected);
    if (!selected.length) {
      wx.showToast({ title: '请先选择待出库批次', icon: 'none' });
      return;
    }
    const action = (this._actionsByKey || {})[selected[0].actionKey];
    this.openShipmentLogistics(action, selected);
  },

  openShipmentLogistics(action, selected) {
    if (this.logisticsBusy() || !action) return;
    const shipment = (this._shipmentByActionKey || {})[action.key];
    const draft = logisticsDraftFor(action, shipment);
    if (!draft) {
      wx.showToast({ title: '物流任务字段不完整，请刷新后重试', icon: 'none' });
      return;
    }
    if (selected && selected.length) {
      draft.shipmentIds = selected.map(row => row.id);
      draft.shipments = selected;
      draft.title = selected.map(row => row.title).join('、');
      draft.batchMode = true;
    }
    const old = this.data.logisticsDraft;
    // Changing the selected batch does not silently discard an uploaded image.
    if (old) {
      draft.fields = draft.fields.map(field => ({
        ...field,
        inputValue: (old.fields.find(row => row.name === field.name) || {}).inputValue || ''
      }));
      ['document', 'documentLocalPath', 'documentRequestId', 'documentError'].forEach(key => {
        draft[key] = old[key];
      });
    }
    this.setData({ logisticsDraft: draft, splitDraft: null }, () => {
      wx.pageScrollTo({ selector: '#logistics-form', duration: 250 });
    });
  },

  cancelShipmentLogistics() {
    if (this.logisticsBusy()) return;
    this.setData({ logisticsDraft: null });
  },

  onLogisticsInput(e) {
    if (this.logisticsBusy()) return;
    const index = Number(e.currentTarget.dataset.index);
    const draft = this.data.logisticsDraft;
    if (!draft || !Number.isInteger(index) || !draft.fields[index]) return;
    const fields = draft.fields.map((field, fieldIndex) => (
      fieldIndex === index ? { ...field, inputValue: String(e.detail.value || '') } : field
    ));
    this.setData({ logisticsDraft: { ...draft, fields, errorMessage: '' } });
  },

  chooseLogisticsDocument(e) {
    if (this.logisticsBusy() || !this.data.logisticsDraft) return;
    const source = e.currentTarget.dataset.source === 'camera' ? 'camera' : 'album';
    const draft = this.data.logisticsDraft;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [source],
      sizeType: ['compressed'],
      success: result => {
        if (this._unloaded || this.data.logisticsDraft !== draft) return;
        const file = asArray(result.tempFiles)[0];
        if (!file || !file.tempFilePath) return;
        if (file.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
          return;
        }
        this.setData({ logisticsDraft: {
          ...draft,
          document: null,
          documentLocalPath: file.tempFilePath,
          documentRequestId: `logistics-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
          documentError: '',
          errorMessage: ''
        } });
        this.uploadLogisticsDocument();
      },
      fail: error => {
        if (String(error.errMsg || '').indexOf('cancel') < 0) {
          wx.showToast({ title: source === 'camera' ? '拍照失败，请重试' : '选择图片失败，请重试', icon: 'none' });
        }
      }
    });
  },

  uploadLogisticsDocument() {
    if (this.logisticsBusy()) return;
    const draft = this.data.logisticsDraft;
    if (!draft || !draft.documentLocalPath) return;
    this.setData({ uploadingLogisticsDocument: true, logisticsDraft: { ...draft, documentError: '' } });
    const requestId = draft.documentRequestId;
    const updateDraft = values => {
      if (this._unloaded || !this.data.logisticsDraft || this.data.logisticsDraft.documentRequestId !== requestId) return;
      this.setData({ logisticsDraft: { ...this.data.logisticsDraft, ...values } });
    };
    this._logisticsUploadTask = wx.uploadFile({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/material-flow/shipment-logistics-document/`,
      filePath: draft.documentLocalPath,
      name: 'document',
      header: app.authHeader(null),
      formData: { client_request_id: requestId },
      timeout: 180000,
      success: res => {
        let body = {};
        try { body = JSON.parse(res.data || '{}'); } catch (error) {}
        if (res.statusCode === 401) app.reauthenticate();
        const document = body.data && body.data.document;
        if (res.statusCode < 200 || res.statusCode >= 300 || body.code !== 0 || !document || !document.id) {
          updateDraft({ documentError: body.msg || '物流凭证上传失败，请重试或移除图片后提交。' });
          return;
        }
        updateDraft({ document, documentError: '' });
      },
      fail: () => updateDraft({ documentError: '物流凭证上传失败，请检查网络后重试。' }),
      complete: () => {
        this._logisticsUploadTask = null;
        if (!this._unloaded) this.setData({ uploadingLogisticsDocument: false });
      }
    });
  },

  removeLogisticsDocument() {
    if (this.logisticsBusy() || !this.data.logisticsDraft) return;
    this.setData({ logisticsDraft: {
      ...this.data.logisticsDraft, document: null, documentLocalPath: '', documentRequestId: '', documentError: ''
    } });
  },

  previewLogisticsDraftDocument() {
    const path = this.data.logisticsDraft && this.data.logisticsDraft.documentLocalPath;
    if (path) wx.previewImage({ urls: [path], current: path });
  },

  previewShipmentDocument(e) {
    const id = Number(e.currentTarget.dataset.shipmentId);
    const rows = this.data.shipments.concat(...this.data.productionSubplans.map(row => row.shipments));
    const shipment = rows.find(row => Number(row.id) === id);
    const document = shipment && shipment.logisticsDocument;
    if (document) this.previewPrivateImage(document.file_url, `logistics-${document.id}`);
  },

  previewPrivateImage(fileUrl, documentId) {
    if (this.data.downloadingDocumentId) return;
    const url = sameOriginFileUrl(fileUrl);
    if (!url) {
      wx.showToast({ title: '凭证地址无效，请刷新后重试', icon: 'none' });
      return;
    }
    this.setData({ downloadingDocumentId: documentId });
    wx.showLoading({ title: '正在读取凭证', mask: true });
    wx.downloadFile({
      url,
      header: app.authHeader(null),
      success: result => {
        if (result.statusCode === 401) app.reauthenticate();
        if (result.statusCode !== 200 || !result.tempFilePath) {
          wx.showToast({ title: result.statusCode === 401 ? '登录已失效，请重试' : '无法读取凭证，请刷新后重试', icon: 'none' });
          return;
        }
        wx.previewImage({
          urls: [result.tempFilePath],
          current: result.tempFilePath,
          fail: () => wx.showToast({ title: '图片预览失败，请重试', icon: 'none' })
        });
      },
      fail: () => wx.showToast({ title: '凭证下载失败，请检查网络', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        if (!this._unloaded) this.setData({ downloadingDocumentId: null });
      }
    });
  },

  submitShipmentLogistics() {
    if (this.logisticsBusy()) return;
    const draft = this.data.logisticsDraft;
    const action = draft && (this._actionsByKey || {})[draft.actionKey];
    if (!draft || !action || action.code !== 'shipment-logistics-confirm') return;
    const fieldValues = {};
    for (const field of draft.fields) {
      const value = String(field.inputValue || '').trim();
      if (!value || value.length > field.maxlength) {
        this.setData({ logisticsDraft: { ...draft, errorMessage: !value ? `请填写${field.label}。` : `${field.label}不能超过${field.maxlength}字。` } });
        return;
      }
      fieldValues[field.name] = value;
    }
    if (draft.documentLocalPath && !draft.document) {
      this.setData({ logisticsDraft: { ...draft, errorMessage: '所选凭证尚未上传成功，请重试上传，或移除图片后提交。' } });
      return;
    }
    if (draft.document) fieldValues.logistics_document_id = draft.document.id;
    this._logisticsConfirming = true;
    wx.showModal({
      title: '确认线下出库',
      content: `共 ${draft.shipmentIds.length} 个批次：${draft.title}。确认后每批分别记录同一物流公司、单号${draft.document ? '和凭证' : ''}，并进入“已出库待发货”。`,
      confirmText: '确认出库',
      confirmColor: '#07a85a',
      success: result => {
        this._logisticsConfirming = false;
        if (!result.confirm || this.data.logisticsDraft !== draft || this.logisticsBusy()) return;
        this.submitShipmentLogisticsRequest(action, draft, fieldValues);
      },
      fail: () => {
        this._logisticsConfirming = false;
        wx.showToast({ title: '确认窗口打开失败，请重试', icon: 'none' });
      }
    });
  },

  submitShipmentLogisticsRequest(action, draft, fieldValues) {
    if (this.logisticsBusy() || this.data.logisticsDraft !== draft) return;
    this.setData({ submittingActionKey: action.key });
    wx.showLoading({ title: '正在确认出库', mask: true });
    const path = draft.batchMode ? 'shipment-logistics-batch-confirm' : 'shipment-logistics-confirm';
    const payload = draft.batchMode
      ? { shipment_ids: draft.shipmentIds, ...fieldValues }
      : { ...action.payload, shipment_id: draft.shipmentId, ...fieldValues };
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/material-flow/${path}/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: payload,
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) app.reauthenticate();
        if (res.statusCode < 200 || res.statusCode >= 300 || body.code !== 0) {
          this.setData({ logisticsDraft: { ...draft, errorMessage: body.msg || '出库确认失败，请刷新进度后重试。' } });
          return;
        }
        wx.showToast({ title: '已出库待发货', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.setData({
          logisticsDraft: null,
          logisticsCandidates: this.data.logisticsCandidates.map(row => ({ ...row, selected: false })),
          selectedLogisticsCount: 0
        });
        this.loadDetail();
      },
      fail: () => {
        this.setData({ logisticsDraft: { ...draft, errorMessage: '网络连接中断，提交结果暂未确认。请刷新核对批次进度后再操作。' } });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ submittingActionKey: '' });
      }
    });
  },

  openFinanceAction(e) {
    if (this.logisticsBusy()) return;
    const action = e.currentTarget.dataset.financeAction;
    const paymentId = Number(e.currentTarget.dataset.paymentId) || null;
    const payment = this.data.finance && this.data.finance.payments.find(row => Number(row.id) === paymentId);
    const draft = {
      action,
      paymentId,
      sequenceNo: this.data.finance && this.data.finance.next_sequence_no,
      title: action === 'statement' ? '制作订单清单' : action === 'payment'
        ? `上传第 ${this.data.finance.next_sequence_no} 笔付款凭证`
        : `确认第 ${payment ? payment.sequence_no : ''} 笔实际到账`,
      amountInput: '',
      filePath: '',
      requestId: newFinanceRequestId(),
      errorMessage: ''
    };
    if (!financeDraftAllowed(draft, this.data.finance)) {
      wx.showToast({ title: '当前财务任务已变化，请刷新后重试', icon: 'none' });
      return;
    }
    this.setData({ financeDraft: draft }, () => {
      wx.pageScrollTo({ selector: '#finance-form', duration: 250 });
    });
  },

  toggleFinanceOrders() {
    this.setData({ financeOrdersExpanded: !this.data.financeOrdersExpanded });
  },

  openCurrentOrderFinance() {
    const finance = this.data.finance;
    if (!finance || !finance.showCurrentFinanceLink || this.logisticsBusy() || this._openingFinanceEntry) return;
    const orderPlanId = Number(finance.rolling_receivables.active_order_plan_id);
    if (!Number.isSafeInteger(orderPlanId) || orderPlanId <= 0 || orderPlanId === this.data.orderPlanId) return;
    this._openingFinanceEntry = true;
    wx.redirectTo({
      url: `/pages/sales/order_plan_detail/order_plan_detail?order_plan_id=${orderPlanId}`,
      fail: () => wx.showToast({ title: '最新订单打开失败，请重试', icon: 'none' }),
      complete: () => { this._openingFinanceEntry = false; }
    });
  },

  cancelFinanceAction() {
    if (!this.logisticsBusy()) this.setData({ financeDraft: null });
  },

  onFinanceAmountInput(e) {
    if (this.logisticsBusy() || !this.data.financeDraft) return;
    this.setData({ financeDraft: {
      ...this.data.financeDraft,
      amountInput: String(e.detail.value || ''),
      errorMessage: ''
    } });
  },

  chooseFinanceImage(e) {
    if (this.logisticsBusy() || !this.data.financeDraft) return;
    const draft = this.data.financeDraft;
    const source = e.currentTarget.dataset.source === 'camera' ? 'camera' : 'album';
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [source],
      sizeType: ['compressed'],
      success: result => {
        if (this._unloaded || !this.data.financeDraft || this.data.financeDraft.requestId !== draft.requestId) return;
        const file = asArray(result.tempFiles)[0];
        if (!file || !file.tempFilePath) return;
        if (file.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
          return;
        }
        this.setData({ financeDraft: { ...this.data.financeDraft, filePath: file.tempFilePath, errorMessage: '' } });
      },
      fail: error => {
        if (String(error.errMsg || '').indexOf('cancel') < 0) {
          wx.showToast({ title: '选择图片失败，请重试', icon: 'none' });
        }
      }
    });
  },

  removeFinanceImage() {
    if (this.logisticsBusy() || !this.data.financeDraft) return;
    this.setData({ financeDraft: { ...this.data.financeDraft, filePath: '' } });
  },

  previewFinanceDraftImage() {
    const path = this.data.financeDraft && this.data.financeDraft.filePath;
    if (path) wx.previewImage({ urls: [path], current: path });
  },

  previewFinanceImage(e) {
    const finance = this.data.finance;
    if (!finance) return;
    const paymentId = Number(e.currentTarget.dataset.paymentId);
    if (!paymentId) {
      this.previewPrivateImage(finance.statement_url, 'finance-statement');
      return;
    }
    const payment = finance.payments.find(row => Number(row.id) === paymentId);
    if (payment) this.previewPrivateImage(payment.voucher_url, `finance-payment-${payment.id}`);
  },

  submitFinanceAction() {
    if (this.logisticsBusy()) return;
    const draft = this.data.financeDraft;
    if (!financeDraftAllowed(draft, this.data.finance)) return;
    const amount = String(draft.amountInput || '').trim();
    if (draft.action !== 'payment' && (!/^\d{1,12}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) {
      this.setData({ financeDraft: { ...draft, errorMessage: '请填写大于0的金额，最多12位整数、2位小数。' } });
      return;
    }
    if (draft.action !== 'confirm' && !draft.filePath) {
      this.setData({ financeDraft: { ...draft, errorMessage: draft.action === 'statement' ? '请添加订单清单截图。' : '请添加付款凭证图片。' } });
      return;
    }
    this._financeConfirming = true;
    wx.showModal({
      title: draft.title,
      content: draft.action === 'confirm'
        ? `本笔实际到账金额为 ¥${amount}。请按真实到账填写，系统将先冲抵较早订单的欠款，再更新累计余额；多收款项保留为预收余额。`
        : draft.action === 'statement'
          ? `确认提交订单清单，本单应收总额为 ¥${amount}？只填写本单金额，历史未付货款由系统自动累计。`
          : '确认上传本笔付款凭证，等待厂家销售助理核实实际到账金额？',
      confirmText: '确认提交',
      success: result => {
        this._financeConfirming = false;
        if (result.confirm && this.data.financeDraft === draft && !this.logisticsBusy()) {
          this.submitFinanceRequest(draft, amount);
        }
      },
      fail: () => {
        this._financeConfirming = false;
        wx.showToast({ title: '确认窗口打开失败，请重试', icon: 'none' });
      }
    });
  },

  submitFinanceRequest(draft, amount) {
    if (this.logisticsBusy()) return;
    this.setData({ submittingActionKey: `finance-${draft.action}` });
    wx.showLoading({ title: '正在提交财务记录', mask: true });
    const base = `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/finance`;
    const updateError = message => {
      if (this._unloaded || !this.data.financeDraft || this.data.financeDraft.requestId !== draft.requestId) return;
      this.setData({ financeDraft: { ...this.data.financeDraft, errorMessage: message } });
    };
    const callbacks = {
      success: res => {
        let body = res.data || {};
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch (error) { body = {}; }
        }
        if (res.statusCode === 401) app.reauthenticate();
        if (res.statusCode < 200 || res.statusCode >= 300 || body.code !== 0) {
          updateError(body.msg || '财务记录提交失败，请刷新核对后重试。');
          return;
        }
        wx.showToast({ title: '财务记录已提交', icon: 'success' });
        this.setData({ financeDraft: null });
        app.refreshTasks && app.refreshTasks();
        this.loadDetail();
      },
      fail: () => updateError('网络连接中断，提交结果暂未确认。请刷新核对财务记录后再操作。'),
      complete: () => {
        this._financeUploadTask = null;
        wx.hideLoading();
        if (!this._unloaded) this.setData({ submittingActionKey: '' });
      }
    };
    if (draft.action === 'confirm') {
      wx.request({
        url: `${base}/payments/${draft.paymentId}/confirm/`,
        method: 'POST',
        header: app.authHeader('application/json'),
        data: { confirmed_amount: amount },
        ...callbacks
      });
      return;
    }
    this._financeUploadTask = wx.uploadFile({
      url: `${base}/${draft.action === 'statement' ? 'statement' : 'payments'}/`,
      name: 'file',
      filePath: draft.filePath,
      header: app.authHeader(null),
      timeout: 180000,
      formData: draft.action === 'statement'
        ? { receivable_amount: amount }
        : { client_request_id: draft.requestId },
      ...callbacks
    });
  },

  onSplitQuantityInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const draft = this.data.splitDraft;
    if (!draft || !Number.isInteger(index) || !draft.items[index]) return;
    const items = draft.items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, inputValue: String(e.detail.value || '') } : item
    ));
    this.setData({ splitDraft: { ...draft, items, errorMessage: '' } });
  },

  submitShipmentSplit() {
    const draft = this.data.splitDraft;
    const action = draft && (this._actionsByKey || {})[draft.actionKey];
    if (!draft || !action || action.code !== 'shipment-create' || this.logisticsBusy()) return;

    const items = [];
    let unchanged = true;
    for (const row of draft.items) {
      const quantity = parseSplitQuantity(row.inputValue);
      if (quantity === null || quantity < 0 || quantity > row.maximum) {
        this.setData({
          splitDraft: { ...draft, errorMessage: `${row.productName}请填写 0 到 ${row.maximum} 的整数。` }
        });
        return;
      }
      if (quantity !== row.maximum) unchanged = false;
      if (quantity > 0) items.push({ [row.sourceKey]: row.sourceId, quantity });
    }
    if (!items.length) {
      this.setData({ splitDraft: { ...draft, errorMessage: '首批发货至少需要保留一台产品。' } });
      return;
    }
    if (unchanged) {
      this.setData({ splitDraft: { ...draft, errorMessage: '请至少减少一个产品数量；无需拆分时请直接确认本批发货。' } });
      return;
    }

    this._splitConfirming = true;
    wx.showModal({
      title: '确认拆分发货批次',
      content: '首批将按填写数量发货，其余数量会保留为独立待确认批次。拆分后尚未授权的批次仍可分别处理。',
      confirmText: '确认拆分',
      confirmColor: '#07a85a',
      success: result => {
        this._splitConfirming = false;
        if (!result.confirm) return;
        this.submitShipmentSplitRequest(action, draft, items);
      },
      fail: () => {
        this._splitConfirming = false;
        wx.showToast({ title: '确认窗口打开失败，请重试', icon: 'none' });
      }
    });
  },

  submitShipmentSplitRequest(action, draft, items) {
    if (this.logisticsBusy()) return;
    this.setData({ submittingActionKey: action.key });
    wx.showLoading({ title: '正在创建发货批次…', mask: true });
    const payload = {
      ...action.payload,
      client_request_id: draft.clientRequestId,
      items
    };
    if (draft.productionSubplanId) payload.production_subplan_id = draft.productionSubplanId;
    wx.request({
      url: action.url || action.endpoint || (
        `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/material-flow/shipment-create/`
      ),
      method: action.method || 'POST',
      header: app.authHeader('application/json'),
      data: payload,
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '拆分发货批次失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '发货批次已拆分', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.setData({ splitDraft: null });
        this.loadDetail();
      },
      fail: () => wx.showToast({ title: '网络连接失败，请稍后重试', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submittingActionKey: '' });
      }
    });
  },

  submitAction(action) {
    if (this.logisticsBusy()) return;
    this.setData({ submittingActionKey: action.key });
    wx.showLoading({ title: action.loadingText, mask: true });
    wx.request({
      url: action.url || action.endpoint || (
        `${app.globalData.apiBase}/sales/order-plans/${this.data.orderPlanId}/material-flow/${action.code}/`
      ),
      method: action.method,
      header: app.authHeader('application/json'),
      data: action.payload,
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        if (body.code !== 0) {
          wx.showToast({ title: body.msg || '操作失败', icon: 'none' });
          return;
        }
        wx.showToast({ title: body.msg || '操作已提交', icon: 'success' });
        app.refreshTasks && app.refreshTasks();
        this.loadDetail();
      },
      fail: () => wx.showToast({ title: '网络连接失败，请稍后重试', icon: 'none' }),
      complete: () => {
        wx.hideLoading();
        this.setData({ submittingActionKey: '' });
      }
    });
  }
});
