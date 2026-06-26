import type { FinanceCategoryRule } from '@/types/report'

export const financeCategoryRules: FinanceCategoryRule[] = [
  { name: '办公', color: '#2563eb', keywords: ['办公', '纸', '笔', '打印', '文具'] },
  { name: '耗材', color: '#16a34a', keywords: ['耗材', '试剂', '坩埚', '瓶', '样袋'] },
  { name: '设备', color: '#7c3aed', keywords: ['设备', '仪器', '维修', '校准'] },
  { name: '交通', color: '#f97316', keywords: ['交通', '油费', '过路', '车', '快递'] },
  { name: '餐饮', color: '#dc2626', keywords: ['餐', '饭', '水', '饮料'] },
  { name: '线上服务', color: '#0891b2', keywords: ['线上', '软件', '云', '会员', '服务'] },
  { name: '其他', color: '#64748b', keywords: [] }
]
