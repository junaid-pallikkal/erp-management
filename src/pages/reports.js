import { supabase } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, money, num, date, badge, fullName, downloadCsv, today } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import { pageHeader, tableHtml, skeletonRows, emptyState } from '../lib/ui.js'

const org = () => state.org.id
const q = (table, select, { from, to, dateCol, soft = true } = {}) => {
  let b = supabase.from(table).select(select).eq('organization_id', org()).limit(2000)
  if (soft) b = b.is('deleted_at', null)
  if (dateCol && from) b = b.gte(dateCol, from)
  if (dateCol && to) b = b.lte(dateCol, to)
  return b
}
const M = (label, f) => ({ label, right: true, render: (r) => money(f(r)), csv: (r) => f(r) })
const T = (label, f) => ({ label, render: (r) => esc(f(r) ?? '—'), csv: f })
const Bd = (label, f) => ({ label, render: (r) => badge(f(r)), csv: f })
const D = (label, f) => ({ label, render: (r) => date(f(r)), csv: f })
const N = (label, f) => ({ label, right: true, render: (r) => num(f(r)), csv: f })
const sum = (rows, f) => rows.reduce((a, r) => a + Number(f(r) || 0), 0)

const REPORTS = [
  { id: 'sales', title: 'Sales summary', module: 'sales', desc: 'Orders in the selected period', async run(p) {
    const { data } = await q('sales_orders', '*, customer:customers!customer_id(name)', { ...p, dateCol: 'order_date' })
    const rows = (data || []).filter((r) => r.status !== 'cancelled')
    return { rows, columns: [T('Order', (r) => r.order_number), T('Customer', (r) => r.customer?.name), D('Date', (r) => r.order_date), Bd('Status', (r) => r.status), M('Total', (r) => r.total)],
      summary: [['Orders', rows.length], ['Total sales', money(sum(rows, (r) => r.total))]] } } },
  { id: 'purchases', title: 'Purchases summary', module: 'purchases', desc: 'Purchase orders in the selected period', async run(p) {
    const { data } = await q('purchase_orders', '*, supplier:suppliers!supplier_id(name)', { ...p, dateCol: 'order_date' })
    const rows = (data || []).filter((r) => r.status !== 'cancelled')
    return { rows, columns: [T('PO', (r) => r.po_number), T('Supplier', (r) => r.supplier?.name), D('Date', (r) => r.order_date), Bd('Status', (r) => r.status), M('Total', (r) => r.total)],
      summary: [['Purchase orders', rows.length], ['Total purchases', money(sum(rows, (r) => r.total))]] } } },
  { id: 'inventory', title: 'Inventory valuation', module: 'inventory', desc: 'Current stock at cost', noDates: true, async run() {
    const { data } = await q('products', '*, category:product_categories!category_id(name), stock:stock_levels(quantity_on_hand)')
    const rows = (data || []).filter((r) => r.track_inventory).map((r) => ({ ...r, qty: sum(r.stock || [], (s) => s.quantity_on_hand) }))
    return { rows, columns: [T('SKU', (r) => r.sku), T('Product', (r) => r.name), T('Category', (r) => r.category?.name), N('On hand', (r) => r.qty), M('Unit cost', (r) => r.cost_price), M('Value', (r) => r.qty * r.cost_price)],
      summary: [['Products', rows.length], ['Inventory value', money(sum(rows, (r) => r.qty * r.cost_price))]] } } },
  { id: 'attendance', title: 'Attendance summary', module: 'attendance', desc: 'Days by status per employee', async run(p) {
    const { data } = await q('attendance_records', '*, employee:employees!employee_id(first_name,last_name)', { ...p, dateCol: 'date', soft: false })
    const by = {}
    ;(data || []).forEach((r) => { const k = r.employee_id; by[k] ||= { name: fullName(r.employee), present: 0, late: 0, remote: 0, half_day: 0, absent: 0, on_leave: 0 }; by[k][r.status]++ })
    const rows = Object.values(by).sort((a, b) => a.name.localeCompare(b.name))
    return { rows, columns: [T('Employee', (r) => r.name), N('Present', (r) => r.present), N('Late', (r) => r.late), N('Remote', (r) => r.remote), N('Half day', (r) => r.half_day), N('Absent', (r) => r.absent), N('On leave', (r) => r.on_leave)], summary: [['Employees', rows.length]] } } },
  { id: 'leave', title: 'Leave summary', module: 'leave', desc: 'Requests in the selected period', async run(p) {
    const { data } = await q('leave_requests', '*, employee:employees!employee_id(first_name,last_name), type:leave_types!leave_type_id(name)', { ...p, dateCol: 'start_date', soft: false })
    const rows = data || []
    return { rows, columns: [T('Employee', (r) => fullName(r.employee)), T('Type', (r) => r.type?.name), D('From', (r) => r.start_date), D('To', (r) => r.end_date), N('Days', (r) => r.days), Bd('Status', (r) => r.status)],
      summary: [['Requests', rows.length], ['Approved days', sum(rows.filter((r) => r.status === 'approved'), (r) => r.days)]] } } },
  { id: 'projects', title: 'Project progress', module: 'projects', desc: 'Status and completion of all projects', noDates: true, async run() {
    const { data } = await q('projects', '*, owner:employees!owner_employee_id(first_name,last_name)')
    const rows = data || []
    return { rows, columns: [T('Code', (r) => r.code), T('Project', (r) => r.name), T('Owner', (r) => (r.owner ? fullName(r.owner) : '')), Bd('Status', (r) => r.status), D('Due', (r) => r.due_date), N('Progress %', (r) => r.progress_percent)],
      summary: [['Projects', rows.length], ['Active', rows.filter((r) => r.status === 'active').length]] } } },
  { id: 'pnl', title: 'Profit & loss', module: 'finance', desc: 'Income and approved expenses by category', async run(p) {
    const [{ data: inc }, { data: exp }] = await Promise.all([
      q('income_records', '*, category:finance_categories!category_id(name)', { ...p, dateCol: 'date', soft: false }),
      q('expense_records', '*, category:finance_categories!category_id(name)', { ...p, dateCol: 'date', soft: false }).in('status', ['approved', 'paid']),
    ])
    const grp = (rows) => Object.entries((rows || []).reduce((a, r) => ((a[r.category?.name || 'Uncategorized'] = (a[r.category?.name || 'Uncategorized'] || 0) + Number(r.amount)), a), {}))
    const rows = [...grp(inc).map(([c, a]) => ({ section: 'Income', category: c, amount: a })), ...grp(exp).map(([c, a]) => ({ section: 'Expense', category: c, amount: a }))]
    const ti = sum(inc || [], (r) => r.amount), te = sum(exp || [], (r) => r.amount)
    return { rows, columns: [T('Type', (r) => r.section), T('Category', (r) => r.category), M('Amount', (r) => r.amount)],
      summary: [['Total income', money(ti)], ['Total expenses', money(te)], ['Net profit', money(ti - te)]] } } },
  { id: 'receivables', title: 'Receivables aging', module: 'sales', desc: 'Unpaid invoices by days past due', noDates: true, async run() {
    const { data } = await q('invoices', '*, customer:customers!customer_id(name)').in('status', ['sent', 'partially_paid', 'overdue'])
    const rows = (data || []).map((r) => ({ ...r, late: Math.floor((Date.now() - new Date(r.due_date + 'T00:00:00')) / 86400000) }))
    const bucket = (d) => (d <= 0 ? 'Current' : d <= 30 ? '1–30' : d <= 60 ? '31–60' : '60+')
    return { rows, columns: [T('Invoice', (r) => r.invoice_number), T('Customer', (r) => r.customer?.name), D('Due', (r) => r.due_date), T('Aging (days)', (r) => bucket(r.late)), M('Balance', (r) => r.balance_due)], summary: [['Total receivable', money(sum(rows, (r) => r.balance_due))]] } } },
  { id: 'payables', title: 'Payables aging', module: 'purchases', desc: 'Unpaid supplier bills by days past due', noDates: true, async run() {
    const { data } = await q('bills', '*, supplier:suppliers!supplier_id(name)').in('status', ['open', 'partially_paid', 'overdue'])
    const rows = (data || []).map((r) => ({ ...r, late: Math.floor((Date.now() - new Date(r.due_date + 'T00:00:00')) / 86400000) }))
    const bucket = (d) => (d <= 0 ? 'Current' : d <= 30 ? '1–30' : d <= 60 ? '31–60' : '60+')
    return { rows, columns: [T('Bill', (r) => r.bill_number), T('Supplier', (r) => r.supplier?.name), D('Due', (r) => r.due_date), T('Aging (days)', (r) => bucket(r.late)), M('Balance', (r) => r.balance_due)], summary: [['Total payable', money(sum(rows, (r) => r.balance_due))]] } } },
]

