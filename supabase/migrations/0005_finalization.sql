-- ============================================================================
-- Phase 5 — Finalization: seed data, dashboard stats, platform admin, reports
-- ============================================================================

-- Default data created for every new organization (called by create_organization)
create or replace function public.seed_org_module_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.leave_types (organization_id, name, days_per_year, is_paid) values
    (p_org, 'Annual Leave', 20, true), (p_org, 'Sick Leave', 10, true), (p_org, 'Unpaid Leave', 0, false);
  insert into public.finance_categories (organization_id, name, type) values
    (p_org, 'Sales Revenue', 'income'), (p_org, 'Other Income', 'income'),
    (p_org, 'Purchases', 'expense'), (p_org, 'Salaries', 'expense'), (p_org, 'Rent', 'expense'),
    (p_org, 'Utilities', 'expense'), (p_org, 'Marketing', 'expense'), (p_org, 'Travel', 'expense'),
    (p_org, 'Other Expenses', 'expense');
  insert into public.warehouses (organization_id, name, code, is_default) values (p_org, 'Main Warehouse', 'MAIN', true);
end $$;

-- Dashboard statistics. Sections the caller may not view are returned as null.
create or replace function public.dashboard_stats(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start date := date_trunc('month', current_date)::date;
  r jsonb := '{}'::jsonb;
  v_months jsonb;
begin
  if not public.is_member(p_org) then raise exception 'Permission denied' using errcode = '42501'; end if;

  if public.has_perm(p_org, 'finance', 'view') then
    select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'label', to_char(m, 'Mon'),
        'income', coalesce((select sum(amount) from public.income_records where organization_id = p_org and date_trunc('month', date) = m), 0),
        'expense', coalesce((select sum(amount) from public.expense_records where organization_id = p_org and status in ('approved','paid') and date_trunc('month', date) = m), 0))
        order by m), '[]')
    into v_months
    from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m;
    r := r || jsonb_build_object(
      'months', v_months,
      'income_month', coalesce((select sum(amount) from public.income_records where organization_id = p_org and date >= v_start), 0),
      'expense_month', coalesce((select sum(amount) from public.expense_records where organization_id = p_org and status in ('approved','paid') and date >= v_start), 0));
  end if;

  if public.has_perm(p_org, 'sales', 'view') then
    r := r || jsonb_build_object(
      'open_orders', (select count(*) from public.sales_orders where organization_id = p_org and deleted_at is null and status in ('draft','confirmed')),
      'receivables', coalesce((select sum(balance_due) from public.invoices where organization_id = p_org and deleted_at is null and status in ('sent','partially_paid','overdue')), 0),
      'overdue_invoices', coalesce((select jsonb_agg(x) from (select id, invoice_number, balance_due, due_date from public.invoices
          where organization_id = p_org and deleted_at is null and status = 'overdue' order by due_date limit 5) x), '[]'),
      'sales_by_status', coalesce((select jsonb_object_agg(status, c) from (select status, count(*) c from public.sales_orders
          where organization_id = p_org and deleted_at is null group by status) s), '{}'),
      'top_products', coalesce((select jsonb_agg(x) from (select coalesce(p.name, i.description, 'Item') name, sum(i.line_total) revenue
          from public.sales_order_items i join public.sales_orders o on o.id = i.sales_order_id
          left join public.products p on p.id = i.product_id
          where o.organization_id = p_org and o.status in ('confirmed','fulfilled','closed')
          group by 1 order by 2 desc limit 5) x), '[]'));
  end if;

  if public.has_perm(p_org, 'purchases', 'view') then
    r := r || jsonb_build_object('payables', coalesce((select sum(balance_due) from public.bills
      where organization_id = p_org and deleted_at is null and status in ('open','partially_paid','overdue')), 0));
  end if;

  if public.has_perm(p_org, 'inventory', 'view') then
    r := r || jsonb_build_object('low_stock', (select count(*) from public.products p
      where p.organization_id = p_org and p.deleted_at is null and p.track_inventory and p.status = 'active'
        and coalesce((select sum(quantity_on_hand) from public.stock_levels s where s.product_id = p.id), 0) <= p.reorder_level));
  end if;

  if public.has_perm(p_org, 'employees', 'view') then
    r := r || jsonb_build_object('employees', (select count(*) from public.employees where organization_id = p_org and deleted_at is null and status <> 'terminated'));
  end if;

  if public.has_perm(p_org, 'leave', 'view') then
    r := r || jsonb_build_object(
      'pending_leave', (select count(*) from public.leave_requests where organization_id = p_org and status = 'pending'),
      'on_leave_today', coalesce((select jsonb_agg(trim(e.first_name || ' ' || e.last_name))
          from public.leave_requests l join public.employees e on e.id = l.employee_id
          where l.organization_id = p_org and l.status = 'approved' and current_date between l.start_date and l.end_date), '[]'));
  end if;

  if public.has_perm(p_org, 'purchases', 'approve') then
    r := r || jsonb_build_object('pending_pos', (select count(*) from public.purchase_orders where organization_id = p_org and status = 'pending_approval'));
  end if;

  if public.has_perm(p_org, 'tasks', 'view') then
    r := r || jsonb_build_object(
      'open_tasks', (select count(*) from public.tasks where organization_id = p_org and deleted_at is null and status in ('todo','in_progress','review')),
      'overdue_tasks', (select count(*) from public.tasks where organization_id = p_org and deleted_at is null and status in ('todo','in_progress','review') and due_date < current_date));
  end if;

  return r;
