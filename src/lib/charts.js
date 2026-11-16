import { esc } from './format.js'

const C1 = 'var(--accent)'
const C2 = '#9bd3b5'
const PALETTE = ['var(--accent)', '#0f4d33', '#7cc7a0', '#c5e4d3', '#e0a43a', '#d64545']

/** Grouped bar chart. series: [{name, color, values[]}], labels: string[] */
export function barChart({ labels, series, height = 220, format = (v) => v }) {
  const W = 560, H = height, pl = 8, pb = 24, pt = 10
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const gw = (W - pl) / labels.length
  const bw = Math.min(26, (gw * 0.7) / series.length)
  const bars = labels
    .map((l, i) =>
      series
        .map((s, j) => {
          const h = ((H - pb - pt) * s.values[i]) / max
          const x = pl + gw * i + (gw - bw * series.length) / 2 + bw * j
          return `<rect x="${x}" y="${H - pb - h}" width="${bw - 2}" height="${Math.max(h, 0)}" rx="${(bw - 2) / 2}" fill="${s.color}"><title>${esc(s.name)} ${esc(l)}: ${esc(format(s.values[i]))}</title></rect>`
        })
        .join('') + `<text x="${pl + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(l)}</text>`,
    )
    .join('')
  const legend = series
    .map((s) => `<span class="inline-flex items-center gap-1.5 text-xs text-ink2"><i class="w-2.5 h-2.5 rounded-sm inline-block" style="background:${s.color}"></i>${esc(s.name)}</span>`)
    .join('')
  return `<div><svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Bar chart">
    <line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line)"/>${bars}</svg>
    <div class="flex gap-4 mt-1">${legend}</div></div>`
}

/** Donut chart. data: [{label, value}] */
export function donutChart({ data, size = 150 }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  if (!total) return '<p class="text-ink2 text-sm py-8 text-center">No data yet</p>'
  const r = 54, c = 2 * Math.PI * r
  let off = 0
  const arcs = data
    .map((d, i) => {
      const len = (d.value / total) * c
      const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${PALETTE[i % PALETTE.length]}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(d.label)}: ${d.value}</title></circle>`
      off += len
      return el
    })
    .join('')
  const legend = data
    .map((d, i) => `<li class="flex items-center gap-2 text-sm"><i class="w-2.5 h-2.5 rounded-sm" style="background:${PALETTE[i % PALETTE.length]}"></i><span class="capitalize flex-1">${esc(d.label)}</span><span class="num text-ink2">${d.value}</span></li>`)
    .join('')
  return `<div class="flex items-center gap-5 flex-wrap"><svg width="${size}" height="${size}" viewBox="0 0 140 140" role="img" aria-label="Donut chart">${arcs}
    <text x="70" y="75" text-anchor="middle" font-size="20" font-weight="600" fill="var(--text)">${total}</text></svg>
    <ul class="space-y-1.5 flex-1 min-w-[120px]">${legend}</ul></div>`
}

/** Horizontal bars for rankings. rows: [{label, value, display}] */
export function hBars(rows) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return '<p class="text-ink2 text-sm py-6 text-center">No data yet</p>'
  return `<ul class="space-y-3">${rows
    .map(
      (r) => `<li><div class="flex justify-between text-sm mb-1"><span class="truncate pr-2">${esc(r.label)}</span><span class="num text-ink2">${esc(r.display ?? r.value)}</span></div>
      <div class="h-2 rounded-full bg-bg overflow-hidden"><div class="h-full rounded-full" style="width:${(r.value / max) * 100}%;background:${C1}"></div></div></li>`,
    )
    .join('')}</ul>`
}

export const COLORS = { income: C1, expense: C2 }
