// Sales orders and purchase orders: full-page form with line items, and workflow detail page.
import { supabase, unwrap } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, money, date, badge, today } from '../lib/format.js'
import { icon } from '../lib/icons.js'
import { pageHeader, openForm, attempt, confirmDialog, toast, loadRefOptions, skeletonRows, tableHtml, errMsg } from '../lib/ui.js'
import { registry } from '../modules/registry.js'

const KINDS = {
  sales: {
    label: 'Sales order', module: 'sales', table: 'sales_orders', items: 'sales_order_items', fk: 'sales_order_id', numberField: 'order_number',
    partner: { field: 'customer_id', label: 'Customer', table: 'customers', rel: 'customer:customers!customer_id(name,email)' },
    expectedField: 'expected_delivery_date', priceField: 'unit_price', priceDefault: 'sale_price', discount: true, list: '#/m/sales-orders', save: 'save_sales_order',
  },
  purchase: {
    label: 'Purchase order', module: 'purchases', table: 'purchase_orders', items: 'purchase_order_items', fk: 'purchase_order_id', numberField: 'po_number',
    partner: { field: 'supplier_id', label: 'Supplier', table: 'suppliers', rel: 'supplier:suppliers!supplier_id(name,email)' },
    expectedField: 'expected_date', priceField: 'unit_cost', priceDefault: 'cost_price', discount: false, list: '#/m/purchase-orders', save: 'save_purchase_order',
  },
}

const lineTotal = (k, r) => Math.round(Number(r.quantity || 0) * Number(r[k.priceField] || 0) * (1 - Number(r.discount_percent || 0) / 100) * 100) / 100

