import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getReminders, markReminderRead } from '@/api/reminder'
import type { Reminder } from '@/types/reminder'

export const useReminderStore = defineStore('reminder', () => {
  const reminders = ref<Reminder[]>([])
  const loading = ref(false)
  const unreadCount = computed(() => reminders.value.filter((item) => !item.readAt).length)

  async function loadReminders() {
    loading.value = true
    try {
      reminders.value = await getReminders()
    } finally {
      loading.value = false
    }
  }

  async function markRead(id: string) {
    const saved = await markReminderRead(id)
    const index = reminders.value.findIndex((item) => item.id === id)
    if (index >= 0) reminders.value[index] = saved
  }

  return { reminders, loading, unreadCount, loadReminders, markRead }
})
