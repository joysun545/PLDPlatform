const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function setup(){
 let p,modal,submitted,toast;const requests=[];
 const app={globalData:{apiBase:'/api'},authHeader:()=>({})};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../pages/aftersale/detail/detail.js'),'utf8'),{
  getApp:()=>app,Page:x=>{p=x;},wx:{request:r=>requests.push(r),showModal:r=>{modal=r;},showToast:r=>{toast=r.title;}},console
 });
 p.data=JSON.parse(JSON.stringify(p.data));
 p.setData=values=>{for(const [key,val] of Object.entries(values)){
  const parts=key.split('.');let target=p.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=val;
 }};
 p.data.applicationId=26;
 p.data.detail={triage_options:{preliminary_fault_types:[{value:'COMPONENT_SUSPECTED'}],routes:[{value:'ORIGINAL_INSTALLER'},{value:'SERVICE_STATION'}],candidates:[]}};
 Object.assign(p.data.triage,{route:'ORIGINAL_INSTALLER',routeIndex:0,faultIndex:0,preliminaryMaterials:['7'],diagnosisNote:'缺料诊断',repairPlan:'更换配件'});
 p.runAction=x=>{submitted=x;};
 return {p,requests,get modal(){return modal;},get submitted(){return submitted;},get toast(){return toast;}};
}
const missing={status:'MISSING_PARTS',message:'原装车组织缺少控制器',confirmation_token:'signed-proof',missing_materials:[{material_name:'控制器'}],
 nearest_station:{station_application_id:18,organization:'最近站',distance_label:'2公里'}};
function response(result){return {statusCode:200,data:{code:0,data:{original_installer_check:result}}};}

test('missing stock preview neither dispatches nor changes route; cancel sends nothing',async()=>{
 const s=setup();const loading=s.p.loadOriginalInstallerCheck();
 s.requests[0].success(response(missing));await loading;
 assert.equal(s.p.data.triage.route,'ORIGINAL_INSTALLER');assert.equal(s.submitted,undefined);
 s.p.confirmOriginalInstallerFallback();assert.match(s.modal.content,/最近站/);
 s.modal.success({confirm:false});assert.equal(s.submitted,undefined);
 s.p.submitTriage();assert.equal(s.submitted,undefined);assert.match(s.toast,/未通过/);
});
test('explicit confirmation sends nearest station and signed acknowledgement',async()=>{
 const s=setup();const loading=s.p.loadOriginalInstallerCheck();s.requests[0].success(response(missing));await loading;
 s.p.confirmOriginalInstallerFallback();s.modal.success({confirm:true});
 assert.equal(s.submitted.data.dispatch_route,'SERVICE_STATION');
 assert.equal(s.submitted.data.service_station_application_id,18);
 assert.equal(s.submitted.data.original_installer_fallback_confirmed,true);
 assert.equal(s.submitted.data.original_installer_fallback_token,'signed-proof');
});
test('changed material selection invalidates preview and modal confirmation',async()=>{
 const s=setup();const first=s.p.loadOriginalInstallerCheck();s.requests[0].success(response(missing));await first;
 s.p.confirmOriginalInstallerFallback();const modal=s.modal;
 s.p.onTriageMaterials({detail:{value:['8']}});
 modal.success({confirm:true});assert.equal(s.submitted,undefined);
 s.requests[1].success(response({status:'MISSING_PARTS',message:'没有库存满足的站点',nearest_station:null}));
 await Promise.resolve();await Promise.resolve();
 s.p.confirmOriginalInstallerFallback();assert.equal(s.submitted,undefined);
});
test('stale response after switching route is ignored',async()=>{
 const s=setup();const first=s.p.loadOriginalInstallerCheck();s.p.data.triage.route='SERVICE_STATION';
 s.requests[0].success(response(missing));await first;
 assert.equal(s.p.data.triage.originalInstallerCheck,null);
});
test('valid installer is selected only after current stock check',async()=>{
 const s=setup();s.p.submitTriage();assert.equal(s.submitted,undefined);
 const loading=s.p.loadOriginalInstallerCheck();s.requests[0].success(response({status:'READY',message:'有库存',original_installer:{user_id:59,available:true}}));await loading;
 s.p.submitTriage();assert.equal(s.submitted.data.dispatch_route,'ORIGINAL_INSTALLER');assert.equal(s.submitted.data.assigned_user_id,59);
});
