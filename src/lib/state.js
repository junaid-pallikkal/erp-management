import { supabase, unwrap } from './supabase.js'

export const state = {
  session: null,
  profile: null,
  memberships: [],
  membership: null,
  org: null,
  role: null,
  perms: new Set(),
  employeeId: null,
  unread: 0,
}

/** True when the signed-in user may perform `action` on `module` in the active organization. */
export const can = (module, action = 'view') => state.perms.has(`${module}:${action}`)
export const isPlatformAdmin = () => Boolean(state.profile?.is_platform_admin)

export function applyTheme(pref) {
  const p = pref || localStorage.getItem('theme') || 'system'
  try { localStorage.setItem('theme', p) } catch {}
  const dark = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export async function loadContext() {
  const { data } = await supabase.auth.getSession()
  state.session = data.session
  Object.assign(state, { profile: null, memberships: [], membership: null, org: null, role: null, perms: new Set(), employeeId: null })
  if (!state.session) return

  state.profile = unwrap(await supabase.from('profiles').select('*').eq('id', state.session.user.id).single())
  applyTheme(state.profile.theme_preference)

  state.memberships = unwrap(
    await supabase
      .from('memberships')
      .select('*, organization:organizations(*), role:roles(*)')
      .eq('profile_id', state.session.user.id)
      .eq('status', 'active'),
  )
  const m =
    state.memberships.find((x) => x.organization_id === state.profile.last_active_organization_id) ||
    state.memberships[0]
  if (m) await selectMembership(m)
}

async function selectMembership(m) {
  state.membership = m
  state.org = m.organization
  state.role = m.role
  state.employeeId = m.employee_id
  state.perms = new Set()
  if (state.org?.status === 'active') {
    const rows = unwrap(
      await supabase.from('role_permissions').select('permission:permissions(module,action)').eq('role_id', m.role_id),
    )
    rows.forEach((r) => state.perms.add(`${r.permission.module}:${r.permission.action}`))
    await refreshUnread()
  }
}

export async function switchOrganization(orgId) {
  await supabase.from('profiles').update({ last_active_organization_id: orgId }).eq('id', state.session.user.id)
  await loadContext()
}

export async function refreshUnread() {
  if (!state.org) return
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', state.org.id)
    .eq('is_read', false)
  state.unread = count || 0
  const el = document.getElementById('notif-count')
  if (el) {
    el.textContent = state.unread > 99 ? '99+' : state.unread
    el.classList.toggle('hidden', !state.unread)
  }
}
