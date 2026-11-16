import { supabase } from './supabase.js'
import { state } from './state.js'
import { esc, get, titleCase } from './format.js'
import { icon } from './icons.js'

/* ------------------------------------------------------------------ toast */
export function toast(message, type = 'ok') {
  let host = document.getElementById('toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toast-host'
    host.className = 'toast-host fixed bottom-4 right-4 z-[70] flex flex-col gap-2'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.setAttribute('role', type === 'error' ? 'alert' : 'status')
  el.textContent = message
  host.appendChild(el)
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200)
}

export const errMsg = (e) => {
  const m = (e?.message || String(e || '')).replace(/^.*?(ERROR:\s*)/, '')
  if (/rate limit/i.test(m)) return 'Too many emails were sent. Please wait a while and try again.'
  if (/invalid login/i.test(m)) return 'Email or password is not correct.'
  if (/already registered/i.test(m)) return 'This email already has an account. Please sign in.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first, then sign in.'
  return m || 'Something went wrong. Please try again.'
}

/** Run an async action, showing a toast on success/failure. Returns true if it succeeded. */
export async function attempt(fn, success) {
  try {
    await fn()
    if (success) toast(success)
    return true
  } catch (e) {
    toast(errMsg(e), 'error')
    return false
  }
}

/* ---------------------------------------------------------------- overlays */
export function openDrawer({ title, body = '', footer = '', modal = false }) {
  const prevFocus = document.activeElement
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  const panel = document.createElement('div')
  panel.className = modal ? 'modal' : 'drawer'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', title)
  panel.innerHTML = modal
    ? `<div class="flex items-center justify-between mb-3"><h2 class="text-base font-semibold">${esc(title)}</h2>
         <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('x')}</button></div>
       <div data-body>${body}</div><div data-footer class="mt-4 flex justify-end gap-2">${footer}</div>`
    : `<div class="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
         <h2 class="text-base font-semibold truncate">${esc(title)}</h2>
         <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close">${icon('x')}</button></div>
       <div data-body class="flex-1 overflow-y-auto p-5">${body}</div>
       <div data-footer class="shrink-0 border-t border-line px-5 py-3 flex justify-end gap-2 bg-raised">${footer}</div>`
  document.body.append(overlay, panel)
  const close = () => {
    overlay.remove(); panel.remove()
    document.removeEventListener('keydown', onKey)
    prevFocus?.focus?.()
  }
  const onKey = (e) => e.key === 'Escape' && close()
  document.addEventListener('keydown', onKey)
  overlay.addEventListener('click', close)
  panel.querySelector('[data-close]').addEventListener('click', close)
  setTimeout(() => panel.querySelector('input,select,textarea,button:not([data-close])')?.focus(), 30)
  return { close, panel, body: panel.querySelector('[data-body]'), footer: panel.querySelector('[data-footer]') }
}

export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const d = openDrawer({
      title, modal: true,
      body: `<p class="text-ink2">${esc(message)}</p>`,
      footer: `<button class="btn" data-no>Cancel</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmLabel)}</button>`,
    })
    let done = false
    const fin = (v) => { if (!done) { done = true; resolve(v); d.close() } }
    d.panel.querySelector('[data-no]').onclick = () => fin(false)
    d.panel.querySelector('[data-yes]').onclick = () => fin(true)
    d.panel.querySelector('[data-close]').addEventListener('click', () => fin(false))
  })
}

/* ------------------------------------------------------------------- forms */
const optionCache = new Map()
export const clearOptionCache = () => optionCache.clear()

export async function loadRefOptions(ref) {
  const key = `${state.org?.id}|${ref.table}|${ref.select || ''}|${ref.filter ? 'f' + ref.filter.toString() : ''}`
  if (optionCache.has(key)) return optionCache.get(key)
  const labelFn = typeof ref.label === 'function' ? ref.label : (r) => r[ref.label]
  const select = ref.select || `id,${typeof ref.label === 'string' ? ref.label : 'name'}`
  let q = supabase.from(ref.table).select(select).eq('organization_id', state.org.id).limit(1000)
  if (ref.soft) q = q.is('deleted_at', null)
  if (ref.filter) q = ref.filter(q)
  if (typeof ref.label === 'string') q = q.order(ref.label)
  const { data, error } = await q
  if (error) throw error
  const opts = (data || []).map((r) => ({ value: r.id, label: labelFn(r), row: r }))
  optionCache.set(key, opts)
  return opts
}

