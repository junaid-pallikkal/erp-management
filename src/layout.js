import { supabase } from './lib/supabase.js'
import { state, can, isPlatformAdmin, applyTheme, switchOrganization } from './lib/state.js'
import { esc, debounce, fullName } from './lib/format.js'
import { icon } from './lib/icons.js'
import { nav } from './modules/registry.js'

let shellKey = null

const SEARCH_SOURCES = [
  { table: 'employees', module: 'employees', cols: 'id,first_name,last_name,employee_code', or: ['first_name', 'last_name', 'employee_code'], label: (r) => fullName(r), hint: 'Employee', href: (r) => `#/m/employees/${r.id}`, soft: true },
  { table: 'customers', module: 'customers', cols: 'id,name', or: ['name', 'email'], label: (r) => r.name, hint: 'Customer', href: (r) => `#/m/customers/${r.id}`, soft: true },
  { table: 'suppliers', module: 'suppliers', cols: 'id,name', or: ['name', 'email'], label: (r) => r.name, hint: 'Supplier', href: (r) => `#/m/suppliers/${r.id}`, soft: true },
  { table: 'products', module: 'inventory', cols: 'id,name,sku', or: ['name', 'sku'], label: (r) => `${r.name} · ${r.sku}`, hint: 'Product', href: (r) => `#/m/products/${r.id}`, soft: true },
  { table: 'projects', module: 'projects', cols: 'id,name', or: ['name', 'code'], label: (r) => r.name, hint: 'Project', href: (r) => `#/m/projects/${r.id}`, soft: true },
  { table: 'sales_orders', module: 'sales', cols: 'id,order_number', or: ['order_number'], label: (r) => r.order_number, hint: 'Sales order', href: (r) => `#/orders/sales/${r.id}`, soft: true },
  { table: 'invoices', module: 'sales', cols: 'id,invoice_number', or: ['invoice_number'], label: (r) => r.invoice_number, hint: 'Invoice', href: (r) => `#/m/invoices/${r.id}`, soft: true },
]

function navHtml() {
  const groups = nav
    .map((g) => {
      const items = g.items.filter((i) => can(i.module, 'view'))
      if (!items.length) return ''
      return `<div class="nav-title">${g.title}</div>${items
        .map((i) => `<a class="nav-link" href="${i.href}" data-href="${i.href}" data-also="${(i.also || []).join(' ')}">${icon(i.icon)}<span>${i.label}</span></a>`)
        .join('')}`
    })
    .join('')
  const platform = isPlatformAdmin()
    ? `<div class="nav-title">Platform</div><a class="nav-link" href="#/platform" data-href="#/platform">${icon('globe')}<span>Organizations</span></a>`
    : ''
  return groups + platform
}

