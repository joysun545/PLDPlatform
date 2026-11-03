const app = getApp();

const META = {
  MATERIAL: { title: '物料配套分析', path: 'material' },
  FLOW: { title: '产品流转分析', path: 'flow' },
  AFTERSALES: { title: '售后服务分析', path: 'aftersales' },
  QUALITY: { title: '质量追溯汇总', path: 'quality' }
};

const LABELS = {
  replacement_completed_count:'已完成用户换机台次（非结算）',
  replacement_waiting_count:'待用户换机台次',
  replacement_pending_supply_count:'链路待发补机台数',
  replacement_open_return_count:'旧机未全部返厂台数',
  repair_completed_visits: '已完工维修台次', repair_waiting_visits: '完工待确认／结案台次',
  repair_basis_visits: '具备结算依据维修台次', replacement_basis_pieces: '结算依据换件件次',
  repair_basis_review_visits: '结算依据待核对台次',

  produced_device_count:'生产设备', inventory_device_count:'市场库存', installed_device_count:'已安装', activated_device_count:'终端激活', installation_rate:'安装率', activation_rate:'激活率',
  material_batch_count:'物料批次', material_usage_count:'配套记录', material_covered_device_count:'配套设备量', material_fault_device_count:'故障关联设备',
  aftersales_case_count:'售后工单', aftersales_fault_device_count:'故障设备', aftersales_open_count:'未结案售后', activated_exposure_device_count:'已激活暴露设备', aftersales_fault_rate:'售后故障率',
  active_recall_campaign_count:'召回中批次', active_recall_device_count:'召回中设备', completed_recall_campaign_count:'已完成批次'
};

const CHART_NAMES = {
  current_status_distribution:'当前设备状态分布', product_model_distribution:'产品型号分布', conversion_funnel:'生产—安装—激活转化',
  supplier_distribution:'供应商配套分布', material_distribution:'物料配套分布', material_fault_distribution:'物料故障关联分布',
  status_distribution:'售后状态分布', final_fault_distribution:'最终故障类型分布', recall_status_distribution:'召回设备状态分布'
};

function rowLabel(row) {
  return row.product_model__name || row.device__product_model__name || row.bom_item__material__name || row.material__name || row.supplier_material_batch__supplier__name || row.status || row.final_fault_type || row.stage || '未分类';
}

function rowValue(row) {
  return row.value !== undefined ? row.value : (row.device_count !== undefined ? row.device_count : (row.planned_device_quantity !== undefined ? row.planned_device_quantity : (row.case_count || row.occurrence_count || 0)));
}

function compactSalesResponsibilityTree(root) {
  if (!root || root.node_type !== 'RESPONSIBILITY_ACCOUNT') return root;
  function compactOrganization(node) {
    const children = [];
    (node.children || []).forEach(child => {
      if (child.node_type === 'RESPONSIBILITY_ACCOUNT') {
        (child.children || []).forEach(grandchild => children.push(compactOrganization(grandchild)));
      } else {
        children.push(compactOrganization(child));
      }
    });
    return Object.assign({}, node, { children });
  }
  return Object.assign({}, root, {
    children: (root.children || []).map(compactOrganization)
  });
}

function flattenResponsibilityTree(sourceRoot) {
  const root = compactSalesResponsibilityTree(sourceRoot);
  const rows = [];
  function visit(node, depth, parentIds) {
    if (!node) return;
    const children = node.children || [];
    const own = node.own || {};
    const total = node.total || {};
    const displayScope = node.display_scope === 'OWN' ? 'OWN' : 'TOTAL';
    const ownInventory = own.market_inventory_device_count || 0;
    const ownActivated = own.activated_device_count || 0;
    const ownInstalled = own.installed_device_count || 0;
    const totalInventory = total.market_inventory_device_count || 0;
    const totalActivated = total.activated_device_count || 0;
    const totalInstalled = total.installed_device_count || 0;
    const isResponsibility = node.node_type === 'RESPONSIBILITY_ACCOUNT';
    const isMerchantOrganization = node.node_type === 'ORGANIZATION' && !node.role_code;
    const hasChildren = children.length > 0;
    const hasSubordinateOrganizations = node.has_subordinate_organizations === true;
    rows.push({
      id: node.node_id, nodeType: node.node_type,
      name: node.name || '未命名节点', roleCode: node.role_code || '',
      isMerchantOrganization,
      depth, indent: Math.min(depth, 7) * 24, parentIds, expanded: false,
      hasChildren,
      hasSubordinateOrganizations,
      displayScope,
      showOrganizationInventory: node.show_organization_inventory === true && isMerchantOrganization && hasSubordinateOrganizations,
      showInstallationCount: isMerchantOrganization,
      ownInventory, ownActivated, ownInstalled,
      totalInventory, totalActivated, totalInstalled,
      primaryInventory: totalInventory,
      primaryActivated: totalActivated,
      primaryInstalled: totalInstalled,
      inventoryLabel: isResponsibility ? '负责链路库存' : (isMerchantOrganization ? (hasSubordinateOrganizations ? '链路库存' : '库存') : (hasChildren ? '链路库存' : '库存')),
      activatedLabel: isMerchantOrganization && hasSubordinateOrganizations ? '链路激活' : '激活',
      installedLabel: isMerchantOrganization && hasSubordinateOrganizations ? '链路安装' : '安装',
      totalTransit: total.in_transit_device_count || 0,
      totalReturn: total.return_or_recall_device_count || 0,
      totalDevices: total.market_device_count || 0
    });
    children.forEach(child => visit(child, depth + 1, parentIds.concat([node.node_id])));
  }
  visit(root, 0, []);
  return rows;
}