/* ------------------------------------------------------------------- FORM */
export async function form(el, { params, query }) {
  const k = KINDS[params.kind]
  if (!k) return void (el.innerHTML = '<div class="card p-8 text-center">Unknown order type</div>')
  const editId = query.id || null
  if (!can(k.module, editId ? 'edit' : 'create')) return void (el.innerHTML = '<div class="card py-16 text-center"><p class="text-lg font-semibold">No access</p></div>')
  el.innerHTML = skeletonRows(5)

  const [partners, products, warehouses] = await Promise.all([
    loadRefOptions({ table: k.partner.table, label: 'name', soft: true }),
    loadRefOptions({ table: 'products', select: 'id,name,sku,sale_price,cost_price,tax_rate', label: (r) => `${r.name} (${r.sku})`, soft: true, filter: (q) => q.eq('status', 'active') }),
    loadRefOptions({ table: 'warehouses', label: 'name' }),
  ])

  let head = { [k.partner.field]: '', order_date: today(), [k.expectedField]: '', warehouse_id: '', notes: '' }
  let rows = [{ product_id: '', description: '', quantity: 1, [k.priceField]: 0, discount_percent: 0, tax_rate: Number(state.org.default_tax_rate) || 0 }]
  if (editId) {
    const { data: o } = await supabase.from(k.table).select('*').eq('id', editId).maybeSingle()
    if (!o || o.status !== 'draft') return void (el.innerHTML = '<div class="card p-8 text-center">Only draft orders can be edited.</div>')
    head = o
    const { data: items } = await supabase.from(k.items).select('*').eq(k.fk, editId).order('position')
    rows = items?.length ? items : rows
  }

  const draw = () => {
    const sub = rows.reduce((a, r) => a + lineTotal(k, r), 0)
    const tax = rows.reduce((a, r) => a + Math.round(lineTotal(k, r) * Number(r.tax_rate || 0)) / 100, 0)
    el.innerHTML = `${pageHeader({ title: `${editId ? 'Edit' : 'New'} ${k.label.toLowerCase()}`, back: editId ? `#/orders/${params.kind}/${editId}` : k.list })}
    <form class="space-y-5" id="of" novalidate>
      <div class="card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div><label class="label" for="h_p">${k.partner.label} <span class="text-bad">*</span></label><select class="select" id="h_p" required><option value="">Select…</option>${partners.map((o) => `<option value="${o.value}" ${o.value === head[k.partner.field] ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
        <div><label class="label" for="h_d">Order date</label><input class="input" id="h_d" type="date" required value="${head.order_date || ''}"/></div>
        <div><label class="label" for="h_e">Expected ${params.kind === 'sales' ? 'delivery' : 'arrival'}</label><input class="input" id="h_e" type="date" value="${head[k.expectedField] || ''}"/></div>
        <div><label class="label" for="h_w">Warehouse</label><select class="select" id="h_w"><option value="">Default</option>${warehouses.map((o) => `<option value="${o.value}" ${o.value === head.warehouse_id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
        <div class="sm:col-span-2 lg:col-span-4"><label class="label" for="h_n">Notes</label><textarea class="textarea" id="h_n" rows="2">${esc(head.notes || '')}</textarea></div>
      </div>
      <div class="card">
        <div class="overflow-x-auto"><table class="tbl"><thead><tr><th>Product</th><th>Description</th><th class="text-right">Qty</th><th class="text-right">${params.kind === 'sales' ? 'Unit price' : 'Unit cost'}</th>
          ${k.discount ? '<th class="text-right">Disc %</th>' : ''}<th class="text-right">Tax %</th><th class="text-right">Total</th><th></th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr data-r="${i}">
            <td class="min-w-[200px]"><select class="select" data-f="product_id" aria-label="Product"><option value="">— Custom item —</option>${products.map((p) => `<option value="${p.value}" ${p.value === r.product_id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></td>
            <td class="min-w-[160px]"><input class="input" data-f="description" value="${esc(r.description || '')}" aria-label="Description"/></td>
            <td><input class="input w-20 text-right" data-f="quantity" type="number" min="0.01" step="any" value="${r.quantity}" aria-label="Quantity"/></td>
            <td><input class="input w-28 text-right" data-f="${k.priceField}" type="number" min="0" step="0.01" value="${r[k.priceField]}" aria-label="Price"/></td>
            ${k.discount ? `<td><input class="input w-20 text-right" data-f="discount_percent" type="number" min="0" max="100" step="any" value="${r.discount_percent || 0}" aria-label="Discount"/></td>` : ''}
            <td><input class="input w-20 text-right" data-f="tax_rate" type="number" min="0" step="any" value="${r.tax_rate || 0}" aria-label="Tax"/></td>
            <td class="text-right num whitespace-nowrap" data-lt>${money(lineTotal(k, r))}</td>
            <td><button type="button" class="btn btn-sm btn-ghost btn-icon btn-danger" data-rm aria-label="Remove line" ${rows.length < 2 ? 'disabled' : ''}>${icon('trash', 'w-4 h-4')}</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="p-4 border-t border-line flex flex-wrap justify-between gap-4 items-start">
          <button type="button" class="btn btn-sm" id="addrow">${icon('plus', 'w-4 h-4')} Add line</button>
          <dl class="text-sm min-w-[220px] space-y-1"><div class="flex justify-between"><dt class="text-ink2">Subtotal</dt><dd class="num" id="t_sub">${money(sub)}</dd></div>
            <div class="flex justify-between"><dt class="text-ink2">Tax</dt><dd class="num" id="t_tax">${money(tax)}</dd></div>
            <div class="flex justify-between font-semibold text-base pt-1 border-t border-line"><dt>Total</dt><dd class="num" id="t_tot">${money(sub + tax)}</dd></div></dl></div>
      </div>
      <div class="field-error hidden" data-err role="alert"></div>
      <div class="flex justify-end gap-2"><a class="btn" href="${editId ? `#/orders/${params.kind}/${editId}` : k.list}">Cancel</a><button class="btn btn-primary" type="submit" id="save">Save as draft</button></div>
    </form>`

    const totals = () => {
      const s = rows.reduce((a, r) => a + lineTotal(k, r), 0)
      const t = rows.reduce((a, r) => a + Math.round(lineTotal(k, r) * Number(r.tax_rate || 0)) / 100, 0)
      el.querySelector('#t_sub').textContent = money(s); el.querySelector('#t_tax').textContent = money(t); el.querySelector('#t_tot').textContent = money(s + t)
    }
    el.querySelector('tbody').addEventListener('input', (e) => {
      const tr = e.target.closest('tr'); const f = e.target.dataset.f; if (!tr || !f || f === 'product_id') return
      const r = rows[+tr.dataset.r]; r[f] = ['description'].includes(f) ? e.target.value : e.target.value === '' ? '' : Number(e.target.value)
      tr.querySelector('[data-lt]').textContent = money(lineTotal(k, r)); totals()
    })
    el.querySelector('tbody').addEventListener('change', (e) => {
      if (e.target.dataset.f !== 'product_id') return
      const r = rows[+e.target.closest('tr').dataset.r]; r.product_id = e.target.value
      const p = products.find((x) => x.value === r.product_id)?.row
      if (p) { r.description = p.name; r[k.priceField] = Number(p[k.priceDefault]) || 0; if (p.tax_rate != null) r.tax_rate = Number(p.tax_rate) }
      draw()
    })
    el.querySelector('tbody').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b && rows.length > 1) { rows.splice(+b.closest('tr').dataset.r, 1); draw() } })
    el.querySelector('#addrow').onclick = () => { rows.push({ product_id: '', description: '', quantity: 1, [k.priceField]: 0, discount_percent: 0, tax_rate: Number(state.org.default_tax_rate) || 0 }); draw() }

    const f = el.querySelector('#of')
    const keep = () => { head = { ...head, [k.partner.field]: f.h_p.value, order_date: f.h_d.value, [k.expectedField]: f.h_e.value, warehouse_id: f.h_w.value, notes: f.h_n.value } }
    ;['#h_p', '#h_d', '#h_e', '#h_w', '#h_n'].forEach((s) => el.querySelector(s).addEventListener('change', keep))
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); keep()
      const err = el.querySelector('[data-err]'); err.classList.add('hidden')
      const valid = rows.filter((r) => Number(r.quantity) > 0 && (r.product_id || r.description))
      if (!head[k.partner.field]) { err.textContent = `Select a ${k.partner.label.toLowerCase()}`; return err.classList.remove('hidden') }
      if (!valid.length) { err.textContent = 'Add at least one line with a product or description and a quantity'; return err.classList.remove('hidden') }
      const btn = el.querySelector('#save'); btn.disabled = true; btn.textContent = 'Saving…'
      try {
        const header = { [k.partner.field]: head[k.partner.field], order_date: head.order_date, [k.expectedField]: head[k.expectedField] || null, warehouse_id: head.warehouse_id || null, notes: head.notes || null }
        const id = unwrap(await supabase.rpc(k.save, { p_org: state.org.id, p_id: editId, p_header: header, p_items: valid.map((r) => ({ product_id: r.product_id || null, description: r.description || null, quantity: r.quantity, [k.priceField]: r[k.priceField], discount_percent: r.discount_percent || 0, tax_rate: r.tax_rate || 0 })) }))
        toast('Order saved')
        location.hash = `#/orders/${params.kind}/${id}`
      } catch (ex) { err.textContent = errMsg(ex); err.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Save as draft' }
    })
  }
  draw()
}

/* ----------------------------------------------------------------- DETAIL */
export async function detail(el, { params }) {
  const k = KINDS[params.kind]
  if (!k || !can(k.module, 'view')) return void (el.innerHTML = '<div class="card py-16 text-center"><p class="text-lg font-semibold">Not available</p></div>')
  el.innerHTML = skeletonRows(5)

  async function load() {
    const [{ data: o }, { data: items }] = await Promise.all([
      supabase.from(k.table).select(`*, ${k.partner.rel}`).eq('id', params.id).maybeSingle(),
      supabase.from(k.items).select('*').eq(k.fk, params.id).order('position'),
    ])
    if (!o) return void (el.innerHTML = pageHeader({ title: 'Not found', back: k.list }) + '<div class="card p-8 text-center text-ink2">This order does not exist or you cannot access it.</div>')
    const partner = o.customer || o.supplier
    let invoices = []
    if (params.kind === 'sales' && can('sales', 'view')) invoices = (await supabase.from('invoices').select('id,invoice_number,status,total,balance_due').eq('sales_order_id', o.id).is('deleted_at', null)).data || []
    let bills = []
    if (params.kind === 'purchase') bills = (await supabase.from('bills').select('id,bill_number,status,total,balance_due').eq('purchase_order_id', o.id).is('deleted_at', null)).data || []

    const num = o[k.numberField]
    const act = []
    const A = (label, run, cls = '') => act.push({ label, run, cls })
    const rpc = (fn, args, ok) => async () => { if (await attempt(async () => unwrap(await supabase.rpc(fn, args)), ok)) load() }
    if (params.kind === 'sales') {
      const live = invoices.filter((i) => i.status !== 'void')
      if (o.status === 'draft') {
        if (can('sales', 'edit')) A('Edit', () => (location.hash = `#/orders/sales/new?id=${o.id}`))
        if (can('sales', 'approve')) A('Confirm order', rpc('confirm_sales_order', { p_id: o.id }, 'Order confirmed — stock updated'), 'btn-primary')
        if (can('sales', 'edit')) A('Cancel order', async () => { if (await confirmDialog({ title: 'Cancel this order?', confirmLabel: 'Cancel order', danger: true })) rpc('set_sales_order_status', { p_id: o.id, p_status: 'cancelled' }, 'Order cancelled')() }, 'btn-danger')
      }
      if (o.status === 'confirmed' && can('sales', 'edit')) {
        A('Mark fulfilled', rpc('set_sales_order_status', { p_id: o.id, p_status: 'fulfilled' }, 'Order fulfilled'))
        A('Cancel order', async () => { if (await confirmDialog({ title: 'Cancel this order?', message: 'Reserved stock will be returned to the warehouse.', confirmLabel: 'Cancel order', danger: true })) rpc('set_sales_order_status', { p_id: o.id, p_status: 'cancelled' }, 'Order cancelled')() }, 'btn-danger')
      }
      if (o.status === 'fulfilled' && can('sales', 'edit')) A('Close order', rpc('set_sales_order_status', { p_id: o.id, p_status: 'closed' }, 'Order closed'))
      if (['confirmed', 'fulfilled', 'closed'].includes(o.status) && !live.length && can('sales', 'create'))
        A('Create invoice', async () => { try { const id = unwrap(await supabase.rpc('create_invoice_from_order', { p_order: o.id })); toast('Invoice created'); location.hash = `#/m/invoices/${id}` } catch (e) { toast(errMsg(e), 'error') } }, 'btn-primary')
    } else {
      if (o.status === 'draft') {
        if (can('purchases', 'edit')) A('Edit', () => (location.hash = `#/orders/purchase/new?id=${o.id}`))
        if (can('purchases', 'create')) A('Submit for approval', rpc('set_purchase_order_status', { p_id: o.id, p_status: 'pending_approval' }, 'Submitted for approval'), 'btn-primary')
      }
      if (o.status === 'pending_approval' && can('purchases', 'approve')) {
        A('Approve', rpc('set_purchase_order_status', { p_id: o.id, p_status: 'approved' }, 'Purchase order approved'), 'btn-primary')
        A('Return to draft', rpc('set_purchase_order_status', { p_id: o.id, p_status: 'draft' }, 'Returned to draft'))
      }
      if (['approved', 'partially_received'].includes(o.status) && can('purchases', 'edit')) A('Receive goods', () => receiveDialog(o, items, load), 'btn-primary')
      if (['approved', 'partially_received', 'received', 'closed'].includes(o.status) && can('purchases', 'create') && !bills.length) A('Record bill', () => billDialog(o, load))
      if (o.status === 'received' && can('purchases', 'edit')) A('Close', rpc('set_purchase_order_status', { p_id: o.id, p_status: 'closed' }, 'Purchase order closed'))
      if (['draft', 'pending_approval', 'approved'].includes(o.status) && can('purchases', 'edit'))
        A('Cancel', async () => { if (await confirmDialog({ title: 'Cancel this purchase order?', confirmLabel: 'Cancel order', danger: true })) rpc('set_purchase_order_status', { p_id: o.id, p_status: 'cancelled' }, 'Cancelled')() }, 'btn-danger')
    }
    A('Print', () => window.print())

    const cols = [{ label: 'Item', render: (r) => esc(r.description || '—') }, { label: 'Qty', right: true, render: (r) => r.quantity },
      ...(params.kind === 'purchase' ? [{ label: 'Received', right: true, render: (r) => r.quantity_received }] : []),
      { label: params.kind === 'sales' ? 'Unit price' : 'Unit cost', right: true, render: (r) => money(r[k.priceField]) },
      ...(k.discount ? [{ label: 'Disc %', right: true, render: (r) => r.discount_percent }] : []),
      { label: 'Tax %', right: true, render: (r) => r.tax_rate }, { label: 'Total', right: true, render: (r) => money(r.line_total) }]
    const linked = params.kind === 'sales' ? invoices.map((i) => ({ ...i, kind: 'invoices', num: i.invoice_number })) : bills.map((b) => ({ ...b, kind: 'bills', num: b.bill_number }))

    el.innerHTML = `${pageHeader({ title: num, back: k.list, actions: act.map((a, i) => `<button class="btn ${a.cls} no-print" data-a="${i}">${esc(a.label)}</button>`).join('') })}
      <div class="-mt-3 mb-4">${badge(o.status)}</div>
      <div class="card p-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div><p class="text-xs text-muted uppercase">${k.partner.label}</p><p class="mt-0.5 font-medium">${esc(partner?.name || '—')}</p><p class="text-xs text-ink2">${esc(partner?.email || '')}</p></div>
        <div><p class="text-xs text-muted uppercase">Order date</p><p class="mt-0.5">${date(o.order_date)}</p></div>
        <div><p class="text-xs text-muted uppercase">Expected</p><p class="mt-0.5">${date(o[k.expectedField])}</p></div>
        <div><p class="text-xs text-muted uppercase">Total</p><p class="mt-0.5 text-lg font-semibold num">${money(o.total)}</p></div>
        ${o.notes ? `<div class="sm:col-span-2 lg:col-span-4"><p class="text-xs text-muted uppercase">Notes</p><p class="mt-0.5">${esc(o.notes)}</p></div>` : ''}</div>
      <div class="card mt-5"><div class="px-4 py-3 border-b border-line font-semibold">Items</div>${tableHtml(cols, items || [])}
        <div class="p-4 border-t border-line ml-auto w-full max-w-xs text-sm space-y-1"><div class="flex justify-between"><span class="text-ink2">Subtotal</span><span class="num">${money(o.subtotal)}</span></div>
        <div class="flex justify-between"><span class="text-ink2">Tax</span><span class="num">${money(o.tax_total)}</span></div>
        <div class="flex justify-between font-semibold pt-1 border-t border-line"><span>Total</span><span class="num">${money(o.total)}</span></div></div></div>
      ${linked.length ? `<div class="card mt-5"><div class="px-4 py-3 border-b border-line font-semibold">${params.kind === 'sales' ? 'Invoices' : 'Supplier bills'}</div>
        <ul class="divide-y divide-line">${linked.map((l) => `<li class="flex justify-between items-center px-4 py-3"><a class="text-accent" href="#/m/${l.kind}/${l.id}">${esc(l.num)}</a>${badge(l.status)}<span class="num">${money(l.total)}</span></li>`).join('')}</ul></div>` : ''}`
    el.onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) act[+b.dataset.a].run() }
  }
  await load()
}

