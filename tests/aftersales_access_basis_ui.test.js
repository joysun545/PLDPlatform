const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
function load(file, app, wx) {
  let page;
  vm.runInNewContext(fs.readFileSync(path.join(root, file),'utf8'), {
    getApp:()=>app, wx, Page:p=>{page=p;}, require:()=>({sync(){}}), console, setTimeout, clearTimeout
  });
  page.data=JSON.parse(JSON.stringify(page.data));
  page.setData=values=>Object.assign(page.data,values);
  return page;
}
test('home receives capabilities from server and discards stale identity response',()=>{
  const app={globalData:{role:'merchant_sales',openid:'a',organization_id:18,apiBase:'/api'},authHeader:()=>({})};
  const requests=[];
  const p=load('pages/home/index/index.js',app,{request:r=>requests.push(r)});
  p.updateButtons();assert.equal(p.data.showAftersale,false);
  p.updateAftersalesCapability(true);
  app.globalData.openid='other';
  requests[0].success({data:{code:0,data:{can_view_aftersales:true}}});
  assert.equal(p.data.showAftersale,false);
  p.updateAftersalesCapability(true);
  requests[1].success({data:{code:0,data:{can_view_aftersales:true,can_view_repair_basis:true}}});
  assert.equal(p.data.showAftersale,true);assert.equal(p.data.showStats,true);
  p.updateAftersalesCapability(true);
  requests[2].success({data:{code:0,data:{can_view_aftersales:false,can_view_repair_basis:false}}});
  assert.equal(p.data.showAftersale,false);
});
test('repair requires actual quantities and sends no BOM inferred count',()=>{
  const app={globalData:{},authHeader:()=>({})};let toast='';let submitted;
  const p=load('pages/aftersale/detail/detail.js',app,{showToast:r=>{toast=r.title;}});
  p.data.detail={bom:{items:[{bom_item_id:3,material_id:4,material_name:'控制器',quantity:100}]}};
  p.data.repairSummary='更换完成';p.data.repairMaterialReplaced=true;
  p.runAction=r=>{submitted=r;};
  p.onRepairMaterials({detail:{value:['3']}});
  p.submitRepairComplete();assert.equal(submitted,undefined);assert.match(toast,/实际更换/);
  p.onRepairQuantity({currentTarget:{dataset:{key:'3'}},detail:{value:'2'}});
  p.submitRepairComplete();assert.equal(submitted.data.repair_materials[0].replacement_quantity,2);
  assert.equal(submitted.data.repair_materials[0].quantity,undefined);
  p.data.repairMaterialReplaced=false;p.submitRepairComplete();
  assert.equal(submitted.data.repair_materials.length,0);
});
test('basis records open canonical application detail and paginate',()=>{
  let url='';let request;
  const app={globalData:{openid:'x',role:'merchant_sales',organization_id:18,apiBase:'/api'},authHeader:()=>({})};
  const p=load('pages/data_statistics/domain/domain.js',app,{navigateTo:r=>{url=r.url;},request:r=>{request=r;}});
  p.openRepairCase({currentTarget:{dataset:{id:26}}});
  assert.equal(url,'/pages/aftersale/detail/detail?application_id=26');
  p.loadRepairBasis(false);
  request.success({data:{code:0,data:{items:[{application_id:26,materials:[{material_name:'控制器',quantity:100,replacement_quantity:null}]}],next_cursor:26}}});
  assert.match(p.data.basisRows[0].materialsText,/数量待核对/);
  p.moreRepairBasis();assert.equal(request.data.cursor,26);
  request.success({data:{code:0,data:{items:[{application_id:25}],next_cursor:null}}});
  assert.equal(p.data.basisRows.length,2);
});
