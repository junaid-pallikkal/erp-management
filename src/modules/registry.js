// Declarative configuration for every list/detail module. Pages are rendered by pages/resource.js.
import { supabase, unwrap } from '../lib/supabase.js'
import { state, can } from '../lib/state.js'
import { esc, money, num, date, dateTime, badge, fullName, today, titleCase } from '../lib/format.js'
import { openForm, attempt, confirmDialog, clearOptionCache } from '../lib/ui.js'

/* ------------------------------------------------------------- shared bits */
const STATUS_ACTIVE = ['active', 'inactive']
const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const empRef = { table: 'employees', select: 'id,first_name,last_name', label: fullName, soft: true }
const deptRef = { table: 'departments', label: 'name' }
const custRef = { table: 'customers', label: 'name', soft: true }
const suppRef = { table: 'suppliers', label: 'name', soft: true }
const prodRef = { table: 'products', select: 'id,name,sku', label: (r) => `${r.name} (${r.sku})`, soft: true }
const whRef = { table: 'warehouses', label: 'name' }
const col = (label, key, extra = {}) => ({ label, key, sortKey: key, ...extra })
const statusCol = (key = 'status', label = 'Status') => ({ label, sortKey: key, render: (r) => badge(r[key]) })
const moneyCol = (label, key) => ({ label, sortKey: key, right: true, render: (r) => money(r[key]), csv: (r) => r[key] })
const dateCol = (label, key) => ({ label, sortKey: key, render: (r) => date(r[key]), csv: (r) => r[key] })
const link = (href, text) => `<a href="${href}" class="text-accent hover:underline" onclick="event.stopPropagation()">${esc(text)}</a>`
const progress = (p) =>
  `<div class="flex items-center gap-2 min-w-[110px]"><div class="h-1.5 flex-1 rounded-full bg-bg overflow-hidden border border-line"><div class="h-full bg-accent" style="width:${p || 0}%"></div></div><span class="text-xs text-ink2 num">${p || 0}%</span></div>`

async function rpc(fn, args, success) {
  return attempt(async () => unwrap(await supabase.rpc(fn, args)), success)
}

export async function recordPaymentDialog(direction, doc, onDone) {
  await openForm({
    title: direction === 'in' ? 'Record payment received' : 'Record payment made',
    modal: true,
    submitLabel: 'Record payment',
    values: { amount: doc.balance_due, payment_date: today(), method: 'bank_transfer' },
    fields: [
      { name: 'amount', label: `Amount (balance ${money(doc.balance_due)})`, type: 'money', required: true, min: 0.01, span: 2 },
      { name: 'payment_date', label: 'Date', type: 'date', required: true },
      { name: 'method', label: 'Method', type: 'select', options: ['bank_transfer', 'cash', 'card', 'cheque', 'other'], required: true },
      { name: 'reference', label: 'Reference', span: 2 },
    ],
    onSubmit: async (v) => {
      unwrap(await supabase.rpc('record_payment', {
        p_direction: direction, p_target: doc.id, p_amount: v.amount, p_date: v.payment_date, p_method: v.method, p_reference: v.reference,
      }))
      onDone?.()
    },
  })
}

const payAction = (direction) => ({
  label: 'Record payment',
  show: (r) => can('finance', 'create') && !['paid', 'void'].includes(r.status) && Number(r.balance_due) > 0,
  run: (r, reload) => recordPaymentDialog(direction, r, reload),
})

