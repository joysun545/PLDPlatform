const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const appConfig = require(path.join(ROOT, 'app.json'));
const theme = require(path.join(ROOT, 'utils/theme'));
const { ROUTES } = require(path.join(ROOT, 'utils/theme-routes'));

test('three colours and two supported styles produce exactly six valid combinations', () => {
  const colors = Object.keys(theme.COLOR_SCHEMES);
  const styles = Object.keys(theme.STYLE_SCHEMES);
  assert.deepEqual(colors, ['jade', 'ocean', 'amber']);
  assert.deepEqual(styles, ['flow', 'order']);
  const codes = new Set();
  for (const color_scheme of colors) {
    for (const style_scheme of styles) {
      const value = theme.normalize({ color_scheme, style_scheme });
      codes.add(value.option_code);
      const variables = theme.styleVariables(value);
      assert.match(variables, /--ui-primary:/);
      assert.match(variables, /--ui-card-radius:/);
      assert.match(variables, /--ui-surface:/);
      assert.match(variables, /--ui-field-bg:/);
    }
  }
  assert.equal(codes.size, 6);
  assert.equal(theme.normalize({ color_scheme: 'amber', style_scheme: 'layer' }).style_scheme, 'flow');
});

test('every registered page has one explicit hierarchy and uses the theme shell', () => {
  for (const route of appConfig.pages) {
    assert.ok(ROUTES[route], `missing route theme metadata: ${route}`);
    assert.ok(
      ['none', 'tab', 'primary', 'secondary', 'tertiary'].includes(ROUTES[route].level),
      `invalid hierarchy: ${route}`
    );
    const wxml = fs.readFileSync(path.join(ROOT, `${route}.wxml`), 'utf8');
    assert.match(wxml, /^<theme-shell(?:\s[^>]*)?>/, `missing theme shell: ${route}`);
    assert.match(wxml, /<\/theme-shell>\s*$/, `unclosed theme shell: ${route}`);
  }
});

test('tab pages are explicit and the custom tab bar is enabled', () => {
  assert.equal(appConfig.tabBar.custom, true);
  const tabRoutes = Object.entries(ROUTES)
    .filter(([, meta]) => meta.level === 'tab')
    .map(([route]) => route)
    .sort();
  assert.deepEqual(tabRoutes, [
    'pages/home/index/index',
    'pages/personal/center/center',
    'pages/scan/scan/scan'
  ]);
  assert.equal(appConfig.window.navigationStyle, 'custom');
});

test('tab pages omit route titles and non-tab pages use a shared three-line title component', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxml'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxss'), 'utf8');
  const logic = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.js'), 'utf8');
  assert.match(shell, /class="theme-header theme-header-tab"/);
  assert.match(shell, /class="tab-hero"/);
  assert.match(shell, /organization-line/);
  assert.match(shell, /theme-page-title-fixed/);
  assert.match(shell, /class="theme-page-title-fixed"/);
  assert.match(shell, /title="\{\{routeTitle\}\}"/);
  assert.doesNotMatch(shell, /一级页面|二级页面|三级页面/);
  const titleMarkup = fs.readFileSync(path.join(ROOT, 'components/theme-page-title/index.wxml'), 'utf8');
  const titleStyles = fs.readFileSync(path.join(ROOT, 'components/theme-page-title/index.wxss'), 'utf8');
  assert.match(titleMarkup, /global-page-title-back/);
  assert.match(titleMarkup, /global-page-title-first-line[\s\S]*global-page-title-back/);
  assert.match(titleStyles, /\.global-page-title\s*\{[^}]*height:\s*164rpx/);
  assert.match(titleStyles, /\.global-page-title-main\s*\{[^}]*-webkit-line-clamp:\s*1/);
  assert.match(titleStyles, /\.global-page-title-subtitle\s*\{[^}]*-webkit-line-clamp:\s*2/);
  assert.match(styles, /\.theme-header\s*\{[^}]*width:\s*100%/);
  assert.match(styles, /\.theme-header\s*\{[^}]*linear-gradient\(135deg, var\(--ui-gradient-start\), var\(--ui-gradient-end\)\)/s);
  assert.doesNotMatch(styles, /theme-style-layer/);
  assert.match(logic, /style_scheme \? themeValue\.style_scheme : 'flow'/);
  assert.match(logic, /headerOffset = statusHeight \+ heroHeightRpx \* rpxToPx/);
  assert.match(logic, /titleTop = headerOffset \+ 24 \* rpxToPx/);
  assert.match(logic, /bodyOffset = headerOffset \+ \(hasPageTitle \? 200 \* rpxToPx : 0\)/);
  assert.doesNotMatch(styles, /\.level-(?:secondary|tertiary) \.page-heading-title/);
});

