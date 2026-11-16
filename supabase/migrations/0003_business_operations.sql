-- ============================================================================
-- Phase 3 — Business Operations: customers, suppliers, inventory, sales, purchases
-- ============================================================================

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_code text,
  name text not null,
  type text not null default 'company' check (type in ('individual','company')),
  email text, phone text, tax_id text,
  billing_address text, shipping_address text,
  payment_terms_days int not null default 30,
  credit_limit numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_code)
);

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null, position text, email text, phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.projects add constraint projects_customer_fk
  foreign key (customer_id) references public.customers(id) on delete set null;

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_code text,
  name text not null,
  email text, phone text, tax_id text, address text,
  payment_terms_days int not null default 30,
  status text not null default 'active' check (status in ('active','inactive')),
  notes text,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_code)
);

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null, position text, email text, phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  parent_category_id uuid references public.product_categories(id) on delete set null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  address text,
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category_id uuid references public.product_categories(id) on delete set null,
  unit_of_measure text not null default 'pcs',
  cost_price numeric(14,2) not null default 0,
  sale_price numeric(14,2) not null default 0,
  tax_rate numeric(5,2),
  reorder_level numeric(14,2) not null default 0,
  track_inventory boolean not null default true,
  image_url text,
  status text not null default 'active' check (status in ('active','inactive','discontinued')),
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);
create index on public.products (organization_id, category_id);

create table public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  quantity_on_hand numeric(14,2) not null default 0,
  quantity_reserved numeric(14,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, warehouse_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id),
  movement_type text not null check (movement_type in ('purchase_receipt','sale','adjustment','transfer_in','transfer_out','return')),
  quantity numeric(14,2) not null check (quantity <> 0),
  reference_type text,
  reference_id uuid,
  reason text,
  performed_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (organization_id, product_id, created_at desc);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text,
  customer_id uuid not null references public.customers(id),
  order_date date not null default current_date,
  expected_delivery_date date,
  status text not null default 'draft' check (status in ('draft','confirmed','fulfilled','closed','cancelled')),
  warehouse_id uuid references public.warehouses(id),
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  salesperson_employee_id uuid references public.employees(id) on delete set null,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);
create index on public.sales_orders (organization_id, status);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  quantity numeric(14,2) not null check (quantity > 0),
  unit_price numeric(14,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  position int not null default 0
);
create index on public.sales_order_items (sales_order_id);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  po_number text,
  supplier_id uuid not null references public.suppliers(id),
  order_date date not null default current_date,
  expected_date date,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','partially_received','received','closed','cancelled')),
  warehouse_id uuid references public.warehouses(id),
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, po_number)
);
create index on public.purchase_orders (organization_id, status);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id),
  description text,
  quantity numeric(14,2) not null check (quantity > 0),
  quantity_received numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  line_total numeric(14,2) not null default 0,
  position int not null default 0
);
create index on public.purchase_order_items (purchase_order_id);

-- ---------- numbering & status guards -----------------------------------------
create trigger trg_cust_code before insert on public.customers
  for each row execute function public.assign_doc_number('customer', 'customer_code');
create trigger trg_sup_code before insert on public.suppliers
  for each row execute function public.assign_doc_number('supplier', 'supplier_code');
create trigger trg_so_number before insert on public.sales_orders
  for each row execute function public.assign_doc_number('sales_order', 'order_number');
create trigger trg_po_number before insert on public.purchase_orders
  for each row execute function public.assign_doc_number('purchase_order', 'po_number');
create trigger trg_so_status before insert or update on public.sales_orders
  for each row execute function public.guard_status('draft');
create trigger trg_po_status before insert or update on public.purchase_orders
  for each row execute function public.guard_status('draft');

