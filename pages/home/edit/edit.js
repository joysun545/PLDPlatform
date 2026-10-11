const app = getApp();

function asNumberSet(values) {
  return new Set((values || []).map(value => Number(value)));
}

function uniqueNumbers(values) {
  return Array.from(asNumberSet(values));
}

function withCheckedState(rows, selectedIds) {
  const selected = asNumberSet(selectedIds);
  return (rows || []).map(row => ({
    ...row,
    checked: selected.has(Number(row.id))
  }));
}

function availableBrands(brands) {
  // A brand can contain several independently selectable categories. Keep the
  // full parent-authorized brand list visible while editing so the same brand
  // can be selected again and existing scopes can be revisited.
  return (brands || []).slice();
}

function buildDraftFromSelected(selected) {
  return (selected || []).map(brand => ({
    brand_id: brand.id,
    brand_name: brand.name,
    categories: (brand.categories || []).map(category => ({
      category_id: category.id,
      category_name: category.name,
      product_model_ids: (category.models || []).map(model => model.id),
      product_models: category.models || []
    }))
  }));
}

function catalogFocusOffset() {
  let windowInfo = {};
  try {
    windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  } catch (e) {}
  const width = Number(windowInfo.windowWidth) || 375;
  const statusHeight = Number(windowInfo.statusBarHeight) || 20;
  const appearance = (app.globalData && app.globalData.appearance) || {};
  const style = appearance.style_scheme || 'flow';
  const heroHeightRpx = style === 'order' ? 166 : (style === 'layer' ? 198 : 186);
  // Match the fixed global header, three-line page-title reserve, and page top
  // padding so the merchant heading lands just below the fixed title area.
  return Math.ceil(statusHeight + (heroHeightRpx + 228) * width / 750 + 8);
}