function fieldHtml(f, value, opts) {
  const id = `f_${f.name}`
  const req = f.required ? 'required' : ''
  const ro = f.readonly ? 'disabled' : ''
  let control
  const v = value ?? f.default ?? ''
  if (f.type === 'textarea') {
    control = `<textarea class="textarea" id="${id}" name="${f.name}" ${req} ${ro} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`
  } else if (f.type === 'select' || f.ref) {
    const list = f.ref ? opts || [] : (f.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: titleCase(o) }))
    control = `<select class="select" id="${id}" name="${f.name}" ${req} ${ro}>
      ${f.required && v !== '' ? '' : `<option value="">${f.required ? 'Select…' : '— None —'}</option>`}
      ${list.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>`
  } else if (f.type === 'checkbox') {
    control = `<label class="flex items-center gap-2 h-9"><input type="checkbox" id="${id}" name="${f.name}" ${v === true || v === 'true' ? 'checked' : ''} ${ro} class="w-4 h-4 accent-[var(--accent)]"/> <span>${esc(f.checkLabel || 'Yes')}</span></label>`
  } else {
    const type = { money: 'number', number: 'number', datetime: 'datetime-local' }[f.type] || f.type || 'text'
    const step = f.type === 'money' ? 'step="0.01"' : f.step ? `step="${f.step}"` : f.type === 'number' ? 'step="any"' : ''
    const min = f.min != null ? `min="${f.min}"` : ''
    control = `<input class="input" id="${id}" name="${f.name}" type="${type}" ${step} ${min} ${req} ${ro} value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"/>`
  }
  return `<div class="${f.span === 2 || f.type === 'textarea' ? 'sm:col-span-2' : ''}">
    <label class="label" for="${id}">${esc(f.label)}${f.required ? ' <span class="text-bad">*</span>' : ''}</label>${control}
    ${f.hint ? `<p class="text-xs text-muted mt-1">${esc(f.hint)}</p>` : ''}</div>`
}

export async function formHtml(fields, values = {}) {
  const refOpts = {}
  await Promise.all(fields.filter((f) => f.ref).map(async (f) => (refOpts[f.name] = await loadRefOptions(f.ref))))
  return `<form class="grid grid-cols-1 sm:grid-cols-2 gap-4" novalidate>
    ${fields.map((f) => fieldHtml(f, values[f.name], refOpts[f.name])).join('')}
    <div class="sm:col-span-2 field-error hidden" data-error role="alert"></div></form>`
}

export function collect(form, fields) {
  const out = {}
  for (const f of fields) {
    if (f.readonly) continue
    const el = form.elements[f.name]
    if (!el) continue
    if (f.type === 'checkbox') out[f.name] = el.checked
    else if (f.type === 'number' || f.type === 'money') out[f.name] = el.value === '' ? null : Number(el.value)
    else if (f.type === 'datetime') out[f.name] = el.value ? new Date(el.value).toISOString() : null
    else out[f.name] = el.value === '' ? null : el.value
  }
  return out
}

/** Opens a form in a drawer (or modal). onSubmit(payload) may throw to show an error. */
export async function openForm({ title, fields, values = {}, submitLabel = 'Save', onSubmit, modal = false }) {
  const body = await formHtml(fields, values)
  const d = openDrawer({
    title, modal, body,
    footer: `<button type="button" class="btn" data-cancel>Cancel</button>
             <button type="button" class="btn btn-primary" data-save>${esc(submitLabel)}</button>`,
  })
  const form = d.panel.querySelector('form')
  const save = d.panel.querySelector('[data-save]')
  const errBox = form.querySelector('[data-error]')
  d.panel.querySelector('[data-cancel]').onclick = d.close
  const submit = async () => {
    if (!form.reportValidity()) return
    save.disabled = true
    save.innerHTML = `${icon('loader', 'w-4 h-4 spin')} Saving…`
    errBox.classList.add('hidden')
    try {
      await onSubmit(collect(form, fields), d)
      d.close()
    } catch (e) {
      errBox.textContent = errMsg(e)
      errBox.classList.remove('hidden')
      save.disabled = false
      save.textContent = submitLabel
    }
  }
  save.onclick = submit
  form.addEventListener('submit', (e) => { e.preventDefault(); submit() })
  return d
}

