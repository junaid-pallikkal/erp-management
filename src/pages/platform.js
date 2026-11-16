// Platform Admin: manage organizations across the platform
import { supabase, unwrap } from '../lib/supabase.js'
import { esc, date, badge } from '../lib/format.js'
import { pageHeader, tableHtml, skeletonRows, attempt, confirmDialog, emptyState } from '../lib/ui.js'

export default async function platform(el) {
  async function draw() {
    el.innerHTML = pageHeader({ title: 'Organizations', subtitle: 'All organizations on the platform' }) + `<div class="card">${skeletonRows(4)}</div>`
    const { data, error } = await supabase.rpc('platform_list_organizations')
    if (error) return void (el.innerHTML = `<div class="card p-6 text-bad">${esc(error.message)}</div>`)
    const cols = [
      { label: 'Organization', render: (r) => `<span class="font-medium">${esc(r.name)}</span><div class="text-xs text-muted">${esc(r.slug)}</div>` },
      { label: 'Owner', render: (r) => esc(r.owner_email || '—') }, { label: 'Country', render: (r) => esc(r.country || '—') },
      { label: 'Members', right: true, render: (r) => r.member_count }, { label: 'Created', render: (r) => date(r.created_at) },
      { label: 'Status', render: (r) => badge(r.status) },
      { label: '', render: (r) => `<div class="flex justify-end"><button class="btn btn-sm ${r.status === 'active' ? 'btn-danger' : ''}" data-toggle>${r.status === 'active' ? 'Suspend' : 'Reactivate'}</button></div>` },
    ]
    el.innerHTML = `${pageHeader({ title: 'Organizations', subtitle: `${data.length} on the platform` })}<div class="card">${data.length ? tableHtml(cols, data) : emptyState('No organizations yet')}</div>`
    el.onclick = async (e) => {
      const b = e.target.closest('[data-toggle]'); if (!b) return
      const o = data[+b.closest('tr').dataset.i]
      const to = o.status === 'active' ? 'suspended' : 'active'
      if (!(await confirmDialog({ title: `${to === 'suspended' ? 'Suspend' : 'Reactivate'} ${o.name}?`, message: to === 'suspended' ? 'Members will lose access immediately.' : 'Members will regain access.', confirmLabel: to === 'suspended' ? 'Suspend' : 'Reactivate', danger: to === 'suspended' }))) return
      if (await attempt(async () => unwrap(await supabase.rpc('platform_set_org_status', { p_org: o.id, p_status: to })), 'Organization updated')) draw()
    }
  }
  await draw()
}