-- ---------- line items: totals ------------------------------------------------------
create or replace function public.sales_item_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_order uuid;
begin
  if tg_op = 'DELETE' then v_order := old.sales_order_id; else v_order := new.sales_order_id; end if;
  select status into v_status from public.sales_orders where id = v_order;
  if v_status is distinct from 'draft' and coalesce(current_setting('app.rpc', true), '') <> 'on' then
    raise exception 'Items can only be changed while the order is a draft';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.line_total := round(new.quantity * new.unit_price * (1 - new.discount_percent / 100), 2);
  return new;
end $$;
create trigger trg_so_item_calc before insert or update or delete on public.sales_order_items
  for each row execute function public.sales_item_calc();

create or replace function public.sales_order_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  if tg_op = 'DELETE' then v_order := old.sales_order_id; else v_order := new.sales_order_id; end if;
  update public.sales_orders so set
    subtotal = coalesce(s.sub, 0), discount_total = coalesce(s.disc, 0),
    tax_total = coalesce(s.tax, 0), total = coalesce(s.sub, 0) + coalesce(s.tax, 0)
  from (select sum(line_total) sub, sum(round(quantity * unit_price * discount_percent / 100, 2)) disc,
               sum(round(line_total * tax_rate / 100, 2)) tax
        from public.sales_order_items where sales_order_id = v_order) s
  where so.id = v_order;
  return null;
end $$;
create trigger trg_so_recalc after insert or update or delete on public.sales_order_items
  for each row execute function public.sales_order_recalc();

create or replace function public.purchase_item_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text; v_order uuid;
begin
  if tg_op = 'DELETE' then v_order := old.purchase_order_id; else v_order := new.purchase_order_id; end if;
  select status into v_status from public.purchase_orders where id = v_order;
  if v_status is distinct from 'draft' and coalesce(current_setting('app.rpc', true), '') <> 'on' then
    raise exception 'Items can only be changed while the purchase order is a draft';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.line_total := round(new.quantity * new.unit_cost, 2);
  return new;
end $$;
create trigger trg_po_item_calc before insert or update or delete on public.purchase_order_items
  for each row execute function public.purchase_item_calc();

create or replace function public.purchase_order_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  if tg_op = 'DELETE' then v_order := old.purchase_order_id; else v_order := new.purchase_order_id; end if;
  update public.purchase_orders po set
    subtotal = coalesce(s.sub, 0), tax_total = coalesce(s.tax, 0), total = coalesce(s.sub, 0) + coalesce(s.tax, 0)
  from (select sum(line_total) sub, sum(round(line_total * tax_rate / 100, 2)) tax
        from public.purchase_order_items where purchase_order_id = v_order) s
  where po.id = v_order;
  return null;
end $$;
create trigger trg_po_recalc after insert or update or delete on public.purchase_order_items
  for each row execute function public.purchase_order_recalc();

-- ---------- stock ledger ----------------------------------------------------------------
create or replace function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_on_hand numeric; v_reorder numeric; v_track boolean; v_name text;
begin
  insert into public.stock_levels (organization_id, product_id, warehouse_id, quantity_on_hand)
  values (new.organization_id, new.product_id, new.warehouse_id, 0)
  on conflict (product_id, warehouse_id) do nothing;

  update public.stock_levels set quantity_on_hand = quantity_on_hand + new.quantity, updated_at = now()
  where product_id = new.product_id and warehouse_id = new.warehouse_id
  returning quantity_on_hand into v_on_hand;

  if v_on_hand < 0 then
    raise exception 'Insufficient stock: this movement would take the quantity below zero';
  end if;

  select reorder_level, track_inventory, name into v_reorder, v_track, v_name from public.products where id = new.product_id;
  if v_track and new.quantity < 0 and v_on_hand <= v_reorder then
    perform public.notify_perm(new.organization_id, 'inventory', 'edit', 'low_stock',
      'Low stock: ' || v_name, v_on_hand || ' remaining (reorder level ' || v_reorder || ')', 'products', new.product_id);
  end if;
  return null;
end $$;
create trigger trg_apply_stock after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

