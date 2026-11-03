const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){let p,action,scan,modal,toast,request;
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.js'),'utf8'),{
getApp:()=>({globalData:{},authHeader:()=>({})}),Page:x=>p=x,console,wx:{scanCode:x=>scan=x,showModal:x=>modal=x,showToast:x=>toast=x.title,request:x=>{request=x;x.success({statusCode:200,data:{code:0,data:{}}});}}});
p.data=JSON.parse(JSON.stringify(p.data));p.setData=d=>Object.assign(p.data,d);const original=p.runAction;p.runAction=x=>action=x;
p.data.detail={factory_transport:{kind:'REPAIR',can_finalize:true}};return {p,original,get action(){return action},get scan(){return scan},get modal(){return modal},get toast(){return toast},get request(){return request}};
}
test('factory logistics shipment submits current leg and evidence without scanning',()=>{
const s=setup();s.p.factoryTransportSend({currentTarget:{dataset:{direction:'outbound',index:0}}});assert.equal(s.action,undefined);assert.match(s.toast,/物流/);
s.p.data.replacementCompany='顺丰';s.p.data.replacementTracking='SF1';s.p.data.actionMedia=[{path:'doc.jpg'}];
s.p.factoryTransportSend({currentTarget:{dataset:{direction:'outbound',index:0}}});
assert.equal(s.scan,undefined);assert.equal(s.action.data.action,'FACTORY_TRANSPORT_SEND');assert.equal(s.action.data.direction,'outbound');assert.equal(s.action.data.index,0);assert.equal(s.action.purpose,'REPAIR_RETURN_SHIPMENT_DOCUMENT');
});
test('factory aftersales scan only prepares a new device and never ships it',()=>{
const s=setup();s.p.factoryTransportPrepare();s.scan.success({result:'FACTORY-NEW'});
assert.equal(s.action.data.action,'FACTORY_TRANSPORT_PREPARE_SWAP');assert.equal(s.action.data.qr_text,'FACTORY-NEW');assert.equal(s.action.data.logistics_company,undefined);assert.equal(s.action.purpose,undefined);
});
test('factory attribution posts to transport finalize rather than old close endpoint',()=>{
const s=setup();s.p.finalPayload=()=>({final_fault_type:'OTHER',final_solution_type:'OTHER',final_solution_note:'已修好'});s.p.submitFactoryClose();assert.equal(s.action.data.action,'FACTORY_TRANSPORT_FINALIZE');assert.equal(s.action.endpoint,'/escalation/');
});
test('receiving requires an explicit physical confirmation and does not scan',()=>{
const s=setup();s.p.factoryTransportReceive({currentTarget:{dataset:{direction:'inbound',index:1}}});assert.equal(s.action,undefined);s.modal.success({confirm:false});assert.equal(s.action,undefined);
s.p.factoryTransportReceive({currentTarget:{dataset:{direction:'inbound',index:1}}});s.modal.success({confirm:true});assert.equal(s.action.data.confirmed,true);assert.equal(s.action.data.index,1);assert.equal(s.scan,undefined);
});
test('upload success attaches selected proof IDs while failure prevents submission',async()=>{
const s=setup();s.p.uploadActionMedia=()=>Promise.resolve();s.p.loadDetail=()=>Promise.resolve();s.p.data.actionMedia=[{serverMediaId:101}];
s.original.call(s.p,{endpoint:'/escalation/',purpose:'REPAIR_RETURN_SHIPMENT_DOCUMENT',data:{action:'FACTORY_TRANSPORT_SEND',factory_transport_upload:true}});
await new Promise(r=>setImmediate(r));assert.deepEqual(Array.from(s.request.data.document_ids),[101]);assert.equal(s.request.data.factory_transport_upload,undefined);
const f=setup();f.p.uploadActionMedia=()=>Promise.reject(new Error('failed'));
f.original.call(f.p,{endpoint:'/escalation/',purpose:'REPAIR_RETURN_SHIPMENT_DOCUMENT',data:{factory_transport_upload:true}});await new Promise(r=>setImmediate(r));assert.equal(f.request,undefined);
});
test('factory transport hides old replacement cards and exposes courier evidence per leg',()=>{
const source=fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.wxml'),'utf8');assert.match(source,/!detail.factory_transport && detail.replacement_flow/);assert.match(source,/factoryTransportSend/);assert.match(source,/确认归因，交厂家物流返件/);
});
