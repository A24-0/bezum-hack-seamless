import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Maximize2, Minus, Plus } from 'lucide-react'
import { documentsApi } from '../api'
import type { Document } from '../types'
import { extractDocBlocks } from '../lib/docPreview'

// ─── constants ────────────────────────────────────────────────────────────────
const PAGE_W = 220
const PAGE_H = 115
const ROUTE_W = 215
const ROUTE_H = 78
const CANVAS_W = 5000
const CANVAS_H = 4000

// ─── types ────────────────────────────────────────────────────────────────────
interface Pos { x: number; y: number }

interface PageNodeData {
  id: string        // docId
  title: string
  subtitle: string  // first heading from content
  x: number
  y: number
}

interface RouteNodeData {
  id: string
  label: string       // "menu:XYZ"
  description: string // "Sec → anchor:..."
  fromId: string      // docId
  toId: string | null // docId or null
  x: number
  y: number
}

// ─── TipTap content parser ────────────────────────────────────────────────────
interface ExtractedLink {
  href: string
  text: string
  section: string
  nodeId: string
}

function extractLinks(content: any): ExtractedLink[] {
  const links: ExtractedLink[] = []
  let section = ''
  let nodeCounter = 0

  function walk(node: any) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'heading') {
      section = (node.content || []).map((c: any) => c.text ?? '').join('').trim()
    }
    // Text node with link mark
    if (node.type === 'text' && Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === 'link' && mark.attrs?.href) {
          links.push({
            href: mark.attrs.href,
            text: node.text || '',
            section,
            nodeId: mark.attrs.id || node.attrs?.id || `lnk${++nodeCounter}`,
          })
        }
      }
    }
    // Custom button/link node with explicit href attr
    if (node.type !== 'text' && node.attrs?.href) {
      links.push({
        href: node.attrs.href,
        text: node.attrs.label || node.type || '',
        section,
        nodeId: node.attrs.id || `btn${++nodeCounter}`,
      })
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child)
    }
  }

  if (content && typeof content === 'object') {
    const top = content.type === 'doc' ? content.content : content.content
    if (Array.isArray(top)) for (const n of top) walk(n)
  }
  return links
}