/* --------------------------------------------------------------- registry */
export const registry = {
  employees: {
    title: 'Employees', singular: 'Employee', module: 'employees', table: 'employees', soft: true,
    select: '*, department:departments!department_id(name), manager:employees!manager_employee_id(first_name,last_name)',
    columns: [
      col('Code', 'employee_code'),
      { label: 'Name', sortKey: 'first_name', render: (r) => `<span class="font-medium">${esc(fullName(r))}</span><div class="text-xs text-muted">${esc(r.email || '')}</div>`, csv: fullName },
      col('Department', 'department.name', { sortKey: null }),
      col('Position', 'job_title'),
      statusCol(),
    ],
    search: ['first_name', 'last_name', 'email', 'employee_code', 'job_title'],
    statusField: 'status', statuses: ['active', 'on_leave', 'terminated'],
    order: ['created_at', false],
    detailTitle: (r) => fullName(r),
    fields: [
      { name: 'first_name', label: 'First name', required: true },
      { name: 'last_name', label: 'Last name' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'job_title', label: 'Job title' },
      { name: 'department_id', label: 'Department', ref: deptRef, view: 'department.name' },
      { name: 'manager_employee_id', label: 'Reports to', ref: empRef, view: 'manager', viewFn: fullName },
      { name: 'employment_type', label: 'Employment type', type: 'select', options: ['full_time', 'part_time', 'contract', 'intern'], required: true, default: 'full_time' },
      { name: 'hire_date', label: 'Hire date', type: 'date' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'on_leave', 'terminated'], required: true, default: 'active' },
      { name: 'date_of_birth', label: 'Date of birth', type: 'date' },
      { name: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'other'] },
      { name: 'street', label: 'Street', span: 2 },
      { name: 'city', label: 'City' }, { name: 'state', label: 'State / Region' },
      { name: 'postal_code', label: 'Postal code' }, { name: 'country', label: 'Country' },
      { name: 'emergency_contact_name', label: 'Emergency contact' }, { name: 'emergency_contact_phone', label: 'Emergency phone', type: 'tel' },
    ],
    related: [
      { title: 'Leave requests', table: 'leave_requests', fk: 'employee_id', module: 'leave', select: '*, type:leave_types!leave_type_id(name)',
        columns: [col('Type', 'type.name'), dateCol('From', 'start_date'), dateCol('To', 'end_date'), col('Days', 'days'), statusCol()] },
      { title: 'Assigned tasks', table: 'tasks', fk: 'assignee_employee_id', module: 'tasks', select: '*, project:projects!project_id(name)', soft: true,
        columns: [col('Task', 'title'), col('Project', 'project.name'), statusCol(), dateCol('Due', 'due_date')] },
    ],
  },

  departments: {
    title: 'Departments', singular: 'Department', module: 'departments', table: 'departments',
    select: '*, manager:employees!manager_employee_id(first_name,last_name)',
    columns: [col('Name', 'name'), col('Code', 'code'), { label: 'Manager', render: (r) => esc(r.manager ? fullName(r.manager) : '—'), csv: (r) => (r.manager ? fullName(r.manager) : '') }, statusCol()],
    search: ['name', 'code'], statusField: 'status', statuses: STATUS_ACTIVE, order: ['name', true],
    detailTitle: (r) => r.name,
    fields: [
      { name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code' },
      { name: 'manager_employee_id', label: 'Manager', ref: empRef, view: 'manager', viewFn: fullName },
      { name: 'parent_department_id', label: 'Parent department', ref: deptRef },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_ACTIVE, required: true, default: 'active' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    related: [
      { title: 'Members', table: 'employees', fk: 'department_id', module: 'employees', soft: true,
        columns: [col('Code', 'employee_code'), { label: 'Name', render: (r) => link(`#/m/employees/${r.id}`, fullName(r)) }, col('Position', 'job_title'), statusCol()] },
    ],
  },

  attendance: {
    title: 'Attendance', singular: 'Attendance record', module: 'attendance', table: 'attendance_records',
    select: '*, employee:employees!employee_id(first_name,last_name)',
    columns: [
      { label: 'Employee', render: (r) => esc(fullName(r.employee)), csv: (r) => fullName(r.employee) },
      dateCol('Date', 'date'),
      { label: 'Check in', render: (r) => (r.check_in ? new Date(r.check_in).toLocaleTimeString([], { timeStyle: 'short' }) : '—') },
      { label: 'Check out', render: (r) => (r.check_out ? new Date(r.check_out).toLocaleTimeString([], { timeStyle: 'short' }) : '—') },
      statusCol(),
    ],
    statusField: 'status', statuses: ['present', 'absent', 'late', 'half_day', 'remote', 'on_leave'], order: ['date', false], noDetail: true,
    canCreate: () => can('attendance', 'edit'),
    fields: [
      { name: 'employee_id', label: 'Employee', ref: empRef, required: true },
      { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
      { name: 'status', label: 'Status', type: 'select', options: ['present', 'absent', 'late', 'half_day', 'remote', 'on_leave'], required: true, default: 'present' },
      { name: 'check_in', label: 'Check in', type: 'datetime' }, { name: 'check_out', label: 'Check out', type: 'datetime' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    toolbar: () => [
      ...(state.employeeId && can('attendance', 'create')
        ? [
            { label: 'Check in', run: (reload) => rpc('attendance_check_in', { p_org: state.org.id }, 'Checked in').then(reload) },
            { label: 'Check out', run: (reload) => rpc('attendance_check_out', { p_org: state.org.id }, 'Checked out').then(reload) },
          ]
        : []),
    ],
  },

  'leave-requests': {
    title: 'Leave requests', singular: 'Leave request', module: 'leave', table: 'leave_requests',
    select: '*, employee:employees!employee_id(first_name,last_name), type:leave_types!leave_type_id(name)',
    columns: [
      { label: 'Employee', render: (r) => esc(fullName(r.employee)), csv: (r) => fullName(r.employee) },
      col('Type', 'type.name', { sortKey: null }), dateCol('From', 'start_date'), dateCol('To', 'end_date'), col('Days', 'days'), statusCol(),
    ],
    statusField: 'status', statuses: ['pending', 'approved', 'rejected', 'cancelled'], order: ['created_at', false], noDetail: true,
    canEdit: () => false, canDelete: () => false,
    fields: () => [
      ...(can('leave', 'approve') ? [{ name: 'employee_id', label: 'Employee', ref: empRef, required: true, default: state.employeeId }] : []),
      { name: 'leave_type_id', label: 'Leave type', ref: { table: 'leave_types', label: 'name', filter: (q) => q.eq('status', 'active') }, required: true },
      { name: 'start_date', label: 'Start date', type: 'date', required: true, default: today() },
      { name: 'end_date', label: 'End date', type: 'date', required: true, default: today() },
      { name: 'reason', label: 'Reason', type: 'textarea' },
    ],
    beforeSave: (p) => {
      if (!p.employee_id) p.employee_id = state.employeeId
      if (!p.employee_id) throw new Error('Your account is not linked to an employee record. Ask an admin to link it in Settings → Users.')
      const d = Math.round((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1
      if (d < 1) throw new Error('End date must be on or after the start date')
      p.days = d
      return p
    },
    rowActions: [
      { label: 'Approve', show: (r) => r.status === 'pending' && can('leave', 'approve'), run: (r, reload) => rpc('decide_leave', { p_id: r.id, p_approve: true }, 'Leave approved').then(reload) },
      { label: 'Reject', danger: true, show: (r) => r.status === 'pending' && can('leave', 'approve'), run: (r, reload) => rpc('decide_leave', { p_id: r.id, p_approve: false }, 'Leave rejected').then(reload) },
      { label: 'Cancel', show: (r) => ['pending', 'approved'].includes(r.status) && (r.employee_id === state.employeeId || can('leave', 'approve')),
        run: async (r, reload) => { if (await confirmDialog({ title: 'Cancel leave request?', confirmLabel: 'Cancel request', danger: true })) rpc('cancel_leave', { p_id: r.id }, 'Request cancelled').then(reload) } },
    ],
  },

  'leave-balances': {
    title: 'Leave balances', module: 'leave', table: 'leave_balances', readonly: true, noDetail: true,
    select: '*, employee:employees!employee_id(first_name,last_name), type:leave_types!leave_type_id(name)',
    columns: [
      { label: 'Employee', render: (r) => esc(fullName(r.employee)), csv: (r) => fullName(r.employee) },
      col('Type', 'type.name', { sortKey: null }), col('Year', 'year'), col('Allocated', 'allocated_days'), col('Used', 'used_days'),
      { label: 'Remaining', render: (r) => num(r.allocated_days - r.used_days), csv: (r) => r.allocated_days - r.used_days },
    ],
    order: ['year', false],
  },

  'leave-types': {
    title: 'Leave types', singular: 'Leave type', module: 'leave', table: 'leave_types', noDetail: true,
    columns: [col('Name', 'name'), col('Days / year', 'days_per_year'), { label: 'Paid', render: (r) => (r.is_paid ? 'Yes' : 'No') }, statusCol()],
    order: ['name', true],
    fields: [
      { name: 'name', label: 'Name', required: true }, { name: 'days_per_year', label: 'Days per year', type: 'number', default: 0, min: 0 },
      { name: 'is_paid', label: 'Paid', type: 'checkbox', default: true, checkLabel: 'Paid leave' },
      { name: 'requires_approval', label: 'Approval', type: 'checkbox', default: true, checkLabel: 'Requires approval' },
      { name: 'carry_forward_limit', label: 'Carry-forward limit (days)', type: 'number', default: 0, min: 0 },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_ACTIVE, required: true, default: 'active' },
    ],
  },

  projects: {
    title: 'Projects', singular: 'Project', module: 'projects', table: 'projects', soft: true,
    select: '*, owner:employees!owner_employee_id(first_name,last_name), department:departments!department_id(name), customer:customers!customer_id(name)',
    columns: [
      col('Code', 'code'), col('Name', 'name'),
      { label: 'Owner', render: (r) => esc(r.owner ? fullName(r.owner) : '—'), csv: (r) => (r.owner ? fullName(r.owner) : '') },
      statusCol(), statusCol('priority', 'Priority'), dateCol('Due', 'due_date'),
      { label: 'Progress', sortKey: 'progress_percent', render: (r) => progress(r.progress_percent), csv: (r) => r.progress_percent },
    ],
    search: ['name', 'code'], statusField: 'status', statuses: ['planned', 'active', 'on_hold', 'completed', 'cancelled'], order: ['created_at', false],
    detailTitle: (r) => r.name,
    detailActions: [{ label: 'Open board', run: (r) => (location.hash = `#/tasks?project=${r.id}`) }],
    fields: [
      { name: 'name', label: 'Name', required: true, span: 2 },
      { name: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'on_hold', 'completed', 'cancelled'], required: true, default: 'planned' },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true, default: 'medium' },
      { name: 'start_date', label: 'Start date', type: 'date' }, { name: 'due_date', label: 'Due date', type: 'date' },
      { name: 'owner_employee_id', label: 'Owner', ref: empRef, view: 'owner', viewFn: fullName },
      { name: 'department_id', label: 'Department', ref: deptRef, view: 'department.name' },
      { name: 'customer_id', label: 'Customer', ref: custRef, view: 'customer.name' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    related: [
      { title: 'Tasks', table: 'tasks', fk: 'project_id', module: 'tasks', soft: true, select: '*, assignee:employees!assignee_employee_id(first_name,last_name)',
        columns: [col('Task', 'title'), { label: 'Assignee', render: (r) => esc(r.assignee ? fullName(r.assignee) : '—') }, statusCol(), statusCol('priority', 'Priority'), dateCol('Due', 'due_date')] },
      { title: 'Team', table: 'project_members', fk: 'project_id', module: 'projects', select: '*, employee:employees!employee_id(first_name,last_name)',
        columns: [{ label: 'Member', render: (r) => esc(fullName(r.employee)) }, col('Role', 'project_role')],
        add: { fields: [{ name: 'employee_id', label: 'Employee', ref: empRef, required: true }, { name: 'project_role', label: 'Role', type: 'select', options: ['lead', 'member', 'viewer'], required: true, default: 'member' }] } },
    ],
  },

  tasks: {
    title: 'Task list', singular: 'Task', module: 'tasks', table: 'tasks', soft: true,
    select: '*, project:projects!project_id(name), assignee:employees!assignee_employee_id(first_name,last_name)',
    columns: [
      col('Task', 'title'), col('Project', 'project.name', { sortKey: null }),
      { label: 'Assignee', render: (r) => esc(r.assignee ? fullName(r.assignee) : '—'), csv: (r) => (r.assignee ? fullName(r.assignee) : '') },
      statusCol(), statusCol('priority', 'Priority'), dateCol('Due', 'due_date'),
    ],
    search: ['title'], statusField: 'status', statuses: ['todo', 'in_progress', 'review', 'done', 'cancelled'], order: ['created_at', false],
    detailTitle: (r) => r.title,
    fields: [
      { name: 'title', label: 'Title', required: true, span: 2 },
      { name: 'project_id', label: 'Project', ref: { table: 'projects', label: 'name', soft: true }, view: 'project.name' },
      { name: 'assignee_employee_id', label: 'Assignee', ref: empRef, view: 'assignee', viewFn: fullName },
      { name: 'status', label: 'Status', type: 'select', options: ['todo', 'in_progress', 'review', 'done', 'cancelled'], required: true, default: 'todo' },
      { name: 'priority', label: 'Priority', type: 'select', options: PRIORITIES, required: true, default: 'medium' },
      { name: 'due_date', label: 'Due date', type: 'date' }, { name: 'estimated_hours', label: 'Estimated hours', type: 'number', min: 0 },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    related: [
      { title: 'Comments', table: 'task_comments', fk: 'task_id', module: 'tasks', order: ['created_at', false],
        columns: [{ label: 'Comment', render: (r) => esc(r.body) }, { label: 'When', render: (r) => dateTime(r.created_at) }],
        add: { label: 'Add comment', fields: [{ name: 'body', label: 'Comment', type: 'textarea', required: true }] } },
    ],
  },

  customers: {
    title: 'Customers', singular: 'Customer', module: 'customers', table: 'customers', soft: true,
    columns: [col('Code', 'customer_code'), col('Name', 'name'), col('Type', 'type'), col('Email', 'email'), col('Phone', 'phone'), statusCol()],
    search: ['name', 'email', 'customer_code', 'phone'], statusField: 'status', statuses: STATUS_ACTIVE, order: ['created_at', false],
    detailTitle: (r) => r.name,
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'type', label: 'Type', type: 'select', options: ['company', 'individual'], required: true, default: 'company' },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'tax_id', label: 'Tax ID' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_ACTIVE, required: true, default: 'active' },
      { name: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', default: 30, min: 0 },
      { name: 'credit_limit', label: 'Credit limit', type: 'money', default: 0, min: 0 },
      { name: 'billing_address', label: 'Billing address', type: 'textarea' }, { name: 'shipping_address', label: 'Shipping address', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    related: [
      { title: 'Sales orders', table: 'sales_orders', fk: 'customer_id', module: 'sales', soft: true,
        columns: [{ label: 'Order', render: (r) => link(`#/orders/sales/${r.id}`, r.order_number) }, dateCol('Date', 'order_date'), statusCol(), moneyCol('Total', 'total')] },
      { title: 'Invoices', table: 'invoices', fk: 'customer_id', module: 'sales', soft: true,
        columns: [{ label: 'Invoice', render: (r) => link(`#/m/invoices/${r.id}`, r.invoice_number) }, dateCol('Due', 'due_date'), statusCol(), moneyCol('Total', 'total'), moneyCol('Balance', 'balance_due')] },
      { title: 'Contacts', table: 'customer_contacts', fk: 'customer_id', module: 'customers',
        columns: [col('Name', 'name'), col('Position', 'position'), col('Email', 'email'), col('Phone', 'phone')],
        add: { fields: [{ name: 'name', label: 'Name', required: true }, { name: 'position', label: 'Position' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' }] } },
    ],
  },

  suppliers: {
    title: 'Suppliers', singular: 'Supplier', module: 'suppliers', table: 'suppliers', soft: true,
    columns: [col('Code', 'supplier_code'), col('Name', 'name'), col('Email', 'email'), col('Phone', 'phone'), statusCol()],
    search: ['name', 'email', 'supplier_code', 'phone'], statusField: 'status', statuses: STATUS_ACTIVE, order: ['created_at', false],
    detailTitle: (r) => r.name,
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'tax_id', label: 'Tax ID' },
      { name: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', default: 30, min: 0 },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_ACTIVE, required: true, default: 'active' },
      { name: 'address', label: 'Address', type: 'textarea' }, { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    related: [
      { title: 'Purchase orders', table: 'purchase_orders', fk: 'supplier_id', module: 'purchases', soft: true,
        columns: [{ label: 'PO', render: (r) => link(`#/orders/purchase/${r.id}`, r.po_number) }, dateCol('Date', 'order_date'), statusCol(), moneyCol('Total', 'total')] },
      { title: 'Bills', table: 'bills', fk: 'supplier_id', module: 'purchases', soft: true,
        columns: [{ label: 'Bill', render: (r) => link(`#/m/bills/${r.id}`, r.bill_number) }, dateCol('Due', 'due_date'), statusCol(), moneyCol('Total', 'total'), moneyCol('Balance', 'balance_due')] },
      { title: 'Contacts', table: 'supplier_contacts', fk: 'supplier_id', module: 'suppliers',
        columns: [col('Name', 'name'), col('Position', 'position'), col('Email', 'email'), col('Phone', 'phone')],
        add: { fields: [{ name: 'name', label: 'Name', required: true }, { name: 'position', label: 'Position' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' }] } },
    ],
  },

  products: {
    title: 'Products', singular: 'Product', module: 'inventory', table: 'products', soft: true,
    select: '*, category:product_categories!category_id(name), stock:stock_levels(quantity_on_hand)',
    columns: [
      col('SKU', 'sku'), col('Name', 'name'), col('Category', 'category.name', { sortKey: null }),
      { label: 'In stock', right: true, render: (r) => { const q = (r.stock || []).reduce((a, s) => a + Number(s.quantity_on_hand), 0); return r.track_inventory ? `<span class="${q <= Number(r.reorder_level) ? 'text-bad font-medium' : ''}">${num(q)}</span>` : '—' }, csv: (r) => (r.stock || []).reduce((a, s) => a + Number(s.quantity_on_hand), 0) },
      moneyCol('Price', 'sale_price'), statusCol(),
    ],
    search: ['name', 'sku'], statusField: 'status', statuses: ['active', 'inactive', 'discontinued'], order: ['created_at', false],
    detailTitle: (r) => r.name,
    fields: [
      { name: 'sku', label: 'SKU', required: true }, { name: 'name', label: 'Name', required: true },
      { name: 'category_id', label: 'Category', ref: { table: 'product_categories', label: 'name' }, view: 'category.name' },
      { name: 'unit_of_measure', label: 'Unit', default: 'pcs', required: true },
      { name: 'cost_price', label: 'Cost price', type: 'money', default: 0, min: 0 }, { name: 'sale_price', label: 'Sale price', type: 'money', default: 0, min: 0 },
      { name: 'tax_rate', label: 'Tax rate %', type: 'number', min: 0 }, { name: 'reorder_level', label: 'Reorder level', type: 'number', default: 0, min: 0 },
      { name: 'track_inventory', label: 'Inventory', type: 'checkbox', default: true, checkLabel: 'Track stock' },
      { name: 'status', label: 'Status', type: 'select', options: ['active', 'inactive', 'discontinued'], required: true, default: 'active' },
      { name: 'description', label: 'Description', type: 'textarea' },
    ],
    related: [
      { title: 'Stock by warehouse', table: 'stock_levels', fk: 'product_id', module: 'inventory', select: '*, warehouse:warehouses!warehouse_id(name)',
        columns: [col('Warehouse', 'warehouse.name'), col('On hand', 'quantity_on_hand'), col('Reserved', 'quantity_reserved')] },
      { title: 'Stock history', table: 'stock_movements', fk: 'product_id', module: 'inventory', order: ['created_at', false], limit: 20, select: '*, warehouse:warehouses!warehouse_id(name)',
        columns: [{ label: 'Date', render: (r) => dateTime(r.created_at) }, col('Warehouse', 'warehouse.name'), { label: 'Type', render: (r) => badge(r.movement_type) }, col('Qty', 'quantity'), col('Reason', 'reason')] },
    ],
  },

  categories: {
    title: 'Product categories', singular: 'Category', module: 'inventory', table: 'product_categories', noDetail: true,
    select: '*, parent:product_categories!parent_category_id(name)',
    columns: [col('Name', 'name'), col('Parent', 'parent.name', { sortKey: null }), col('Description', 'description')],
    search: ['name'], order: ['name', true],
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'parent_category_id', label: 'Parent category', ref: { table: 'product_categories', label: 'name' } }, { name: 'description', label: 'Description', type: 'textarea' }],
  },

  warehouses: {
    title: 'Warehouses', singular: 'Warehouse', module: 'inventory', table: 'warehouses', noDetail: true,
    columns: [col('Name', 'name'), col('Code', 'code'), col('Address', 'address'), { label: 'Default', render: (r) => (r.is_default ? 'Yes' : '') }, statusCol()],
    order: ['name', true],
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code' }, { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'is_default', label: 'Default', type: 'checkbox', checkLabel: 'Default warehouse' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_ACTIVE, required: true, default: 'active' }],
  },

  stock: {
    title: 'Stock levels', module: 'inventory', table: 'stock_levels', readonly: true, noDetail: true,
    select: '*, product:products!product_id(name,sku,reorder_level), warehouse:warehouses!warehouse_id(name)',
    columns: [
      { label: 'Product', render: (r) => `${esc(r.product?.name)} <span class="text-muted">${esc(r.product?.sku)}</span>`, csv: (r) => r.product?.name },
      col('Warehouse', 'warehouse.name', { sortKey: null }), col('On hand', 'quantity_on_hand'), col('Reserved', 'quantity_reserved'),
      { label: 'Available', render: (r) => num(r.quantity_on_hand - r.quantity_reserved), csv: (r) => r.quantity_on_hand - r.quantity_reserved },
      { label: 'Level', render: (r) => (Number(r.quantity_on_hand) <= Number(r.product?.reorder_level) ? '<span class="badge badge-bad">Low stock</span>' : '<span class="badge badge-ok">OK</span>'), csv: (r) => (Number(r.quantity_on_hand) <= Number(r.product?.reorder_level) ? 'low' : 'ok') },
    ],
    order: ['updated_at', false],
    toolbar: () => (can('inventory', 'create') ? [{
      label: 'Adjust stock', primary: true,
      run: (reload) => openForm({
        title: 'Adjust stock', modal: true, submitLabel: 'Apply adjustment',
        fields: [
          { name: 'product_id', label: 'Product', ref: { ...prodRef, filter: (q) => q.eq('track_inventory', true) }, required: true, span: 2 },
          { name: 'warehouse_id', label: 'Warehouse', ref: whRef, required: true },
          { name: 'quantity', label: 'Quantity (+ add / − remove)', type: 'number', required: true },
          { name: 'reason', label: 'Reason', span: 2 },
        ],
        onSubmit: async (v) => {
          if (!v.quantity) throw new Error('Quantity cannot be zero')
          unwrap(await supabase.from('stock_movements').insert({ ...v, organization_id: state.org.id, movement_type: 'adjustment', reference_type: 'manual' }))
          reload()
        },
      }),
    }] : []),
  },

  movements: {
    title: 'Stock movements', module: 'inventory', table: 'stock_movements', readonly: true, noDetail: true,
    select: '*, product:products!product_id(name,sku), warehouse:warehouses!warehouse_id(name)',
    columns: [
      { label: 'Date', sortKey: 'created_at', render: (r) => dateTime(r.created_at), csv: (r) => r.created_at },
      { label: 'Product', render: (r) => esc(r.product?.name), csv: (r) => r.product?.name },
      col('Warehouse', 'warehouse.name', { sortKey: null }), { label: 'Type', sortKey: 'movement_type', render: (r) => badge(r.movement_type), csv: (r) => r.movement_type },
      { label: 'Quantity', right: true, sortKey: 'quantity', render: (r) => `<span class="${r.quantity < 0 ? 'text-bad' : 'text-ok'}">${r.quantity > 0 ? '+' : ''}${num(r.quantity)}</span>`, csv: (r) => r.quantity },
      col('Reason', 'reason'),
    ],
    order: ['created_at', false],
  },

  'sales-orders': {
    title: 'Sales orders', singular: 'Sales order', module: 'sales', table: 'sales_orders', soft: true,
    select: '*, customer:customers!customer_id(name)',
    columns: [
      { label: 'Order', sortKey: 'order_number', render: (r) => `<span class="font-medium">${esc(r.order_number)}</span>`, csv: (r) => r.order_number },
      col('Customer', 'customer.name', { sortKey: null }), dateCol('Date', 'order_date'), statusCol(), moneyCol('Total', 'total'),
    ],
    search: ['order_number'], statusField: 'status', statuses: ['draft', 'confirmed', 'fulfilled', 'closed', 'cancelled'], order: ['created_at', false],
    newHref: '#/orders/sales/new', detailHref: (r) => `#/orders/sales/${r.id}`, canEdit: () => false, canDelete: () => false,
  },

  'purchase-orders': {
    title: 'Purchase orders', singular: 'Purchase order', module: 'purchases', table: 'purchase_orders', soft: true,
    select: '*, supplier:suppliers!supplier_id(name)',
    columns: [
      { label: 'PO', sortKey: 'po_number', render: (r) => `<span class="font-medium">${esc(r.po_number)}</span>`, csv: (r) => r.po_number },
      col('Supplier', 'supplier.name', { sortKey: null }), dateCol('Date', 'order_date'), statusCol(), moneyCol('Total', 'total'),
    ],
    search: ['po_number'], statusField: 'status', statuses: ['draft', 'pending_approval', 'approved', 'partially_received', 'received', 'closed', 'cancelled'], order: ['created_at', false],
    newHref: '#/orders/purchase/new', detailHref: (r) => `#/orders/purchase/${r.id}`, canEdit: () => false, canDelete: () => false,
  },

  invoices: {
    title: 'Invoices', singular: 'Invoice', module: 'sales', table: 'invoices', soft: true, readonly: true,
    select: '*, customer:customers!customer_id(name)',
    columns: [
      { label: 'Invoice', sortKey: 'invoice_number', render: (r) => `<span class="font-medium">${esc(r.invoice_number)}</span>`, csv: (r) => r.invoice_number },
      col('Customer', 'customer.name', { sortKey: null }), dateCol('Issued', 'issue_date'), dateCol('Due', 'due_date'), statusCol(), moneyCol('Total', 'total'), moneyCol('Balance', 'balance_due'),
    ],
    search: ['invoice_number'], statusField: 'status', statuses: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'], order: ['created_at', false],
    detailTitle: (r) => r.invoice_number,
    rowActions: [payAction('in')],
    detailActions: [
      { label: 'Mark as sent', show: (r) => r.status === 'draft' && can('sales', 'edit'), run: async (r, reload) => { await attempt(async () => unwrap(await supabase.from('invoices').update({ status: 'sent' }).eq('id', r.id)), 'Invoice marked as sent'); reload() } },
      payAction('in'),
      { label: 'Print', icon: 'print', run: () => window.print() },
      { label: 'Void', danger: true, show: (r) => !['void', 'paid', 'partially_paid'].includes(r.status) && can('sales', 'edit'),
        run: async (r, reload) => { if (await confirmDialog({ title: 'Void this invoice?', message: 'This cannot be undone.', confirmLabel: 'Void invoice', danger: true })) { await attempt(async () => unwrap(await supabase.from('invoices').update({ status: 'void' }).eq('id', r.id)), 'Invoice voided'); reload() } } },
    ],
    fields: [
      { name: 'issue_date', label: 'Issue date', type: 'date', view: 'issue_date' }, { name: 'due_date', label: 'Due date', type: 'date' },
      { name: 'customer_id', label: 'Customer', ref: custRef, view: 'customer.name' }, { name: 'status', label: 'Status', type: 'text', view: 'status' },
      { name: 'subtotal', label: 'Subtotal', type: 'money' }, { name: 'tax_total', label: 'Tax', type: 'money' },
      { name: 'total', label: 'Total', type: 'money' }, { name: 'amount_paid', label: 'Paid', type: 'money' }, { name: 'balance_due', label: 'Balance due', type: 'money' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    related: [
      { title: 'Items', table: 'invoice_items', fk: 'invoice_id', module: 'sales',
        columns: [col('Description', 'description'), col('Qty', 'quantity'), moneyCol('Unit price', 'unit_price'), col('Tax %', 'tax_rate'), moneyCol('Line total', 'line_total')] },
      { title: 'Payments', table: 'payments', fk: 'invoice_id', module: 'finance', order: ['payment_date', false],
        columns: [dateCol('Date', 'payment_date'), moneyCol('Amount', 'amount'), col('Method', 'method'), col('Reference', 'reference')] },
    ],
  },

  bills: {
    title: 'Supplier bills', singular: 'Bill', module: 'purchases', table: 'bills', soft: true,
    select: '*, supplier:suppliers!supplier_id(name), po:purchase_orders!purchase_order_id(po_number)',
    columns: [col('Bill', 'bill_number'), col('Supplier', 'supplier.name', { sortKey: null }), dateCol('Due', 'due_date'), statusCol(), moneyCol('Total', 'total'), moneyCol('Balance', 'balance_due')],
    search: ['bill_number'], statusField: 'status', statuses: ['open', 'partially_paid', 'paid', 'overdue', 'void'], order: ['created_at', false],
    detailTitle: (r) => r.bill_number,
    canEdit: (r) => !r || (r.amount_paid == 0 && r.status !== 'void'), canDelete: () => false,
    rowActions: [payAction('out')], detailActions: [payAction('out')],
    fields: [
      { name: 'bill_number', label: 'Bill number', required: true },
      { name: 'supplier_id', label: 'Supplier', ref: suppRef, required: true, view: 'supplier.name' },
      { name: 'purchase_order_id', label: 'Purchase order', ref: { table: 'purchase_orders', label: 'po_number', soft: true }, view: 'po.po_number' },
      { name: 'total', label: 'Total', type: 'money', required: true, min: 0 },
      { name: 'issue_date', label: 'Issue date', type: 'date', required: true, default: today() },
      { name: 'due_date', label: 'Due date', type: 'date', required: true, default: today() },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    related: [{ title: 'Payments', table: 'payments', fk: 'bill_id', module: 'finance', order: ['payment_date', false],
      columns: [dateCol('Date', 'payment_date'), moneyCol('Amount', 'amount'), col('Method', 'method'), col('Reference', 'reference')] }],
  },

  payments: {
    title: 'Payments', module: 'finance', table: 'payments', readonly: true, noDetail: true,
    select: '*, invoice:invoices!invoice_id(invoice_number), bill:bills!bill_id(bill_number)',
    columns: [
      dateCol('Date', 'payment_date'),
      { label: 'Direction', sortKey: 'direction', render: (r) => (r.direction === 'in' ? '<span class="badge badge-ok">Received</span>' : '<span class="badge badge-warn">Paid out</span>'), csv: (r) => r.direction },
      { label: 'Document', render: (r) => esc(r.invoice?.invoice_number || r.bill?.bill_number || '—'), csv: (r) => r.invoice?.invoice_number || r.bill?.bill_number },
      moneyCol('Amount', 'amount'), col('Method', 'method'), col('Reference', 'reference'),
    ],
    order: ['payment_date', false],
  },

  income: {
    title: 'Income', singular: 'Income', module: 'finance', table: 'income_records', noDetail: true,
    select: '*, category:finance_categories!category_id(name), customer:customers!customer_id(name)',
    columns: [dateCol('Date', 'date'), col('Category', 'category.name', { sortKey: null }), col('Description', 'description'), col('Customer', 'customer.name', { sortKey: null }), { label: 'Source', render: (r) => badge(r.source_type) }, moneyCol('Amount', 'amount')],
    search: ['description'], order: ['date', false],
    canEdit: (r) => !r || r.source_type === 'manual', canDelete: (r) => !r || r.source_type === 'manual',
    fields: [
      { name: 'category_id', label: 'Category', ref: { table: 'finance_categories', label: 'name', filter: (q) => q.eq('type', 'income') } },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0.01 }, { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
      { name: 'customer_id', label: 'Customer', ref: custRef }, { name: 'description', label: 'Description', type: 'textarea' },
    ],
  },

  expenses: {
    title: 'Expenses', singular: 'Expense', module: 'finance', table: 'expense_records', noDetail: true,
    select: '*, category:finance_categories!category_id(name), supplier:suppliers!supplier_id(name)',
    columns: [dateCol('Date', 'date'), col('Category', 'category.name', { sortKey: null }), col('Description', 'description'), col('Supplier', 'supplier.name', { sortKey: null }), statusCol(), moneyCol('Amount', 'amount')],
    search: ['description'], statusField: 'status', statuses: ['pending', 'approved', 'rejected', 'paid'], order: ['date', false],
    canEdit: (r) => !r || r.status === 'pending', canDelete: (r) => !r || r.status === 'pending',
    rowActions: [
      { label: 'Approve', show: (r) => r.status === 'pending' && can('finance', 'approve'), run: (r, reload) => rpc('decide_expense', { p_id: r.id, p_approve: true }, 'Expense approved').then(reload) },
      { label: 'Reject', danger: true, show: (r) => r.status === 'pending' && can('finance', 'approve'), run: (r, reload) => rpc('decide_expense', { p_id: r.id, p_approve: false }, 'Expense rejected').then(reload) },
    ],
    fields: [
      { name: 'category_id', label: 'Category', ref: { table: 'finance_categories', label: 'name', filter: (q) => q.eq('type', 'expense') } },
      { name: 'amount', label: 'Amount', type: 'money', required: true, min: 0.01 }, { name: 'date', label: 'Date', type: 'date', required: true, default: today() },
      { name: 'supplier_id', label: 'Supplier', ref: suppRef }, { name: 'description', label: 'Description', type: 'textarea' },
    ],
  },

  'finance-categories': {
    title: 'Finance categories', singular: 'Category', module: 'finance', table: 'finance_categories', noDetail: true,
    columns: [col('Name', 'name'), { label: 'Type', sortKey: 'type', render: (r) => `<span class="badge ${r.type === 'income' ? 'badge-ok' : 'badge-warn'}">${esc(r.type)}</span>`, csv: (r) => r.type }, statusCol()],
    order: ['name', true], statusField: 'status', statuses: STATUS_ACTIVE,
    fields: [{ name: 'name', label: 'Name', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['income', 'expense'], required: true },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_ACTIVE, required: true, default: 'active' }],
  },
}

/* "My tasks" reuses the tasks table, filtered to the signed-in employee. */
registry['my-tasks'] = {
  ...registry.tasks, title: 'My tasks',
  baseFilter: (q) => q.eq('assignee_employee_id', state.employeeId || '00000000-0000-0000-0000-000000000000'),
  canCreate: () => false,
}

export function configFor(key) {
  const cfg = registry[key]
  return cfg ? { ...cfg, key } : null
}

/* ------------------------------------------------------------- navigation */
export const nav = [
  { title: 'Overview', items: [{ label: 'Dashboard', href: '#/', icon: 'dashboard', module: 'dashboard' }] },
  { title: 'People', items: [
    { label: 'Employees', href: '#/m/employees', icon: 'users', module: 'employees' },
    { label: 'Departments', href: '#/m/departments', icon: 'building', module: 'departments' },
    { label: 'Attendance', href: '#/m/attendance', icon: 'clock', module: 'attendance' },
    { label: 'Leave', href: '#/m/leave-requests', icon: 'calendar', module: 'leave', also: ['#/m/leave-balances'] },
    { label: 'Projects', href: '#/m/projects', icon: 'briefcase', module: 'projects' },
    { label: 'Tasks board', href: '#/tasks', icon: 'check', module: 'tasks' },
    { label: 'My tasks', href: '#/m/my-tasks', icon: 'list', module: 'tasks' },
  ] },
  { title: 'Operations', items: [
    { label: 'Customers', href: '#/m/customers', icon: 'user', module: 'customers' },
    { label: 'Suppliers', href: '#/m/suppliers', icon: 'truck', module: 'suppliers' },
    { label: 'Products', href: '#/m/products', icon: 'box', module: 'inventory', also: ['#/m/categories', '#/m/warehouses'] },
    { label: 'Stock', href: '#/m/stock', icon: 'warehouse', module: 'inventory', also: ['#/m/movements'] },
    { label: 'Sales orders', href: '#/m/sales-orders', icon: 'cart', module: 'sales' },
    { label: 'Invoices', href: '#/m/invoices', icon: 'receipt', module: 'sales' },
    { label: 'Purchase orders', href: '#/m/purchase-orders', icon: 'bag', module: 'purchases' },
    { label: 'Supplier bills', href: '#/m/bills', icon: 'file', module: 'purchases' },
  ] },
  { title: 'Money', items: [
    { label: 'Finance', href: '#/finance', icon: 'wallet', module: 'finance', also: ['#/m/income', '#/m/expenses', '#/m/payments', '#/m/finance-categories'] },
    { label: 'Reports', href: '#/reports', icon: 'chart', module: 'reports' },
  ] },
  { title: 'System', items: [
    { label: 'Notifications', href: '#/notifications', icon: 'bell', module: 'notifications' },
    { label: 'Settings', href: '#/settings', icon: 'settings', module: 'settings' },
  ] },
]

export { clearOptionCache, titleCase }
