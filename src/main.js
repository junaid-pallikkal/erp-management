import './style.css'
import { supabase, isConfigured } from './lib/supabase.js'
import { state, loadContext, can, isPlatformAdmin, applyTheme, refreshUnread } from './lib/state.js'
import { route, resolve, currentPath, currentQuery } from './lib/router.js'
import { mountShell, highlightNav, resetShell } from './layout.js'
import { esc } from './lib/format.js'
import { toast } from './lib/ui.js'
import { configFor } from './modules/registry.js'

const app = document.getElementById('app')
let cleanup = null
let renderToken = 0
let channel = null

/* ------------------------------------------------------------------ routes */
const page = (loader) => async () => (await loader()).default

// Public / auth
route('/login', page(() => import('./pages/auth.js').then((m) => ({ default: m.login }))), { public: true, bare: true, guestOnly: true })
route('/register', page(() => import('./pages/auth.js').then((m) => ({ default: m.register }))), { public: true, bare: true, guestOnly: true })
route('/forgot', page(() => import('./pages/auth.js').then((m) => ({ default: m.forgot }))), { public: true, bare: true })
route('/reset', page(() => import('./pages/auth.js').then((m) => ({ default: m.reset }))), { public: true, bare: true })
route('/accept/:token', page(() => import('./pages/auth.js').then((m) => ({ default: m.accept }))), { public: true, bare: true })
route('/setup', page(() => import('./pages/setup.js')), { bare: true, noOrg: true })

// App
route('/', page(() => import('./pages/dashboard.js')), { perm: ['dashboard', 'view'] })
route('/m/:key', async () => async (el, ctx) => {
  const cfg = configFor(ctx.params.key)
  if (!cfg) return notFound(el)
  if (!can(cfg.module, 'view')) return noAccess(el)
  return (await import('./pages/resource.js')).renderList(cfg, el)
})
route('/m/:key/:id', async () => async (el, ctx) => {
  const cfg = configFor(ctx.params.key)
  if (!cfg || cfg.noDetail) return notFound(el)
  if (!can(cfg.module, 'view')) return noAccess(el)
  return (await import('./pages/resource.js')).renderDetail(cfg, ctx.params.id, el)
})
route('/tasks', page(() => import('./pages/tasks.js')), { perm: ['tasks', 'view'] })
route('/orders/:kind/new', page(() => import('./pages/orders.js').then((m) => ({ default: m.form }))))
route('/orders/:kind/:id', page(() => import('./pages/orders.js').then((m) => ({ default: m.detail }))))
route('/finance', page(() => import('./pages/finance.js')), { perm: ['finance', 'view'] })
route('/reports', page(() => import('./pages/reports.js')), { perm: ['reports', 'view'] })
route('/notifications', page(() => import('./pages/notifications.js')), { perm: ['notifications', 'view'] })
route('/settings', page(() => import('./pages/settings.js')), { perm: ['settings', 'view'] })
route('/settings/:tab', page(() => import('./pages/settings.js')), { perm: ['settings', 'view'] })
route('/profile', page(() => import('./pages/profile.js')))
route('/platform', page(() => import('./pages/platform.js')), { platform: true, noOrg: true })

/* --------------------------------------------------------------- utilities */
function notFound(el) {
  el.innerHTML = `<div class="card py-16 text-center"><p class="text-lg font-semibold">Page not found</p><p class="text-ink2 mt-1">The page you are looking for does not exist.</p><a class="btn btn-primary mt-4" href="#/">Go to dashboard</a></div>`
}
function noAccess(el) {
  el.innerHTML = `<div class="card py-16 text-center"><p class="text-lg font-semibold">No access</p><p class="text-ink2 mt-1">Your role does not include permission to view this page.</p><a class="btn mt-4" href="#/">Back to dashboard</a></div>`
}
function bareScreen(html) {
  app.innerHTML = `<div class="min-h-screen flex items-center justify-center p-6"><div class="card p-8 max-w-md w-full text-center">${html}</div></div>`
}

function subscribeRealtime() {
  if (channel || !state.session) return
  channel = supabase
    .channel('notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${state.session.user.id}` },
      (payload) => { refreshUnread(); toast(payload.new.title, 'info') })
    .subscribe()
}

/* ------------------------------------------------------------------ render */
async function render() {
  const token = ++renderToken
  if (cleanup) { try { cleanup() } catch {} cleanup = null }

  if (!isConfigured) {
    return bareScreen(`<h1 class="text-xl font-semibold mb-2">Supabase is not configured</h1>
      <p class="text-ink2">Copy <code>.env.example</code> to <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.</p>`)
  }

  const path = currentPath()
  const found = resolve(path)
  if (!found) {
    return notFound(mountOrBare(!state.session || !state.org))
  }
  const { route: r, params } = found

  if (!state.session && !r.public) return void (location.hash = '#/login')
  if (state.session && r.guestOnly) return void (location.hash = '#/')
  if (r.platform && !isPlatformAdmin()) return void (location.hash = '#/')

  if (state.session && !state.org && !r.noOrg && !r.public) {
    return void (location.hash = isPlatformAdmin() ? '#/platform' : '#/setup')
  }
  if (state.org && state.org.status === 'suspended' && !r.public) {
    bareScreen(`<h1 class="text-xl font-semibold mb-2">Organization suspended</h1><p class="text-ink2">Access to ${esc(state.org.name)} has been suspended. Contact the platform administrator.</p>
      <button class="btn mt-5" id="so">Sign out</button>`)
    document.getElementById('so').addEventListener('click', () => supabase.auth.signOut())
    return
  }

  const el = mountOrBare(r.bare || !state.session)
  if (r.perm && !can(...r.perm)) return noAccess(el)

  let fn
  try { fn = await r.loader() } catch (e) { return void (el.innerHTML = `<div class="card p-6 text-bad">Failed to load page: ${esc(e.message)}</div>`) }
  if (token !== renderToken) return
  window.scrollTo(0, 0)
  try {
    const result = await fn(el, { params, query: currentQuery() })
    if (token !== renderToken) { if (typeof result === 'function') result(); return }
    if (typeof result === 'function') cleanup = result
  } catch (e) {
    console.error(e)
    el.innerHTML = `<div class="card p-6"><p class="font-semibold text-bad">Something went wrong</p><p class="text-ink2 mt-1">${esc(e.message || e)}</p></div>`
  }
  highlightNav(path)
}

/** Returns a fresh container: inside the app shell, or a bare full-page container. */
function mountOrBare(bare) {
  if (bare) {
    resetShell()
    app.innerHTML = '<div id="content"></div>'
    return app.firstElementChild
  }
  const content = mountShell(app)
  const fresh = content.cloneNode(false) // drop listeners from the previous page
  content.replaceWith(fresh)
  return fresh
}

/* -------------------------------------------------------------------- boot */
async function boot() {
  applyTheme()
  if (isConfigured) {
    supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        if (channel) { supabase.removeChannel(channel); channel = null }
        await loadContext()
        resetShell()
        location.hash = '#/login'
      } else if (event === 'PASSWORD_RECOVERY') {
        location.hash = '#/reset'
      }
    })
    try {
      await loadContext()
      if (state.org) {
        subscribeRealtime()
        supabase.rpc('refresh_overdue', { p_org: state.org.id })
      }
    } catch (e) {
      console.error(e)
    }
  }
  window.addEventListener('hashchange', render)
  window.addEventListener('ctx-changed', () => {
    if (!state.org) return
    subscribeRealtime()
    supabase.rpc('refresh_overdue', { p_org: state.org.id })
  })
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())
  if (!location.hash) location.hash = '#/'
  render()
}

boot()
