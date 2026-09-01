const app = getApp();

const META = {
  MATERIAL: { title: '物料配套分析', path: 'material' },
  FLOW: { title: '产品流转分析', path: 'flow' },
  AFTERSALES: { title: '售后服务分析', path: 'aftersales' },
  QUALITY: { title: '质量追溯汇总', path: 'quality' }
};

const LABELS = {
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
    rows.push({
      id: node.node_id, nodeType: node.node_type,
      name: node.name || '未命名节点', roleCode: node.role_code || '',
      depth, indent: Math.min(depth, 7) * 24, parentIds, expanded: false,
      hasChildren: children.length > 0,
      ownInventory: (node.own || {}).market_inventory_device_count || 0,
      ownActivated: (node.own || {}).activated_device_count || 0,
      totalInventory: (node.total || {}).market_inventory_device_count || 0,
      totalActivated: (node.total || {}).activated_device_count || 0,
      totalTransit: (node.total || {}).in_transit_device_count || 0,
      totalReturn: (node.total || {}).return_or_recall_device_count || 0,
      totalDevices: (node.total || {}).market_device_count || 0
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
    hasResponsibilityTree:false, treeNodes:[], treeSemantics:null
  },
  onLoad(options) {
    const domain = String(options.domain || '').toUpperCase();
    const meta = META[domain];
    if (!meta) { this.setData({ loading:false, error:'统计专题参数无效。' }); return; }
    this.setData({ domain, title:meta.title });
    wx.setNavigationBarTitle({ title:meta.title });
    this.load();
  },
  onPullDownRefresh() { this.load(() => wx.stopPullDownRefresh()); },
  load(done) {
    const meta = META[this.data.domain];
    this.setData({ loading:true, error:'' });
    app.ensureLogin(ok => {
      if (!ok) { this.setData({ loading:false, error:'登录状态无效。' }); done && done(); return; }
      wx.request({
        url:`${app.globalData.apiBase}/data-statistics/${meta.path}/`, method:'GET', header:app.authHeader(),
        success:res => {
          const body=res.data||{};
          if(body.code!==0||!body.data){this.setData({loading:false,error:body.msg||'数据加载失败。'});return;}
          const data=body.data;
          const metrics=this.data.domain==='FLOW'?[]:Object.keys(data.metrics||{}).map(code=>({code,name:LABELS[code]||code,value:data.metrics[code],unit:code.indexOf('rate')>=0?'%':''}));
          const charts=this.data.domain==='FLOW'?[]:Object.keys(data.charts||{}).map(code=>{
            const source=data.charts[code]||[];
            const max=Math.max.apply(null,source.map(rowValue).concat([1]));
            return {code,title:CHART_NAMES[code]||code,rows:source.map(row=>({label:rowLabel(row),value:rowValue(row),width:Math.max(4,Math.round(rowValue(row)/max*100))}))};
          });
          const allTreeNodes=flattenResponsibilityTree(data.responsibility_tree);
          this._allTreeNodes=allTreeNodes;
          this.setData({
            loading:false, metrics, charts, note:data.metric_note||'',
            hasResponsibilityTree:this.data.domain==='FLOW'&&allTreeNodes.length>0,
            treeNodes:visibleTreeRows(allTreeNodes),
            treeSemantics:data.tree_semantics||null
          });
        },
        fail:()=>this.setData({loading:false,error:'网络连接失败，请下拉刷新。'}),
        complete:()=>{done&&done();}
      });
    });
  },
  toggleTreeNode(event) {
    const id=event.currentTarget.dataset.id;
    const rows=this._allTreeNodes||[];
    const target=rows.find(row=>row.id===id);
    if(!target||!target.hasChildren)return;
    target.expanded=!target.expanded;
    this.setData({treeNodes:visibleTreeRows(rows)});
  }
});
