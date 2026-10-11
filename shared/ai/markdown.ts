import MarkdownIt from 'markdown-it'

// Model replies are untrusted text. Keep raw HTML disabled and use only the
// parser's built-in rules; business actions belong to the separate review cards.
const markdown = new MarkdownIt({ html: false, breaks: true, linkify: false, typographer: false })

markdown.validateLink = url => {
  try {
    const parsed = new URL(url)
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol)
  } catch { return false }
}
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return renderer.renderToken(tokens, index, options)
}
// A reply must not load arbitrary remote images automatically. Preserve its
// caption as text; uploaded photos continue to use the existing photo controls.
markdown.renderer.rules.image = (tokens, index, options, env, renderer) =>
  markdown.utils.escapeHtml(renderer.renderInlineAsText(tokens[index].children || [], options, env) || '[图片]')
markdown.renderer.rules.table_open = () => '<div class="ys-ai-markdown__table" role="region" aria-label="AI 回复表格" tabindex="0"><table>\n'
markdown.renderer.rules.table_close = () => '</table></div>\n'

export function renderAiMarkdown(content: string): string {
  return markdown.render(content)
}