create or replace function public.default_warehouse(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.warehouses where organization_id = p_org and status = 'active'
  order by is_default desc, created_at limit 1
$$;

-- ---------- sales workflow ----------------------------------------------------------------
create or replace function public.confirm_sales_order(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare so public.sales_orders; it record; v_wh uuid;
begin
  select * into so from public.sales_orders where id = p_id for update;
  if not found then raise exception 'Order not found'; end if;
  perform public.assert_perm(so.organization_id, 'sales', 'approve');
  if so.status <> 'draft' then raise exception 'Only draft orders can be confirmed'; end if;
  if not exists (select 1 from public.sales_order_items where sales_order_id = p_id) then
    raise exception 'Add at least one item before confirming';
  end if;
  v_wh := coalesce(so.warehouse_id, public.default_warehouse(so.organization_id));
  if v_wh is null then raise exception 'No warehouse available'; end if;
  perform set_config('app.rpc', 'on', true);
  for it in select i.*, p.track_inventory from public.sales_order_items i
            left join public.products p on p.id = i.product_id where i.sales_order_id = p_id loop
    if it.product_id is not null and it.track_inventory then
      insert into public.stock_movements (organization_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, reason)
      values (so.organization_id, it.product_id, v_wh, 'sale', -it.quantity, 'sales_orders', p_id, 'Order ' || so.order_number);
    end if;
  end loop;
  update public.sales_orders set status = 'confirmed', warehouse_id = v_wh where id = p_id;
end $$;

create or replace function public.set_sales_order_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare so public.sales_orders; it record;
begin
  select * into so from public.sales_orders where id = p_id for update;
  if not found then raise exception 'Order not found'; end if;
  perform public.assert_perm(so.organization_id, 'sales', 'edit');
  if not ((so.status = 'confirmed' and p_status in ('fulfilled','cancelled'))
       or (so.status = 'fulfilled' and p_status = 'closed')
       or (so.status = 'draft' and p_status = 'cancelled')) then
    raise exception 'Cannot change order from % to %', so.status, p_status;
  end if;
  perform set_config('app.rpc', 'on', true);
  if so.status = 'confirmed' and p_status = 'cancelled' then
    for it in select i.*, p.track_inventory from public.sales_order_items i
              left join public.products p on p.id = i.product_id where i.sales_order_id = p_id loop
      if it.product_id is not null and it.track_inventory then
        insert into public.stock_movements (organization_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, reason)
        values (so.organization_id, it.product_id, so.warehouse_id, 'return', it.quantity, 'sales_orders', p_id, 'Cancelled ' || so.order_number);
      end if;
    end loop;
  end if;
  update public.sales_orders set status = p_status where id = p_id;
end $$;

-- ---------- purchase workflow ------------------------------------------------------------
create or replace function public.set_purchase_order_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'Purchase order not found'; end if;

  if po.status = 'draft' and p_status = 'pending_approval' then
    perform public.assert_perm(po.organization_id, 'purchases', 'create');
    if not exists (select 1 from public.purchase_order_items where purchase_order_id = p_id) then
      raise exception 'Add at least one item first';
    end if;
  elsif po.status = 'pending_approval' and p_status in ('approved','draft') then
    perform public.assert_perm(po.organization_id, 'purchases', 'approve');
  elsif (po.status in ('draft','pending_approval','approved') and p_status = 'cancelled')
     or (po.status = 'received' and p_status = 'closed') then
    perform public.assert_perm(po.organization_id, 'purchases', 'edit');
  else
    raise exception 'Cannot change purchase order from % to %', po.status, p_status;
  end if;

  perform set_config('app.rpc', 'on', true);
  update public.purchase_orders set status = p_status,
    approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when p_status = 'approved' then now() else approved_at end
  where id = p_id;

  if p_status = 'pending_approval' then
    perform public.notify_perm(po.organization_id, 'purchases', 'approve', 'approval_required',
      'Purchase order awaiting approval', po.po_number || ' — total ' || po.total, 'purchase_orders', p_id, 'pending');
  elsif po.status = 'pending_approval' then
    update public.notifications set action_status = case when p_status = 'approved' then 'approved' else 'rejected' end
    where entity_type = 'purchase_orders' and entity_id = p_id and action_status = 'pending';
  end if;
end $$;

-- p_items: optional [{"item_id": "...", "qty": 3}]; null receives everything outstanding
create or replace function public.receive_purchase_order(p_id uuid, p_items jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders; it record; v_qty numeric; v_wh uuid; v_open int;
begin
  select * into po from public.purchase_orders where id = p_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  perform public.assert_perm(po.organization_id, 'purchases', 'edit');
  if po.status not in ('approved','partially_received') then
    raise exception 'Only approved purchase orders can be received';
  end if;
  v_wh := coalesce(po.warehouse_id, public.default_warehouse(po.organization_id));
  if v_wh is null then raise exception 'No warehouse available'; end if;
  perform set_config('app.rpc', 'on', true);

  for it in select i.*, p.track_inventory from public.purchase_order_items i
            left join public.products p on p.id = i.product_id where i.purchase_order_id = p_id loop
    if p_items is null then
      v_qty := it.quantity - it.quantity_received;
    else
      select coalesce(sum((e->>'qty')::numeric), 0) into v_qty from jsonb_array_elements(p_items) e where (e->>'item_id')::uuid = it.id;
    end if;
    v_qty := least(greatest(v_qty, 0), it.quantity - it.quantity_received);
    if v_qty > 0 then
      update public.purchase_order_items set quantity_received = quantity_received + v_qty where id = it.id;
      if it.product_id is not null and it.track_inventory then
        insert into public.stock_movements (organization_id, product_id, warehouse_id, movement_type, quantity, reference_type, reference_id, reason)
        values (po.organization_id, it.product_id, v_wh, 'purchase_receipt', v_qty, 'purchase_orders', p_id, 'Received ' || po.po_number);
      end if;
    end if;
  end loop;

  select count(*) into v_open from public.purchase_order_items where purchase_order_id = p_id and quantity_received < quantity;
  update public.purchase_orders set warehouse_id = v_wh,
    status = case when v_open = 0 then 'received' else 'partially_received' end where id = p_id;
end $$;

-- ---------- RLS ------------------------------------------------------------------------------
select public.apply_rls('customers', 'customers');
select public.apply_rls('customer_contacts', 'customers');
select public.apply_rls('suppliers', 'suppliers');
select public.apply_rls('supplier_contacts', 'suppliers');
select public.apply_rls('product_categories', 'inventory');
select public.apply_rls('warehouses', 'inventory');
select public.apply_rls('products', 'inventory');
select public.apply_rls('stock_levels', 'inventory', null, false);
select public.apply_rls('stock_movements', 'inventory');
select public.apply_rls('sales_orders', 'sales');
select public.apply_rls('sales_order_items', 'sales');
select public.apply_rls('purchase_orders', 'purchases');
select public.apply_rls('purchase_order_items', 'purchases');

-- Stock levels are derived from the movement ledger; movements are append-only.
revoke insert, update, delete on public.stock_levels from authenticated;
revoke update, delete on public.stock_movements from authenticated;
-- Received quantities change only through receive_purchase_order().
revoke update on public.purchase_order_items from authenticated;
grant update (product_id, description, quantity, unit_cost, tax_rate, position) on public.purchase_order_items to authenticated;
revoke insert on public.purchase_order_items from authenticated;
grant insert (organization_id, purchase_order_id, product_id, description, quantity, unit_cost, tax_rate, position) on public.purchase_order_items to authenticated;

-- ---------- atomic order save (header + line items) -----------------------------------------
-- p_header: {customer_id, order_date, expected_delivery_date, warehouse_id, notes}
-- p_items:  [{product_id, description, quantity, unit_price, discount_percent, tax_rate}]
create or replace function public.save_sales_order(p_org uuid, p_id uuid, p_header jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; so public.sales_orders; it jsonb; i int := 0;
begin
  if p_id is null then
    perform public.assert_perm(p_org, 'sales', 'create');
    insert into public.sales_orders (organization_id, customer_id, order_date, expected_delivery_date, warehouse_id, notes, salesperson_employee_id, created_by)
    values (p_org, (p_header->>'customer_id')::uuid, coalesce((p_header->>'order_date')::date, current_date),
            nullif(p_header->>'expected_delivery_date', '')::date, nullif(p_header->>'warehouse_id', '')::uuid,
            p_header->>'notes', public.my_employee_id(p_org), auth.uid())
    returning id into v_id;
  else
    select * into so from public.sales_orders where id = p_id and organization_id = p_org for update;
    if not found then raise exception 'Order not found'; end if;
    perform public.assert_perm(p_org, 'sales', 'edit');
    if so.status <> 'draft' then raise exception 'Only draft orders can be edited'; end if;
    update public.sales_orders set customer_id = (p_header->>'customer_id')::uuid,
      order_date = coalesce((p_header->>'order_date')::date, order_date),
      expected_delivery_date = nullif(p_header->>'expected_delivery_date', '')::date,
      warehouse_id = nullif(p_header->>'warehouse_id', '')::uuid, notes = p_header->>'notes'
    where id = p_id;
    v_id := p_id;
    delete from public.sales_order_items where sales_order_id = v_id;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.sales_order_items (organization_id, sales_order_id, product_id, description, quantity, unit_price, discount_percent, tax_rate, position)
    values (p_org, v_id, nullif(it->>'product_id', '')::uuid, it->>'description', (it->>'quantity')::numeric,
            coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'discount_percent')::numeric, 0), coalesce((it->>'tax_rate')::numeric, 0), i);
  end loop;
  return v_id;
end $$;

create or replace function public.save_purchase_order(p_org uuid, p_id uuid, p_header jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; po public.purchase_orders; it jsonb; i int := 0;
begin
  if p_id is null then
    perform public.assert_perm(p_org, 'purchases', 'create');
    insert into public.purchase_orders (organization_id, supplier_id, order_date, expected_date, warehouse_id, notes, created_by)
    values (p_org, (p_header->>'supplier_id')::uuid, coalesce((p_header->>'order_date')::date, current_date),
            nullif(p_header->>'expected_date', '')::date, nullif(p_header->>'warehouse_id', '')::uuid, p_header->>'notes', auth.uid())
    returning id into v_id;
  else
    select * into po from public.purchase_orders where id = p_id and organization_id = p_org for update;
    if not found then raise exception 'Purchase order not found'; end if;
    perform public.assert_perm(p_org, 'purchases', 'edit');
    if po.status <> 'draft' then raise exception 'Only draft purchase orders can be edited'; end if;
    update public.purchase_orders set supplier_id = (p_header->>'supplier_id')::uuid,
      order_date = coalesce((p_header->>'order_date')::date, order_date),
      expected_date = nullif(p_header->>'expected_date', '')::date,
      warehouse_id = nullif(p_header->>'warehouse_id', '')::uuid, notes = p_header->>'notes'
    where id = p_id;
    v_id := p_id;
    delete from public.purchase_order_items where purchase_order_id = v_id;
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.purchase_order_items (organization_id, purchase_order_id, product_id, description, quantity, unit_cost, tax_rate, position)
    values (p_org, v_id, nullif(it->>'product_id', '')::uuid, it->>'description', (it->>'quantity')::numeric,
            coalesce((it->>'unit_cost')::numeric, 0), coalesce((it->>'tax_rate')::numeric, 0), i);
  end loop;
  return v_id;
end $$;

grant execute on function public.save_sales_order(uuid,uuid,jsonb,jsonb), public.save_purchase_order(uuid,uuid,jsonb,jsonb) to authenticated;
