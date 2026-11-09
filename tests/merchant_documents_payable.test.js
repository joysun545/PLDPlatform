const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const ROOT = path.join(__dirname, '..');
const ROUTES = {
  settlement:'pages/stock/goods_transfer_settlement/goods_transfer_settlement',
  accounts:'pages/stock/goods_transfer_accounts/goods_transfer_accounts',
  detail:'pages/stock/goods_transfer_detail/goods_transfer_detail',
  dashboard:'pages/data_statistics/dashboard/dashboard',
  domain:'pages/data_statistics/domain/domain'
};

function environment(name) {
  let page;
  const requests = [], uploads = [], navigations = [], redirects = [], modals = [], toasts = [];
  const app = {
    globalData:{apiBase:'https://example.invalid/api',openid:'a',access_token:'token',organization_id:18,
      role:'merchant_sales',factory_root_id:2,operationRoot:{id:2,name:'厂家根'}},
    ensureLogin:done => done(true),authHeader:() => ({}),reauthenticate() {},refreshTasks() {}
  };
  const wx = {
    request:request => requests.push(request), uploadFile:request => uploads.push(request),
    navigateTo:request => navigations.push(request), redirectTo:request => redirects.push(request),
    showModal:modal => modals.push(modal), showToast:toast => toasts.push(toast),
    showLoading() {},hideLoading() {},setNavigationBarTitle() {},stopPullDownRefresh() {}
  };
  const filename = path.join(ROOT, ROUTES[name] + '.js');
  vm.runInNewContext(fs.readFileSync(filename,'utf8'), {
    getApp:() => app, Page:value => {page=value;},wx,require:createRequire(filename),setTimeout,clearTimeout
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = values => Object.assign(page.data,values);
  const reply = (index,statusCode,data) => {
    requests[index].success({statusCode,data});
    if(requests[index].complete)requests[index].complete();
  };
  const respond = (data,index=requests.length-1) => reply(index,200,{code:0,data});
  return {page,app,requests,uploads,navigations,redirects,modals,toasts,reply,respond};
}

// Interpret the production WXML's conditionals/loops against real Page data.
// This is a visibility/text acceptance helper, not a WeChat layout renderer.
function render(name,data) {
  const source = fs.readFileSync(path.join(ROOT,ROUTES[name]+'.wxml'),'utf8');
  const root = {children:[]}, stack=[root];
  const tokens = source.match(/<\/?[\w:-]+(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g) || [];
  for(const token of tokens) {
    if(token.startsWith('</')) { stack.pop(); continue; }
    if(!token.startsWith('<')) { stack[stack.length-1].children.push({text:token}); continue; }
    const tag = /^<([\w:-]+)/.exec(token)[1];
    const attrs = {};
    const raw = token.slice(tag.length+1).replace(/\/?>$/,'');
    for(const match of raw.matchAll(/([^\s=/>]+)(?:="([^"]*)")?/g))attrs[match[1]]=match[2]===undefined?'':match[2];
    const node={tag,attrs,children:[]};stack[stack.length-1].children.push(node);
    if(!token.endsWith('/>'))stack.push(node);
  }
  const result={text:[],nodes:[]};
  const evaluate=(value,scope) => {
    const match=/^\{\{([\s\S]*)\}\}$/.exec(value||'');
    if(!match)return value;
    try{return vm.runInNewContext('('+match[1]+')',scope);}catch{return undefined;}
  };
  function children(nodes,scope) {
    let matched=null;
    for(const node of nodes) {
      if(node.text!==undefined) {
        result.text.push(node.text.replace(/\{\{([\s\S]*?)\}\}/g,(_,expr)=>{
          const value=evaluate('{{'+expr+'}}',scope);return value==null?'':String(value);
        }));
        if(node.text.trim())matched=null;
        continue;
      }
      const a=node.attrs;let visible=true;
      if('wx:if' in a){visible=Boolean(evaluate(a['wx:if'],scope));matched=visible;}
      else if('wx:elif' in a){visible=!matched&&Boolean(evaluate(a['wx:elif'],scope));matched=matched||visible;}
      else if('wx:else' in a){visible=!matched;matched=true;}
      else matched=null;
      if(!visible)continue;
      const rows='wx:for' in a?evaluate(a['wx:for'],scope):null;
      const scopes=rows?Array.from(rows,(row,index)=>Object.assign({},scope,{[a['wx:for-item']||'item']:row,[a['wx:for-index']||'index']:index})):[scope];
      for(const current of scopes){
        result.nodes.push({tag:node.tag,attrs:Object.fromEntries(Object.entries(a).map(([k,v])=>[k,evaluate(v,current)]))});
        children(node.children,current);
      }
    }
  }
  children(root.children,data);result.text=result.text.join(' ').replace(/\s+/g,' ');return result;
}


const tap = dataset => ({currentTarget:{dataset}});
const ROOT_ORG = {id:2,name:'厂家根'};
function documents(extra={}) {
  return Object.assign({financial_mode:'DOCUMENTS_ONLY',financial_enabled:false,
    financial_message:'商家下发仅留存货品清单与物流，不生成应收账款。',root_organization:ROOT_ORG,
    goods_transfer:{id:7,flow_no:'GF-7',device_count:2,from_organization_name:'商家甲',to_organization_name:'下级乙'},
    state_name:'待补单据',physical_status_name:'已完成',statement:{submitted:false},logistics_documents:[],
    actions:{can_submit_statement:true,can_upload_logistics:true}},extra);
}
function loadDocuments(extra={}) {
  const e=environment('settlement');e.page.onLoad({transfer_id:'7'});e.respond(documents(extra));return e;
}
function finances(extra={}) {
  return Object.assign({domain:'FINANCE',finance_sides:['PAYABLE'],metrics:{payable_outstanding_amount:'3500.00'},
    metric_note:'仅直属商家向厂家应付，商家下发不形成应收。',root_organization:ROOT_ORG,
    accounts:[{key:'ORDER_PLAN:2:18',side:'PAYABLE',source_kind:'ORDER_PLAN',counterparty_name:'厂家根',document_count:3,
      receivable_amount:'5000.00',received_amount:'1500.00',credit_amount:'0.00',outstanding_amount:'3500.00',
      overpaid_amount:'0.00',entry_id:null,can_open:false,root_organization:ROOT_ORG}]},extra);
}
function loadFinance(extra={}) {
  const e=environment('domain');e.page.onLoad({domain:'FINANCE'});e.page.onShow();e.respond(finances(extra));return e;
}

test('shipment documents show physical count and real documents without receivable, rolling or payment controls',()=>{
  const e=loadDocuments({receivable_amount:'500.00',rolling_receivables:{enabled:true,outstanding_amount:'900.00'},payments:[{id:1,can_confirm:true}],payment_count:1});
  const view=render('settlement',e.page.data);
  assert.match(view.text,/共 2 台/);assert.match(view.text,/实物状态：已完成/);assert.match(view.text,/货品清单/);assert.match(view.text,/物流单据/);
  assert.doesNotMatch(view.text,/¥500|¥900|双方累计|本单原始应收|付款凭证|确认本次收款/);
  assert.equal(view.nodes.some(n=>n.tag==='input'&&n.attrs.bindinput==='onReceivableInput'),false);
});

test('statement upload needs an image, sends only statement_image and no amount, then refreshes documents/tasks',()=>{
  const e=loadDocuments();let refreshes=0;e.app.refreshTasks=()=>refreshes++;
  e.page.submitStatement();assert.equal(e.uploads.length,0);assert.match(e.toasts[0].title,/清单图片/);
  e.page.data.selectedStatementPath='/tmp/statement.jpg';e.page.submitStatement();e.modals[0].success({confirm:true});
  assert.equal(e.uploads.length,1);const request=e.uploads[0];assert.match(request.url,/goods-transfers\/7\/settlement\/statement\/$/);
  assert.equal(request.name,'statement_image');assert.equal(request.filePath,'/tmp/statement.jpg');assert.deepEqual(Object.keys(request.formData),[]);
  request.success({data:JSON.stringify({code:0,msg:'货品清单已提交',data:{}})});assert.equal(refreshes,1);
  e.respond(documents({statement:{submitted:true,submitted_at:'2026-11-09T01:00:00Z',preview_path:'/statement-file/'}}));
  request.complete();const view=render('settlement',e.page.data);assert.match(view.text,/已提交/);assert.equal(e.page.data.selectedStatementPath,'');
});

test('logistics keeps its upload endpoint, file and remark independently of financial amounts',()=>{
  const e=loadDocuments();e.page.data.selectedLogisticsPath='/tmp/logistics.pdf';e.page.data.logisticsRemark='TRACK-1';e.page.submitLogistics();
  const request=e.uploads[0];assert.match(request.url,/settlement\/logistics-documents\/$/);assert.equal(request.name,'document_file');
  assert.equal(request.formData.remark,'TRACK-1');assert.ok(request.formData.client_request_id);assert.equal(request.formData.receivable_amount,undefined);
});

test('receivers and completed statement pages cannot force document mutations through stale events',()=>{
  const e=loadDocuments({actions:{can_submit_statement:false,can_upload_logistics:false}});
  e.page.data.selectedStatementPath='/tmp/s.jpg';e.page.data.selectedLogisticsPath='/tmp/l.jpg';
  e.page.submitStatement();e.page.uploadStatement('/tmp/s.jpg');e.page.submitLogistics();
  assert.equal(e.uploads.length,0);assert.equal(e.modals.length,0);
});

test('old shipment cash events cannot issue a payment, receipt confirmation or voucher request',()=>{
  const e=loadDocuments();const before=e.requests.length;
  e.page.chooseVoucher();e.page.submitVoucher();e.page.uploadVoucher('/tmp/voucher.jpg');e.page.confirmPayment(tap({id:4}));e.page.submitPaymentConfirmation(4,'100');e.page.previewVoucher(tap({path:'/private-voucher/'}));
  assert.equal(e.requests.length,before);assert.equal(e.uploads.length,0);assert.equal(e.modals.length,0);assert.equal(e.toasts.length,6);
});

test('a disabled merchant account page displays a physical-flow link and cannot mutate even via old callbacks',()=>{
  const e=environment('accounts');e.page.onLoad({transfer_id:'7'});e.respond({merchant_accounts_enabled:false,disabled_reason:'商家下发货款流程已停用',root_organization:ROOT_ORG,goods_transfer:{flow_no:'GF-7',device_count:2},cases:[]});
  const view=render('accounts',e.page.data);assert.match(view.text,/商家下发货款流程已停用/);assert.doesNotMatch(view.text,/提交本次金额|确认进入往来账|上传付款凭证|手动关联应收批次/);
  for(const [name,args] of [['submitCase',[tap({index:0})]],['doSubmitCase',[0]],['submitCaseDecision',[1,'CONFIRM','']],['doAllocate',[1,{target_id:1},'2']],['uploadVoucher',[tap({index:0})]],['doConfirmPayment',[1,2,'3']]])e.page[name](...args);
  assert.equal(e.requests.length,1);assert.equal(e.uploads.length,0);e.page.openTransferDetail();assert.match(e.redirects[0].url,/goods_transfer_detail\?transfer_id=7$/);
});

test('manufacturer-upstream account cases keep their existing amount-confirmation interface',()=>{
  const e=environment('accounts');e.page.onLoad({transfer_id:'8'});e.respond({merchant_accounts_enabled:true,root_organization:ROOT_ORG,goods_transfer:{flow_no:'GF-8',flow_type:'RETURN',device_count:2},cases:[{id:11,case_type:'RETURN_CREDIT',case_type_name:'退厂冲抵',upper_organization:{id:2,name:'厂家根'},lower_organization:{id:18,name:'直属商家'},confirmed_amount:null,available_credit_amount:null,outstanding_amount:null,pair_summary:{},actions:{can_submit:true},allocations:[],payments:[],allocation_candidates:[]}]});
  assert.equal(e.page.data.detail.financialDisabled,false);assert.match(render('accounts',e.page.data).text,/提交本次金额/);
  e.page.data.detail.cases[0].amountInput='250.00';e.page.submitCase(tap({index:0}));e.modals[0].success({confirm:true});
  assert.match(e.requests[1].url,/accounts\/RETURN_CREDIT\/submit\/$/);assert.equal(e.requests[1].data.amount,'250.00');
});

test('goods flow keeps the documents link while a merchant cannot use a disabled accounts action',()=>{
  const e=environment('detail');e.page.data.transferId=7;e.page.data.detail={flow_type:'SHIPMENT',status:'COMPLETED',actions:{can_view_accounts:false}};
  e.page.openAccounts();assert.equal(e.navigations.length,0);e.page.openSettlement();assert.match(e.navigations[0].url,/goods_transfer_settlement\?transfer_id=7$/);
  e.page.data.detail.actions.can_view_accounts=true;e.page.openAccounts();assert.match(e.navigations[1].url,/goods_transfer_accounts\?transfer_id=7$/);
});

test('direct merchant finance renders only payable with exact money and read-only sales rows cannot open forbidden order details',()=>{
  const e=loadFinance({metrics:{payable_outstanding_amount:'1234567890123456.7'}});const view=render('domain',e.page.data);
  assert.match(view.text,/1234567890123456.70/);assert.match(view.text,/当前应付/);assert.doesNotMatch(view.text,/当前应收/);
  assert.equal(e.requests[0].data.root_organization_id,2);assert.equal(e.page.data.financeAccounts[0].canOpen,false);
  e.page.openFinanceAccount(tap({key:'ORDER_PLAN:2:18'}));assert.equal(e.navigations.length,0);
});

test('a permitted owner order-detail link preserves the actual business root; disabled source types are not rendered',()=>{
  const payload=finances();payload.accounts[0].entry_id=19;payload.accounts[0].can_open=true;
  payload.accounts.push({...payload.accounts[0],key:'OLD-GOODS',source_kind:'GOODS_TRANSFER',side:'RECEIVABLE'});
  const e=loadFinance(payload);assert.equal(e.page.data.financeAccounts.length,1);
  e.page.openFinanceAccount(tap({key:'ORDER_PLAN:2:18'}));assert.equal(e.navigations[0].url,'/pages/sales/order_plan_detail/order_plan_detail?order_plan_id=19');
  const events=[];e.navigations[0].success({eventChannel:{emit:(name,value)=>events.push([name,value])}});assert.deepEqual(JSON.parse(JSON.stringify(events)),[['taskRootOrganization',ROOT_ORG]]);
});

test('dashboard and FLOW detail expose merchant shipment counts while retaining the existing inventory tree',()=>{
  const section={domain:'FLOW',metrics:{merchant_shipment_count:4,merchant_shipped_device_count:9,inventory_device_count:7},responsibility_tree:{node_id:'org:18',node_type:'ORGANIZATION',name:'本商家',has_subordinate_organizations:true,show_organization_inventory:true,own:{market_inventory_device_count:3},total:{market_inventory_device_count:7},children:[]}};
  const d=environment('dashboard');d.page.onShow();d.respond({sections:[section],identity:{}});const card=d.page.data.sections[0];
  assert.deepEqual(JSON.parse(JSON.stringify(card.metrics.filter(x=>x.code.startsWith('merchant_')).map(x=>[x.name,x.value,x.unit]))),[['累计向下发货单',4,'单'],['累计向下发货台次',9,'台次']]);
  const e=environment('domain');e.page.onLoad({domain:'FLOW'});e.page.onShow();e.respond(section);const view=render('domain',e.page.data);
  assert.match(view.text,/累计向下发货单/);assert.match(view.text,/累计向下发货台次/);assert.match(view.text,/链路库存/);assert.match(view.text,/组织库存/);
  assert.equal(e.page.data.metrics.length,2);assert.equal(e.page.data.hasResponsibilityTree,true);
});

test('finance revocation clears data and stale account links; a root-denied response is not financial zero',()=>{
  const e=loadFinance();e.page.onPullDownRefresh();e.reply(1,200,{code:1,error_code:'STATISTICS_ACCESS_DENIED',msg:'当前岗位无权查看',data:{}});
  assert.equal(e.page.data.financeAccounts.length,0);assert.equal(e.page.data.financeRoot,null);assert.equal(e.page.data.metrics.length,0);e.page.openFinanceAccount(tap({key:'ORDER_PLAN:2:18'}));assert.equal(e.navigations.length,0);
  const d=environment('dashboard');d.page.onShow();d.respond({sections:[{domain:'FINANCE',access_denied:true,metrics:{payable_outstanding_amount:'0.00'},metric_note:'请切换根组织'}],identity:{}});
  assert.equal(d.page.data.sections[0].metrics.length,0);assert.match(render('dashboard',d.page.data).text,/请切换根组织/);
});

test('root switching cannot restore stale finance data or let an old denial clear a newer authorized response',()=>{
  const e=loadFinance();e.page.onPullDownRefresh();const old=e.requests[1];
  e.app.globalData.operationRoot={id:3,name:'另一个根'};e.page.onShow();assert.equal(e.page.data.financeAccounts.length,0);assert.equal(e.requests[2].data.root_organization_id,3);
  e.respond(finances({root_organization:{id:3,name:'另一个根'},accounts:[]}),2);old.success({statusCode:200,data:{code:1,error_code:'STATISTICS_ACCESS_DENIED',msg:'旧根无权',data:{}}});
  assert.equal(e.page.data.error,'');assert.equal(e.page.data.financeRoot.id,3);assert.equal(e.page.data.financeAccounts.length,0);
});