function parseDocRef(href: string, ids: Set<string>): string | null {
  const patterns = [/\/documents\/([^/?#\s]+)/, /\/docs\/([^/?#\s]+)/, /#doc:([^/?#\s]+)/]
  for (const re of patterns) {
    const m = href.match(re)
    if (m && ids.has(m[1])) return m[1]
  }
  return null
}

// Stable short id from two strings
function stableId(a: string, b: string) {
  let h = 0
  const s = a + '|' + b
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  let v = Math.abs(h)
  for (let i = 0; i < 20; i++) { r += chars[v % chars.length]; v = Math.floor(v / chars.length) || (v + 1) }
  return r
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
const POS_KEY = (pid: string) => `sitemap_pos_${pid}`
const RPOS_KEY = (pid: string) => `sitemap_rpos_${pid}`

function loadJSON<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}
function saveJSON(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
}

// ─── SVG arrow helpers ────────────────────────────────────────────────────────
function nodeCenter(x: number, y: number, w: number, h: number): Pos {
  return { x: x + w / 2, y: y + h / 2 }
}

function edgePath(from: Pos, to: Pos): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const cx1 = from.x + dx * 0.5
  const cy1 = from.y
  const cx2 = from.x + dx * 0.5
  const cy2 = to.y
  return `M ${from.x} ${from.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${to.x} ${to.y}`
}

function arrowHead(to: Pos, from: Pos): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = 9
  const a1 = angle + Math.PI * 0.8
  const a2 = angle - Math.PI * 0.8
  return [
    `M ${to.x} ${to.y}`,
    `L ${to.x + size * Math.cos(a1)} ${to.y + size * Math.sin(a1)}`,
    `L ${to.x + size * Math.cos(a2)} ${to.y + size * Math.sin(a2)}`,
    'Z',
  ].join(' ')
}

// ─── sub-components ───────────────────────────────────────────────────────────
function PageCard({
  node, selected, onMouseDown,
}: {
  node: PageNodeData
  selected: boolean
  onMouseDown: (e: React.MouseEvent, id: string) => void
}) {
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      style={{ left: node.x, top: node.y, width: PAGE_W, position: 'absolute', userSelect: 'none' }}
      className={`bg-white dark:bg-slate-800 rounded-xl shadow-md border cursor-grab active:cursor-grabbing transition-shadow ${
        selected
          ? 'border-indigo-500 shadow-indigo-200 dark:shadow-indigo-900 shadow-lg'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-1 mb-1">
          <span className="font-semibold text-slate-900 dark:text-white text-sm leading-tight line-clamp-2">
            {node.title}
          </span>
          <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        </div>
        {node.subtitle && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 truncate">{node.subtitle}</div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
            richtext
          </span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {Math.round(node.x)}, {Math.round(node.y)}
          </span>
        </div>
      </div>
    </div>
  )
}

function RouteCard({
  node, onMouseDown,
}: {
  node: RouteNodeData
  onMouseDown: (e: React.MouseEvent, id: string) => void
}) {
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      style={{ left: node.x, top: node.y, width: ROUTE_W, position: 'absolute', userSelect: 'none' }}
      className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-lg shadow cursor-grab active:cursor-grabbing"
    >
      <div className="p-2.5">
        <div className="text-[10px] font-mono text-indigo-700 dark:text-indigo-300 truncate mb-1">
          {node.label}
        </div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
          {node.description}
        </div>
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────
export default function SiteMapPage() {
  const { projectId } = useParams<{ projectId: string }>()

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => documentsApi.list(projectId!).then((r) => r.data as Document[]),
    enabled: !!projectId,
  })

  const containerRef = useRef<HTMLDivElement>(null)

  // canvas transform
  const [zoom, setZoom] = useState(0.83)
  const [pan, setPan] = useState<Pos>({ x: 40, y: 40 })

  // node positions
  const [nodePos, setNodePos] = useState<Record<string, Pos>>({})
  const [routePos, setRoutePos] = useState<Record<string, Pos>>({})
  const [selected, setSelected] = useState<string | null>(null)

  // drag state stored in ref to avoid re-render during drag
  const dragRef = useRef<{
    type: 'pan' | 'page' | 'route'
    id: string
    startMouse: Pos
    startPos: Pos
  } | null>(null)

  // ── init positions from localStorage or compute grid layout ──────────────
  const initialized = useRef(false)
  useEffect(() => {
    if (!projectId || docs.length === 0 || initialized.current) return
    initialized.current = true

    const savedNode = loadJSON<Record<string, Pos>>(POS_KEY(projectId)) || {}
    const savedRoute = loadJSON<Record<string, Pos>>(RPOS_KEY(projectId)) || {}

    const cols = Math.max(1, Math.ceil(Math.sqrt(docs.length)))
    const initPos: Record<string, Pos> = {}
    docs.forEach((doc, i) => {
      const id = String(doc.id)
      initPos[id] = savedNode[id] ?? { x: 80 + (i % cols) * 320, y: 80 + Math.floor(i / cols) * 220 }
    })
    setNodePos(initPos)
    setRoutePos(savedRoute)
  }, [projectId, docs])

  // persist positions
  useEffect(() => {
    if (projectId && Object.keys(nodePos).length > 0) saveJSON(POS_KEY(projectId), nodePos)
  }, [projectId, nodePos])
  useEffect(() => {
    if (projectId && Object.keys(routePos).length > 0) saveJSON(RPOS_KEY(projectId), routePos)
  }, [projectId, routePos])

  // ── build graph ───────────────────────────────────────────────────────────
  const docIds = useMemo(() => new Set(docs.map((d) => String(d.id))), [docs])

  const { pageNodes, routeNodes } = useMemo(() => {
    const pageNodes: PageNodeData[] = docs.map((doc) => {
      const blocks = extractDocBlocks(doc.content)
      const firstHeading = blocks.find((b) => b.type === 'heading')
      const pos = nodePos[String(doc.id)] ?? { x: 100, y: 100 }
      return {
        id: String(doc.id),
        title: doc.title,
        subtitle: firstHeading?.text ?? '',
        x: pos.x,
        y: pos.y,
      }
    })

    const routeNodes: RouteNodeData[] = []

    docs.forEach((doc) => {
      const links = extractLinks(doc.content)
      links.forEach((link, idx) => {
        const toDocId = parseDocRef(link.href, docIds)
        const routeId = `route_${stableId(String(doc.id), link.href + idx)}`

        const fromPos = nodePos[String(doc.id)] ?? { x: 100, y: 100 }
        const toPos = toDocId ? (nodePos[toDocId] ?? { x: fromPos.x + 350, y: fromPos.y }) : { x: fromPos.x + 350, y: fromPos.y }
        const defaultRPos: Pos = {
          x: (fromPos.x + toPos.x) / 2 - ROUTE_W / 2 + (idx % 3) * 20,
          y: (fromPos.y + toPos.y) / 2 - ROUTE_H / 2 + (idx % 3) * 15,
        }

        let description = ''
        const anchorPart = link.href.startsWith('#')
          ? `anchor:${link.href.slice(1)}`
          : link.href.length > 40 ? link.href.slice(0, 40) + '…' : link.href

        if (toDocId) {
          const toTitle = docs.find((d) => String(d.id) === toDocId)?.title ?? toDocId
          description = `${doc.title} → ${toTitle} → ${anchorPart}`
        } else if (link.section) {
          description = `${link.section} → ${anchorPart}`
        } else {
          description = anchorPart
        }

        routeNodes.push({
          id: routeId,
          label: `menu:${stableId(link.nodeId, routeId)}`,
          description,
          fromId: String(doc.id),
          toId: toDocId,
          x: routePos[routeId]?.x ?? defaultRPos.x,
          y: routePos[routeId]?.y ?? defaultRPos.y,
        })
      })
    })

    return { pageNodes, routeNodes }
  }, [docs, docIds, nodePos, routePos])

  // ── mouse handlers ─────────────────────────────────────────────────────────
  const toCanvas = useCallback((clientX: number, clientY: number): Pos => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return { x: clientX, y: clientY }
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom }
  }, [pan, zoom])

  const onPageMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelected(id)
    dragRef.current = {
      type: 'page',
      id,
      startMouse: { x: e.clientX, y: e.clientY },
      startPos: nodePos[id] ?? { x: 0, y: 0 },
    }
  }, [nodePos])

  const onRouteMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const node = routeNodes.find((r) => r.id === id)
    if (!node) return
    dragRef.current = {
      type: 'route',
      id,
      startMouse: { x: e.clientX, y: e.clientY },
      startPos: { x: node.x, y: node.y },
    }
  }, [routeNodes])

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setSelected(null)
    dragRef.current = {
      type: 'pan',
      id: '',
      startMouse: { x: e.clientX, y: e.clientY },
      startPos: pan,
    }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startMouse.x
    const dy = e.clientY - d.startMouse.y
    if (d.type === 'pan') {
      setPan({ x: d.startPos.x + dx, y: d.startPos.y + dy })
    } else if (d.type === 'page') {
      setNodePos((prev) => ({
        ...prev,
        [d.id]: { x: d.startPos.x + dx / zoom, y: d.startPos.y + dy / zoom },
      }))
    } else if (d.type === 'route') {
      setRoutePos((prev) => ({
        ...prev,
        [d.id]: { x: d.startPos.x + dx / zoom, y: d.startPos.y + dy / zoom },
      }))
    }
  }, [zoom])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom((z) => {
      const nz = Math.min(3, Math.max(0.2, z * factor))
      setPan((p) => ({
        x: mx - (mx - p.x) * (nz / z),
        y: my - (my - p.y) * (nz / z),
      }))
      return nz
    })
  }, [])

  // ── zoom controls ──────────────────────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(3, +(z * 1.2).toFixed(2)))
  const zoomOut = () => setZoom((z) => Math.max(0.2, +(z / 1.2).toFixed(2)))

  const fitAll = useCallback(() => {
    if (pageNodes.length === 0) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const minX = Math.min(...pageNodes.map((n) => n.x))
    const minY = Math.min(...pageNodes.map((n) => n.y))
    const maxX = Math.max(...pageNodes.map((n) => n.x + PAGE_W))
    const maxY = Math.max(...pageNodes.map((n) => n.y + PAGE_H))
    const contentW = maxX - minX + 80
    const contentH = maxY - minY + 80
    const scaleX = rect.width / contentW
    const scaleY = rect.height / contentH
    const newZoom = Math.min(1.5, Math.max(0.2, Math.min(scaleX, scaleY)))
    setZoom(newZoom)
    setPan({
      x: (rect.width - contentW * newZoom) / 2 - minX * newZoom + 40 * newZoom,
      y: (rect.height - contentH * newZoom) / 2 - minY * newZoom + 40 * newZoom,
    })
  }, [pageNodes])

  // ── render arrows ──────────────────────────────────────────────────────────
  const arrows = useMemo(() => {
    const result: { id: string; d: string; arrow: string; midX: number; midY: number }[] = []

    routeNodes.forEach((rn) => {
      const fromPage = pageNodes.find((p) => p.id === rn.fromId)
      if (!fromPage) return

      const fromCenter = nodeCenter(fromPage.x, fromPage.y, PAGE_W, PAGE_H)
      const routeCenter = nodeCenter(rn.x, rn.y, ROUTE_W, ROUTE_H)

      // from page → route node
      result.push({
        id: `${rn.id}_in`,
        d: edgePath(fromCenter, routeCenter),
        arrow: arrowHead(routeCenter, fromCenter),
        midX: (fromCenter.x + routeCenter.x) / 2,
        midY: (fromCenter.y + routeCenter.y) / 2,
      })

      // route node → to page (if exists)
      if (rn.toId) {
        const toPage = pageNodes.find((p) => p.id === rn.toId)
        if (toPage) {
          const toCenter = nodeCenter(toPage.x, toPage.y, PAGE_W, PAGE_H)
          result.push({
            id: `${rn.id}_out`,
            d: edgePath(routeCenter, toCenter),
            arrow: arrowHead(toCenter, routeCenter),
            midX: (routeCenter.x + toCenter.x) / 2,
            midY: (routeCenter.y + toCenter.y) / 2,
          })
        }
      }
    })

    return result
  }, [pageNodes, routeNodes])

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Header */}
      <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Карта страниц и маршрутов</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Свободное размещение объектов, масштабирование, панорамирование и движущиеся пунктирные связи.
          </p>
        </div>
        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 min-w-[56px] text-center">
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={zoomIn}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={fitAll}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ml-1"
            title="Вписать всё"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative bg-slate-50 dark:bg-slate-950 cursor-default"
        style={{
          backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-slate-400 text-sm">Загрузка документов…</span>
          </div>
        )}

        {!isLoading && docs.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">В проекте нет документов</p>
              <p className="text-slate-300 text-xs mt-1">Создайте документы в разделе «Документы»</p>
            </div>
          </div>
        )}

        {/* Transform layer */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: CANVAS_W,
            height: CANVAS_H,
            position: 'relative',
          }}
        >
          {/* SVG arrows layer */}
          <svg
            style={{
              position: 'absolute',
              inset: 0,
              width: CANVAS_W,
              height: CANVAS_H,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <defs>
              <style>{`
                @keyframes dashMove {
                  to { stroke-dashoffset: -24; }
                }
                .animated-dash {
                  animation: dashMove 0.9s linear infinite;
                }
              `}</style>
            </defs>
            {arrows.map((a) => (
              <g key={a.id}>
                <path
                  d={a.d}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1.8"
                  strokeDasharray="8 5"
                  strokeLinecap="round"
                  className="animated-dash"
                  opacity="0.7"
                />
                <path d={a.arrow} fill="#6366f1" opacity="0.85" />
              </g>
            ))}
          </svg>

          {/* Route nodes */}
          {routeNodes.map((rn) => (
            <RouteCard key={rn.id} node={rn} onMouseDown={onRouteMouseDown} />
          ))}

          {/* Page nodes */}
          {pageNodes.map((pn) => (
            <PageCard
              key={pn.id}
              node={pn}
              selected={selected === pn.id}
              onMouseDown={onPageMouseDown}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