export function mountShell(root) {
  const key = `${state.session?.user.id}|${state.org?.id}|${[...state.perms].length}`
  if (shellKey === key && root.querySelector('#content')) return root.querySelector('#content')
  shellKey = key
  const initial = (state.profile?.full_name || state.profile?.email || '?').trim()[0].toUpperCase()
  root.innerHTML = `
  <div class="min-h-screen lg:pl-[17.5rem]">
    <aside id="sidebar" class="fixed top-3 bottom-3 left-3 w-64 bg-surface rounded-[28px] shadow-[var(--soft-shadow)] border border-line z-30 flex flex-col -translate-x-[120%] lg:translate-x-0 transition-transform">
      <div class="h-16 px-5 flex items-center gap-3 shrink-0">
        <div class="w-10 h-10 rounded-2xl bg-accent shadow-[0_8px_18px_rgb(31_122_77/.35)] text-white dark:text-[#0b0f17] flex items-center justify-center font-bold text-lg">${esc((state.org?.name || 'E')[0].toUpperCase())}</div>
        ${state.memberships.length > 1
          ? `<select id="org-switch" class="select !h-8 !border-0 font-semibold !px-1" aria-label="Switch organization">${state.memberships.map((m) => `<option value="${m.organization_id}" ${m.organization_id === state.org?.id ? 'selected' : ''}>${esc(m.organization.name)}</option>`).join('')}</select>`
          : `<span class="font-semibold truncate">${esc(state.org?.name || 'ERP')}</span>`}
      </div>
      <nav class="flex-1 overflow-y-auto px-4 pb-6 space-y-0.5" aria-label="Main">${navHtml()}</nav>
    </aside>
    <div id="scrim" class="fixed inset-0 bg-black/40 z-20 hidden lg:hidden"></div>
    <header class="topbar sticky top-0 z-10 h-[72px] bg-[var(--bg)]/85 backdrop-blur flex items-center gap-3 px-4 sm:px-6">
      <button class="btn btn-icon btn-round lg:hidden" id="menu-btn" aria-label="Open menu">${icon('menu')}</button>
      <div class="relative flex-1 max-w-md">
        <span class="absolute left-4 top-3 text-muted">${icon('search', 'w-4 h-4')}</span>
        <input id="gsearch" class="input pl-10 !rounded-full" type="search" placeholder="Search people, customers, products…" aria-label="Global search" autocomplete="off"/>
        <div id="gresults" class="hidden absolute left-0 right-0 top-11 card shadow-lg z-20 max-h-80 overflow-y-auto"></div>
      </div>
      <div class="ml-auto flex items-center gap-1">
        <button class="btn btn-icon btn-round" id="theme-btn" aria-label="Toggle theme">${icon(document.documentElement.classList.contains('dark') ? 'sun' : 'moon')}</button>
        <a class="btn btn-icon btn-round relative" href="#/notifications" aria-label="Notifications">${icon('bell')}
          <span id="notif-count" class="hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[11px] flex items-center justify-center">0</span></a>
        <div class="relative">
          <button class="w-10 h-10 rounded-full bg-accent text-white dark:text-[#0d1220] font-semibold shadow-[0_6px_14px_rgb(31_122_77/.35)]" id="avatar-btn" aria-haspopup="menu" aria-label="Account menu">${esc(initial)}</button>
          <div id="avatar-menu" class="hidden absolute right-0 top-11 card w-56 shadow-lg z-20 p-1" role="menu">
            <div class="px-3 py-2 border-b border-line mb-1"><p class="font-medium truncate">${esc(state.profile?.full_name || '')}</p>
              <p class="text-xs text-muted truncate">${esc(state.profile?.email || '')}</p>
              ${state.role ? `<p class="text-xs text-accent mt-0.5">${esc(state.role.label)}</p>` : ''}</div>
            <a class="nav-link" href="#/profile" role="menuitem">${icon('user')} Profile</a>
            <button class="nav-link w-full" id="logout-btn" role="menuitem">${icon('logout')} Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <main id="content" class="px-4 pb-8 sm:px-6 max-w-[1320px] mx-auto"></main>
  </div>`

  const sidebar = root.querySelector('#sidebar')
  const scrim = root.querySelector('#scrim')
  const toggle = (open) => { sidebar.classList.toggle('-translate-x-[120%]', !open); scrim.classList.toggle('hidden', !open) }
  root.querySelector('#menu-btn').onclick = () => toggle(true)
  scrim.onclick = () => toggle(false)
  sidebar.addEventListener('click', (e) => e.target.closest('a') && toggle(false))

  root.querySelector('#org-switch')?.addEventListener('change', async (e) => { await switchOrganization(e.target.value); shellKey = null; location.hash = '#/'; location.reload() })

  root.querySelector('#theme-btn').onclick = async () => {
    const dark = !document.documentElement.classList.contains('dark')
    const pref = dark ? 'dark' : 'light'
    applyTheme(pref)
    root.querySelector('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon')
    await supabase.from('profiles').update({ theme_preference: pref }).eq('id', state.session.user.id)
  }

  const menu = root.querySelector('#avatar-menu')
  root.querySelector('#avatar-btn').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('hidden') }
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.classList.add('hidden')
    const gr = root.querySelector('#gresults')
    if (gr && !gr.contains(e.target) && e.target.id !== 'gsearch') gr?.classList.add('hidden')
  })
  root.querySelector('#logout-btn').onclick = async () => { await supabase.auth.signOut() }

  // Global search
  const gs = root.querySelector('#gsearch')
  const gr = root.querySelector('#gresults')
  gs.addEventListener('input', debounce(async () => {
    const s = gs.value.replace(/[,()%*]/g, ' ').trim()
    if (s.length < 2) return gr.classList.add('hidden')
    const hits = await Promise.all(SEARCH_SOURCES.filter((x) => can(x.module, 'view')).map(async (x) => {
      let q = supabase.from(x.table).select(x.cols).eq('organization_id', state.org.id).or(x.or.map((c) => `${c}.ilike.%${s}%`).join(',')).limit(4)
      if (x.soft) q = q.is('deleted_at', null)
      const { data } = await q
      return (data || []).map((r) => ({ label: x.label(r), hint: x.hint, href: x.href(r) }))
    }))
    const flat = hits.flat()
    gr.innerHTML = flat.length
      ? flat.map((h) => `<a href="${h.href}" class="flex justify-between gap-3 px-4 py-2.5 hover:bg-bg border-b border-line last:border-0"><span class="truncate">${esc(h.label)}</span><span class="text-xs text-muted shrink-0">${h.hint}</span></a>`).join('')
      : '<p class="px-4 py-3 text-ink2">No results</p>'
    gr.classList.remove('hidden')
  }))
  gr.addEventListener('click', () => { gr.classList.add('hidden'); gs.value = '' })

  return root.querySelector('#content')
}

export function highlightNav(path) {
  const hash = '#' + path
  document.querySelectorAll('#sidebar .nav-link').forEach((a) => {
    const hrefs = [a.dataset.href, ...(a.dataset.also || '').split(' ').filter(Boolean)]
    const active = hrefs.some((h) => (h === '#/' ? hash === '#/' : hash === h || hash.startsWith(h + '/')))
    a.classList.toggle('active', active)
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current')
  })
}

export function resetShell() { shellKey = null }
