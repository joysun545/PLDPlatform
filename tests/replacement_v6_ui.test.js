const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){let p,scan,action,modal,toast,request;
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.js'),'utf8'),{
getApp:()=>({globalData:{},authHeader:()=>({})}),Page:x=>p=x,wx:{request:x=>{request=x;x.success({statusCode:200,data:{code:0,data:{}}})},scanCode:x=>scan=x,showModal:x=>modal=x,showToast:x=>toast=x.title},console});
p.data=JSON.parse(JSON.stringify(p.data));p.setData=x=>Object.assign(p.data,x);const actualRunAction=p.runAction;p.runAction=x=>action=x;
p.data.detail={replacement_flow:{protocol_version:6,mode:'LOCAL',legs:[]}};
return {p,actualRunAction,get request(){return request},get scan(){return scan},get action(){return action},get modal(){return modal},get toast(){return toast}};}
test('only home or shop service is chosen before onsite scan',()=>{
const s=setup();s.p.confirmOnsiteService();assert.equal(s.action,undefined);assert.match(s.toast,/选择/);
s.p.data.onsiteServiceMode='HOME';s.p.confirmOnsiteService();assert.equal(s.action.data.action,'CONFIRM_REPLACEMENT_SERVICE');assert.equal(s.action.data.service_mode,'HOME');
});
test('onsite scan submits delivery immediately without logistics or extra customer signature',()=>{
const s=setup();s.p.scanReplacementStock();s.scan.success({result:'NEW-LIFECYCLE'});
assert.equal(s.action.data.action,'SCAN_SWAP');assert.equal(s.action.data.qr_text,'NEW-LIFECYCLE');assert.equal(s.action.purpose,undefined);
assert.equal(s.action.data.logistics_company,undefined);assert.equal(s.modal,undefined);
});
test('old-machine offline acknowledgement needs no scan or file upload',()=>{
const s=setup();s.p.oldMachineAction({currentTarget:{dataset:{id:13,action:'RECEIVE_REPLACEMENT_LEG'}}});s.modal.success({confirm:true});
assert.equal(s.action.data.leg_id,13);assert.equal(s.action.data.confirmed,true);assert.equal(s.action.purpose,undefined);assert.equal(s.scan,undefined);
});
test('cancelled old-machine acknowledgement does not submit',()=>{
const s=setup();s.p.oldMachineAction({currentTarget:{dataset:{id:13,action:'RECEIVE_REPLACEMENT_LEG'}}});s.modal.success({confirm:false});assert.equal(s.action,undefined);
});
test('factory repaired machine has explicit finished or turnover target',()=>{
const s=setup();s.p.data.recoveryNote='维修测试合格';s.p.recoveryRepairComplete({currentTarget:{dataset:{target:'TURNOVER'}}});
assert.equal(s.action.data.stock_target,'TURNOVER');assert.equal(s.action.purpose,'REPAIR_EVIDENCE');
});
test('actual disassembly return quantity is submitted without using BOM quantity',()=>{
const s=setup();s.p.data.disassemblyRows=[{bom_item_id:1,quantity:10,actualQuantity:'2'},{bom_item_id:2,quantity:5,actualQuantity:''}];
s.p.completeDisassembly();assert.equal(s.action.data.parts.length,1);assert.equal(s.action.data.parts[0].quantity,'2');
});

test('old return requires separate waybill and device photos and never scans for v5 or v6',()=>{
for(const version of [5,6]) {
const s=setup();s.p.data.detail.replacement_flow={protocol_version:version,legs:[{id:13,direction:'OLD'}]};
s.p.sendReplacementLeg({currentTarget:{dataset:{id:13}}});assert.equal(s.action,undefined);assert.match(s.toast,/物流单/);assert.equal(s.scan,undefined);
s.p.onOldReturnDeviceMedia({detail:{files:[{path:'old.jpg',media_type:'IMAGE'}]}});
s.p.onOldReturnLogisticsMedia({detail:{files:[{path:'waybill.jpg',media_type:'IMAGE'}]}});
s.p.sendReplacementLeg({currentTarget:{dataset:{id:13}}});
assert.equal(s.scan,undefined);assert.equal(s.action.data.action,'SEND_REPLACEMENT_LEG');assert.equal(s.action.data.old_return_upload,true);
assert.equal(s.action.purpose,'REPAIR_RETURN_SHIPMENT_DOCUMENT');assert.equal(s.action.data.qr_text,undefined);
}
});

test('old return sends the selected uploaded proof IDs after successful upload',async()=>{
const s=setup();s.p.uploadActionMedia=()=>Promise.resolve();s.p.loadDetail=()=>Promise.resolve();
s.p.data.actionMedia=[{oldReturnKind:'DEVICE',serverMediaId:71,evidenceScopeKey:'old:13:send',clientUploadId:'device-upload'},{oldReturnKind:'LOGISTICS',serverMediaId:72,evidenceScopeKey:'old:13:send',clientUploadId:'logistics-upload'}];
s.actualRunAction.call(s.p,{endpoint:'/escalation/',purpose:'REPAIR_RETURN_SHIPMENT_DOCUMENT',data:{action:'SEND_REPLACEMENT_LEG',leg_id:13,old_return_upload:true}});
await new Promise(resolve=>setImmediate(resolve));
assert.deepEqual(Array.from(s.request.data.device_image_ids),[71]);assert.deepEqual(Array.from(s.request.data.logistics_document_ids),[72]);
assert.equal(s.request.data.old_return_upload,undefined);assert.equal(s.request.data.qr_text,undefined);
});
test('failed return upload cannot submit or clear selected proofs',async()=>{
const s=setup();s.p.uploadActionMedia=()=>Promise.reject(new Error('upload failed'));s.p.data.actionMedia=[{oldReturnKind:'DEVICE',path:'old.jpg'}];
s.actualRunAction.call(s.p,{endpoint:'/escalation/',purpose:'REPAIR_RETURN_SHIPMENT_DOCUMENT',data:{old_return_upload:true}});
await new Promise(resolve=>setImmediate(resolve));assert.equal(s.request,undefined);assert.equal(s.p.data.actionMedia.length,1);assert.equal(s.p.data.submitting,false);
});