end $$;

-- Platform administration --------------------------------------------------------
create or replace function public.platform_list_organizations()
returns table (id uuid, name text, slug text, status text, country text, currency text, created_at timestamptz, member_count bigint, owner_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Permission denied' using errcode = '42501'; end if;
  return query
  select o.id, o.name, o.slug, o.status, o.country, o.currency, o.created_at,
         (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
         (select p.email from public.profiles p where p.id = o.created_by)
  from public.organizations o order by o.created_at desc;
end $$;

create or replace function public.platform_set_org_status(p_org uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_status not in ('active','suspended') then raise exception 'Invalid status'; end if;
  update public.organizations set status = p_status where id = p_org;
end $$;

-- Marks notifications read in bulk.
create or replace function public.mark_all_notifications_read(p_org uuid) returns void
language sql security definer set search_path = public as $$
  update public.notifications set is_read = true, read_at = now()
  where recipient_id = auth.uid() and organization_id = p_org and not is_read
$$;

grant execute on function
  public.create_organization(text,text,text,text,text,int,text,numeric),
  public.accept_invitation(text), public.decide_leave(uuid,boolean,text), public.cancel_leave(uuid),
  public.confirm_sales_order(uuid), public.set_sales_order_status(uuid,text),
  public.set_purchase_order_status(uuid,text), public.receive_purchase_order(uuid,jsonb),
  public.create_invoice_from_order(uuid), public.record_payment(text,uuid,numeric,date,text,text),
  public.decide_expense(uuid,boolean), public.refresh_overdue(uuid), public.dashboard_stats(uuid),
  public.platform_list_organizations(), public.platform_set_org_status(uuid,text),
  public.mark_all_notifications_read(uuid), public.next_doc_number(uuid,text)
to authenticated;

-- Attendance self-service (employees have create but not edit permission) ----------
create or replace function public.attendance_check_in(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.my_employee_id(p_org);
begin
  if v_emp is null then raise exception 'Your account is not linked to an employee record'; end if;
  perform public.assert_perm(p_org, 'attendance', 'create');
  insert into public.attendance_records (organization_id, employee_id, date, check_in, status)
  values (p_org, v_emp, current_date, now(), 'present')
  on conflict (employee_id, date) do update set check_in = coalesce(public.attendance_records.check_in, now())
  where public.attendance_records.check_in is null;
  if not found then raise exception 'You have already checked in today'; end if;
end $$;

create or replace function public.attendance_check_out(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.my_employee_id(p_org);
begin
  if v_emp is null then raise exception 'Your account is not linked to an employee record'; end if;
  perform public.assert_perm(p_org, 'attendance', 'create');
  update public.attendance_records set check_out = now()
  where employee_id = v_emp and date = current_date and check_in is not null and check_out is null;
  if not found then raise exception 'No open check-in found for today'; end if;
end $$;

grant execute on function public.attendance_check_in(uuid), public.attendance_check_out(uuid) to authenticated;

-- Realtime for notifications and task boards ------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end;
  end if;
end $$;
