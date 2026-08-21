import { describe, expect, it, vi } from 'vitest'

import { desktopTargets } from './config'
import {
  configureDownloadPrompt,
  createSaveDialogOptions,
  getDownloadOutcome,
  sanitizeDownloadFilename,
} from './downloads'

describe('desktop downloads', () => {
  it('removes path traversal, control and reserved filename characters', () => {
    expect(sanitizeDownloadFilename('../../工资单<8月>.png')).toBe('工资单_8月_.png')
    expect(sanitizeDownloadFilename('..\\..\\report:\u0000?.png')).toBe(
      'report___.png',
    )
    expect(sanitizeDownloadFilename('  ...  ')).toBe('download')
    expect(sanitizeDownloadFilename('结算单.png')).toBe('结算单.png')
  })

  it('creates an explicit system save-dialog prompt in the Downloads folder', () => {
    expect(createSaveDialogOptions('工资单.png', '/Users/me/Downloads')).toEqual({
      title: '另存为',
      buttonLabel: '保存',
      defaultPath: '/Users/me/Downloads/工资单.png',
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    })
  })

  it('prompts for same-origin and blob exports without forcing a path', () => {
    const item = {
      getFilename: vi.fn().mockReturnValue('导出.png'),
      getURL: vi.fn().mockReturnValue('blob:https://www.ysjc.art/1234'),
      getURLChain: vi
        .fn()
        .mockReturnValue(['blob:https://www.ysjc.art/1234']),
      setSaveDialogOptions: vi.fn(),
      setSavePath: vi.fn(),
      cancel: vi.fn(),
    }

    expect(
      configureDownloadPrompt(
        item,
        desktopTargets.internal,
        '/Users/me/Downloads',
      ),
    ).toBe('prompt')
    expect(item.setSaveDialogOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: '/Users/me/Downloads/导出.png',
      }),
    )
    expect(item.setSavePath).not.toHaveBeenCalled()
    expect(item.cancel).not.toHaveBeenCalled()
  })

  it('cancels downloads redirected away from the approved origin', () => {
    const item = {
      getFilename: vi.fn().mockReturnValue('evil.exe'),
      getURL: vi.fn().mockReturnValue('https://evil.example/evil.exe'),
      getURLChain: vi
        .fn()
        .mockReturnValue([
          'https://www.ysjc.art/export',
          'https://evil.example/evil.exe',
        ]),
      setSaveDialogOptions: vi.fn(),
      setSavePath: vi.fn(),
      cancel: vi.fn(),
    }

    expect(
      configureDownloadPrompt(
        item,
        desktopTargets.internal,
        '/Users/me/Downloads',
      ),
    ).toBe('blocked')
    expect(item.cancel).toHaveBeenCalledOnce()
    expect(item.setSaveDialogOptions).not.toHaveBeenCalled()
  })

  it('allows a canvas PNG data download only from an approved page', () => {
    const createItem = () => ({
      getFilename: vi.fn().mockReturnValue('月结单.png'),
      getURL: vi.fn().mockReturnValue('data:image/png;base64,iVBORw0KGgo='),
      getURLChain: vi
        .fn()
        .mockReturnValue(['data:image/png;base64,iVBORw0KGgo=']),
      setSaveDialogOptions: vi.fn(),
      setSavePath: vi.fn(),
      cancel: vi.fn(),
    })
    const approvedItem = createItem()
    const untrustedItem = createItem()

    expect(
      configureDownloadPrompt(
        approvedItem,
        desktopTargets.internal,
        '/Users/me/Downloads',
        'https://www.ysjc.art/finance/monthly-settlement',
      ),
    ).toBe('prompt')
    expect(
      configureDownloadPrompt(
        untrustedItem,
        desktopTargets.internal,
        '/Users/me/Downloads',
        'data:text/html,untrusted',
      ),
    ).toBe('blocked')
    expect(approvedItem.setSaveDialogOptions).toHaveBeenCalledOnce()
    expect(untrustedItem.cancel).toHaveBeenCalledOnce()
  })

  it('blocks non-PNG data downloads even when initiated by an approved page', () => {
    const item = {
      getFilename: vi.fn().mockReturnValue('page.html'),
      getURL: vi.fn().mockReturnValue('data:text/html,<script>alert(1)</script>'),
      getURLChain: vi
        .fn()
        .mockReturnValue(['data:text/html,<script>alert(1)</script>']),
      setSaveDialogOptions: vi.fn(),
      setSavePath: vi.fn(),
      cancel: vi.fn(),
    }

    expect(
      configureDownloadPrompt(
        item,
        desktopTargets.internal,
        '/Users/me/Downloads',
        'https://www.ysjc.art/dashboard',
      ),
    ).toBe('blocked')
  })

  it('distinguishes save, cancel and interrupted terminal outcomes', () => {
    expect(getDownloadOutcome('completed', '/Users/me/Downloads/report.png')).toBe(
      'saved',
    )
    expect(getDownloadOutcome('cancelled', '')).toBe('cancelled')
    expect(getDownloadOutcome('interrupted', '')).toBe('interrupted')
  })
})
