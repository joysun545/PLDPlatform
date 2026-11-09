const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(file='pages/sales/replacement_supply/replacement_supply.js') {
let p,requests=[],navigate;
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../'+file),'utf8'),{getApp:()=>({globalData:{apiBase:'/api'},authHeader:()=>({}),ensureLogin:f=>f(true)}),Page:x=>p=x,wx:{request:o=>requests.push(o),navigateTo:o=>navigate=o.url,showToast:()=>{},showModal:o=>o.success({confirm:true})},console});
p.data=JSON.parse(JSON.stringify(p.data));p.setData=d=>Object.assign(p.data,d);return {p,requests,get navigate(){return navigate}};
}
test('standalone replacement plan creates without any sales quantity or BOM',async()=>{
const s=setup();s.p.data.merchants=[{id:18,name:'直属商家'}];s.p.create();
const req=s.requests[0];assert.equal(req.method,'POST');assert.equal(req.data.merchant_id,18);assert.equal(req.data.items,undefined);assert.equal(req.data.quantity,undefined);
assert.match(req.data.client_request_id,/^supply-/);req.success({statusCode:200,data:{code:0,data:{plan:{id:1,items:[]}}}});await new Promise(r=>setImmediate(r));assert.equal(s.p.planId,1);
});
test('failed standalone creation retries with the same idempotency key',async()=>{
const s=setup();s.p.data.merchants=[{id:18}];s.p.create();const key=s.requests[0].data.client_request_id;s.requests[0].fail();await new Promise(r=>setImmediate(r));s.p.create();assert.equal(s.requests[1].data.client_request_id,key);
});
test('normal order view opens only its attached replacement plan',()=>{
const s=setup();s.p.onLoad({order_id:25});assert.match(s.requests[0].url,/\?order_id=25$/);assert.equal(s.requests[0].method,'GET');
});
test('factory replacement logistics cannot submit in person from stale frontend state',()=>{
const s=setup('pages/aftersale/detail/detail.js');s.p.data.detail={replacement_flow:{factory_logistics_only:true}};s.p.data.replacementHandoverMethod='IN_PERSON';assert.equal(s.p.replacementLogistics().handover_method,'SHIPMENT');
});
test('factory shipping selectors are hidden, standalone entry stays on create page and order detail uses linked rows',()=>{
const detail=fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.wxml'),'utf8');
assert.equal((detail.match(/<radio-group wx:if="{{!detail.replacement_flow.factory_logistics_only}}" data-field="replacementHandoverMethod"/g)||[]).length,2);
const create=fs.readFileSync(path.resolve(__dirname,'../pages/sales/create_plan/create_plan.wxml'),'utf8');
assert.match(create,/openReplacementSupplyPlans/);
const order=fs.readFileSync(path.resolve(__dirname,'../pages/sales/order_plan_detail/order_plan_detail.wxml'),'utf8');
assert.match(order,/wx:for="{{replacementSupplyItems}}"/);
assert.doesNotMatch(order,/openReplacementSupplyPlans/);
});
