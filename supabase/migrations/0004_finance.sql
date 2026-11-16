-- ============================================================================
-- Phase 4 — Finance: invoices, bills, payments, income, expenses
-- ============================================================================

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  parent_category_id uuid references public.finance_categories(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, type, name)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number text,
  sales_order_id uuid references public.sales_orders(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  issue_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','overdue','void')),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number)
);
create index on public.invoices (organization_id, status, due_date);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text,
  quantity numeric(14,2) not null,
  unit_price numeric(14,2) not null,
  discount_percent numeric(5,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  line_total numeric(14,2) not null
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_number text not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  supplier_id uuid not null references public.suppliers(id),
  issue_date date not null default current_date,
  due_date date not null default current_date,
  status text not null default 'open' check (status in ('open','partially_paid','paid','overdue','void')),
  total numeric(14,2) not null default 0 check (total >= 0),
  amount_paid numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.bills (organization_id, status, due_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  invoice_id uuid references public.invoices(id) on delete set null,
  bill_id uuid references public.bills(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'bank_transfer' check (method in ('cash','bank_transfer','card','cheque','other')),
  reference text,
  recorded_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (not (invoice_id is not null and bill_id is not null))
);
create index on public.payments (organization_id, payment_date);

create table public.income_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.finance_categories(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  description text,
  source_type text not null default 'manual' check (source_type in ('payment','manual')),
  payment_id uuid references public.payments(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.income_records (organization_id, date);

create table public.expense_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.finance_categories(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  date date not null default current_date,
  description text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  submitted_by uuid references public.profiles(id) default auth.uid(),
  approved_by uuid references public.profiles(id),
  receipt_path text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.expense_records (organization_id, date);

-- ---------- triggers -----------------------------------------------------------------
create trigger trg_inv_number before insert on public.invoices
  for each row execute function public.assign_doc_number('invoice', 'invoice_number');
create trigger trg_a_inv_guard before insert or update on public.invoices
  for each row execute function public.guard_status('draft','sent','void');
create trigger trg_a_bill_guard before insert or update on public.bills
  for each row execute function public.guard_status('open','void');
create trigger trg_exp_guard before insert or update on public.expense_records
  for each row execute function public.guard_status('pending');

-- Keeps balance_due and the payment-derived status consistent (and raises overdue alerts).
create or replace function public.refresh_doc_balance() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_old_status text := null; v_label text; v_num text;
begin
  if tg_op = 'UPDATE' then v_old_status := old.status; end if;
  new.balance_due := new.total - new.amount_paid;
  if new.status not in ('draft','void') then
    if new.balance_due <= 0 and new.total > 0 then new.status := 'paid';
    elsif new.amount_paid > 0 then new.status := 'partially_paid';
    elsif new.due_date < current_date then new.status := 'overdue';
    else new.status := case when tg_table_name = 'invoices' then 'sent' else 'open' end;
    end if;
  end if;
  if new.status = 'overdue' and v_old_status is distinct from 'overdue' then
    if tg_table_name = 'invoices' then v_label := 'Invoice overdue'; v_num := new.invoice_number;
    else v_label := 'Bill overdue'; v_num := new.bill_number; end if;
    perform public.notify_perm(new.organization_id, 'finance', 'view', 'invoice_overdue',
      v_label || ': ' || v_num, 'Balance due ' || new.balance_due, tg_table_name, new.id);
  end if;
  return new;
end $$;
create trigger trg_b_inv_balance before insert or update on public.invoices
  for each row execute function public.refresh_doc_balance();
create trigger trg_b_bill_balance before insert or update on public.bills
  for each row execute function public.refresh_doc_balance();

-- Mark everything past due as overdue (called from the app on load).
create or replace function public.refresh_overdue(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then return; end if;
  perform set_config('app.rpc', 'on', true);
  update public.invoices set updated_at = now()
  where organization_id = p_org and status in ('sent') and due_date < current_date and balance_due > 0;
  update public.bills set updated_at = now()
  where organization_id = p_org and status in ('open') and due_date < current_date and balance_due > 0;
end $$;

-- ---------- workflow functions -------------------------------------------------------
create or replace function public.create_invoice_from_order(p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare so public.sales_orders; v_inv uuid; v_terms int;
begin
  select * into so from public.sales_orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  perform public.assert_perm(so.organization_id, 'sales', 'create');
  if so.status not in ('confirmed','fulfilled','closed') then
    raise exception 'Confirm the order before invoicing it';
  end if;
  if exists (select 1 from public.invoices where sales_order_id = p_order and status <> 'void' and deleted_at is null) then
    raise exception 'This order already has an invoice';
  end if;
  select payment_terms_days into v_terms from public.customers where id = so.customer_id;
  perform set_config('app.rpc', 'on', true);
  insert into public.invoices (organization_id, sales_order_id, customer_id, issue_date, due_date, status,
                               subtotal, discount_total, tax_total, total)
  values (so.organization_id, p_order, so.customer_id, current_date, current_date + coalesce(v_terms, 30), 'draft',
          so.subtotal, so.discount_total, so.tax_total, so.total)
  returning id into v_inv;
  insert into public.invoice_items (organization_id, invoice_id, product_id, description, quantity, unit_price, discount_percent, tax_rate, line_total)
  select organization_id, v_inv, product_id, description, quantity, unit_price, discount_percent, tax_rate, line_total
  from public.sales_order_items where sales_order_id = p_order order by position;
  return v_inv;
end $$;

-- p_direction 'in' => p_target is an invoice; 'out' => p_target is a bill.
create or replace function public.record_payment(
  p_direction text, p_target uuid, p_amount numeric, p_date date default current_date,
  p_method text default 'bank_transfer', p_reference text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_pay uuid; v_bal numeric; v_status text; v_cat uuid; v_party uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  perform set_config('app.rpc', 'on', true);

  if p_direction = 'in' then
    select organization_id, balance_due, status, customer_id into v_org, v_bal, v_status, v_party
    from public.invoices where id = p_target for update;
  elsif p_direction = 'out' then
    select organization_id, balance_due, status, supplier_id into v_org, v_bal, v_status, v_party
    from public.bills where id = p_target for update;
  else raise exception 'Invalid payment direction'; end if;
  if v_org is null then raise exception 'Document not found'; end if;

  perform public.assert_perm(v_org, 'finance', 'create');
  if v_status = 'void' then raise exception 'Cannot pay a void document'; end if;
  if p_amount > v_bal then raise exception 'Amount exceeds the balance due (%)', v_bal; end if;

  insert into public.payments (organization_id, direction, invoice_id, bill_id, amount, payment_date, method, reference)
  values (v_org, p_direction, case when p_direction = 'in' then p_target end,
          case when p_direction = 'out' then p_target end, p_amount, p_date, p_method, p_reference)
  returning id into v_pay;

  if p_direction = 'in' then
    update public.invoices set amount_paid = amount_paid + p_amount,
      status = case when status = 'draft' then 'sent' else status end where id = p_target;
    select id into v_cat from public.finance_categories where organization_id = v_org and type = 'income' and name = 'Sales Revenue';
    insert into public.income_records (organization_id, category_id, amount, date, description, source_type, payment_id, customer_id)
    values (v_org, v_cat, p_amount, p_date, 'Invoice payment', 'payment', v_pay, v_party);
  else
    update public.bills set amount_paid = amount_paid + p_amount where id = p_target;
    select id into v_cat from public.finance_categories where organization_id = v_org and type = 'expense' and name = 'Purchases';
    insert into public.expense_records (organization_id, category_id, amount, date, description, supplier_id, payment_id, status, approved_by)
    values (v_org, v_cat, p_amount, p_date, 'Bill payment', v_party, v_pay, 'paid', auth.uid());
  end if;
  return v_pay;
end $$;

create or replace function public.decide_expense(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_status text;
begin
  select organization_id, status into v_org, v_status from public.expense_records where id = p_id for update;
  if v_org is null then raise exception 'Expense not found'; end if;
  perform public.assert_perm(v_org, 'finance', 'approve');
  if v_status <> 'pending' then raise exception 'Only pending expenses can be decided'; end if;
  perform set_config('app.rpc', 'on', true);
  update public.expense_records set status = case when p_approve then 'approved' else 'rejected' end,
    approved_by = auth.uid() where id = p_id;
end $$;

-- ---------- RLS ------------------------------------------------------------------------
select public.apply_rls('finance_categories', 'finance');
select public.apply_rls('invoices', 'sales');
select public.apply_rls('invoice_items', 'sales');
select public.apply_rls('bills', 'purchases');
select public.apply_rls('payments', 'finance');
select public.apply_rls('income_records', 'finance');
select public.apply_rls('expense_records', 'finance');

-- Invoices are created by create_invoice_from_order(); payments by record_payment().
revoke insert, delete on public.invoices from authenticated;
revoke update on public.invoices from authenticated;
grant update (issue_date, due_date, notes, status, deleted_at) on public.invoices to authenticated;
revoke insert, update, delete on public.invoice_items from authenticated;
revoke insert, update, delete on public.payments from authenticated;

-- Bills: totals/paid amounts are not client-writable after creation.
revoke insert, update on public.bills from authenticated;
grant insert (organization_id, bill_number, purchase_order_id, supplier_id, issue_date, due_date, total, notes) on public.bills to authenticated;
grant update (bill_number, issue_date, due_date, total, notes, status, deleted_at) on public.bills to authenticated;

-- Expenses: approval fields are workflow-only.
revoke insert, update on public.expense_records from authenticated;
grant insert (organization_id, category_id, amount, date, description, supplier_id, receipt_path) on public.expense_records to authenticated;
grant update (category_id, amount, date, description, supplier_id, receipt_path) on public.expense_records to authenticated;
-- Income created from payments is read-only in practice (edit only manual rows via the app).
