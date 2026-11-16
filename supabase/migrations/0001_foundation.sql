-- ============================================================================
-- Phase 1 — Foundation: tenancy, auth profiles, roles, permissions, helpers
-- ============================================================================
create extension if not exists pgcrypto;

-- ---------- profiles ---------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  phone text,
  theme_preference text not null default 'system' check (theme_preference in ('light','dark','system')),
  is_platform_admin boolean not null default false,
  last_active_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- organizations ----------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  industry text,
  country text,
  timezone text not null default 'UTC',
  currency text not null default 'USD',
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  date_format text not null default 'YYYY-MM-DD',
  default_tax_rate numeric(5,2) not null default 0,
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- permissions / roles ---------------------------------------------
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null check (action in ('view','create','edit','delete','approve','export')),
  unique (module, action)
);

insert into public.permissions (module, action)
select m, a
from unnest(array['dashboard','employees','departments','attendance','leave','projects','tasks',
  'customers','suppliers','inventory','sales','purchases','finance','reports','notifications',
  'settings','users']) as m
cross join unnest(array['view','create','edit','delete','approve','export']) as a;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  label text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  unique (role_id, permission_id)
);
create index on public.role_permissions (organization_id);

-- ---------- memberships / invitations ---------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status text not null default 'active' check (status in ('active','disabled')),
  employee_id uuid,  -- FK added in phase 2 (employees)
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);
create index on public.memberships (profile_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_id uuid not null references public.roles(id),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invitations (organization_id);

-- ---------- sequences, audit, attachments, notifications --------------------
create table public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null,
  prefix text not null default '',
  next_number int not null default 1,
  padding int not null default 4,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,  -- intentionally no FK: logs must survive organization removal
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs (organization_id, created_at desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.attachments (organization_id, entity_type, entity_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  action_status text not null default 'none' check (action_status in ('none','pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index on public.notifications (recipient_id, is_read, created_at desc);

-- ============================================================================
-- Helper functions
-- ============================================================================
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.profile_id = auth.uid() and m.organization_id = p_org
      and m.status = 'active' and o.status = 'active')
$$;

create or replace function public.has_perm(p_org uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    join public.organizations o on o.id = m.organization_id and o.status = 'active'
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.profile_id = auth.uid() and m.organization_id = p_org and m.status = 'active'
      and p.module = p_module and p.action = p_action)
$$;

create or replace function public.assert_perm(p_org uuid, p_module text, p_action text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm(p_org, p_module, p_action) then
    raise exception 'Permission denied (% %)', p_module, p_action using errcode = '42501';
  end if;
end $$;

create or replace function public.my_employee_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.memberships
  where profile_id = auth.uid() and organization_id = p_org and status = 'active'
$$;

create or replace function public.shares_org(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.organization_id = b.organization_id
    where a.profile_id = auth.uid() and b.profile_id = p_profile)
$$;

-- Notifications (internal use by other security-definer functions/triggers)
create or replace function public.notify(
  p_org uuid, p_recipient uuid, p_type text, p_title text, p_body text default null,
  p_entity_type text default null, p_entity_id uuid default null, p_action_status text default 'none')
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null then return; end if;
  insert into public.notifications (organization_id, recipient_id, type, title, body, entity_type, entity_id, action_status)
  values (p_org, p_recipient, p_type, p_title, p_body, p_entity_type, p_entity_id, p_action_status);
end $$;

create or replace function public.notify_perm(
  p_org uuid, p_module text, p_action text, p_type text, p_title text, p_body text default null,
  p_entity_type text default null, p_entity_id uuid default null, p_action_status text default 'none')
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select distinct m.profile_id from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
    where m.organization_id = p_org and m.status = 'active' and p.module = p_module and p.action = p_action
  loop
    perform public.notify(p_org, r.profile_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_action_status);
  end loop;
end $$;

-- Document numbering ---------------------------------------------------------
create or replace function public.next_doc_number(p_org uuid, p_type text) returns text
language plpgsql security definer set search_path = public as $$
declare v_prefix text; v_num int; v_pad int;
begin
  if not public.is_member(p_org) then raise exception 'Permission denied' using errcode = '42501'; end if;
  insert into public.document_sequences (organization_id, document_type, prefix)
  values (p_org, p_type, upper(left(p_type, 3)) || '-') on conflict do nothing;
  update public.document_sequences set next_number = next_number + 1
  where organization_id = p_org and document_type = p_type
  returning prefix, next_number - 1, padding into v_prefix, v_num, v_pad;
  return v_prefix || lpad(v_num::text, v_pad, '0');
end $$;

-- Trigger: assign a document number. args: document_type, column name
create or replace function public.assign_doc_number() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb := to_jsonb(new); col text := tg_argv[1];
begin
  if j->>col is null or j->>col = '' then
    new := jsonb_populate_record(new,
      jsonb_build_object(col, public.next_doc_number((j->>'organization_id')::uuid, tg_argv[0])));
  end if;
  return new;
end $$;

-- Trigger: stamp created_by
create or replace function public.stamp_user() returns trigger language plpgsql as $$
begin
  if to_jsonb(new) ? 'created_by' and to_jsonb(new)->>'created_by' is null then
    new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid()));
  end if;
  return new;
end $$;

-- Trigger: audit log
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb;
begin
  if tg_op = 'DELETE' then rec := to_jsonb(old); else rec := to_jsonb(new); end if;
  insert into public.audit_logs (organization_id, actor_id, action, table_name, record_id, changes)
  values ((rec->>'organization_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, (rec->>'id')::uuid,
    case tg_op
      when 'INSERT' then jsonb_build_object('after', to_jsonb(new))
      when 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
      else jsonb_build_object('before', to_jsonb(old)) end);
  return null;
end $$;

-- Trigger: block client-side status changes outside the allowed list.
-- RPC functions set app.rpc = 'on' for the transaction to bypass this guard.
create or replace function public.guard_status() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.rpc', true), '') = 'on' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return new; end if;
  end if;
  if not (new.status = any (tg_argv)) then
    raise exception 'Status "%" can only be set through its workflow action', new.status using errcode = '42501';
  end if;
  return new;
end $$;

-- Applies tenant RLS + audit + housekeeping triggers to a table.
-- p_scope: optional SQL boolean expression letting plain users see/create only their own rows.
create or replace function public.apply_rls(p_table text, p_module text, p_scope text default null, p_audit boolean default true)
returns void language plpgsql as $$
declare sel_x text := ''; ins_x text := '';
begin
  execute format('alter table public.%I enable row level security', p_table);
  if p_scope is not null then
    sel_x := format(' and (public.has_perm(organization_id,%L,''edit'') or public.has_perm(organization_id,%L,''approve'') or (%s))', p_module, p_module, p_scope);
    ins_x := sel_x;
  end if;
  execute format('drop policy if exists %I on public.%I', p_table || '_sel', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_ins', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_upd', p_table);
  execute format('drop policy if exists %I on public.%I', p_table || '_del', p_table);
  execute format('create policy %I on public.%I for select to authenticated using (public.has_perm(organization_id,%L,''view'')%s)', p_table || '_sel', p_table, p_module, sel_x);
  execute format('create policy %I on public.%I for insert to authenticated with check (public.has_perm(organization_id,%L,''create'')%s)', p_table || '_ins', p_table, p_module, ins_x);
  execute format('create policy %I on public.%I for update to authenticated using (public.has_perm(organization_id,%L,''edit'')) with check (public.has_perm(organization_id,%L,''edit''))', p_table || '_upd', p_table, p_module, p_module);
  execute format('create policy %I on public.%I for delete to authenticated using (public.has_perm(organization_id,%L,''delete''))', p_table || '_del', p_table, p_module);

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name='updated_at') then
    execute format('drop trigger if exists trg_updated_at on public.%I', p_table);
    execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.set_updated_at()', p_table);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name='created_by') then
    execute format('drop trigger if exists trg_stamp_user on public.%I', p_table);
    execute format('create trigger trg_stamp_user before insert on public.%I for each row execute function public.stamp_user()', p_table);
  end if;
  if p_audit then
    execute format('drop trigger if exists trg_audit on public.%I', p_table);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', p_table);
  end if;
end $$;

-- ============================================================================
-- Default role permissions + organization creation
-- ============================================================================
create or replace function public.seed_role_permissions(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.role_permissions (organization_id, role_id, permission_id)
  select p_org, r.id, p.id from public.roles r cross join public.permissions p
  where r.organization_id = p_org and r.name = 'organization_admin';

  with defs(role_name, module, actions) as (values
    ('manager','dashboard','{view}'::text[]),
    ('manager','employees','{view,edit}'),
    ('manager','departments','{view}'),
    ('manager','attendance','{view,create,edit}'),
    ('manager','leave','{view,create,approve}'),
    ('manager','projects','{view,create,edit,delete}'),
    ('manager','tasks','{view,create,edit,delete}'),
    ('manager','customers','{view,create,edit}'),
    ('manager','suppliers','{view,create,edit}'),
    ('manager','inventory','{view,create,edit}'),
    ('manager','sales','{view,create,edit,approve}'),
    ('manager','purchases','{view,create,edit,approve}'),
    ('manager','finance','{view}'),
    ('manager','reports','{view,export}'),
    ('manager','notifications','{view}'),
    ('employee','dashboard','{view}'),
    ('employee','employees','{view}'),
    ('employee','departments','{view}'),
    ('employee','attendance','{view,create}'),
    ('employee','leave','{view,create}'),
    ('employee','projects','{view}'),
    ('employee','tasks','{view,edit}'),
    ('employee','notifications','{view}'))
  insert into public.role_permissions (organization_id, role_id, permission_id)
  select p_org, r.id, p.id from defs d
  join public.roles r on r.organization_id = p_org and r.name = d.role_name
  join public.permissions p on p.module = d.module and p.action = any (d.actions);
end $$;

create or replace function public.create_organization(
  p_name text, p_industry text default null, p_country text default null,
  p_timezone text default 'UTC', p_currency text default 'USD',
  p_fiscal_start int default 1, p_date_format text default 'YYYY-MM-DD',
  p_tax_rate numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_admin uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Organization name is required'; end if;

  insert into public.organizations (name, slug, industry, country, timezone, currency, fiscal_year_start_month, date_format, default_tax_rate, created_by)
  values (trim(p_name),
          trim(both '-' from lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'))) || '-' || substr(gen_random_uuid()::text, 1, 6),
          p_industry, p_country, p_timezone, p_currency, p_fiscal_start, p_date_format, p_tax_rate, auth.uid())
  returning id into v_org;

  insert into public.roles (organization_id, name, label, description) values
    (v_org, 'organization_admin', 'Organization Admin', 'Full control of the organization workspace'),
    (v_org, 'manager', 'Manager', 'Manages teams, approvals and day-to-day operations'),
    (v_org, 'employee', 'Employee', 'Performs assigned work with limited access');
  perform public.seed_role_permissions(v_org);

  select id into v_admin from public.roles where organization_id = v_org and name = 'organization_admin';
  insert into public.memberships (organization_id, profile_id, role_id) values (v_org, auth.uid(), v_admin);
  update public.profiles set last_active_organization_id = v_org where id = auth.uid();

  insert into public.document_sequences (organization_id, document_type, prefix, padding) values
    (v_org, 'employee', 'EMP-', 4), (v_org, 'customer', 'CUS-', 4), (v_org, 'supplier', 'SUP-', 4),
    (v_org, 'sales_order', 'SO-', 5), (v_org, 'invoice', 'INV-', 5),
    (v_org, 'purchase_order', 'PO-', 5), (v_org, 'project', 'PRJ-', 3);

  if to_regprocedure('public.seed_org_module_defaults(uuid)') is not null then
    execute 'select public.seed_org_module_defaults($1)' using v_org;
  end if;
  return v_org;
end $$;

-- Invitations ---------------------------------------------------------------
create or replace function public.get_invitation(p_token text)
returns table (organization_name text, email text, role_label text, status text, expired boolean)
language sql stable security definer set search_path = public as $$
  select o.name, i.email, r.label, i.status, (i.expires_at < now())
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  join public.roles r on r.id = i.role_id
  where i.token = p_token
$$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_inv public.invitations; v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();
  select * into v_inv from public.invitations where token = p_token for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at < now() then
    raise exception 'This invitation is no longer valid';
  end if;
  if lower(v_inv.email) <> lower(coalesce(v_email, '')) then
    raise exception 'This invitation was sent to a different email address';
  end if;
  insert into public.memberships (organization_id, profile_id, role_id)
  values (v_inv.organization_id, auth.uid(), v_inv.role_id)
  on conflict (organization_id, profile_id) do update set role_id = excluded.role_id, status = 'active';
  update public.invitations set status = 'accepted', accepted_at = now() where id = v_inv.id;
  update public.profiles set last_active_organization_id = v_inv.organization_id where id = auth.uid();
  return v_inv.organization_id;
end $$;

grant execute on function public.get_invitation(text) to anon, authenticated;

-- Last-admin protection --------------------------------------------------------
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_was_admin boolean; v_remaining int;
begin
  select (name = 'organization_admin') into v_was_admin from public.roles where id = old.role_id;
  if tg_op = 'UPDATE' then
    if new.role_id = old.role_id and new.status = old.status then
      return new;
    end if;
  end if;
  if v_was_admin and old.status = 'active' then
    select count(*) into v_remaining from public.memberships m
    join public.roles r on r.id = m.role_id
    where m.organization_id = old.organization_id and r.name = 'organization_admin'
      and m.status = 'active' and m.id <> old.id;
    if v_remaining = 0 then
      raise exception 'An organization must keep at least one active Organization Admin';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger trg_guard_last_admin before update or delete on public.memberships
for each row execute function public.guard_last_admin();

-- ============================================================================
-- Row Level Security — foundation tables
-- ============================================================================
alter table public.profiles enable row level security;
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org(id) or public.is_platform_admin());
create policy profiles_upd on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, phone, theme_preference, last_active_organization_id) on public.profiles to authenticated;
create trigger trg_updated_at before update on public.profiles for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
create policy organizations_sel on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_platform_admin()
         or exists (select 1 from public.memberships m
                    where m.organization_id = organizations.id and m.profile_id = auth.uid()));
create policy organizations_upd on public.organizations for update to authenticated
  using (public.has_perm(id, 'settings', 'edit') or public.is_platform_admin())
  with check (public.has_perm(id, 'settings', 'edit') or public.is_platform_admin());
revoke update on public.organizations from authenticated;
grant update (name, logo_url, industry, country, timezone, currency, fiscal_year_start_month, date_format, default_tax_rate, status)
  on public.organizations to authenticated;
create trigger trg_updated_at before update on public.organizations for each row execute function public.set_updated_at();

alter table public.permissions enable row level security;
create policy permissions_sel on public.permissions for select to authenticated using (true);

alter table public.roles enable row level security;
create policy roles_sel on public.roles for select to authenticated using (public.is_member(organization_id));
create policy roles_upd on public.roles for update to authenticated
  using (public.has_perm(organization_id, 'settings', 'edit')) with check (public.has_perm(organization_id, 'settings', 'edit'));

alter table public.role_permissions enable row level security;
create policy role_permissions_sel on public.role_permissions for select to authenticated using (public.is_member(organization_id));
create policy role_permissions_ins on public.role_permissions for insert to authenticated
  with check (public.has_perm(organization_id, 'settings', 'edit'));
create policy role_permissions_del on public.role_permissions for delete to authenticated
  using (public.has_perm(organization_id, 'settings', 'edit'));

alter table public.memberships enable row level security;
create policy memberships_sel on public.memberships for select to authenticated
  using (profile_id = auth.uid() or public.has_perm(organization_id, 'users', 'view') or public.is_platform_admin());
create policy memberships_upd on public.memberships for update to authenticated
  using (public.has_perm(organization_id, 'users', 'edit')) with check (public.has_perm(organization_id, 'users', 'edit'));
create policy memberships_del on public.memberships for delete to authenticated
  using (public.has_perm(organization_id, 'users', 'delete'));
revoke update on public.memberships from authenticated;
grant update (role_id, status, employee_id) on public.memberships to authenticated;
create trigger trg_updated_at before update on public.memberships for each row execute function public.set_updated_at();

select public.apply_rls('invitations', 'users');
select public.apply_rls('document_sequences', 'settings');

alter table public.audit_logs enable row level security;
create policy audit_logs_sel on public.audit_logs for select to authenticated
  using (public.has_perm(organization_id, 'settings', 'view'));

alter table public.attachments enable row level security;
create policy attachments_sel on public.attachments for select to authenticated using (public.is_member(organization_id));
create policy attachments_ins on public.attachments for insert to authenticated with check (public.is_member(organization_id));
create policy attachments_del on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.has_perm(organization_id, 'settings', 'edit'));

alter table public.notifications enable row level security;
create policy notifications_sel on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_upd on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_del on public.notifications for delete to authenticated using (recipient_id = auth.uid());
revoke update on public.notifications from authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

-- ============================================================================
-- Storage buckets (paths must begin with the organization id)
-- ============================================================================
insert into storage.buckets (id, name, public) values
  ('avatars','avatars',false), ('org-assets','org-assets',false), ('documents','documents',false),
  ('receipts','receipts',false), ('invoices','invoices',false)
on conflict (id) do nothing;

create policy "org members read files" on storage.objects for select to authenticated
  using (bucket_id in ('avatars','org-assets','documents','receipts','invoices')
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "org members write files" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','org-assets','documents','receipts','invoices')
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "org members delete files" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','org-assets','documents','receipts','invoices')
         and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         and public.is_member(((storage.foldername(name))[1])::uuid));
