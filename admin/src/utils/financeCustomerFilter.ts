type FinanceCustomerRow = {
  customer?: unknown
}

function customerFromRow(row: unknown): string {
  if (typeof row !== 'object' || row === null) return ''

  return normalizeFinanceCustomer((row as FinanceCustomerRow).customer)
}

export function normalizeFinanceCustomer(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function financeCustomerOptions(rows: unknown[]): string[] {
  const customers = rows.map(customerFromRow).filter(Boolean)

  return [...new Set(customers)].sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function filterFinanceRowsByCustomers<T>(
  rows: T[],
  selectedCustomers: string[]
): T[] {
  const selected = new Set(selectedCustomers.map(normalizeFinanceCustomer).filter(Boolean))
  if (selected.size === 0) return rows

  return rows.filter((row) => selected.has(customerFromRow(row)))
}

export function retainAvailableFinanceCustomers(
  selectedCustomers: string[],
  availableCustomers: string[]
): string[] {
  const available = new Set(availableCustomers)

  return selectedCustomers.filter((customer) => available.has(customer))
}

export function shouldApplyFinanceResponse(
  requestedTab: string,
  activeTab: string,
  requestId: number,
  latestRequestId: number
): boolean {
  return requestedTab === activeTab && requestId === latestRequestId
}
