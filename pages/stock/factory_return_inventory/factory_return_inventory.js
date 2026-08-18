const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function prepareData(data, filterValue) {
  const counts = data.counts || {};
  const filterOptions = [
    { value: '', label: `全部状态（${data.total_count || 0}）` },
    ...(data.status_options || []).map(option => ({
      ...option,
      label: `${option.label}（${counts[option.value] || 0}）`
    }))
  ];
  const filterIndex = Math.max(
    0,
    filterOptions.findIndex(option => option.value === filterValue)
  );
  const items = (data.items || []).map(item => ({
    ...item,
    classifiedText: formatDate(item.classified_at),
    productionProcessedText: formatDate(item.production_processed_at),
    matchingProcessedText: formatDate(item.matching_processed_at)
  }));
  return {
    ...data,
    counts,
    items,
    filterOptions,
    filterIndex,
    filterValue: filterOptions[filterIndex].value,
    filteredItems: filterOptions[filterIndex].value
      ? items.filter(item => item.stock_status === filterOptions[filterIndex].value)
      : items
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    inventoryData: null,
    filterValue: ''
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadData();
    });
  },

  onShow() {
    if (this.data.inventoryData && app.globalData.access_token) this.loadData();
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
  },

  loadData(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/factory-returns/inventory/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '厂家退货库存加载失败'
          });
          return;
        }
        this.setData({
          loading: false,
          inventoryData: prepareData(body.data, this.data.filterValue)
        });
      },
      fail: () => this.setData({
        loading: false,
        errorMessage: '网络连接失败，请稍后重试'
      }),
      complete: () => done && done()
    });
  },

  retryLoad() {
    this.loadData();
  },

  onFilterChange(event) {
    const index = Number(event.detail.value);
    const source = this.data.inventoryData;
    if (!source) return;
    const option = (source.filterOptions || [])[index];
    if (!option) return;
    this.setData({
      filterValue: option.value,
      inventoryData: prepareData(source, option.value)
    });
  },

  openProcess(event) {
    const url = event.currentTarget.dataset.url || '';
    if (!url) return;
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: '退货处理页面打开失败', icon: 'none' })
    });
  }
});
