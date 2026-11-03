const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){let p,modal,submitted,toast;
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.js'),'utf8'),{
 getApp:()=>({globalData:{},authHeader:()=>({})}),Page:x=>p=x,
 wx:{showModal:x=>modal=x,showToast:x=>toast=x.title},console});
 p.data=JSON.parse(JSON.stringify(p.data));p.setData=x=>Object.assign(p.data,x);p.runAction=x=>submitted=x;
 return {p,get modal(){return modal},get submitted(){return submitted},get toast(){return toast}};
}
test('unable repair requires reason and explicit confirmation; cancel does nothing',()=>{
 const s=setup();s.p.submitUnableRepair();assert.match(s.toast,/原因/);assert.equal(s.submitted,undefined);
 s.p.data.escalationReason='无法修复';s.p.submitUnableRepair();s.modal.success({confirm:false});assert.equal(s.submitted,undefined);
 s.p.submitUnableRepair();s.modal.success({confirm:true});assert.equal(s.submitted.data.action,'REQUEST');
 assert.equal(s.submitted.data.holder,'EXECUTOR');assert.equal(s.submitted.purpose,'REPAIR_EVIDENCE');
});
test('factory uses explicit repair fallback, with no reject action',()=>{
 const s=setup();s.p.submitEscalationDecision({currentTarget:{dataset:{decision:'FACTORY_REPAIR'}}});assert.equal(s.submitted,undefined);
 s.p.data.escalationAddress='厂家地址、王经理、13900000000';s.p.submitEscalationDecision({currentTarget:{dataset:{decision:'FACTORY_REPAIR'}}});
 s.modal.success({confirm:true});assert.equal(s.submitted.data.decision,'FACTORY_REPAIR');assert.equal(s.submitted.data.action,'DECIDE');
});
test('handover requires logistics for shipment but allows documented in-person handover',()=>{
 const s=setup();s.p.data.escalationHandoverNote='交接原设备';s.p.submitEscalationHandover();assert.equal(s.submitted,undefined);
 s.p.data.escalationHandoverMethod='IN_PERSON';s.p.submitEscalationHandover();
 assert.equal(s.submitted.data.action,'HANDOVER');assert.equal(s.submitted.purpose,'APPLICANT_SHIPMENT_DOCUMENT');
});
test('replacement requires new SN and delivery explanation',()=>{
 const s=setup();s.p.submitReplacementDelivery();assert.equal(s.submitted,undefined);
 s.p.data.escalationNewSN='NEW-SN';s.p.data.escalationDeliveryNote='已交付';s.p.submitReplacementDelivery();
 assert.equal(s.submitted.data.action,'DELIVER_REPLACEMENT');assert.equal(s.submitted.data.new_device_sn,'NEW-SN');
});
test('replacement confirmation checks received SN and requires explicit confirmation',()=>{
 const s=setup();s.p.data.detail={escalation:{new_device_sn:'NEW-SN'}};s.p.data.escalationNewSN='WRONG';s.p.submitReplacementConfirm();assert.equal(s.submitted,undefined);
 s.p.data.escalationNewSN='NEW-SN';s.p.submitReplacementConfirm();s.modal.success({confirm:false});assert.equal(s.submitted,undefined);
 s.p.submitReplacementConfirm();s.modal.success({confirm:true});assert.equal(s.submitted.data.confirmed,true);assert.equal(s.submitted.data.action,'CONFIRM_REPLACEMENT');
});
