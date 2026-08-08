Page({
  data: { deviceId: null },

  onLoad(options) {
    this.setData({ deviceId: Number(options && options.device_id) || null });
  },

  goBack() {
    wx.navigateBack();
  }
});
