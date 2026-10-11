Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    eyebrow: { type: String, value: '' },
    title: { type: String, value: '' },
    metric: { type: String, value: '' },
    subtitle: { type: String, value: '' }
  },
  methods: {
    goBack() {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({ delta: 1 });
      } else {
        wx.switchTab({ url: '/pages/home/index/index' });
      }
    }
  }
});