export default async function reports(el) {
  const avail = REPORTS.filter((r) => can(r.module, 'view'))
  const monthStart = today().slice(0, 8) + '01'
  let cur = avail[0]?.id, from = monthStart, to = today()
  let last = null

  async function run() {
    const out = el.querySelector('#out')
    const rep = avail.find((r) => r.id === cur)
    if (!rep) return void (out.innerHTML = emptyState('No reports available', 'Your role has no access to report data.'))
    out.innerHTML = skeletonRows(5)
    try {
      last = { rep, ...(await rep.run({ from, to })) }
      out.innerHTML = `<div class="flex flex-wrap gap-6 px-5 py-4 border-b border-line">${last.summary.map(([l, v]) => `<div><p class="text-xs text-muted uppercase">${esc(l)}</p><p class="text-lg font-semibold num">${esc(v)}</p></div>`).join('')}</div>
        ${last.rows.length ? tableHtml(last.columns, last.rows) : emptyState('No data for this period')}`
    } catch (e) { out.innerHTML = `<p class="p-5 text-bad">${esc(e.message)}</p>` }
  }

  el.innerHTML = `${pageHeader({ title: 'Reports & analytics', subtitle: 'Summaries across your organization', actions: `
    ${can('reports', 'export') ? `<button class="btn no-print" id="csv">${icon('download', 'w-4 h-4')} CSV</button><button class="btn no-print" id="pdf">${icon('print', 'w-4 h-4')} Print / PDF</button>` : ''}` })}
    <div class="grid lg:grid-cols-[260px_1fr] gap-5 items-start">
      <nav class="card p-2 no-print" aria-label="Reports">${avail.map((r) => `<button class="nav-link w-full text-left ${r.id === cur ? 'active' : ''}" data-r="${r.id}"><span><span class="block">${esc(r.title)}</span><span class="block text-xs text-muted font-normal">${esc(r.desc)}</span></span></button>`).join('')}</nav>
      <div class="card"><div class="flex flex-wrap items-end gap-3 p-4 border-b border-line no-print" id="filters"></div><div id="out"></div></div></div>`

  const drawFilters = () => {
    const rep = avail.find((r) => r.id === cur)
    el.querySelector('#filters').innerHTML = rep?.noDates ? `<p class="text-ink2 text-sm">${esc(rep.title)} — current snapshot</p>` :
      `<div><label class="label" for="rf">From</label><input class="input" id="rf" type="date" value="${from}"/></div><div><label class="label" for="rt">To</label><input class="input" id="rt" type="date" value="${to}"/></div>
       <button class="btn btn-primary" id="apply">Apply</button>`
    el.querySelector('#apply')?.addEventListener('click', () => { from = el.querySelector('#rf').value; to = el.querySelector('#rt').value; run() })
  }
  el.querySelector('nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]'); if (!b) return
    cur = b.dataset.r
    el.querySelectorAll('nav [data-r]').forEach((x) => x.classList.toggle('active', x === b))
    drawFilters(); run()
  })
  el.querySelector('#csv')?.addEventListener('click', () => {
    if (!last?.rows.length) return
    downloadCsv(`${last.rep.id}-report.csv`, last.rows.map((r) => Object.fromEntries(last.columns.filter((c) => c.label).map((c) => [c.label, c.csv ? c.csv(r) : '']))))
  })
  el.querySelector('#pdf')?.addEventListener('click', () => window.print())
  drawFilters(); run()
}
