import { supabase, unwrap } from '../lib/supabase.js'
import { state, can, loadContext } from '../lib/state.js'
import { esc, dateTime, titleCase, timeAgo, fullName, badge } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import { pageHeader, formHtml, collect, openForm, attempt, toast, errMsg, skeletonRows, tableHtml, emptyState, confirmDialog, openDrawer, loadRefOptions, clearOptionCache } from '../lib/ui.js'

const TABS = [
  ['organization', 'Organization'], ['users', 'Users'], ['roles', 'Roles & permissions'], ['master', 'Master data'], ['audit', 'Audit log'],
]
const MODULES = ['dashboard', 'employees', 'departments', 'attendance', 'leave', 'projects', 'tasks', 'customers', 'suppliers', 'inventory', 'sales', 'purchases', 'finance', 'reports', 'notifications', 'settings', 'users']
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export']
const inviteLink = (t) => `${location.origin}${location.pathname}#/accept/${t}`

export default async function settings(el, { params }) {
  const tab = params.tab && TABS.some(([k]) => k === params.tab) ? params.tab : 'organization'
  el.innerHTML = `${pageHeader({ title: 'Settings', subtitle: state.org.name })}
    <div class="flex gap-1 border-b border-line mb-5 overflow-x-auto" role="tablist">${TABS.map(([k, l]) => `<a role="tab" aria-selected="${k === tab}" href="#/settings/${k}" class="px-4 py-2.5 whitespace-nowrap font-medium border-b-2 -mb-px ${k === tab ? 'border-accent text-accent' : 'border-transparent text-ink2 hover:text-ink'}">${l}</a>`).join('')}</div>
    <div id="tab">${skeletonRows(4)}</div>`
  const host = el.querySelector('#tab')
  await { organization, users, roles, master, audit }[tab](host)
}

/* ---------------------------------------------------------- organization */
async function organization(host) {
  const o = state.org
  const editable = can('settings', 'edit')
  const fields = [
    { name: 'name', label: 'Organization name', required: true }, { name: 'industry', label: 'Industry' },
    { name: 'country', label: 'Country' }, { name: 'timezone', label: 'Timezone' },
    { name: 'currency', label: 'Currency (ISO code)', required: true, hint: 'Changing currency does not convert existing amounts.' },
    { name: 'fiscal_year_start_month', label: 'Fiscal year starts (month 1–12)', type: 'number', min: 1 },
    { name: 'date_format', label: 'Date format', type: 'select', options: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] },
    { name: 'default_tax_rate', label: 'Default tax rate (%)', type: 'number', min: 0 },
  ].map((f) => ({ ...f, readonly: !editable }))
  host.innerHTML = `<div class="card p-5 max-w-3xl">${await formHtml(fields, o)}
    ${editable ? '<div class="mt-5"><button class="btn btn-primary" id="save">Save changes</button></div>' : '<p class="text-sm text-ink2 mt-4">You have read-only access to these settings.</p>'}</div>`
  host.querySelector('#save')?.addEventListener('click', async () => {
    const form = host.querySelector('form'); if (!form.reportValidity()) return
    if (await attempt(async () => { unwrap(await supabase.from('organizations').update(collect(form, fields)).eq('id', o.id)); await loadContext() }, 'Organization updated')) location.reload()
  })
}

