import { request } from '../api'
import type {
  AdminSharedPrepaidDetail,
  AdminSharedPrepaidPage,
  AdminSharedPrepaidQuery,
  AdminSharedPrepaidResource
} from '../types/sharedPrepaid'

function params(query: AdminSharedPrepaidQuery) {
  return {
    ...query,
    frontendUserIds: query.frontendUserIds.join(','),
    ...(query.status ? { status: query.status } : {}),
    ...(query.payableStatus ? { payableStatus: query.payableStatus } : {})
  }
}

export function getAdminSharedPrepaidPage(
  resource: AdminSharedPrepaidResource,
  query: AdminSharedPrepaidQuery
): Promise<AdminSharedPrepaidPage> {
  return request.get(`/admin/shared-prepaid/${resource}`, { params: params(query) })
}

export function getAdminSharedPrepaidDetail(
  resource: AdminSharedPrepaidResource,
  id: string,
  frontendUserIds: string[]
): Promise<AdminSharedPrepaidDetail> {
  return request.get(`/admin/shared-prepaid/${resource}/${encodeURIComponent(id)}`, {
    params: { frontendUserIds: frontendUserIds.join(',') }
  })
}
