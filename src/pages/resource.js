// Generic list + detail pages driven by modules/registry.js
import { supabase, unwrap } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, get, debounce, downloadCsv, badge, date, money, titleCase } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import {
  openForm, confirmDialog, attempt, toast, tableHtml, skeletonRows, emptyState, pagerHtml, pageHeader, clearOptionCache,
} from '../lib/ui.js'

const PAGE_SIZE = 15
const fieldsOf = (cfg) => (typeof cfg.fields === 'function' ? cfg.fields() : cfg.fields || [])
const allow = (cfg, kind, row) => {
  const fn = cfg[`can${kind}`]
  if (fn) return fn(row)
  return can(cfg.module, kind.toLowerCase())
}
const stripHtml = (h) => String(h ?? '').replace(/<[^>]+>/g, '').trim()

function baseQuery(cfg, { countOnly = false } = {}) {
  let q = supabase.from(cfg.table).select(cfg.select || '*', { count: 'exact' }).eq('organization_id', state.org.id)
  if (cfg.soft) q = q.is('deleted_at', null)
  if (cfg.baseFilter) q = cfg.baseFilter(q)
  return q
}

async function saveRow(cfg, payload, id) {
  if (cfg.beforeSave) payload = cfg.beforeSave(payload, id)
  clearOptionCache()
  if (id) {
    unwrap(await supabase.from(cfg.table).update(payload).eq('id', id))
  } else {
    unwrap(await supabase.from(cfg.table).insert({ ...payload, organization_id: state.org.id }))
  }
}

async function deleteRow(cfg, row) {
  const ok = await confirmDialog({ title: `Delete this ${cfg.singular?.toLowerCase() || 'record'}?`, message: cfg.soft ? 'It will be archived and hidden from lists.' : 'This cannot be undone.', confirmLabel: 'Delete', danger: true })
  if (!ok) return false
  clearOptionCache()
  return attempt(async () => {
    if (cfg.soft) unwrap(await supabase.from(cfg.table).update({ deleted_at: new Date().toISOString() }).eq('id', row.id))
    else unwrap(await supabase.from(cfg.table).delete().eq('id', row.id))
  }, 'Deleted')
}

function openRowForm(cfg, row, onDone) {
  const fields = fieldsOf(cfg)
  const values = {}
  fields.forEach((f) => {
    values[f.name] = row ? row[f.name] : typeof f.default === 'function' ? f.default() : f.default
    if (f.type === 'datetime' && row?.[f.name]) values[f.name] = new Date(row[f.name]).toISOString().slice(0, 16)
  })
  return openForm({
    title: `${row ? 'Edit' : 'New'} ${cfg.singular?.toLowerCase() || 'record'}`,
    fields, values,
    onSubmit: async (payload) => { await saveRow(cfg, payload, row?.id); toast(row ? 'Changes saved' : 'Created'); onDone() },
  })
}