function receiveDialog(po, items, onDone) {
  const open = items.filter((i) => Number(i.quantity) > Number(i.quantity_received))
  return openForm({
    title: 'Receive goods', submitLabel: 'Receive',
    fields: open.map((i) => ({ name: `q_${i.id}`, label: `${i.description || 'Item'} — outstanding ${Number(i.quantity) - Number(i.quantity_received)}`, type: 'number', min: 0, default: Number(i.quantity) - Number(i.quantity_received), span: 2 })),
    values: Object.fromEntries(open.map((i) => [`q_${i.id}`, Number(i.quantity) - Number(i.quantity_received)])),
    onSubmit: async (v) => {
      const p_items = open.map((i) => ({ item_id: i.id, qty: v[`q_${i.id}`] || 0 })).filter((x) => x.qty > 0)
      if (!p_items.length) throw new Error('Enter at least one received quantity')
      unwrap(await supabase.rpc('receive_purchase_order', { p_id: po.id, p_items }))
      toast('Goods received — stock updated')
      onDone()
    },
  })
}

function billDialog(po, onDone) {
  const cfg = registry.bills
  return openForm({
    title: 'Record supplier bill', fields: cfg.fields.filter((f) => f.name !== 'purchase_order_id'),
    values: { supplier_id: po.supplier_id, total: po.total, issue_date: today(), due_date: today() },
    onSubmit: async (p) => {
      unwrap(await supabase.from('bills').insert({ ...p, purchase_order_id: po.id, organization_id: state.org.id }))
      toast('Bill recorded'); onDone()
    },
  })
}
