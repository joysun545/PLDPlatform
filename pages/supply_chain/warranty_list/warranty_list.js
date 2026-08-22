const app = getApp();

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function prepareData(data, focusDispatchId) {
  const returnCases = (data.return_cases || []).map(item => ({
    ...item,
    dismantledText: formatDate(item.dismantled_at),
    materialNamesText: (item.material_names || []).join('、'),
    focused: Number(item.dispatch_id) === Number(focusDispatchId)
  }));
  const faultMaterials = (data.fault_materials || []).map(item => {
    const evaluation = item.warranty_evaluation || {};
    return {
      ...item,
      dismantledText: formatDate(item.dismantled_at),
      warrantyPeriodText: evaluation.warranty_start_date && evaluation.warranty_end_date
        ? `${evaluation.warranty_start_date} 至 ${evaluation.warranty_end_date}`
        : '质保日期待补充',
      focused: Number(item.dispatch_id) === Number(focusDispatchId)
    };
  });
  const returnMaterials = (data.return_materials || []).map(item => {
    const evaluation = item.warranty_evaluation || {};
    return {
      ...item,
      returnedText: formatDate(item.returned_at),
      warrantyPeriodText: evaluation.warranty_start_date && evaluation.warranty_end_date
        ? `${evaluation.warranty_start_date} 至 ${evaluation.warranty_end_date}`
        : '质保日期待补充',
      focused: Number(item.dispatch_id) === Number(focusDispatchId)
    };
  });
  const repairMaterials = (data.repair_material_requests || []).map(item => {
    const evaluation = item.warranty_evaluation || {};
    return {
      ...item,
      requestedText: formatDate(item.requested_at),
      notifiedText: formatDate(item.notified_at),
      warrantyPeriodText: evaluation.warranty_start_date && evaluation.warranty_end_date
        ? `${evaluation.warranty_start_date} 至 ${evaluation.warranty_end_date}`
        : '质保日期待补充'
    };
  });
  return {
    ...data,
    return_cases: returnCases,
    return_materials: returnMaterials,
    fault_materials: faultMaterials,
    repair_material_requests: repairMaterials
  };
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    activeTab: 'cases',
    focusDispatchId: 0,
    taskGroupId: '',
    taskGroup: null,
    pageData: null
  },

  onLoad(options) {
    this.setData({
      focusDispatchId: Number((options || {}).dispatch_id || 0),
      taskGroupId: (options || {}).task_group_id || '',
      activeTab: (options || {}).tab === 'repair' ? 'repair' : 'cases'
    });
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({ loading: false, errorMessage: '登录失败，请重新进入小程序' });
        return;
      }
      this.loadData();
      this.loadTaskGroup();
    });
  },

  loadTaskGroup() {
    if (!this.data.taskGroupId) return;
    app.fetchTaskGroup(this.data.taskGroupId, body => {
      if (!body || body.code !== 0 || !body.data) return;
      this.setData({
        taskGroup: {
          ...body.data,
          items: (body.data.items || []).map(item => ({
            ...item,
            readStateName: item.state === 'NEW' ? '未读' : '已读',
            readClass: item.state === 'NEW' ? 'unread' : 'read'
          }))
        }
      });
    });
  },

  markGroupTaskRead(event) {
    const taskId = Number(event.currentTarget.dataset.taskId || 0);
    const task = ((this.data.taskGroup || {}).items || []).find(
      row => Number(row.id) === taskId
    );
    if (!task || task.state !== 'NEW') return;
    app.openUserTask(taskId, body => {
      if (!body || body.code !== 0) {
        wx.showToast({ title: (body && body.msg) || '任务读取失败', icon: 'none' });
        return;
      }
      this.loadTaskGroup();
    });
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh());
    this.loadTaskGroup();
  },

  loadData(done) {
    this.setData({ loading: true, errorMessage: '' });
    wx.request({
      url: `${app.globalData.apiBase}/lifecycle/supplier-warranty-lists/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (res.statusCode === 401 || body.code === 401) app.reauthenticate();
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            errorMessage: body.msg || '三包拆机清单加载失败'
          });
          return;
        }
        this.setData({
          loading: false,
          pageData: prepareData(body.data, this.data.focusDispatchId)
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

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  }
});
