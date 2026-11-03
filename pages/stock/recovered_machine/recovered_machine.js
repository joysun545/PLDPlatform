const app=getApp();
Page({data:{items:[],error:''},onLoad(){app.ensureLogin(ok=>{if(ok)this.load();});},load(){wx.request({url:app.globalData.apiBase+'/lifecycle/after-sales/recovered-stock/',header:app.authHeader(),success:r=>{
if(r.data&&r.data.code===0)this.setData({items:r.data.data.items,error:''});else this.setData({error:(r.data&&r.data.msg)||'无法查询回收机库'});},fail:()=>this.setData({error:'网络错误'})});},open(e){wx.navigateTo({url:'/pages/aftersale/detail/detail?application_id='+Number(e.currentTarget.dataset.id)});}});
