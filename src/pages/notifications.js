import { supabase, unwrap } from '../lib/supabase.js'
import { state, can, refreshUnread } from '../lib/state.js'
import { esc, timeAgo, badge } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import { pageHeader, skeletonRows, emptyState, attempt } from '../lib/ui.js'

const HREF = {
  tasks: (id) => `#/m/tasks/${id}`, leave_requests: () => '#/m/leave-requests', purchase_orders: (id) => `#/orders/purchase/${id}`,
  products: (id) => `#/m/products/${id}`, invoices: (id) => `#/m/invoices/${id}`, bills: (id) => `#/m/bills/${id}`,
}
const ICON = { task_assigned: 'check', leave_request: 'calendar', leave_decision: 'calendar', low_stock: 'box', invoice_overdue: 'receipt', approval_required: 'shield', system: 'bell' }

export default async function notifications(el) {
  let filter = 'all'
  async function draw() {
    let q = supabase.from('notifications').select('*').eq('organization_id', state.org.id).order('created_at', { ascending: false }).limit(100)
    if (filter === 'unread') q = q.eq('is_read', false)
    if (filter === 'approvals') q = q.eq('action_status', 'pending')
    const { data, error } = await q
    const rows = data || []
    el.innerHTML = `${pageHeader({ title: 'Notifications', actions: `<button class="btn" id="readall">${icon('check2', 'w-4 h-4')} Mark all as read</button>` })}
      <div class="flex gap-2 mb-4" role="tablist">${[['all', 'All'], ['unread', 'Unread'], ['approvals', 'Pending approvals']].map(([k, l]) => `<button role="tab" aria-selected="${k === filter}" class="btn btn-sm ${k === filter ? 'btn-primary' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="card">${error ? `<p class="p-5 text-bad">${esc(error.message)}</p>` : rows.length ? `<ul class="divide-y divide-line">${rows.map((n, i) => `
        <li class="flex gap-3 p-4 ${n.is_read ? '' : 'bg-accent-soft/40'}" data-i="${i}">
          <div class="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">${icon(ICON[n.type] || 'bell', 'w-4 h-4')}</div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between gap-3"><p class="font-medium ${n.is_read ? '' : 'text-ink'}">${esc(n.title)}</p><span class="text-xs text-muted shrink-0">${timeAgo(n.created_at)}</span></div>
            ${n.body ? `<p class="text-ink2 text-sm mt-0.5">${esc(n.body)}</p>` : ''}
            <div class="flex flex-wrap items-center gap-2 mt-2">
              ${n.action_status === 'pending' ? approvalButtons(n) : n.action_status !== 'none' ? badge(n.action_status) : ''}
              ${HREF[n.entity_type] ? `<a class="btn btn-sm" href="${HREF[n.entity_type](n.entity_id)}" data-open>View</a>` : ''}
              ${n.is_read ? '' : '<button class="btn btn-sm btn-ghost" data-read>Mark read</button>'}</div></div></li>`).join('')}</ul>` : emptyState('You are all caught up', 'New alerts and approvals will show up here.')}</div>`

    el.querySelector('#readall').onclick = async () => { await supabase.rpc('mark_all_notifications_read', { p_org: state.org.id }); await refreshUnread(); draw() }
    el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw() }))
    el.querySelectorAll('li[data-i]').forEach((li) => {
      const n = rows[+li.dataset.i]
      const markRead = async () => { if (!n.is_read) { await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', n.id); refreshUnread() } }
      li.querySelector('[data-read]')?.addEventListener('click', async () => { await markRead(); draw() })
      li.querySelector('[data-open]')?.addEventListener('click', markRead)
      li.querySelectorAll('[data-decide]').forEach((b) => b.addEventListener('click', async () => {
        const approve = b.dataset.decide === 'approve'
        const ok = await attempt(async () => {
          if (n.entity_type === 'leave_requests') unwrap(await supabase.rpc('decide_leave', { p_id: n.entity_id, p_approve: approve }))
          else if (n.entity_type === 'purchase_orders') unwrap(await supabase.rpc('set_purchase_order_status', { p_id: n.entity_id, p_status: approve ? 'approved' : 'draft' }))
        }, approve ? 'Approved' : 'Rejected')
        if (ok) { await markRead(); draw() }
      }))
    })
  }
  const approvalButtons = (n) => {
    const allowed = (n.entity_type === 'leave_requests' && can('leave', 'approve')) || (n.entity_type === 'purchase_orders' && can('purchases', 'approve'))
    return allowed ? `<button class="btn btn-sm btn-primary" data-decide="approve">Approve</button><button class="btn btn-sm btn-danger" data-decide="reject">Reject</button>` : badge('pending')
  }
  el.innerHTML = pageHeader({ title: 'Notifications' }) + `<div class="card">${skeletonRows(4)}</div>`
  await draw()
}