/* ===================================================================== LIST */
export async function renderList(cfg, el) {
  const st = { page: 0, sort: null, search: '', status: '', rows: [], total: 0 }
  if (cfg.order) st.sort = { key: cfg.order[0], asc: cfg.order[1] }

  const actionBtns = () => {
    const tb = (cfg.toolbar?.() || []).map((b, i) => `<button class="btn ${b.primary ? 'btn-primary' : ''}" data-tb="${i}">${esc(b.label)}</button>`).join('')
    const exp = can(cfg.module, 'export') ? `<button class="btn" data-export>${icon('download', 'w-4 h-4')} Export</button>` : ''
    const canNew = !cfg.readonly && (cfg.canCreate ? cfg.canCreate() : can(cfg.module, 'create'))
    const add = canNew ? `<button class="btn btn-primary" data-new>${icon('plus', 'w-4 h-4')} New ${esc(cfg.singular?.toLowerCase() || 'record')}</button>` : ''
    return tb + exp + add
  }

  el.innerHTML = `${pageHeader({ title: cfg.title, actions: actionBtns() })}
    <div class="card">
      <div class="flex flex-wrap gap-3 p-4 border-b border-line">
        ${cfg.search ? `<div class="relative flex-1 min-w-[200px] max-w-sm"><span class="absolute left-3 top-2.5 text-muted">${icon('search', 'w-4 h-4')}</span>
          <input class="input pl-9" type="search" placeholder="Search…" aria-label="Search" data-search/></div>` : ''}
        ${cfg.statuses ? `<select class="select max-w-[200px]" data-status aria-label="Filter by status"><option value="">All statuses</option>
          ${cfg.statuses.map((s) => `<option value="${s}">${esc(titleCase(s))}</option>`).join('')}</select>` : ''}
      </div>
      <div data-table>${skeletonRows()}</div><div data-pager></div></div>`

  const tableEl = el.querySelector('[data-table]')
  const pagerEl = el.querySelector('[data-pager]')

  const columns = [...cfg.columns]
  const rowBtns = (r) => {
    const parts = []
    ;(cfg.rowActions || []).forEach((a, i) => { if (!a.show || a.show(r)) parts.push(`<button class="btn btn-sm ${a.danger ? 'btn-danger' : ''}" data-ra="${i}">${esc(a.label)}</button>`) })
    if (!cfg.readonly && allow(cfg, 'Edit', r)) parts.push(`<button class="btn btn-sm btn-ghost btn-icon" data-edit aria-label="Edit">${icon('edit', 'w-4 h-4')}</button>`)
    if (!cfg.readonly && allow(cfg, 'Delete', r)) parts.push(`<button class="btn btn-sm btn-ghost btn-icon btn-danger" data-del aria-label="Delete">${icon('trash', 'w-4 h-4')}</button>`)
    return `<div class="flex justify-end gap-1.5" onclick="event.stopPropagation()">${parts.join('')}</div>`
  }
  const hasActions = !cfg.readonly || cfg.rowActions?.length
  if (hasActions) columns.push({ label: '', right: false, render: rowBtns })

  async function load() {
    tableEl.innerHTML = skeletonRows()
    let q = baseQuery(cfg)
    if (st.search && cfg.search) {
      const s = st.search.replace(/[,()%*]/g, ' ').trim()
      if (s) q = q.or(cfg.search.map((c) => `${c}.ilike.%${s}%`).join(','))
    }
    if (st.status && cfg.statusField) q = q.eq(cfg.statusField, st.status)
    if (st.sort) q = q.order(st.sort.key, { ascending: st.sort.asc })
    q = q.range(st.page * PAGE_SIZE, st.page * PAGE_SIZE + PAGE_SIZE - 1)
    const { data, error, count } = await q
    if (error) { tableEl.innerHTML = `<div class="p-6 text-bad">${esc(error.message)}</div>`; return }
    st.rows = data || []; st.total = count || 0
    if (!st.rows.length) {
      tableEl.innerHTML = emptyState(st.search || st.status ? 'No matching records' : `No ${cfg.title.toLowerCase()} yet`,
        st.search || st.status ? 'Try adjusting your search or filters.' : cfg.readonly ? '' : 'Create the first one to get started.',
        !cfg.readonly && !(st.search || st.status) && (cfg.canCreate ? cfg.canCreate() : can(cfg.module, 'create')) ? '<button class="btn btn-primary" data-new>New ' + esc(cfg.singular?.toLowerCase() || 'record') + '</button>' : '')
      pagerEl.innerHTML = ''
      return
    }
    tableEl.innerHTML = tableHtml(columns, st.rows, { sort: st.sort, clickable: !cfg.noDetail })
    pagerEl.innerHTML = st.total > PAGE_SIZE ? pagerHtml({ page: st.page, pageSize: PAGE_SIZE, total: st.total }) : ''
  }

  const openNew = () => (cfg.newHref ? (location.hash = cfg.newHref) : openRowForm(cfg, null, load))
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button, th, tr[data-i]')
    if (!t) return
    const rowEl = e.target.closest('tr[data-i]')
    const row = rowEl ? st.rows[+rowEl.dataset.i] : null
    if (t.matches('[data-new]')) return openNew()
    if (t.matches('[data-tb]')) return cfg.toolbar()[+t.dataset.tb].run(load)
    if (t.matches('[data-export]')) {
      let q = baseQuery(cfg).limit(5000)
      if (st.sort) q = q.order(st.sort.key, { ascending: st.sort.asc })
      const { data } = await q
      downloadCsv(`${cfg.key || cfg.table}.csv`, (data || []).map((r) => Object.fromEntries(columns.filter((c) => c.label).map((c) => [c.label, c.csv ? c.csv(r) : c.key ? get(r, c.key) : stripHtml(c.render?.(r))]))))
      return
    }
    if (t.matches('[data-page]')) { st.page = +t.dataset.page; return load() }
    if (t.matches('th[data-sort]')) {
      const k = t.dataset.sort
      st.sort = st.sort?.key === k ? { key: k, asc: !st.sort.asc } : { key: k, asc: true }
      st.page = 0
      return load()
    }
    if (t.matches('[data-ra]')) return cfg.rowActions[+t.dataset.ra].run(row, load)
    if (t.matches('[data-edit]')) return openRowForm(cfg, row, load)
    if (t.matches('[data-del]')) { if (await deleteRow(cfg, row)) load(); return }
    if (t.matches('tr[data-i]') && !cfg.noDetail) location.hash = cfg.detailHref ? cfg.detailHref(row) : `#/m/${cfg.key}/${row.id}`
  })
  el.querySelector('[data-search]')?.addEventListener('input', debounce((e) => { st.search = e.target.value; st.page = 0; load() }))
  el.querySelector('[data-status]')?.addEventListener('change', (e) => { st.status = e.target.value; st.page = 0; load() })
  await load()
}

/* ==================================================================== DETAIL */
function displayValue(f, row) {
  let v = f.view ? get(row, f.view) : row[f.name]
  if (f.viewFn && v && typeof v === 'object') v = f.viewFn(v)
  if (v == null || v === '') return '—'
  if (f.type === 'date') return esc(date(v))
  if (f.type === 'money') return esc(money(v))
  if (f.type === 'checkbox') return v ? 'Yes' : 'No'
  if (f.name === 'status' || f.name === 'priority') return badge(v)
  return esc(titleCase(v)).replace(/\n/g, '<br>')
}

