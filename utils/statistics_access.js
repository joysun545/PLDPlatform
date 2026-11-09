function statisticsAccessScope({ globalData }) {
  const {
    openid, access_token, organization_id, organization_type, role,
    is_platform_admin, delegated_role_codes, factory_root_id, operationRoot
  } = globalData;
  return JSON.stringify([
    openid, access_token, organization_id, organization_type, role, is_platform_admin,
    (delegated_role_codes || []).slice().sort(), factory_root_id, operationRoot && operationRoot.id
  ]);
}

function statisticsAccessError(response) {
  const body = response.data || {};
  if (response.statusCode === 401) return '登录已失效，请重新进入。';
  if (response.statusCode === 403 || body.error_code === 'STATISTICS_ACCESS_DENIED') {
    return body.msg || '当前身份无权查看统计数据。';
  }
  return '';
}

module.exports = { statisticsAccessScope, statisticsAccessError };