function visibleTreeRows(rows) {
  const expanded = {};
  rows.forEach(row => { expanded[row.id] = row.expanded; });
  return rows.filter(row => row.parentIds.every(id => expanded[id] !== false));
}

Page({
  data: {
    domain:'', title:'统计专题', loading:true, error:'', metrics:[], charts:[], note:'',
    repairBasisScopeTitle:'', showRepairBasis:false, basisRows:[], basisNextCursor:null, basisLoading:false, basisError:'',
    hasResponsibilityTree:false, treeNodes:[], treeSemantics:null,
    showWarehouseLots:false, warehouseLots:[], warehouseQuery:'', warehouseNextCursor:null, warehouseLoading:false, warehouseError:''
  },
  onLoad(options) {
    const domain = String(options.domain || '').toUpperCase();
    const meta = META[domain];
    if (!meta) { this.setData({ loading:false, error:'统计专题参数无效。' }); return; }
    this.setData({ domain, title:meta.title });
    wx.setNavigationBarTitle({ title:meta.title });
  },
  onShow() { if (META[this.data.domain]) this.load(); },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  load(done) {
    const meta = META[this.data.domain];
    if (!meta || this._domainLoading) { done && done(); return; }
    this._domainLoading = true;
    this.setData({ loading:true, error:'' });
    app.ensureLogin(ok => {
      if (!ok) { this._domainLoading=false; this.setData({ loading:false, error:'登录状态无效。' }); done && done(); return; }
      wx.request({
        url:`${app.globalData.apiBase}/data-statistics/${meta.path}/`, method:'GET', header:app.authHeader(),
        success:res => {
          const body=res.data||{};
          if(res.statusCode===401){app.reauthenticate();this.setData({loading:false,error:'登录已失效，请重新进入。'});return;}
          if(body.code!==0||!body.data){this.setData({loading:false,error:body.msg||'数据加载失败。'});return;}
          const data=body.data;
          const metrics=this.data.domain==='FLOW'?[]:Object.keys(data.metrics||{}).map(code=>({code,name:LABELS[code]||code,value:data.metrics[code],unit:code.indexOf('rate')>=0?'%':(code.endsWith('_visits')?'台次':(code.endsWith('_pieces')?'件次':''))}));
          const charts=this.data.domain==='FLOW'?[]:Object.keys(data.charts||{}).map(code=>{
            const source=data.charts[code]||[];
            const max=Math.max.apply(null,source.map(rowValue).concat([1]));
            return {code,title:CHART_NAMES[code]||code,rows:source.map(row=>({label:rowLabel(row),value:rowValue(row),width:Math.max(4,Math.round(rowValue(row)/max*100))}))};
          });
          const allTreeNodes=flattenResponsibilityTree(data.responsibility_tree);
          const expandedIds = new Set((this._allTreeNodes || []).filter(row => row.expanded).map(row => row.id));
          allTreeNodes.forEach(row => { row.expanded = expandedIds.has(row.id); });
          this._allTreeNodes=allTreeNodes;
          this.setData({
            loading:false, metrics, charts, note:data.metric_note||'',
            hasResponsibilityTree:this.data.domain==='FLOW'&&allTreeNodes.length>0,
            treeNodes:visibleTreeRows(allTreeNodes),
            treeSemantics:data.tree_semantics||null
          });
          this.setData({showRepairBasis: this.data.domain === 'AFTERSALES' && data.can_view_repair_basis === true, repairBasisScopeTitle:(data.repair_basis_scope || {}).title || ''});
          if (this.data.showRepairBasis) this.loadRepairBasis(false);
          if (this.data.domain === 'MATERIAL' && (data.identity || {}).role_code === 'factory_material_stock') {
            this.setData({ showWarehouseLots: true });
            this.loadWarehouseLots(false);
          } else {
            this.setData({ showWarehouseLots: false, warehouseLots: [], warehouseNextCursor: null });
          }
        },
        fail:()=>this.setData({loading:false,error:'网络连接失败，请下拉刷新。'}),
        complete:()=>{this._domainLoading=false;done&&done();}
      });
    });
  },
  loadRepairBasis(append) {
    if (append && (this.data.basisLoading || !this.data.basisNextCursor)) return;
    const run = (this._basisRun || 0) + 1;
    this._basisRun = run;
    const identityKey = [app.globalData.openid, app.globalData.organization_id, app.globalData.role].join(':');
    this.setData({basisLoading:true, basisError:'', ...(append ? {} : {basisRows:[], basisNextCursor:null})});
    wx.request({
      url:`${app.globalData.apiBase}/data-statistics/repair-basis/`, method:'GET', header:app.authHeader(),
      data:{cursor:append?this.data.basisNextCursor:''},
      success:res => {
        if (run !== this._basisRun || identityKey !== [app.globalData.openid, app.globalData.organization_id, app.globalData.role].join(':')) return;
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({basisLoading:false, basisError:body.msg||'结算依据加载失败'}); return;
        }
        const rows = (body.data.items || []).map(row => Object.assign({}, row, {
          materialsText:(row.materials || []).map(item => [item.material_name, item.specification_name].filter(Boolean).join(' ') +
            ' × ' + (item.replacement_quantity == null ? '数量待核对' : item.replacement_quantity + '件')).join('；'),
          issuesText:(row.issues || []).join('；')
        }));
        this.setData({basisLoading:false, basisRows:append?this.data.basisRows.concat(rows):rows,
          basisNextCursor:body.data.next_cursor||null});
      },
      fail:() => {if(run===this._basisRun)this.setData({basisLoading:false,basisError:'网络连接失败，请重试'});}
    });
  },
  moreRepairBasis() { this.loadRepairBasis(true); },
  retryRepairBasis() { this.loadRepairBasis(false); },
  openRepairCase(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (id > 0) wx.navigateTo({url:`/pages/aftersale/detail/detail?application_id=${id}`});
  },
  toggleTreeNode(event) {
    const id=event.currentTarget.dataset.id;
    const rows=this._allTreeNodes||[];
    const target=rows.find(row=>row.id===id);
    if(!target||!target.hasChildren)return;
    target.expanded=!target.expanded;
    this.setData({treeNodes:visibleTreeRows(rows)});
  },
  inputWarehouseQuery(event) {
    this.setData({ warehouseQuery: event.detail.value });
    clearTimeout(this._warehouseSearchTimer);
    this._warehouseSearchTimer = setTimeout(() => this.loadWarehouseLots(false), 250);
  },
  searchWarehouseLots() { this.loadWarehouseLots(false); },
  moreWarehouseLots() { if (this.data.warehouseNextCursor) this.loadWarehouseLots(true); },
  loadWarehouseLots(append) {
    if (append && this.data.warehouseLoading) return;
    const run = (this._warehouseRun || 0) + 1;
    this._warehouseRun = run;
    this.setData({ warehouseLoading:true, warehouseError:'' });
    app.ensureLogin(ok => {
      if (!ok) {
        if (run === this._warehouseRun) this.setData({ warehouseLoading:false, warehouseError:'登录状态无效。' });
        return;
      }
      wx.request({
        url:`${app.globalData.apiBase}/data-statistics/material-warehouse-lots/`, method:'GET',
        data:{q:this.data.warehouseQuery,cursor:append?this.data.warehouseNextCursor:''}, header:app.authHeader(),
        success:res => {
          const body=res.data||{};
          if (run !== this._warehouseRun) return;
          if (body.code !== 0 || !body.data) { this.setData({warehouseLoading:false,warehouseError:body.msg||'批次清单加载失败。'}); return; }
          const data=body.data;
          this.setData({warehouseLoading:false, warehouseLots:append?this.data.warehouseLots.concat(data.items||[]):(data.items||[]), warehouseNextCursor:data.next_cursor||null});
        },
        fail:() => { if(run===this._warehouseRun)this.setData({warehouseLoading:false,warehouseError:'网络连接失败，请重试。'}); }
      });
    });
  }
});
