const app=getApp();
Page({data:{id:null,detail:null,error:'',busy:false},onLoad(o){this.setData({id:Number(o.id)});app.ensureLogin(ok=>{if(ok)this.load();});},
load(){wx.request({url:app.globalData.apiBase+'/lifecycle/after-sales/replacement-material-returns/'+this.data.id+'/',header:app.authHeader(),success:r=>{
if(r.data&&r.data.code===0)this.setData({detail:r.data.data,error:''});else this.setData({error:(r.data&&r.data.msg)||'无法读取退料记录'});},fail:()=>this.setData({error:'网络错误'})});},
receive(){if(this.data.busy)return;wx.showModal({title:'确认三包退料签收',content:'请核对实物、物料规格和实际数量后确认。',success:r=>{if(!r.confirm)return;this.setData({busy:true});wx.request({
url:app.globalData.apiBase+'/lifecycle/after-sales/replacement-material-returns/'+this.data.id+'/',method:'POST',header:app.authHeader('application/json'),data:{confirmed:true},
success:x=>{if(x.data&&x.data.code===0){this.setData({detail:x.data.data});
// A committed receipt invalidates both the cached inbox cards and its counts.
try{app.refreshTasks();}catch(error){console.warn('三包退料签收已成功，任务刷新失败，请在任务页重试。',error);}
}else wx.showToast({title:(x.data&&x.data.msg)||'签收失败',icon:'none'});},complete:()=>this.setData({busy:false})});}});}});