/* ------------------------------------------------------------------ users */
async function users(host) {
  const canEdit = can('users', 'edit'), canInvite = can('users', 'create')
  async function draw() {
    const [{ data: members, error }, { data: roles }, { data: invites }, employees] = await Promise.all([
      supabase.from('memberships').select('*, profile:profiles!profile_id(full_name,email), role:roles!role_id(id,name,label)').eq('organization_id', state.org.id).order('joined_at'),
      supabase.from('roles').select('id,name,label').eq('organization_id', state.org.id).order('name'),
      supabase.from('invitations').select('*, role:roles!role_id(label)').eq('organization_id', state.org.id).eq('status', 'pending').order('created_at', { ascending: false }),
      loadRefOptions({ table: 'employees', select: 'id,first_name,last_name', label: fullName, soft: true }),
    ])
    if (error) return void (host.innerHTML = `<p class="text-bad">${esc(error.message)}</p>`)
    const sel = (m) => canEdit && m.profile_id !== state.session.user.id
      ? `<select class="select !h-8 min-w-[150px]" data-role="${m.id}" aria-label="Role">${roles.map((r) => `<option value="${r.id}" ${r.id === m.role_id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select>` : esc(m.role?.label)
    host.innerHTML = `<div class="flex justify-between items-center mb-3"><p class="text-ink2">${members.length} member${members.length === 1 ? '' : 's'}</p>
      ${canInvite ? `<button class="btn btn-primary" id="invite">${icon('plus', 'w-4 h-4')} Invite user</button>` : ''}</div>
      <div class="card">${tableHtml([
        { label: 'User', render: (m) => `<span class="font-medium">${esc(m.profile?.full_name || '—')}</span><div class="text-xs text-muted">${esc(m.profile?.email || '')}</div>` },
        { label: 'Role', render: sel },
        { label: 'Linked employee', render: (m) => canEdit ? `<select class="select !h-8 min-w-[170px]" data-emp="${m.id}" aria-label="Employee"><option value="">— None —</option>${employees.map((e) => `<option value="${e.value}" ${e.value === m.employee_id ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}</select>` : esc(employees.find((e) => e.value === m.employee_id)?.label || '—') },
        { label: 'Status', render: (m) => badge(m.status) },
        { label: '', render: (m) => canEdit && m.profile_id !== state.session.user.id ? `<div class="flex justify-end"><button class="btn btn-sm ${m.status === 'active' ? 'btn-danger' : ''}" data-st="${m.id}">${m.status === 'active' ? 'Deactivate' : 'Reactivate'}</button></div>` : '' },
      ], members)}</div>
      <h2 class="font-semibold mt-8 mb-3">Pending invitations</h2>
      <div class="card">${invites?.length ? tableHtml([
        { label: 'Email', render: (i) => esc(i.email) }, { label: 'Role', render: (i) => esc(i.role?.label) }, { label: 'Expires', render: (i) => new Date(i.expires_at).toLocaleDateString() },
        { label: '', render: () => `<div class="flex justify-end gap-2"><button class="btn btn-sm" data-copy>${icon('copy', 'w-4 h-4')} Copy link</button>${canEdit ? '<button class="btn btn-sm btn-danger" data-revoke>Revoke</button>' : ''}</div>` },
      ], invites) : emptyState('No pending invitations')}</div>`

    host.onchange = async (e) => {
      const r = e.target.dataset.role, m = e.target.dataset.emp
      if (r) { await attempt(async () => unwrap(await supabase.from('memberships').update({ role_id: e.target.value }).eq('id', r)), 'Role updated'); draw() }
      if (m) { await attempt(async () => unwrap(await supabase.from('memberships').update({ employee_id: e.target.value || null }).eq('id', m)), 'Employee link updated'); draw() }
    }
    host.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return
      if (b.id === 'invite') return openForm({
        title: 'Invite user', modal: true, submitLabel: 'Create invitation',
        fields: [{ name: 'email', label: 'Email', type: 'email', required: true, span: 2 }, { name: 'role_id', label: 'Role', type: 'select', options: roles.map((r) => ({ value: r.id, label: r.name === 'organization_admin' ? 'Organization Admin' : r.label })), required: true, span: 2 }],
        onSubmit: async (v, d) => {
          const { data } = await supabase.from('invitations').insert({ organization_id: state.org.id, email: v.email.toLowerCase(), role_id: v.role_id, invited_by: state.session.user.id }).select('token').single().then((r) => ({ data: unwrap(r) }))
          setTimeout(() => { openDrawer({ title: 'Invitation created', modal: true, body: `<p class="text-ink2 mb-3">Share this link with ${esc(v.email)}. It works only for that email address and expires in 7 days.</p><input class="input" readonly value="${esc(inviteLink(data.token))}" onclick="this.select()"/>` }) }, 50)
          draw()
        },
      })
      if (b.dataset.st) {
        const m = members.find((x) => x.id === b.dataset.st); const to = m.status === 'active' ? 'disabled' : 'active'
        if (to === 'disabled' && !(await confirmDialog({ title: 'Deactivate this user?', message: 'They will lose access immediately. Their records are kept.', confirmLabel: 'Deactivate', danger: true }))) return
        await attempt(async () => unwrap(await supabase.from('memberships').update({ status: to }).eq('id', m.id)), 'User updated'); draw()
      }
      const tr = b.closest('tr')
      if (b.matches('[data-copy]')) { await navigator.clipboard?.writeText(inviteLink(invites[+tr.dataset.i].token)); toast('Invitation link copied') }
      if (b.matches('[data-revoke]')) { await attempt(async () => unwrap(await supabase.from('invitations').update({ status: 'revoked' }).eq('id', invites[+tr.dataset.i].id)), 'Invitation revoked'); draw() }
    }
  }
  await draw()
}

/* ------------------------------------------------------------------ roles */
async function roles(host) {
  const canEdit = can('settings', 'edit')
  const [{ data: rl }, { data: perms }] = await Promise.all([
    supabase.from('roles').select('*').eq('organization_id', state.org.id).order('name'),
    supabase.from('permissions').select('*'),
  ])
  const pid = Object.fromEntries(perms.map((p) => [`${p.module}:${p.action}`, p.id]))
  let roleId = rl.find((r) => r.name === 'manager')?.id || rl[0].id
  async function draw() {
    const { data: rp } = await supabase.from('role_permissions').select('permission_id').eq('role_id', roleId)
    const has = new Set((rp || []).map((x) => x.permission_id))
    const role = rl.find((r) => r.id === roleId)
    const locked = !canEdit || role.name === 'organization_admin'
    host.innerHTML = `<div class="flex flex-wrap items-center gap-3 mb-4"><div class="flex gap-2">${rl.map((r) => `<button class="btn btn-sm ${r.id === roleId ? 'btn-primary' : ''}" data-role="${r.id}">${esc(r.label)}</button>`).join('')}</div>
      ${role.name === 'organization_admin' ? '<span class="text-sm text-ink2">Organization Admin always has full access.</span>' : ''}</div>
      <div class="card overflow-x-auto"><table class="tbl"><thead><tr><th>Module</th>${ACTIONS.map((a) => `<th class="text-center">${titleCase(a)}</th>`).join('')}</tr></thead><tbody>
      ${MODULES.map((m) => `<tr><td class="font-medium capitalize">${m}</td>${ACTIONS.map((a) => `<td class="text-center"><input type="checkbox" class="w-4 h-4 accent-[var(--accent)]" data-p="${m}:${a}" ${has.has(pid[`${m}:${a}`]) ? 'checked' : ''} ${locked ? 'disabled' : ''} aria-label="${m} ${a}"/></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    host.onclick = (e) => { const b = e.target.closest('[data-role]'); if (b) { roleId = b.dataset.role; draw() } }
    host.onchange = async (e) => {
      const k = e.target.dataset.p; if (!k) return
      const id = pid[k]
      const ok = await attempt(async () => {
        if (e.target.checked) unwrap(await supabase.from('role_permissions').insert({ organization_id: state.org.id, role_id: roleId, permission_id: id }))
        else unwrap(await supabase.from('role_permissions').delete().eq('role_id', roleId).eq('permission_id', id))
      })
      if (!ok) e.target.checked = !e.target.checked
      else if (roleId === state.role.id) await loadContext()
    }
  }
  await draw()
}

/* ----------------------------------------------------------------- master */
async function master(host) {
  const links = [['Leave types', '#/m/leave-types', 'calendar', 'leave'], ['Finance categories', '#/m/finance-categories', 'tag', 'finance'], ['Product categories', '#/m/categories', 'layers', 'inventory'], ['Warehouses', '#/m/warehouses', 'warehouse', 'inventory'], ['Departments', '#/m/departments', 'building', 'departments']]
  const { data: seqs } = await supabase.from('document_sequences').select('*').eq('organization_id', state.org.id).order('document_type')
  const canEdit = can('settings', 'edit')
  host.innerHTML = `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">${links.filter((l) => can(l[3], 'view')).map(([l, h, i]) => `<a href="${h}" class="card p-4 flex items-center gap-3 hover:border-accent">${icon(i, 'w-5 h-5 text-accent')}<span class="font-medium">${l}</span>${icon('chevron', 'w-4 h-4 ml-auto text-muted')}</a>`).join('')}</div>
    <h2 class="font-semibold mb-3">Document numbering</h2>
    <div class="card">${tableHtml([
      { label: 'Document', render: (s) => titleCase(s.document_type) },
      { label: 'Prefix', render: (s) => canEdit ? `<input class="input !h-8 w-28" data-k="prefix" value="${esc(s.prefix)}" aria-label="Prefix"/>` : esc(s.prefix) },
      { label: 'Next number', render: (s) => canEdit ? `<input class="input !h-8 w-28" type="number" min="1" data-k="next_number" value="${s.next_number}" aria-label="Next number"/>` : s.next_number },
      { label: 'Padding', render: (s) => canEdit ? `<input class="input !h-8 w-20" type="number" min="0" max="10" data-k="padding" value="${s.padding}" aria-label="Padding"/>` : s.padding },
    ], seqs || [])}</div>`
  host.onchange = async (e) => {
    const k = e.target.dataset.k; if (!k) return
    const s = seqs[+e.target.closest('tr').dataset.i]
    await attempt(async () => unwrap(await supabase.from('document_sequences').update({ [k]: k === 'prefix' ? e.target.value : +e.target.value }).eq('id', s.id)), 'Numbering updated')
  }
}

/* ------------------------------------------------------------------ audit */
async function audit(host) {
  if (!can('settings', 'view')) return void (host.innerHTML = emptyState('No access'))
  let page = 0, table = ''
  const SIZE = 25
  const tables = ['employees', 'departments', 'leave_requests', 'projects', 'tasks', 'customers', 'suppliers', 'products', 'sales_orders', 'purchase_orders', 'invoices', 'bills', 'expense_records', 'memberships']
  async function draw() {
    let q = supabase.from('audit_logs').select('*', { count: 'exact' }).eq('organization_id', state.org.id).order('created_at', { ascending: false }).range(page * SIZE, page * SIZE + SIZE - 1)
    if (table) q = q.eq('table_name', table)
    const { data, count, error } = await q
    const ids = [...new Set((data || []).map((r) => r.actor_id).filter(Boolean))]
    const { data: ps } = ids.length ? await supabase.from('profiles').select('id,full_name,email').in('id', ids) : { data: [] }
    const who = Object.fromEntries((ps || []).map((p) => [p.id, p.full_name || p.email]))
    host.innerHTML = `<div class="flex gap-3 mb-3"><select class="select max-w-[220px]" id="tf" aria-label="Filter by table"><option value="">All records</option>${tables.map((t) => `<option value="${t}" ${t === table ? 'selected' : ''}>${titleCase(t)}</option>`).join('')}</select></div>
      <div class="card">${error ? `<p class="p-5 text-bad">${esc(error.message)}</p>` : data?.length ? tableHtml([
        { label: 'When', render: (r) => dateTime(r.created_at) }, { label: 'User', render: (r) => esc(who[r.actor_id] || (r.actor_id ? 'Unknown' : 'System')) },
        { label: 'Action', render: (r) => `<span class="badge badge-${r.action === 'delete' ? 'bad' : r.action === 'insert' ? 'ok' : 'info'}">${esc(r.action)}</span>` },
        { label: 'Record', render: (r) => `${esc(titleCase(r.table_name))} <span class="text-muted text-xs">${esc((r.record_id || '').slice(0, 8))}</span>` },
      ], data) : emptyState('No activity recorded')}
      ${count > SIZE ? `<div class="flex justify-between p-3 border-t border-line text-sm text-ink2"><span>${page * SIZE + 1}–${Math.min(count, (page + 1) * SIZE)} of ${count}</span><div class="flex gap-2"><button class="btn btn-sm" data-pg="-1" ${page === 0 ? 'disabled' : ''}>Previous</button><button class="btn btn-sm" data-pg="1" ${(page + 1) * SIZE >= count ? 'disabled' : ''}>Next</button></div></div>` : ''}</div>`
    host.querySelector('#tf').onchange = (e) => { table = e.target.value; page = 0; draw() }
    host.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { page += +b.dataset.pg; draw() }))
  }
  await draw()
}
