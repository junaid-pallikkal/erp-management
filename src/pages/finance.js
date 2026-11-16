import { supabase, unwrap } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, money, date, badge, num } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import { pageHeader, statCard, skeletonRows, tableHtml } from '../lib/ui.js'
import { barChart, COLORS } from '../lib/charts.js'

export default async function finance(el) {
  el.innerHTML = pageHeader({ title: 'Finance' }) + skeletonRows(4)
  const s = unwrap(await supabase.rpc('dashboard_stats', { p_org: state.org.id }))
  const { data: pays } = await supabase.from('payments')
    .select('*, invoice:invoices!invoice_id(invoice_number), bill:bills!bill_id(bill_number)')
    .eq('organization_id', state.org.id).order('payment_date', { ascending: false }).limit(8)

  const net = Number(s.income_month || 0) - Number(s.expense_month || 0)
  const links = [
    ['Income', '#/m/income', 'download'], ['Expenses', '#/m/expenses', 'receipt'], ['Payments', '#/m/payments', 'card'],
    ['Invoices', '#/m/invoices', 'file'], ['Supplier bills', '#/m/bills', 'bag'], ['Categories', '#/m/finance-categories', 'tag'],
  ]

  el.innerHTML = `${pageHeader({ title: 'Finance', subtitle: 'Cash position, income and expenses' })}
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      ${statCard('Income this month', money(s.income_month))}${statCard('Expenses this month', money(s.expense_month))}
      ${statCard('Net this month', money(net), '', net < 0 ? 'text-bad' : 'text-ok')}
      ${statCard('Receivables / payables', `${money(s.receivables || 0)}`, `Payables ${money(s.payables || 0)}`)}</div>
    <div class="flex flex-wrap gap-2 mb-5">${links.map(([l, h, i]) => `<a class="btn" href="${h}">${icon(i, 'w-4 h-4')} ${l}</a>`).join('')}</div>
    <div class="grid lg:grid-cols-3 gap-4">
      <section class="card p-5 lg:col-span-2"><h2 class="font-semibold mb-4">Income vs expenses (6 months)</h2>
        ${barChart({ labels: (s.months || []).map((m) => m.label), series: [
          { name: 'Income', color: COLORS.income, values: (s.months || []).map((m) => Number(m.income)) },
          { name: 'Expenses', color: COLORS.expense, values: (s.months || []).map((m) => Number(m.expense)) }], format: money })}</section>
      <section class="card"><h2 class="font-semibold p-5 pb-3">Recent payments</h2>
        <ul class="divide-y divide-line">${(pays || []).map((p) => `<li class="flex justify-between gap-2 px-5 py-3 text-sm"><span><span class="font-medium">${esc(p.invoice?.invoice_number || p.bill?.bill_number || 'Payment')}</span><br><span class="text-muted">${date(p.payment_date)}</span></span>
          <span class="num font-medium ${p.direction === 'in' ? 'text-ok' : 'text-bad'}">${p.direction === 'in' ? '+' : '−'}${money(p.amount)}</span></li>`).join('') || '<li class="p-5 text-ink2 text-sm">No payments yet</li>'}</ul></section></div>`
}
