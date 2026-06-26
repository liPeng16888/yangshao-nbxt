import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { addSampleBlocks, getCurrentLabSheet, getLabSheetByDate, saveSampleBlock, updateCurrentParameters } from '@/api/labSheet'
import type { LabParameter, LabSampleInput, LabSheet, SampleBlock } from '@/types/labSheet'
import { calculateSampleResults } from '@/utils/formulaEngine'
import { isPositiveInteger } from '@/utils/validators'

type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

const AUTO_SAVE_DELAY_MS = 900

export const useLabSheetStore = defineStore('labSheet', () => {
  const sheet = ref<LabSheet | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const adding = ref(false)
  const autoSaving = ref(false)
  const autoSaveStatus = ref<AutoSaveStatus>('idle')
  const lastAutoSavedAt = ref('')
  const autoSaveError = ref('')
  const pendingAutoSaveCount = ref(0)

  const autoSaveTimers = new Map<string, number>()
  const pendingBlockIds = new Set<string>()
  const blockVersions = new Map<string, number>()
  const activeAutoSavePromises = new Set<Promise<void>>()
  let activeAutoSaveCount = 0

  const currentParameters = computed(() => sheet.value?.parameters || null)
  const sampleBlocks = computed(() => sheet.value?.sampleBlocks || [])

  async function loadCurrentSheet() {
    await persistBeforeSheetChange()
    loading.value = true
    try {
      sheet.value = await getCurrentLabSheet()
    } finally {
      loading.value = false
    }
  }

  async function loadSheetByDate(date: string) {
    await persistBeforeSheetChange()
    loading.value = true
    try {
      sheet.value = await getLabSheetByDate(date)
    } finally {
      loading.value = false
    }
  }

  async function saveParameters(parameters: LabParameter) {
    if (!sheet.value) return
    saving.value = true
    try {
      const saved = await updateCurrentParameters(parameters)
      sheet.value.parameters = saved
      ElMessage.success('参数已保存')
    } finally {
      saving.value = false
    }
  }

  function patchBlock(blockId: string, patch: Partial<LabSampleInput>) {
    if (!sheet.value) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly || sheet.value.readonly) return
    block.inputs = { ...block.inputs, ...patch }
    block.parameterSnapshot = sheet.value.parameters
    block.results = calculateSampleResults(block.inputs, block.parameterSnapshot)
    const nextVersion = (blockVersions.get(blockId) || 0) + 1
    blockVersions.set(blockId, nextVersion)
    scheduleBlockAutoSave(blockId, nextVersion)
  }

  async function persistBlock(block: SampleBlock) {
    if (!sheet.value) return
    saving.value = true
    try {
      const saved = await saveSampleBlock(sheet.value.id, block)
      const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
      if (index >= 0) sheet.value.sampleBlocks[index] = saved
    } finally {
      saving.value = false
    }
  }

  async function persistAllBlocks(options: { silent?: boolean } = {}) {
    if (!sheet.value) return
    clearAutoSaveTimers()
    if (activeAutoSavePromises.size) {
      await Promise.allSettled(Array.from(activeAutoSavePromises))
    }
    saving.value = true
    autoSaveStatus.value = 'saving'
    try {
      const currentSheet = sheet.value
      const savedBlocks: SampleBlock[] = []
      for (const block of currentSheet.sampleBlocks) {
        savedBlocks.push(await saveSampleBlock(currentSheet.id, cloneBlock(block)))
      }
      if (sheet.value?.id === currentSheet.id) {
        savedBlocks.forEach((saved) => {
          const index = sheet.value!.sampleBlocks.findIndex((item) => item.id === saved.id)
          if (index >= 0) sheet.value!.sampleBlocks[index] = saved
        })
      }
      lastAutoSavedAt.value = new Date().toISOString()
      autoSaveError.value = ''
      syncAutoSaveStatus(true)
      if (!options.silent) ElMessage.success('当前表格已保存')
    } catch (error) {
      autoSaveStatus.value = 'error'
      autoSaveError.value = error instanceof Error ? error.message : '保存失败'
      if (!options.silent) ElMessage.error('保存失败，请检查内网接口后重试')
    } finally {
      saving.value = false
    }
  }

  async function appendSampleBlocks(countValue: string | number) {
    if (!sheet.value || !isPositiveInteger(countValue)) {
      throw new Error('新增数量必须是正整数')
    }
    await persistAllBlocks({ silent: true })
    if (!sheet.value) return
    adding.value = true
    try {
      sheet.value = await addSampleBlocks(sheet.value.id, Number(countValue))
      ElMessage.success(`已新增 ${countValue} 个样品计算格`)
    } finally {
      adding.value = false
    }
  }

  function scheduleBlockAutoSave(blockId: string, version: number) {
    if (!sheet.value || sheet.value.readonly) return
    const block = sheet.value.sampleBlocks.find((item) => item.id === blockId)
    if (!block || block.readonly) return

    const currentTimer = autoSaveTimers.get(blockId)
    if (currentTimer) window.clearTimeout(currentTimer)

    pendingBlockIds.add(blockId)
    autoSaveError.value = ''
    autoSaveStatus.value = 'pending'
    syncAutoSaveStatus()

    const timer = window.setTimeout(() => {
      autoSaveTimers.delete(blockId)
      pendingBlockIds.delete(blockId)
      void runAutoSave(blockId, version)
    }, AUTO_SAVE_DELAY_MS)
    autoSaveTimers.set(blockId, timer)
  }

  function runAutoSave(blockId: string, version: number) {
    const promise = persistQueuedBlock(blockId, version)
    activeAutoSavePromises.add(promise)
    void promise.finally(() => {
      activeAutoSavePromises.delete(promise)
    })
    return promise
  }

  async function persistQueuedBlock(blockId: string, version: number) {
    const currentSheet = sheet.value
    const block = currentSheet?.sampleBlocks.find((item) => item.id === blockId)
    if (!currentSheet || !block || currentSheet.readonly || block.readonly) {
      pendingBlockIds.delete(blockId)
      syncAutoSaveStatus()
      return
    }

    const sheetId = currentSheet.id
    const snapshot = cloneBlock(block)
    let succeeded = false
    activeAutoSaveCount += 1
    syncAutoSaveStatus()

    try {
      const saved = await saveSampleBlock(sheetId, snapshot)
      succeeded = true
      if (sheet.value?.id === sheetId && blockVersions.get(blockId) === version) {
        const index = sheet.value.sampleBlocks.findIndex((item) => item.id === saved.id)
        if (index >= 0) sheet.value.sampleBlocks[index] = saved
      }
      lastAutoSavedAt.value = new Date().toISOString()
      autoSaveError.value = ''
    } catch (error) {
      autoSaveStatus.value = 'error'
      autoSaveError.value = error instanceof Error ? error.message : '自动保存失败'
      ElMessage.error('自动保存失败，请点击保存当前表格重试')
    } finally {
      activeAutoSaveCount = Math.max(0, activeAutoSaveCount - 1)
      if (!succeeded && autoSaveStatus.value === 'error') {
        pendingAutoSaveCount.value = pendingBlockIds.size
        autoSaving.value = activeAutoSaveCount > 0
        if (pendingBlockIds.size) autoSaveStatus.value = 'pending'
        else if (activeAutoSaveCount > 0) autoSaveStatus.value = 'saving'
        return
      }
      syncAutoSaveStatus(succeeded)
    }
  }

  function clearAutoSaveTimers() {
    autoSaveTimers.forEach((timer) => window.clearTimeout(timer))
    autoSaveTimers.clear()
    pendingBlockIds.clear()
    syncAutoSaveStatus()
  }

  async function persistBeforeSheetChange() {
    if (!sheet.value) {
      clearAutoSaveTimers()
      return
    }
    if (sheet.value.readonly) {
      clearAutoSaveTimers()
      return
    }
    if (pendingBlockIds.size || activeAutoSavePromises.size) {
      await persistAllBlocks({ silent: true })
    } else {
      clearAutoSaveTimers()
    }
  }

  function syncAutoSaveStatus(saved = false) {
    pendingAutoSaveCount.value = pendingBlockIds.size
    autoSaving.value = activeAutoSaveCount > 0
    if (pendingBlockIds.size) {
      autoSaveStatus.value = 'pending'
      return
    }
    if (activeAutoSaveCount > 0) {
      autoSaveStatus.value = 'saving'
      return
    }
    if (saved || lastAutoSavedAt.value) {
      autoSaveStatus.value = 'saved'
      return
    }
    autoSaveStatus.value = 'idle'
  }

  function cloneBlock(block: SampleBlock): SampleBlock {
    return JSON.parse(JSON.stringify(block)) as SampleBlock
  }

  return {
    sheet,
    loading,
    saving,
    adding,
    autoSaving,
    autoSaveStatus,
    lastAutoSavedAt,
    autoSaveError,
    pendingAutoSaveCount,
    currentParameters,
    sampleBlocks,
    loadCurrentSheet,
    loadSheetByDate,
    saveParameters,
    patchBlock,
    persistBlock,
    persistAllBlocks,
    appendSampleBlocks
  }
})
