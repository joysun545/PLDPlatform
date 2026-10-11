const ROUTES = {
  'pages/index/index': { level: 'none', title: '' },
  'pages/home/index/index': { level: 'tab', title: '首页' },
  'pages/scan/scan/scan': { level: 'tab', title: '扫一扫' },
  'pages/personal/center/center': { level: 'tab', title: '我的' },

  'pages/home/invite/invite/invite': { level: 'primary', title: '邀请下级' },
  'pages/home/invite/accept/accept': { level: 'secondary', title: '接受邀请' },
  'pages/home/edit/edit': { level: 'primary', title: '管理下级用户' },
  'pages/personal/edit/edit': { level: 'primary', title: '编辑账号资料' },
  'pages/personal/task_list/task_list': { level: 'primary', title: '我的任务' },
  'pages/personal/task_group/task_group': { level: 'secondary', title: '任务详情' },
  'pages/scan/result/result': { level: 'primary', title: '设备扫码结果' },
  'pages/logs/logs': { level: 'primary', title: '启动日志' },

  'pages/customer/invite/accept/accept': { level: 'secondary', title: '接受设备邀请' },
  'pages/customer/driver/accept/accept': { level: 'secondary', title: '接受车辆设备邀请' },
  'pages/customer/device/list/list': { level: 'primary', title: '我的设备' },
  'pages/customer/device/result/result': { level: 'secondary', title: '设备详情' },
  'pages/customer/document/reader/reader': { level: 'tertiary', title: '设备必读资料' },
  'pages/customer/aftersale/request/request': { level: 'secondary', title: '发起售后申请' },
  'pages/customer/aftersale/detail/detail': { level: 'tertiary', title: '售后申请' },
  'pages/aftersale/list/list': { level: 'primary', title: '售后列表' },
  'pages/aftersale/service_station/application/application': { level: 'primary', title: '申请售后服务站' },
  'pages/aftersale/detail/detail': { level: 'secondary', title: '售后详情' },

  'pages/sales/create_plan/create_plan': { level: 'primary', title: '创建订单计划' },
  'pages/sales/order_plan_list/order_plan_list': { level: 'primary', title: '订单计划列表' },
  'pages/sales/order_plan_detail/order_plan_detail': { level: 'secondary', title: '订单计划详情' },

  'pages/stock/goods_transfer/goods_transfer': { level: 'primary', title: '扫码商品流转' },
  'pages/stock/goods_transfer_list/goods_transfer_list': { level: 'primary', title: '商品流转列表' },
  'pages/stock/goods_transfer_detail/goods_transfer_detail': { level: 'secondary', title: '商品流转详情' },
  'pages/stock/goods_transfer_settlement/goods_transfer_settlement': { level: 'tertiary', title: '商品单据与应收' },
  'pages/stock/goods_transfer_accounts/goods_transfer_accounts': { level: 'secondary', title: '流转往来账' },
  'pages/stock/factory_return_process/factory_return_process': { level: 'secondary', title: '厂家退货处理' },
  'pages/stock/factory_return_inventory/factory_return_inventory': { level: 'primary', title: '厂家成品库存' },

  'pages/supply_chain/responsibility/responsibility': { level: 'primary', title: '销售责任分配' },
  'pages/supply_chain/warranty_list/warranty_list': { level: 'primary', title: '供应商退货协同' },
  'pages/supply_chain/warranty_notice/warranty_notice': { level: 'secondary', title: '供应商三包物料' },
  'pages/supply_chain/aftersale_quality_notice/aftersale_quality_notice': { level: 'secondary', title: '物料质量通知' },
  'pages/supply_chain/aftersale_quality_list/aftersale_quality_list': { level: 'primary', title: '售后质量通知' },

  'pages/quality_trace/dashboard/dashboard': { level: 'primary', title: '质量追溯' },
  'pages/quality_trace/rule_list/rule_list': { level: 'secondary', title: '预警规则' },
  'pages/quality_trace/rule_detail/rule_detail': { level: 'tertiary', title: '规则详情' },
  'pages/quality_trace/alert_list/alert_list': { level: 'secondary', title: '质量预警' },
  'pages/quality_trace/alert_detail/alert_detail': { level: 'tertiary', title: '预警详情' },
  'pages/quality_trace/case_list/case_list': { level: 'secondary', title: '质量案件' },
  'pages/quality_trace/case_detail/case_detail': { level: 'tertiary', title: '案件详情' },
  'pages/quality_trace/recall_list/recall_list': { level: 'secondary', title: '召回管理' },
  'pages/quality_trace/recall_detail/recall_detail': { level: 'tertiary', title: '召回详情' },
  'pages/quality_trace/recall_disposition/recall_disposition': { level: 'tertiary', title: '召回后处置' },
  'pages/quality_trace/recall_handover_accept/recall_handover_accept': { level: 'tertiary', title: '接管召回设备' },
  'pages/quality_trace/recall_task_detail/recall_task_detail': { level: 'tertiary', title: '召回任务详情' },

  'pages/data_statistics/dashboard/dashboard': { level: 'primary', title: '数据统计' },
  'pages/data_statistics/domain/domain': { level: 'secondary', title: '统计专题' },
  'pages/material_inventory/list/list': { level: 'primary', title: '物料库' },
  'pages/material_inventory/order_delivery_receipt/order_delivery_receipt': { level: 'secondary', title: '物料入库' },
  'pages/material_inventory/detail/detail': { level: 'secondary', title: '物料库存详情' },
  'pages/material_inventory/form/form': { level: 'tertiary', title: '物料出入库' },
  'pages/material_inventory/warranty_list/warranty_list': { level: 'secondary', title: '三包件退货' },
  'pages/theme/setting/setting': { level: 'primary', title: '全局界面主题' }
};

function getRouteMeta(route) {
  return ROUTES[route] || { level: 'primary', title: '产品生命周期数字平台' };
}

module.exports = { ROUTES, getRouteMeta };