async function relatedCard(r, row, reload) {
  let q = supabase.from(r.table).select(r.select || '*').eq('organization_id', state.org.id).eq(r.fk, row.id)
  if (r.soft) q = q.is('deleted_at', null)
  if (r.order) q = q.order(r.order[0], { ascending: r.order[1] })
  q = q.limit(r.limit || 50)
  const { data, error } = await q
  const rows = data || []
  const canAdd = r.add && can(r.module, 'create')
  const canDel = r.add && can(r.module, 'delete')
  const cols = [...r.columns]
  if (canDel) cols.push({ label: '', render: () => `<div class="flex justify-end"><button class="btn btn-sm btn-ghost btn-icon btn-danger" data-rdel aria-label="Remove">${icon('trash', 'w-4 h-4')}</button></div>` })
  const wrap = document.createElement('section')
  wrap.className = 'card mt-5 print-keep'
  wrap.innerHTML = `<div class="flex items-center justify-between px-4 py-3 border-b border-line"><h2 class="font-semibold">${esc(r.title)}</h2>
    ${canAdd ? `<button class="btn btn-sm no-print" data-radd>${icon('plus', 'w-4 h-4')} ${esc(r.add.label || 'Add')}</button>` : ''}</div>
    ${error ? `<p class="p-4 text-bad">${esc(error.message)}</p>` : rows.length ? tableHtml(cols, rows) : '<p class="p-4 text-ink2">Nothing here yet.</p>'}`
  wrap.querySelector('[data-radd]')?.addEventListener('click', () =>
    openForm({
      title: r.add.label || `Add ${r.title.toLowerCase()}`, fields: r.add.fields, modal: r.add.fields.length < 3,
      onSubmit: async (p) => { unwrap(await supabase.from(r.table).insert({ ...p, [r.fk]: row.id, organization_id: state.org.id })); toast('Added'); reload() },
    }))
  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rdel]')
    if (!b) return
    const tr = b.closest('tr')
    const item = rows[+tr.dataset.i]
    if (await confirmDialog({ title: 'Remove this entry?', confirmLabel: 'Remove', danger: true })) {
      if (await attempt(async () => unwrap(await supabase.from(r.table).delete().eq('id', item.id)), 'Removed')) reload()
    }
  })
  return wrap
}

export async function renderDetail(cfg, id, el) {
  el.innerHTML = skeletonRows(4)
  async function load() {
    const { data: row, error } = await baseQuery(cfg).eq('id', id).maybeSingle()
    if (error || !row) { el.innerHTML = pageHeader({ title: 'Not found', back: `#/m/${cfg.key}` }) + `<div class="card">${emptyState('Record not found', error?.message || 'It may have been deleted or you may not have access.')}</div>`; return }
    const fields = fieldsOf(cfg)
    const actions = [
      ...(cfg.detailActions || []).filter((a) => !a.show || a.show(row)).map((a, i) => ({ a, i })).map(({ a }) => `<button class="btn ${a.danger ? 'btn-danger' : ''} no-print" data-da="${cfg.detailActions.indexOf(a)}">${a.icon ? icon(a.icon, 'w-4 h-4') : ''}${esc(a.label)}</button>`),
      !cfg.readonly && allow(cfg, 'Edit', row) ? `<button class="btn no-print" data-edit>${icon('edit', 'w-4 h-4')} Edit</button>` : '',
      !cfg.readonly && allow(cfg, 'Delete', row) ? `<button class="btn btn-danger no-print" data-del>${icon('trash', 'w-4 h-4')} Delete</button>` : '',
    ].join('')
    el.innerHTML = `${pageHeader({ title: cfg.detailTitle?.(row) || cfg.singular, subtitle: row.status ? '' : '', back: `#/m/${cfg.key}`, actions })}
      ${row.status ? `<div class="-mt-3 mb-4">${badge(row.status)}</div>` : ''}
      <div class="card p-5"><dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
        ${fields.map((f) => `<div class="${f.type === 'textarea' ? 'sm:col-span-2 lg:col-span-3' : ''}"><dt class="text-xs text-muted uppercase tracking-wide">${esc(f.label)}</dt><dd class="mt-0.5">${displayValue(f, row)}</dd></div>`).join('')}
      </dl></div><div data-related></div>`
    const host = el.querySelector('[data-related]')
    for (const r of cfg.related || []) {
      if (!can(r.module || cfg.module, 'view')) continue
      host.appendChild(await relatedCard(r, row, load))
    }
    el.onclick = async (e) => {
      const b = e.target.closest('button')
      if (!b) return
      if (b.matches('[data-da]')) cfg.detailActions[+b.dataset.da].run(row, load)
      if (b.matches('[data-edit]')) openRowForm(cfg, row, load)
      if (b.matches('[data-del]') && (await deleteRow(cfg, row))) location.hash = `#/m/${cfg.key}`
    }
  }
  await load()
}
