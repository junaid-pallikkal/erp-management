import { state } from './state.js'

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function money(n, currency) {
  const cur = currency || state.org?.currency || 'USD'
  const v = Number(n ?? 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(v)
  } catch {
    return `${cur} ${v.toFixed(2)}`
  }
}

export const num = (n) => new Intl.NumberFormat().format(Number(n ?? 0))

export function date(v) {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T00:00:00' : v)
  return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function dateTime(v) {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function timeAgo(v) {
  const s = (Date.now() - new Date(v).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const today = () => new Date().toISOString().slice(0, 10)
export const titleCase = (s) => String(s ?? '').replace(/_/g, ' ')
export const fullName = (e) => (e ? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() : '—')

export function debounce(fn, ms = 300) {
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

export function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return
  const cols = Object.keys(rows[0])
  const cell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export const statusTone = (s) =>
  ({
    active: 'ok', paid: 'ok', approved: 'ok', done: 'ok', received: 'ok', fulfilled: 'ok', completed: 'ok',
    present: 'ok', accepted: 'ok', closed: 'muted', sent: 'info', confirmed: 'info', in_progress: 'info',
    review: 'info', open: 'info', remote: 'info', planned: 'muted', draft: 'muted', todo: 'muted', inactive: 'muted',
    pending: 'warn', pending_approval: 'warn', partially_paid: 'warn', partially_received: 'warn',
    on_hold: 'warn', on_leave: 'warn', late: 'warn', half_day: 'warn', low: 'muted', medium: 'info', high: 'warn',
    urgent: 'bad', overdue: 'bad', rejected: 'bad', cancelled: 'bad', void: 'bad', terminated: 'bad',
    absent: 'bad', suspended: 'bad', discontinued: 'bad', revoked: 'bad', expired: 'bad',
  }[s] || 'muted')

export const badge = (s) => (s ? `<span class="badge badge-${statusTone(s)}">${esc(titleCase(s))}</span>` : '—')