test('theme settings omit the removed layer style and the redundant combinations card', () => {
  const setting = fs.readFileSync(path.join(ROOT, 'pages/theme/setting/setting.js'), 'utf8');
  const markup = fs.readFileSync(path.join(ROOT, 'pages/theme/setting/setting.wxml'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'pages/theme/setting/setting.wxss'), 'utf8');
  assert.doesNotMatch(setting, /name:\s*'层叠质感'/);
  assert.match(setting, /ALLOWED_STYLE_CODES/);
  assert.doesNotMatch(markup, /九种全局界面组合/);
  assert.doesNotMatch(styles, /style-layer/);
});

test('shared header prefers the explicit factory root name over the current organization', () => {
  const shellLogic = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.js'), 'utf8');
  const appLogic = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(shellLogic, /organizationName:\s*globalData\.factory_root_name\s*\|\|\s*appearance\.owner_organization_name/);
  assert.doesNotMatch(shellLogic, /organizationName:\s*globalData\.organization_name\s*\|\|/);
  assert.match(appLogic, /factory_root_name/);
});

test('the shared header stays pinned and reserves content space at every level', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxml'), 'utf8');
  const logic = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.js'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxss'), 'utf8');
  assert.match(styles, /\.theme-header\s*\{[^}]*position:\s*fixed/);
  assert.match(shell, /padding-top:\s*\{\{bodyOffset\}\}px/);
  assert.match(logic, /headerOffset\s*=\s*statusHeight\s*\+\s*heroHeightRpx/);
  assert.match(logic, /heroHeightRpx/);
  assert.match(logic, /hideHeader\s*\|\|\s*pageLevel\s*===\s*'none'/);
});

test('factory root name is restored, cached, and displayed in the shared branded header', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const shellLogic = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.js'), 'utf8');
  const shellMarkup = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxml'), 'utf8');
  assert.match(appSource, /factory_root_name:\s*data\.factory_root_name/);
  assert.match(appSource, /factory_root_name:\s*g\.factory_root_name/);
  assert.match(shellLogic, /globalData\.factory_root_name \|\| appearance\.owner_organization_name/);
  assert.match(shellMarkup, /{{organizationName}}/);
});

test('invite, subordinate management, and order list share one content title and avoid duplicate shell title', () => {
  const wxml = fs.readFileSync(path.join(ROOT, 'pages/home/invite/invite/invite.wxml'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'pages/home/invite/invite/invite.wxss'), 'utf8');
  const appStyles = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
  assert.match(wxml, /^<theme-shell title-eyebrow="组织邀请"/);
  assert.doesNotMatch(wxml, /<theme-page-title/);
  assert.doesNotMatch(wxml, /class="header"/);
  for (const route of ['pages/home/edit/edit', 'pages/sales/order_plan_list/order_plan_list']) {
    const page = fs.readFileSync(path.join(ROOT, `${route}.wxml`), 'utf8');
    assert.match(page, /^<theme-shell title-eyebrow=/);
    assert.doesNotMatch(page, /<theme-page-title/);
    assert.doesNotMatch(page, /class="page-header"/);
  }
  assert.equal((wxml.match(/<theme-page-title/g) || []).length, 0);
  assert.match(styles, /\.container\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(appStyles, /\.container\s*\{[^}]*padding:\s*200rpx/);
  assert.match(appConfig.usingComponents['theme-page-title'], /components\/theme-page-title\/index/);
});

test('custom tab icons use local-resource-safe WXSS primitives', () => {
  const markup = fs.readFileSync(path.join(ROOT, 'custom-tab-bar/index.wxml'), 'utf8');
  const styles = fs.readFileSync(path.join(ROOT, 'custom-tab-bar/index.wxss'), 'utf8');
  assert.match(markup, /class="home-roof"/);
  assert.match(markup, /class="scan-corner/);
  assert.match(markup, /class="my-head"/);
  assert.equal(/mask-image\s*:\s*url\(/.test(styles), false);
  assert.equal(/background(?:-image)?\s*:\s*url\(/.test(styles), false);
});

test('secondary page invitation and scan pictograms have all three theme variants', () => {
  for (const scheme of ['jade', 'ocean', 'amber']) {
    for (const icon of ['invite-role.png', 'scan-qrcode.png']) {
      const asset = path.join(ROOT, 'images', 'theme_icons', scheme, icon);
      assert.ok(fs.existsSync(asset), `missing themed icon: ${scheme}/${icon}`);
    }
  }
  const invite = fs.readFileSync(path.join(ROOT, 'pages/home/invite/invite/invite.wxml'), 'utf8');
  const scan = fs.readFileSync(path.join(ROOT, 'pages/scan/scan/scan.wxml'), 'utf8');
  assert.match(invite, /theme_icons\/\{\{iconTheme\}\}\/invite-role\.png/);
  assert.match(scan, /theme_icons\/\{\{iconTheme\}\}\/scan-qrcode\.png/);
  assert.doesNotMatch(invite, /src="\/images\/role_manage\.png"/);
  assert.doesNotMatch(scan, /src="\/images\/create_qrcode\.png"/);
});

test('relationship status and scan-result emphasis use theme tokens', () => {
  const subordinate = fs.readFileSync(path.join(ROOT, 'pages/home/edit/edit.wxss'), 'utf8');
  const scanResult = fs.readFileSync(path.join(ROOT, 'pages/scan/result/result.wxss'), 'utf8');
  assert.match(subordinate, /\.status\.configured\s*\{[^}]*var\(--ui-primary-soft\)[^}]*var\(--ui-primary-strong\)/s);
  assert.match(subordinate, /\.manager-role\s*\{[^}]*var\(--ui-primary-soft\)[^}]*var\(--ui-primary-strong\)/s);
  assert.match(scanResult, /\.value\.accent\s*\{[^}]*var\(--ui-primary-strong\)/s);
  assert.match(scanResult, /\.relation-value\s*\{[^}]*var\(--ui-primary-strong\)/s);
});

test('legacy fixed primary green is no longer present in page styles', () => {
  const files = [];
  function walk(directory) {
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name);
      const stat = fs.statSync(target);
      if (stat.isDirectory()) walk(target);
      else if (target.endsWith('.wxss')) files.push(target);
    }
  }
  walk(path.join(ROOT, 'pages'));
  walk(path.join(ROOT, 'components'));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').toLowerCase();
    assert.equal(source.includes('#07c160'), false, file);
    assert.equal(/#(?:08b879|08b978|08b86a|078f72|078d60|008e75|08a870|08a873|07a85d|07986f)\b/i.test(source), false, file);
  }
});


