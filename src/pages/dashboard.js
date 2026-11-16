import { supabase, unwrap } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, money, num, date, badge } from '../lib/format.js'
import { pageHeader, statCard, skeletonRows } from '../lib/ui.js'
import { barChart, COLORS } from '../lib/charts.js'

const card = (title, body, extra = '') =>
  `<section class="card p-5 ${extra}"><h2 class="font-semibold mb-3">${esc(title)}</h2>${body}</section>`

export default async function dashboard(el) {
  const first = state.profile?.full_name ? state.profile.full_name.split(' ')[0] : ''
  const header = pageHeader({ title: `Hello${first ? ', ' + first : ''}`, subtitle: state.org.name })
  el.innerHTML = header + skeletonRows(3)
  const s = unwrap(await supabase.rpc('dashboard_stats', { p_org: state.org.id }))

  let myTasks = []
  if (can('tasks', 'view') && state.employeeId) {
    const { data } = await supabase.from('tasks').select('id,title,status,due_date').eq('organization_id', state.org.id)
      .eq('assignee_employee_id', state.employeeId).is('deleted_at', null).in('status', ['todo', 'in_progress', 'review'])
      .order('due_date', { nullsFirst: false }).limit(5)
    myTasks = data || []
  }

  // Four simple numbers, whichever the person is allowed to see.
  const stats = []
  if (s.income_month !== undefined) {
    stats.push(statCard('Money in this month', money(s.income_month), '', '', true), statCard('Money out this month', money(s.expense_month)))
  }
  if (s.open_orders !== undefined) stats.push(statCard('Open orders', num(s.open_orders)))
  const approvals = (s.pending_leave || 0) + (s.pending_pos || 0)
  if (s.pending_leave !== undefined || s.pending_pos !== undefined) stats.push(statCard('Waiting for approval', num(approvals)))
  if (s.open_tasks !== undefined && stats.length < 4) stats.push(statCard('Open tasks', num(s.open_tasks), s.overdue_tasks ? `${s.overdue_tasks} late` : ''))
  if (s.employees !== undefined && stats.length < 4) stats.push(statCard('Team members', num(s.employees)))

  // One short "needs attention" list.
  const todo = []
  ;(s.overdue_invoices || []).forEach((i) => todo.push(`<li class="flex justify-between gap-3 py-2.5"><a class="hover:underline" href="#/m/invoices/${i.id}">Invoice ${esc(i.invoice_number)} is late</a><span class="num text-ink2">${money(i.balance_due)}</span></li>`))
  if (s.low_stock) todo.push(`<li class="py-2.5"><a class="hover:underline" href="#/m/stock">${s.low_stock} product${s.low_stock === 1 ? ' is' : 's are'} running low</a></li>`)
  if (s.pending_leave) todo.push(`<li class="py-2.5"><a class="hover:underline" href="#/m/leave-requests">${s.pending_leave} leave request${s.pending_leave === 1 ? '' : 's'} to review</a></li>`)
  if (s.pending_pos) todo.push(`<li class="py-2.5"><a class="hover:underline" href="#/m/purchase-orders">${s.pending_pos} purchase order${s.pending_pos === 1 ? '' : 's'} to approve</a></li>`)
  myTasks.forEach((t) => todo.push(`<li class="flex justify-between gap-3 py-2.5"><a class="truncate hover:underline" href="#/m/tasks/${t.id}">${esc(t.title)}</a><span class="flex gap-2 shrink-0 items-center">${badge(t.status)}<span class="text-xs text-muted">${t.due_date ? date(t.due_date) : ''}</span></span></li>`))

  const chart = s.months
    ? card('Money in and out', barChart({
        labels: s.months.map((m) => m.label),
        series: [{ name: 'In', color: COLORS.income, values: s.months.map((m) => Number(m.income)) }, { name: 'Out', color: COLORS.expense, values: s.months.map((m) => Number(m.expense)) }],
        format: (v) => money(v),
      }), todo.length || true ? 'lg:col-span-2' : '')
    : ''
  const list = card('Needs your attention', todo.length ? `<ul class="divide-y divide-line">${todo.join('')}</ul>` : '<p class="text-ink2 text-sm py-6 text-center">All clear. Nothing needs you right now.</p>', s.months ? '' : 'lg:col-span-3')

  el.innerHTML = `${header}
    ${stats.length ? `<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">${stats.join('')}</div>` : ''}
    <div class="grid lg:grid-cols-3 gap-4">${chart}${list}</div>`
}
