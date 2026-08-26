Page({
  data: {
    error: ''
  },

  onLoad(options) {
    const applicationId = Number(options && options.application_id);
    if (!applicationId) {
      this.setData({ error: '售后申请参数缺失' });
      return;
    }
    wx.redirectTo({
      url: '/pages/aftersale/detail/detail?application_id=' + applicationId,
      fail: () => this.setData({ error: '无法打开售后详情' })
    });
  },

  backHome() {
    wx.reLaunch({ url: '/pages/home/index/index' });
  }
});