Page({
  data: {
    loading: true,
    loadError: '',
    channelError: '',
    manager: null,
    subordinates: [],
    editingInvitationId: null,
    editingMerchantId: null,
    regionDraft: '',
    saving: false,
    savingAfterSalesOrganizationId: null,
    catalogEditor: null,
    catalogLoading: false,
    catalogSaving: false
  },

  onLoad() {
    app.ensureLogin(ok => {
      if (!ok) {
        this.setData({
          loading: false,
          loadError: '登录失败，请重新进入小程序'
        });
        return;
      }
      this.loadSubordinates();
    });
  },

  onPullDownRefresh() {
    this.loadSubordinates(() => wx.stopPullDownRefresh());
  },

  loadSubordinates(done) {
    this.setData({
      loading: true,
      loadError: '',
      channelError: '',
      editingInvitationId: null,
      editingMerchantId: null,
      catalogEditor: null
    });

    wx.request({
      url: `${app.globalData.apiBase}/account/subordinates/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          this.setData({
            loading: false,
            loadError: '登录状态已失效，请重新进入小程序'
          });
          return;
        }

        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({
            loading: false,
            loadError: body.msg || '下级账号加载失败'
          });
          return;
        }

        const subordinates = (body.data.items || []).map(item => ({
          ...item,
          channel: null,
          catalog_brand_ids: item.catalog_brand_ids || [],
          catalog_brand_names: item.catalog_brand_names || [],
          catalog_brand_label: item.catalog_brand_label || '未配置',
          has_operating_categories: !!item.has_operating_categories,
          operating_category_count: Number(item.operating_category_count || 0)
        }));
        this.setData({
          manager: body.data.manager || null,
          subordinates
        });

        if (subordinates.some(item => item.management_mode === 'merchant_channel')) {
          this.loadMerchantChannels(done);
          return;
        }

        this.setData({ loading: false });
      },
      fail: () => {
        this.setData({
          loading: false,
          loadError: '网络连接失败，请稍后重试'
        });
      },
      complete: res => {
        if (!(
          res &&
          res.data &&
          res.data.code === 0 &&
          res.data.data &&
          (res.data.data.items || []).some(
            item => item.management_mode === 'merchant_channel'
          )
        )) {
          done && done();
        }
      }
    });
  },

  loadMerchantChannels(done) {
    wx.request({
      url: `${app.globalData.apiBase}/sales/order-plans/options/`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          this.setData({
            channelError: body.msg || '商家区域和品牌资料加载失败'
          });
          return;
        }

        const channelMap = {};
        (body.data.direct_merchants || []).forEach(item => {
          channelMap[item.id] = item;
        });
        this.setData({
          subordinates: this.data.subordinates.map(item => ({
            ...item,
            channel: channelMap[item.organization.id] || null
          }))
        });
      },
      fail: () => {
        this.setData({
          channelError: '商家区域和品牌资料暂时无法加载'
        });
      },
      complete: () => {
        this.setData({ loading: false });
        done && done();
      }
    });
  },

  retryLoad() {
    this.loadSubordinates();
  },

  goInvite() {
    wx.navigateTo({ url: '/pages/home/invite/invite/invite' });
  },

  onAfterSalesQualificationChange(e) {
    const organizationId = Number(e.currentTarget.dataset.organizationId);
    const values = (e.detail && e.detail.value) || [];
    const providesAfterSales = Array.isArray(values) && values.includes('enabled');
    const subordinate = this.data.subordinates.find(item =>
      item.organization.id === organizationId &&
      item.organization.type_code === 'MERCHANT' &&
      item.role.code === 'merchant_owner'
    );

    if (!organizationId || !subordinate) return;
    if (!subordinate.has_operating_categories && providesAfterSales) {
      wx.showToast({ title: '请先保存商家的经营品类', icon: 'none' });
      return;
    }
    if (this.data.savingAfterSalesOrganizationId) return;
    if (!!subordinate.organization.provides_after_sales === providesAfterSales) return;

    this.setData({ savingAfterSalesOrganizationId: organizationId });
    let saved = false;
    wx.request({
      url: `${app.globalData.apiBase}/account/subordinates/after-sales-qualification/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        organization_id: organizationId,
        provides_after_sales: providesAfterSales
      },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }

        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '售后服务资格更新失败', icon: 'none' });
          return;
        }

        const result = body.data;
        this.setData({
          subordinates: this.data.subordinates.map(item => (
            item.organization.id === result.organization_id
              ? {
                  ...item,
                  organization: {
                    ...item.organization,
                    provides_after_sales: !!result.provides_after_sales
                  }
                }
              : item
          ))
        });
        saved = true;
        wx.showToast({
          title: result.provides_after_sales ? '已开通售后服务资格' : '已取消售后服务资格',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
      },
      complete: () => {
        const updates = { savingAfterSalesOrganizationId: null };
        if (!saved) {
          updates.subordinates = this.data.subordinates.map(item => ({
            ...item,
            organization: { ...item.organization }
          }));
        }
        this.setData(updates);
      }
    });
  },

  startEdit(e) {
    const invitationId = Number(e.currentTarget.dataset.invitationId);
    const subordinate = this.data.subordinates.find(
      item => item.invitation_id === invitationId
    );
    if (!subordinate || subordinate.management_mode !== 'merchant_channel') {
      return;
    }
    if (!subordinate.channel) {
      wx.showToast({ title: '渠道资料尚未加载，请下拉刷新', icon: 'none' });
      return;
    }

    this.setData({
      editingInvitationId: invitationId,
      editingMerchantId: subordinate.organization.id,
      regionDraft: subordinate.channel.region || subordinate.organization.region || ''
    });
  },

  cancelEdit() {
    if (this.data.saving) return;
    this.setData({
      editingInvitationId: null,
      editingMerchantId: null,
      regionDraft: ''
    });
  },

  onRegionInput(e) {
    this.setData({ regionDraft: e.detail.value });
  },

  saveMerchantChannel() {
    const invitationId = this.data.editingInvitationId;
    const merchantId = this.data.editingMerchantId;
    const region = (this.data.regionDraft || '').trim();
    const subordinate = this.data.subordinates.find(
      item => item.organization.id === merchantId
    );
    // The region endpoint still requires the legacy single-brand field. Keep
    // that contract without exposing another brand editor or changing an
    // existing assignment. For a new assignment, use the first saved scope.
    const brandId = (
      subordinate && subordinate.channel && subordinate.channel.brand
        ? subordinate.channel.brand.id
        : null
    ) || (subordinate && (subordinate.catalog_brand_ids || [])[0]);

    if (!invitationId || !merchantId || !subordinate) return;
    if (!region) {
      wx.showToast({ title: '请填写负责区域', icon: 'none' });
      return;
    }
    if (!brandId) {
      wx.showToast({ title: '请先编辑品牌、品类和产品型号', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    wx.request({
      url: `${app.globalData.apiBase}/sales/direct-merchants/configure/`,
      method: 'POST',
      header: app.authHeader('application/json'),
      data: {
        merchant_id: merchantId,
        brand_id: brandId,
        region
      },
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }

        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '保存失败', icon: 'none' });
          return;
        }

        const saved = body.data;
        this.setData({
          subordinates: this.data.subordinates.map(item => (
            item.invitation_id === invitationId
              ? {
                  ...item,
                  organization: {
                    ...item.organization,
                    region: saved.region
                  },
                  channel: {
                    ...(item.channel || {}),
                    configured: true,
                    region: saved.region,
                    brand: saved.brand
                  }
                }
              : item
          )),
          editingInvitationId: null,
          editingMerchantId: null,
          regionDraft: ''
        });
        wx.showToast({ title: '下级资料已保存', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
      },
      complete: () => this.setData({ saving: false })
    });
  },

  openCatalogEditor(e) {
    const organizationId = Number(e.currentTarget.dataset.organizationId);
    const subordinate = this.data.subordinates.find(
      item => item.organization.id === organizationId
    );
    if (!subordinate || !['merchant_channel', 'merchant_catalog'].includes(subordinate.management_mode)) {
      return;
    }

    this.setData({
      catalogLoading: true,
      catalogEditor: {
        organizationId,
        organizationName: subordinate.organization.name,
        brands: [],
        draft: [],
        brandIndex: -1,
        currentCategories: [],
        selectedCategoryIds: [],
        selectedModelIds: []
      }
    });

    wx.request({
      url: `${app.globalData.apiBase}/account/subordinates/merchant-catalog/?organization_id=${organizationId}`,
      method: 'GET',
      header: app.authHeader(),
      success: res => {
        if (res.statusCode === 401) {
          app.reauthenticate();
          wx.showToast({ title: '登录状态已失效', icon: 'none' });
          return;
        }
        const body = res.data || {};
        if (body.code !== 0 || !body.data) {
          wx.showToast({ title: body.msg || '经营范围加载失败', icon: 'none' });
          this.setData({ catalogEditor: null });
          return;
        }

        const data = body.data;
        const selectedDraft = buildDraftFromSelected(data.selected);
        const catalogBrandIds = selectedDraft.map(scope => Number(scope.brand_id));
        const catalogBrandNames = selectedDraft.map(scope => scope.brand_name);
        const catalogBrandLabel = catalogBrandNames.length
          ? catalogBrandNames.join('、')
          : '未配置';
        const effectiveCategoryIds = data.after_sales_category_ids || [];
        this.setData({
          subordinates: this.data.subordinates.map(item => (
            item.organization.id === organizationId
              ? {
                  ...item,
                  catalog_brand_ids: catalogBrandIds,
                  catalog_brand_names: catalogBrandNames,
                  catalog_brand_label: catalogBrandLabel,
                  has_operating_categories: effectiveCategoryIds.length > 0,
                  operating_category_count: effectiveCategoryIds.length,
                  organization: {
                    ...item.organization,
                    provides_after_sales: !!data.provides_after_sales
                  }
                }
              : item
          )),
          catalogEditor: {
            organizationId,
            organizationName: data.organization.name,
            brands: data.brands || [],
            draft: selectedDraft,
            availableBrands: availableBrands(
              data.brands || [],
              selectedDraft
            ),
            brandIndex: -1,
            currentCategories: [],
            currentModels: [],
            selectedCategoryIds: [],
            selectedModelIds: []
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '经营范围暂时无法加载', icon: 'none' });
        this.setData({ catalogEditor: null });
      },
      complete: () => this.setData({ catalogLoading: false })
    });
  },

  closeCatalogEditor() {
    if (this.data.catalogSaving) return;
    this.setData({ catalogEditor: null });
  },

  focusCatalogOrganization(organizationId) {
    const id = Number(organizationId);
    if (!Number.isFinite(id) || id <= 0 || typeof wx.pageScrollTo !== 'function') return;
    wx.pageScrollTo({
      selector: `#merchant-catalog-focus-${id}`,
      offsetTop: -catalogFocusOffset(),
      duration: 180
    });
  },

  availableCatalogBrands() {
    const editor = this.data.catalogEditor;
    return editor ? availableBrands(editor.brands, editor.draft) : [];
  },

  onCatalogBrandChange(e) {
    if (!this.data.catalogEditor) return;
    const index = Number(e.detail.value);
    const brands = this.availableCatalogBrands();
    const brand = brands[index];
    const editor = this.data.catalogEditor;
    const existingScope = brand && (editor.draft || []).find(
      scope => Number(scope.brand_id) === Number(brand.id)
    );
    const existingCategories = existingScope && existingScope.categories || [];
    const selectedCategoryIds = existingCategories.map(category => category.category_id);
    const existingModelIds = existingCategories.reduce(
      (all, category) => all.concat(category.product_model_ids || []),
      []
    );
    let currentModels = [];
    if (selectedCategoryIds.length === 1 && brand) {
      const selectedCategory = (brand.categories || []).find(
        category => Number(category.id) === Number(selectedCategoryIds[0])
      );
      currentModels = selectedCategory && selectedCategory.models || [];
    } else if (selectedCategoryIds.length > 1 && brand) {
      const selectedSet = asNumberSet(selectedCategoryIds);
      currentModels = (brand.categories || [])
        .filter(category => selectedSet.has(Number(category.id)))
        .reduce((all, category) => all.concat(category.models || []), []);
    }
    this.setData({
      catalogEditor: {
        ...editor,
        brandIndex: Number.isNaN(index) ? -1 : index,
        currentCategories: withCheckedState(
          brand ? (brand.categories || []) : [],
          selectedCategoryIds
        ),
        currentModels: withCheckedState(currentModels, existingModelIds),
        selectedCategoryIds,
        selectedModelIds: uniqueNumbers(existingModelIds)
      }
    });
  },

  onCatalogCategoryChange(e) {
    const editor = this.data.catalogEditor;
    if (!editor) return;
    const ids = uniqueNumbers((e.detail && e.detail.value) || []);
    let selectedModelIds = [];
    let currentModels = [];
    if (ids.length === 1) {
      const selected = editor.currentCategories.find(item => Number(item.id) === ids[0]);
      const brand = (editor.availableBrands || [])[editor.brandIndex];
      const existingScope = brand && (editor.draft || []).find(
        scope => Number(scope.brand_id) === Number(brand.id)
      );
      const existingCategory = existingScope && (existingScope.categories || []).find(
        category => Number(category.category_id) === ids[0]
      );
      selectedModelIds = existingCategory
        ? (existingCategory.product_model_ids || [])
        : (selected && selected.models || []).map(model => model.id);
      currentModels = selected && selected.models || [];
    } else if (ids.length > 1) {
      const selectedSet = asNumberSet(ids);
      currentModels = (editor.currentCategories || [])
        .filter(category => selectedSet.has(Number(category.id)))
        .reduce((all, category) => all.concat(category.models || []), []);
      selectedModelIds = currentModels.map(model => model.id);
    }
    const normalizedModelIds = uniqueNumbers(selectedModelIds);
    const selectedCategorySet = asNumberSet(ids);
    this.setData({
      catalogEditor: {
        ...editor,
        selectedCategoryIds: ids,
        currentCategories: (editor.currentCategories || []).map(category => ({
          ...category,
          checked: selectedCategorySet.has(Number(category.id))
        })),
        currentModels: withCheckedState(currentModels, normalizedModelIds),
        selectedModelIds: normalizedModelIds
      }
    });
  },

  selectAllCatalogCategories() {
    const editor = this.data.catalogEditor;
    if (!editor) return;
    const categories = editor.currentCategories || [];
    const modelRows = categories.reduce(
      (all, category) => all.concat(category.models || []),
      []
    );
    this.setData({
      catalogEditor: {
        ...editor,
        selectedCategoryIds: categories.map(category => category.id),
        currentCategories: withCheckedState(categories, categories.map(category => category.id)),
        currentModels: withCheckedState(modelRows, modelRows.map(model => model.id)),
        selectedModelIds: modelRows.map(model => model.id)
      }
    });
  },

  clearCatalogCategories() {
    const editor = this.data.catalogEditor;
    if (!editor) return;
    this.setData({
      catalogEditor: {
        ...editor,
        selectedCategoryIds: [],
        currentCategories: withCheckedState(editor.currentCategories, []),
        currentModels: [],
        selectedModelIds: []
      }
    });
  },

  onCatalogModelChange(e) {
    const editor = this.data.catalogEditor;
    if (!editor) return;
    const selectedModelIds = uniqueNumbers((e.detail && e.detail.value) || []);
    this.setData({
      catalogEditor: {
        ...editor,
        currentModels: withCheckedState(editor.currentModels, selectedModelIds),
        selectedModelIds
      }
    });
  },

  selectAllCatalogModels() {
    const editor = this.data.catalogEditor;
    if (!editor || editor.selectedCategoryIds.length !== 1) return;
    this.setData({
      catalogEditor: {
        ...editor,
        selectedModelIds: (editor.currentModels || []).map(model => model.id),
        currentModels: withCheckedState(
          editor.currentModels,
          (editor.currentModels || []).map(model => model.id)
        )
      }
    });
  },

  invertCatalogModels() {
    const editor = this.data.catalogEditor;
    if (!editor || editor.selectedCategoryIds.length !== 1) return;
    const selected = asNumberSet(editor.selectedModelIds);
    const selectedModelIds = (editor.currentModels || [])
      .filter(model => !selected.has(Number(model.id)))
      .map(model => model.id);
    this.setData({
      catalogEditor: {
        ...editor,
        selectedModelIds,
        currentModels: withCheckedState(editor.currentModels, selectedModelIds)
      }
    });
  },

  confirmCatalogBrand() {
    const editor = this.data.catalogEditor;
    if (!editor) return;
    const brand = this.availableCatalogBrands()[editor.brandIndex];
    if (!brand) {
      wx.showToast({ title: '请选择品牌', icon: 'none' });
      return;
    }
    const categorySet = asNumberSet(editor.selectedCategoryIds);
    const categories = (editor.currentCategories || []).filter(
      category => categorySet.has(Number(category.id))
    );
    if (!categories.length) {
      wx.showToast({ title: '请至少选择一个品类', icon: 'none' });
      return;
    }

    let pickedCategories;
    if (categories.length > 1) {
      // Multi-category selection means all models in each selected category.
      pickedCategories = categories.map(category => ({
        category_id: category.id,
        category_name: category.name,
        product_model_ids: (category.models || []).map(model => model.id),
        product_models: category.models || []
      }));
    } else {
      const category = categories[0];
      const modelSet = asNumberSet(editor.selectedModelIds);
      const models = (category.models || []).filter(model => modelSet.has(Number(model.id)));
      pickedCategories = [{
        category_id: category.id,
        category_name: category.name,
        product_model_ids: models.map(model => model.id),
        product_models: models
      }];
    }

    const modelCount = pickedCategories.reduce(
      (count, category) => count + category.product_model_ids.length,
      0
    );
    const summary = `${brand.name}：${pickedCategories.length} 个品类，${modelCount} 个型号`;
    wx.showModal({
      title: '确认当前品牌范围',
      content: `${summary}。确认后会更新待保存清单，仍可继续选择该品牌的其他品类或其他品牌。`,
      confirmText: '确认加入',
      success: result => {
        if (!result.confirm || !this.data.catalogEditor) return;
        const current = this.data.catalogEditor;
        const existingScope = (current.draft || []).find(
          scope => Number(scope.brand_id) === Number(brand.id)
        );
        const incomingScope = {
          brand_id: brand.id,
          brand_name: brand.name,
          categories: pickedCategories
        };
        const mergedCategories = new Map(
          ((existingScope && existingScope.categories) || []).map(category => [
            Number(category.category_id), category
          ])
        );
        pickedCategories.forEach(category => {
          mergedCategories.set(Number(category.category_id), category);
        });
        const mergedScope = {
          ...(existingScope || incomingScope),
          brand_name: brand.name,
          categories: Array.from(mergedCategories.values())
        };
        const nextDraft = existingScope
          ? current.draft.map(scope => (
              Number(scope.brand_id) === Number(brand.id) ? mergedScope : scope
            ))
          : current.draft.concat([mergedScope]);
        this.setData({
          catalogEditor: {
            ...current,
            draft: nextDraft,
            availableBrands: availableBrands(current.brands),
            brandIndex: -1,
            currentCategories: [],
            currentModels: [],
            selectedCategoryIds: [],
            selectedModelIds: []
          }
        }, () => {
          const activeEditor = this.data.catalogEditor;
          if (
            activeEditor &&
            Number(activeEditor.organizationId) === Number(current.organizationId)
          ) {
            this.focusCatalogOrganization(current.organizationId);
          }
        });
      }
    });
  },

  removeDraftCatalogBrand(e) {
    const brandId = Number(e.currentTarget.dataset.brandId);
    const editor = this.data.catalogEditor;
    if (!editor || this.data.catalogSaving) return;
    this.setData({
      catalogEditor: {
        ...editor,
        draft: editor.draft.filter(scope => Number(scope.brand_id) !== brandId),
        availableBrands: availableBrands(
          editor.brands,
          editor.draft.filter(scope => Number(scope.brand_id) !== brandId)
        ),
        brandIndex: -1,
        currentCategories: [],
        currentModels: [],
        selectedCategoryIds: [],
        selectedModelIds: []
      }
    });
  },

  saveAllCatalogScopes() {
    const editor = this.data.catalogEditor;
    if (!editor || this.data.catalogSaving) return;
    const payload = (editor.draft || []).map(brand => ({
      brand_id: brand.brand_id,
      categories: (brand.categories || []).map(category => ({
        category_id: category.category_id,
        product_model_ids: category.product_model_ids || []
      }))
    }));
    const clearAll = payload.length === 0;
    const content = clearAll
      ? '确认清空该商家的全部品牌、品类和型号经营范围？如果没有有效品类，售后服务资格会自动关闭。'
      : `确认保存 ${payload.length} 个品牌的经营范围？下级只能继承这些品类和型号。`;

    wx.showModal({
      title: '最终确认经营范围',
      content,
      confirmText: clearAll ? '确认清空' : '保存全部',
      success: result => {
        if (!result.confirm) return;
        this.setData({ catalogSaving: true });
        wx.request({
          url: `${app.globalData.apiBase}/account/subordinates/merchant-catalog/`,
          method: 'POST',
          header: app.authHeader('application/json'),
          data: {
            organization_id: editor.organizationId,
            catalog: payload
          },
          success: res => {
            if (res.statusCode === 401) {
              app.reauthenticate();
              wx.showToast({ title: '登录状态已失效', icon: 'none' });
              return;
            }
            const body = res.data || {};
            if (body.code !== 0 || !body.data) {
              wx.showToast({ title: body.msg || '经营范围保存失败', icon: 'none' });
              return;
            }
            const resultData = body.data;
            const hasCategories = (resultData.category_ids || []).length > 0;
            const catalogBrandIds = editor.draft.map(scope => Number(scope.brand_id));
            const catalogBrandNames = editor.draft.map(scope => scope.brand_name);
            this.setData({
              subordinates: this.data.subordinates.map(item => (
                item.organization.id === resultData.organization_id
                  ? {
                      ...item,
                      catalog_brand_ids: catalogBrandIds,
                      catalog_brand_names: catalogBrandNames,
                      catalog_brand_label: catalogBrandNames.length
                        ? catalogBrandNames.join('、')
                        : '未配置',
                      has_operating_categories: hasCategories,
                      operating_category_count: (resultData.category_ids || []).length,
                      organization: {
                        ...item.organization,
                        provides_after_sales: !!resultData.provides_after_sales
                      }
                    }
                  : item
              )),
              catalogEditor: null
            });
            wx.showToast({ title: '经营范围已保存', icon: 'success' });
          },
          fail: () => {
            wx.showToast({ title: '网络连接失败', icon: 'none' });
          },
          complete: () => this.setData({ catalogSaving: false })
        });
      }
    });
  },

  startEditCatalogFromCard(e) {
    this.openCatalogEditor(e);
  }
});
