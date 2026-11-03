const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function setup(){let p,scan,action,modal,toast;const requests=[];
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.js'),'utf8'),{
getApp:()=>({globalData:{apiBase:'/api'},authHeader:()=>({})}),Page:x=>p=x,
wx:{request:x=>requests.push(x),scanCode:x=>scan=x,showModal:x=>modal=x,showToast:x=>toast=x.title},console});
p.data=JSON.parse(JSON.stringify(p.data));p.setData=x=>Object.assign(p.data,x);p.runAction=x=>action=x;
p.data.detail={replacement_flow:{legs:[{id:10,direction:'USER',from_name:'服务站',to_name:'用户',device_sn:'NEW'},{id:11,direction:'SUPPLY',from_name:'厂家',to_name:'商家',device_sn:'SUPPLY'}]}};
return {p,requests,get scan(){return scan},get action(){return action},get modal(){return modal},get toast(){return toast}};}
test('stock replacement uses embedded camera scan and sends lifecycle code, not manual SN',()=>{
const s=setup();s.p.data.replacementNote='现场交接';s.p.scanReplacementStock();assert.equal(s.action,undefined);assert.equal(s.scan.onlyFromCamera,true);
s.scan.success({result:'https://joytest.site/d/NEW-LIFE'});assert.equal(s.action.data.action,'SCAN_SWAP');assert.equal(s.action.data.qr_text,'https://joytest.site/d/NEW-LIFE');assert.equal(s.action.purpose,'REPAIR_RETURN_SHIPMENT_DOCUMENT');
});
test('normal-shipment replenishment links carrier and never submits sales quantities',()=>{
const s=setup();s.p.data.replacementShipmentId='32';s.p.sendReplacementLeg({currentTarget:{dataset:{id:11}}});s.scan.success({result:'SUPPLY-LIFE'});
assert.equal(s.action.data.action,'SEND_REPLACEMENT_LEG');assert.equal(s.action.data.shipment_id,'32');assert.equal(s.action.data.leg_id,11);assert.equal(s.action.data.quantity,undefined);assert.equal(s.action.purpose,null);
});
test('customer receipt must scan received new lifecycle code and explicitly confirm',()=>{
const s=setup();s.p.data.replacementNote='核对签收';s.p.receiveReplacementLeg({currentTarget:{dataset:{id:10}}});assert.equal(s.action,undefined);
s.scan.success({result:'NEW-LIFE'});s.modal.success({confirm:false});assert.equal(s.action,undefined);
s.p.receiveReplacementLeg({currentTarget:{dataset:{id:10}}});s.scan.success({result:'NEW-LIFE'});s.modal.success({confirm:true});
assert.equal(s.action.data.action,'RECEIVE_REPLACEMENT_LEG');assert.equal(s.action.data.confirmed,true);assert.equal(s.action.data.qr_text,'NEW-LIFE');
});
test('factory replacement approval records flow version and mode',()=>{
const s=setup();s.p.data.escalationAddress='厂家维修地址';s.p.data.replacementExecutionMode='FACTORY';
s.p.submitEscalationDecision({currentTarget:{dataset:{decision:'REPLACEMENT'}}});s.modal.success({confirm:true});
assert.equal(s.action.data.replacement_flow_version,3);assert.equal(s.action.data.execution_mode,'FACTORY');
});
test('submitting prevents another scan or channel operation',()=>{
const s=setup();s.p.data.submitting=true;s.p.scanReplacementStock();s.p.sendReplacementLeg({currentTarget:{dataset:{id:11}}});assert.equal(s.scan,undefined);assert.equal(s.action,undefined);
});

test('shared carrier choice survives album refresh but clears when batch is no longer eligible',async()=>{
const s=setup();s.p.data.replacementShipmentId='32';s.p.data.replacementNote='核对物流';
let job=s.p.loadDetail(true);s.requests[0].success({statusCode:200,data:{code:0,data:{actions:{},replacement_flow:{shared_shipments:[{id:32,label:'同车批次'}]}}}});await job;
assert.equal(s.p.data.replacementShipmentId,'32');assert.equal(s.p.data.replacementShipmentIndex,1);assert.equal(s.p.data.replacementNote,'核对物流');
job=s.p.loadDetail(true);s.requests[1].success({statusCode:200,data:{code:0,data:{actions:{},replacement_flow:{shared_shipments:[]}}}});await job;
assert.equal(s.p.data.replacementShipmentId,'');
});
