const app=getApp();
Page({
  data:{loading:false,submitting:false,error:'',plan:null,plans:[],merchants:[],merchantIndex:0,canCreate:false,pendingCount:0,businessContext:false},
  onLoad(options){this.planId=options.id || '';this.orderId=options.order_id || '';this.setData({businessContext:!!(this.planId || this.orderId)});app.ensureLogin(ok=>{if(ok)this.load();});},
  onShow(){if(this.loaded)this.load();},
  request(method,data){return new Promise((resolve,reject)=>wx.request({url:app.globalData.apiBase+'/sales/replacement-supply-plans/'+(this.planId?this.planId+'/':'')+(this.orderId?'?order_id='+this.orderId:''),method,data,header:app.authHeader(method==='POST'?'application/json':null),success:r=>{if(r.statusCode>=200&&r.statusCode<300&&r.data&&r.data.code===0)resolve(r.data.data);else reject(new Error((r.data&&r.data.msg)||'补发计划操作失败'));},fail:()=>reject(new Error('网络错误'))}));},
  load(){this.setData({loading:true,error:''});return this.request('GET').then(d=>{this.loaded=true;this.setData({plan:d.plan||null,plans:d.plans||[],merchants:d.merchants||[],canCreate:!!d.can_create,pendingCount:d.pending_count||0});}).catch(e=>this.setData({error:e.message})).finally(()=>this.setData({loading:false}));},
  chooseMerchant(e){this.requestKey='';this.setData({merchantIndex:Number(e.detail.value)});},
  create(){if(this.data.submitting)return;const m=this.data.merchants[this.data.merchantIndex];if(!m)return wx.showToast({title:'没有可单独安排的待补发需求',icon:'none'});
    if(!this.requestKey)this.requestKey='supply-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    this.setData({submitting:true});this.request('POST',{merchant_id:m.id,client_request_id:this.requestKey}).then(d=>{this.planId=d.plan.id;this.setData({plan:d.plan,plans:[],canCreate:false,error:''});}).catch(e=>this.setData({error:e.message})).finally(()=>this.setData({submitting:false}));},
  openPlan(e){wx.navigateTo({url:'/pages/sales/replacement_supply/replacement_supply?id='+Number(e.currentTarget.dataset.id)});},
  openCase(e){wx.navigateTo({url:'/pages/aftersale/detail/detail?application_id='+Number(e.currentTarget.dataset.id)});},
  cancel(){if(this.data.submitting)return;wx.showModal({title:'取消未发货补发计划',content:'取消后释放待补发需求，可重新安排。',success:r=>{if(!r.confirm)return;this.setData({submitting:true});this.request('POST',{action:'CANCEL'}).then(d=>this.setData({plan:d.plan})).catch(e=>this.setData({error:e.message})).finally(()=>this.setData({submitting:false}));}});}
});
