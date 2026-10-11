import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AiMessage from './AiMessage.vue'

function reply(content: string) {
  return mount(AiMessage, { props: { role: 'assistant', content } })
}

describe('AI reply formatting', () => {
  it('formats Chinese headings, emphasis, lists and separators while preserving emoji', () => {
    const wrapper = reply('## 📋 查询类\n\n- **样品信息**：查询检测结果\n- **客户资料**：查看客户\n\n## ✏️ 操作类\n\n1. 生成草稿\n2. 确认后写入\n\n---\n\n## ⚠️ 使用须知\n\n历史样品不可直接修改。')
    expect(wrapper.findAll('h2').map(heading => heading.text())).toEqual(['📋 查询类', '✏️ 操作类', '⚠️ 使用须知'])
    expect(wrapper.get('strong').text()).toBe('样品信息')
    expect(wrapper.findAll('ul > li')).toHaveLength(2)
    expect(wrapper.findAll('ol > li')).toHaveLength(2)
    expect(wrapper.find('hr').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('##')
    expect(wrapper.text()).not.toContain('**')
    wrapper.unmount()
  })

  it('keeps paragraphs and line breaks, nested lists, quotes and inline code', () => {
    const wrapper = reply('第一行\n第二行\n\n下一段\n\n- 第一项\n  - 子项\n\n> 请核对 `金额` 和 *单位*。')
    expect(wrapper.find('br').exists()).toBe(true)
    expect(wrapper.findAll('p').map(paragraph => paragraph.text())).toContain('下一段')
    expect(wrapper.get('ul ul li').text()).toBe('子项')
    expect(wrapper.get('blockquote code').text()).toBe('金额')
    expect(wrapper.get('em').text()).toBe('单位')
    wrapper.unmount()
  })

  it('renders tables in their own keyboard-accessible scroll region and escapes code', () => {
    const wrapper = reply('| 样品 | 结果 |\n| --- | ---: |\n| A001 | 27.94 |\n\n```html\n<img src=x onerror="alert(1)">\n```')
    const table = wrapper.get('[role="region"][aria-label="AI 回复表格"]')
    expect(table.attributes('tabindex')).toBe('0')
    expect(table.findAll('th').map(cell => cell.text())).toEqual(['样品', '结果'])
    expect(table.findAll('td').map(cell => cell.text())).toEqual(['A001', '27.94'])
    expect(wrapper.get('pre code').text()).toContain('<img src=x')
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })

  it('updates the rendered reply when its text changes', async () => {
    const wrapper = reply('旧回复')
    await wrapper.setProps({ content: '## 新回复\n\n**已更新**' })
    expect(wrapper.get('h2').text()).toBe('新回复')
    expect(wrapper.get('strong').text()).toBe('已更新')
    expect(wrapper.text()).not.toContain('旧回复')
    wrapper.unmount()
  })

  it('preserves user input literally instead of reinterpreting their Markdown or HTML', () => {
    const content = '## 我的原始输入\n**客户名称**\n<img src=x onerror="alert(1)">'
    const wrapper = mount(AiMessage, { props: { role: 'user', content } })
    expect(wrapper.get('.ys-ai-message--plain').text()).toBe(content)
    expect(wrapper.find('h2').exists()).toBe(false)
    expect(wrapper.find('strong').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows returned HTML as text and cannot create buttons, scripts or business forms', () => {
    const wrapper = reply('<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n<button onclick="alert(1)">确认写入</button>\n<form action="/api/ai/proposals/p/decision"><input name="decision" value="confirm"></form>')
    expect(wrapper.text()).toContain('<script>alert(1)</script>')
    expect(wrapper.find('script, img, button, form, input, [onclick], [onerror]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('allows ordinary web and email links with safe new-tab attributes', () => {
    const wrapper = reply('[资料](https://example.com/help?q=%E6%A0%B7%E5%93%81) · [网站](http://example.com) · [邮件](mailto:lab@example.com)')
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(3)
    for (const link of links) {
      expect(link.attributes('target')).toBe('_blank')
      expect(link.attributes('rel')).toBe('noopener noreferrer')
    }
    wrapper.unmount()
  })

  it.each(['javascript:alert(1)', 'jav&#x61;script:alert(1)', 'java\tscript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd', '//example.com/private', '/api/ai/proposals/p/decision'])('does not turn an unsafe or implicit URL into a link: %s', url => {
    const wrapper = reply(`[打开](<${url}>)`)
    expect(wrapper.find('a').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves Markdown image captions without automatically loading remote assets', () => {
    const wrapper = reply('![📋 查询说明](https://example.com/tracker.png) ![<img src=x>](https://example.com/image.png)')
    expect(wrapper.text()).toContain('📋 查询说明')
    expect(wrapper.text()).toContain('<img src=x>')
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })
})