/* ------------------------------------------------------------------- tables */
export function tableHtml(columns, rows, { sort, clickable = false } = {}) {
  const head = columns
    .map((c) => {
      const active = sort?.key === c.sortKey
      const arrow = active ? (sort.asc ? ' ↑' : ' ↓') : ''
      return `<th scope="col" class="${c.sortKey ? 'th-sort' : ''} ${c.right ? 'text-right' : ''}" ${c.sortKey ? `data-sort="${c.sortKey}"` : ''}
        ${active ? `aria-sort="${sort.asc ? 'ascending' : 'descending'}"` : ''}>${esc(c.label)}${arrow}</th>`
    })
    .join('')
  const body = rows
    .map(
      (r, i) => `<tr ${clickable ? 'class="clickable"' : ''} data-i="${i}">${columns
        .map((c) => {
          const val = c.render ? c.render(r) : esc(get(r, c.key) ?? '—')
          return `<td data-label="${esc(c.label)}" class="${c.right ? 'text-right num' : ''} ${c.cls || ''}">${val}</td>`
        })
        .join('')}</tr>`,
    )
    .join('')
  return `<div class="overflow-x-auto"><table class="tbl tbl-stack"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

export function skeletonRows(n = 6) {
  return `<div class="p-4 space-y-3">${Array.from({ length: n }, () => '<div class="skeleton h-9"></div>').join('')}</div>`
}

export function emptyState(title, hint = '', actionHtml = '') {
  return `<div class="py-14 text-center"><div class="mx-auto w-11 h-11 rounded-full bg-accent-soft text-accent flex items-center justify-center mb-3">${icon('folder', 'w-5 h-5')}</div>
    <p class="font-medium">${esc(title)}</p>${hint ? `<p class="text-ink2 mt-1 text-sm">${esc(hint)}</p>` : ''}
    ${actionHtml ? `<div class="mt-4">${actionHtml}</div>` : ''}</div>`
}

export function pagerHtml({ page, pageSize, total }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total ? page * pageSize + 1 : 0
  const to = Math.min(total, (page + 1) * pageSize)
  return `<div class="flex items-center justify-between px-4 py-3 border-t border-line text-ink2 text-sm">
    <span>${from}–${to} of ${total}</span>
    <div class="flex gap-2"><button class="btn btn-sm" data-page="${page - 1}" ${page <= 0 ? 'disabled' : ''}>Previous</button>
    <button class="btn btn-sm" data-page="${page + 1}" ${page + 1 >= pages ? 'disabled' : ''}>Next</button></div></div>`
}

export function pageHeader({ title, subtitle = '', actions = '', back = '' }) {
  return `<div class="flex flex-wrap items-start justify-between gap-3 mb-5">
    <div class="min-w-0">${back ? `<a href="${back}" class="text-sm text-ink2 hover:text-ink inline-flex items-center gap-1 mb-1">← Back</a>` : ''}
      <h1 class="text-2xl font-semibold tracking-tight">${esc(title)}</h1>
      ${subtitle ? `<p class="text-ink2 mt-0.5">${esc(subtitle)}</p>` : ''}</div>
    <div class="flex flex-wrap items-center gap-2">${actions}</div></div>`
}

export const statCard = (label, value, sub = '', tone = '', hero = false) =>
  `<div class="card p-5 ${hero ? 'card-hero' : ''}"><p class="${hero ? 'hero-sub' : 'text-ink2'} text-[13px]">${esc(label)}</p>
   <p class="text-3xl font-semibold mt-1 num ${hero ? '' : tone}">${value}</p>${sub ? `<p class="text-xs ${hero ? 'hero-sub' : 'text-muted'} mt-1">${sub}</p>` : ''}</div>`
