const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){let p;const requests=[];
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.js'),'utf8'),{
getApp:()=>({globalData:{apiBase:'/api'},authHeader:()=>({})}),Page:x=>p=x,wx:{request:r=>requests.push(r)},console});
p.data=JSON.parse(JSON.stringify(p.data));p.setData=v=>Object.assign(p.data,v);
p.data.detail={actions:{can_escalation_request:true,can_repair_complete:true}};
return {p,requests};}
test('default repair; switching preserves both drafts and evidence without requests',()=>{
const {p,requests}=setup();assert.equal(p.data.repairActionMode,'COMPLETE');
p.data.repairSummary='已填写维修记录';p.data.escalationReason='无法修复';p.data.actionMedia=[{path:'/tmp/evidence.jpg'}];
p.showUnableRepair();assert.equal(p.data.repairActionMode,'UNABLE');p.data.repairCompleteExpanded=false;
p.showRepairComplete();assert.equal(p.data.repairActionMode,'COMPLETE');assert.equal(p.data.repairCompleteExpanded,true);
assert.equal(p.data.repairSummary,'已填写维修记录');assert.equal(p.data.escalationReason,'无法修复');assert.equal(p.data.actionMedia[0].path,'/tmp/evidence.jpg');assert.equal(requests.length,0);
});
test('submitting locks both switches; unauthorized role has no unable mode',()=>{
const {p}=setup();p.data.submitting=true;p.showUnableRepair();assert.equal(p.data.repairActionMode,'COMPLETE');
p.data.repairActionMode='UNABLE';p.showRepairComplete();assert.equal(p.data.repairActionMode,'UNABLE');
p.data.submitting=false;p.showRepairComplete();p.data.detail.actions.can_escalation_request=false;p.showUnableRepair();assert.equal(p.data.repairActionMode,'COMPLETE');
});
test('album silent refresh retains unable mode and attachments; phase change resets mode',async()=>{
const {p,requests}=setup();p.showUnableRepair();p.data.actionMedia=[{path:'photo'}];
let job=p.loadDetail(true);requests[0].success({statusCode:200,data:{code:0,data:{actions:{can_escalation_request:true}}}});await job;
assert.equal(p.data.repairActionMode,'UNABLE');assert.equal(p.data.actionMedia.length,1);
job=p.loadDetail(true);requests[1].success({statusCode:200,data:{code:0,data:{actions:{can_escalation_request:false}}}});await job;
assert.equal(p.data.repairActionMode,'COMPLETE');
});
