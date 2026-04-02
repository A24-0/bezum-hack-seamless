export type DocBlock =
  | { index: number; type: 'heading'; text: string }
  | { index: number; type: 'paragraph'; text: string }

function extractTextFromNode(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromNode).join(' ')
  if (typeof node === 'object') {
    if (node.type === 'text' && typeof node.text === 'string') return node.text
    if (Array.isArray(node.content)) return node.content.map(extractTextFromNode).join(' ')
  }
  return ''
}

export function extractDocBlocks(content: any): DocBlock[] {
  // Expected TipTap/ProseMirror-ish shape:
  // { type: "doc", content: [ { type:"heading"/"paragraph", content:[...] }, ... ] }
  const doc = content?.type === 'doc' ? content : content
  const top = doc?.content
  if (!Array.isArray(top)) return []

  const blocks: DocBlock[] = []
  let idx = 0
  for (const n of top) {
    const t = n?.type
    if (t === 'heading' || t === 'paragraph') {
      const text = extractTextFromNode(n?.content)?.trim()
      if (!text) continue
      blocks.push({ index: idx, type: t, text })
      idx += 1
    }
  }
  return blocks
}

export function makeDocSummary(blocks: DocBlock[]): string {
  if (!blocks.length) return 'Сводка недоступна.'
  const headings = blocks.filter((b) => b.type === 'heading')
  const paras = blocks.filter((b) => b.type === 'paragraph')
  const h = headings[0]?.text
  const p = paras.slice(0, 2).map((x) => x.text).join(' ')
  return [h, p].filter(Boolean).join('\n\n')
}

export function truncate(text: string, max = 140): string {
  const s = (text || '').trim()
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

export function extractDocPlainText(content: any): string {
  const blocks = extractDocBlocks(content)
  if (!blocks.length) return ''
  // Preserve basic structure: headings first, then paragraphs, separated by blank lines.
  return blocks
    .map((b) => {
      if (b.type === 'heading') return b.text
      return b.text
    })
    .join('\n\n')
    .trim()
}

