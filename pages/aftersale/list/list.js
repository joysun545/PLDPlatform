const app = getApp();

Page({
  data: {
    rows: [],
    loading: true,
    isCustomer: false,
    pageTitle: '售后服务',
    pageSubtitle: '申请、判断、维修与结案',
    emptyText: '暂无需要查看的售后单'
  },

  onShow() {
    app.ensureLogin(ok => {
      if (!ok) return;
      const isCustomer = ['customer_owner', 'driver'].includes(
        (app.globalData.role || '').trim()
      );
      this.setData({
        isCustomer,
        pageTitle: isCustomer ? '我的售后服务' : '售后服务',
        pageSubtitle: isCustomer
          ? '查看每台设备的申请进展、处理方案与结案结果'
          : '申请、判断、维修与结案',
        emptyText: isCustomer
          ? '暂无售后服务单，可从“我的设备”进入设备详情发起申请'
          : '暂无需要查看的售后单'
      });
      this.load();
    });
  },

  load() {
    wx.request({
      url: app.globalData.apiBase + '/lifecycle/after-sales/applications/',
      header: app.authHeader(),
      success: ({ data }) => {
        this.setData({ loading: false, rows: data && data.code === 0 ? data.data : [] });
        if (!data || data.code !== 0) {
          wx.showToast({ title: (data && data.msg) || '读取失败', icon: 'none' });
        }
      },
      fail: () => this.setData({ loading: false })
    });
  },

  open(e) {
    wx.navigateTo({
      url: '/pages/aftersale/detail/detail?application_id=' + e.currentTarget.dataset.id
    });
  }
});