test('brand gradients and interactive text colors meet WCAG AA contrast', () => {
  function luminance(hex) {
    const rgb = hex.replace('#', '').match(/.{2}/g).map(value => parseInt(value, 16) / 255);
    const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  }
  function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }
  for (const color of Object.values(theme.COLOR_SCHEMES)) {
    assert.ok(contrast(color.gradientStart, '#FFFFFF') >= 4.5, `${color.name} gradient start`);
    assert.ok(contrast(color.gradientEnd, '#FFFFFF') >= 4.5, `${color.name} gradient end`);
    assert.ok(contrast(color.primaryStrong, '#FFFFFF') >= 4.5, `${color.name} primary action`);
  }
});

test('theme-driven accents do not retain fixed brand colors in known high-visibility surfaces', () => {
  const checks = [
    ['pages/sales/order_plan_list/order_plan_list.wxss', /#(?:047a49|41d989|078c4c|39705d)\b/i],
    ['pages/sales/create_plan/create_plan.wxss', /#(?:047a49|41d989|087e48|17734e)\b/i],
    ['pages/quality_trace/common.wxss', /#(?:07a963|07b967)\b/i],
    ['pages/data_statistics/dashboard/dashboard.wxss', /#058a64\b/i],
    ['pages/data_statistics/domain/domain.wxss', /#(?:058a64|09bd69|069b70)\b/i],
    ['pages/sales/order_plan_detail/order_plan_detail.wxss', /#(?:037d4b|08bf70|44d88e|05ba70|009c6b)\b/i],
    ['pages/theme/setting/setting.wxss', /#(?:09b96c|087f69|2e7cf6|174ea6|d7942c|8d5008)\b/i],
    ['pages/customer/device/list/list.wxss', /#(?:08b77a|eefbf6)\b/i],
    ['pages/customer/invite/accept/accept.wxss', /#(?:08bd79|079e79)\b/i],
    ['pages/scan/result/result.wxss', /#(?:09bb68|008d78|05a960)\b/i],
    ['components/aftersale-media-uploader/index.wxss', /#(?:08a85d|087f50|edf8f2)!?important/i]
  ];
  for (const [relative, pattern] of checks) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(source, pattern, `fixed brand color remains in ${relative}`);
  }
  const appStyles = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
  assert.match(theme.styleVariables(theme.DEFAULT_APPEARANCE), /--ui-surface-muted:/);
  assert.match(theme.styleVariables(theme.DEFAULT_APPEARANCE), /--ui-field-bg:/);
  assert.match(appStyles, /\.filter-item\.active[^}]*var\(--ui-primary-strong\)/s);
});


test('non-tab title floats over a transparent fixed layer and content reserves its full band', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxml'), 'utf8');
  const shellStyles = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxss'), 'utf8');
  const titleStyles = fs.readFileSync(path.join(ROOT, 'components/theme-page-title/index.wxss'), 'utf8');
  assert.match(shell, /class="theme-page-title-fixed" style="top: \{\{titleTop\}\}px;"/);
  assert.ok(shell.indexOf('theme-page-title-fixed') < shell.indexOf('theme-page-body'));
  assert.match(shellStyles, /\.theme-page-title-fixed\s*\{[^}]*position:\s*fixed/s);
  assert.match(shellStyles, /\.theme-page-title-fixed\s*\{[^}]*background:\s*transparent/s);
  assert.match(titleStyles, /height:\s*164rpx/);
  assert.match(titleStyles, /margin:\s*0/);
  assert.match(titleStyles, /global-page-title-back/);
});

test('task counts share the fixed title card without a duplicate summary card', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.wxml'), 'utf8');
  const shellLogic = fs.readFileSync(path.join(ROOT, 'components/theme-shell/index.js'), 'utf8');
  const titleWxml = fs.readFileSync(path.join(ROOT, 'components/theme-page-title/index.wxml'), 'utf8');
  const taskWxml = fs.readFileSync(path.join(ROOT, 'pages/personal/task_list/task_list.wxml'), 'utf8');
  assert.match(shellLogic, /titleMetric:\s*\{\s*type:\s*String/);
  assert.match(shell, /metric="\{\{titleMetric\}\}"/);
  assert.match(titleWxml, /global-page-title-main-row/);
  assert.match(titleWxml, /global-page-title-metric/);
  assert.match(taskWxml, /title-metric="\{\{attentionCount\}\} 项待关注"/);
  assert.match(taskWxml, /title-subtitle="\{\{unreadCount\}\} 未读 · \{\{actionPendingCount\}\} 待处理"/);
  assert.doesNotMatch(taskWxml, /class="summary"/);
});

test('theme setting and statistics pages do not repeat their fixed page title with hero cards', () => {
  const themeWxml = fs.readFileSync(path.join(ROOT, 'pages/theme/setting/setting.wxml'), 'utf8');
  const statsWxml = fs.readFileSync(path.join(ROOT, 'pages/data_statistics/dashboard/dashboard.wxml'), 'utf8');
  assert.doesNotMatch(themeWxml, /九种全局界面组合|class="intro-card"/);
  assert.doesNotMatch(statsWxml, /class="hero"|dashboardName/);
});

test('invite role choices use compact cards rather than theme control-pill buttons', () => {
  const inviteStyles = fs.readFileSync(path.join(ROOT, 'pages/home/invite/invite/invite.wxss'), 'utf8');
  assert.match(inviteStyles, /border-radius:\s*var\(--ui-card-radius\)\s*!important/);
  assert.match(inviteStyles, /width:\s*104rpx/);
  assert.match(inviteStyles, /min-height:\s*240rpx/);
});

test('all non-tab page templates rely on the one shell title, with repeated content headings removed', () => {
  for (const route of appConfig.pages) {
    const wxml = fs.readFileSync(path.join(ROOT, `${route}.wxml`), 'utf8');
    assert.doesNotMatch(wxml, /<theme-page-title/, `page-level title bypasses shell: ${route}`);
  }
  const duplicateHeadingPatterns = [
    ['pages/personal/task_list/task_list.wxml', /class="summary-title">我的任务/],
    ['pages/quality_trace/dashboard/dashboard.wxml', /class="hero-title">质量追溯控制台/],
    ['pages/quality_trace/rule_list/rule_list.wxml', /class="hero-title">预警规则/],
    ['pages/quality_trace/alert_list/alert_list.wxml', /class="hero-title">质量预警/],
    ['pages/quality_trace/case_list/case_list.wxml', /class="hero-title">质量案件/],
    ['pages/quality_trace/recall_list/recall_list.wxml', /class="hero-title">召回管理/],
    ['pages/supply_chain/aftersale_quality_list/aftersale_quality_list.wxml', /class="summary-title">售后质量通知/],
    ['pages/sales/create_plan/create_plan.wxml', /class="title">创建订单计划/],
    ['pages/customer/aftersale/request/request.wxml', /class="title">发起售后申请/],
    ['pages/supply_chain/warranty_list/warranty_list.wxml', /class="hero-title">供应商退货协同清单/],
    ['pages/supply_chain/warranty_notice/warranty_notice.wxml', /class="hero-title">供应商三包物料通知/]
  ];
  for (const [relative, pattern] of duplicateHeadingPatterns) {
    const wxml = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.doesNotMatch(wxml, pattern, `duplicate title remains in ${relative}`);
  }
});
