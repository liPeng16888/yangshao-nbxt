import request, { useMocks } from '@/utils/request'
import type { Reminder } from '@/types/reminder'

export async function getReminders(): Promise<Reminder[]> {
  if (useMocks) return []
  return request.get('/reminders')
}

export async function markReminderRead(id: string): Promise<Reminder> {
  if (useMocks) return { id, type: 'UNSETTLED_PAYMENT', title: '', content: '', readAt: new Date().toISOString(), createdAt: new Date().toISOString() }
  return request.patch(`/reminders/${id}/read`)
}
