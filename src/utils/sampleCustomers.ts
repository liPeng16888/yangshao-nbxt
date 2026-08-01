import type { Customer } from '@/types/customer'
import type { LabSampleInput } from '@/types/labSheet'

export type SampleCustomerRole = 'payer' | 'recipient'

type CustomerInputFields = Pick<
  LabSampleInput,
  | 'customerText'
  | 'customers'
  | 'recipientCustomerText'
  | 'recipientCustomers'
>

export function buildSampleCustomerPatch(
  role: SampleCustomerRole,
  names: string[],
  customers: Customer[]
): Partial<LabSampleInput> {
  const customerIds = customers.map((customer) => customer.id)
  const customerText = names.map((name) => name.trim()).filter(Boolean).join('、')

  if (role === 'recipient') {
    return {
      recipientCustomerId: customerIds[0],
      recipientCustomerIds: customerIds,
      recipientCustomers: customers,
      recipientCustomerText: customerText
    }
  }

  return {
    customerId: customerIds[0],
    customerIds,
    customers,
    customerText
  }
}

export function getPayerCustomerName(inputs: CustomerInputFields): string {
  return getCustomerName(inputs.customerText, inputs.customers)
}

export function getPayerCustomerDisplayText(inputs: CustomerInputFields): string {
  return getCustomerDisplayText(inputs.customerText, inputs.customers)
}

export function getRecipientCustomerName(inputs: CustomerInputFields): string {
  return getCustomerName(inputs.recipientCustomerText, inputs.recipientCustomers) || getPayerCustomerName(inputs)
}

export function getRecipientCustomerDisplayText(inputs: CustomerInputFields): string {
  return getCustomerDisplayText(inputs.recipientCustomerText, inputs.recipientCustomers) || getPayerCustomerDisplayText(inputs)
}

function getCustomerName(customerText: string | undefined, customers: Customer[] | undefined): string {
  return customerText?.trim() || customers?.map((customer) => customer.name.trim()).filter(Boolean).join('、') || ''
}

function getCustomerDisplayText(customerText: string | undefined, customers: Customer[] | undefined): string {
  const customerDisplayText = customers?.map(formatCustomerDisplayText).filter(Boolean).join('、') || ''
  return customerDisplayText || customerText?.trim() || ''
}

function formatCustomerDisplayText(customer: Customer): string {
  return [customer.name, customer.phone, customer.wechat, customer.wechatNickname, customer.note]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ')
}
