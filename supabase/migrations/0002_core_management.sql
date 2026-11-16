-- ============================================================================
-- Phase 2 — Core Management: HR, attendance, leave, projects, tasks
-- ============================================================================

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  manager_employee_id uuid,
  parent_department_id uuid references public.departments(id) on delete set null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_code text,
  profile_id uuid references public.profiles(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  email text,
  phone text,
  date_of_birth date,
  gender text check (gender in ('female','male','other')),
  street text, city text, state text, postal_code text, country text,
  department_id uuid references public.departments(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  job_title text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contract','intern')),
  hire_date date,
  termination_date date,
  status text not null default 'active' check (status in ('active','on_leave','terminated')),
  emergency_contact_name text,
  emergency_contact_phone text,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_code)
);
create index on public.employees (organization_id, department_id);

alter table public.departments add constraint departments_manager_fk
  foreign key (manager_employee_id) references public.employees(id) on delete set null;
alter table public.memberships add constraint memberships_employee_fk
  foreign key (employee_id) references public.employees(id) on delete set null;

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null default current_date,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present','absent','late','half_day','remote','on_leave')),
  notes text,
  edited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, date)
);
create index on public.attendance_records (organization_id, date);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  days_per_year numeric(5,1) not null default 0,
  is_paid boolean not null default true,
  requires_approval boolean not null default true,
  carry_forward_limit numeric(5,1) not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year int not null,
  allocated_days numeric(5,1) not null default 0,
  used_days numeric(5,1) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  days numeric(5,1) not null,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  approver_id uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (days > 0)
);
create index on public.leave_requests (organization_id, status);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  status text not null default 'planned' check (status in ('planned','active','on_hold','completed','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  start_date date,
  due_date date,
  owner_employee_id uuid references public.employees(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  customer_id uuid,  -- FK added in phase 3
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  project_role text not null default 'member' check (project_role in ('lead','member','viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, employee_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','review','done','cancelled')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  assignee_employee_id uuid references public.employees(id) on delete set null,
  reporter_id uuid references public.profiles(id) default auth.uid(),
  due_date date,
  estimated_hours numeric(6,1),
  completed_at timestamptz,
  parent_task_id uuid references public.tasks(id) on delete cascade,
  position int not null default 0,
  created_by uuid references public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (organization_id, project_id, status);
create index on public.tasks (assignee_employee_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- triggers ---------------------------------------------------------
create trigger trg_emp_code before insert on public.employees
  for each row execute function public.assign_doc_number('employee', 'employee_code');
create trigger trg_project_code before insert on public.projects
  for each row execute function public.assign_doc_number('project', 'code');
create trigger trg_leave_status before insert or update on public.leave_requests
  for each row execute function public.guard_status('pending');

create or replace function public.task_completed_stamp() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger trg_task_completed before insert or update on public.tasks
  for each row execute function public.task_completed_stamp();

create or replace function public.refresh_project_progress() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  if tg_op = 'DELETE' then v_project := old.project_id; else v_project := new.project_id; end if;
  if v_project is not null then
    update public.projects p set progress_percent = coalesce((
      select round(100.0 * count(*) filter (where t.status = 'done') / nullif(count(*), 0))
      from public.tasks t where t.project_id = v_project and t.status <> 'cancelled' and t.deleted_at is null), 0)
    where p.id = v_project;
  end if;
  return null;
end $$;
create trigger trg_project_progress after insert or update or delete on public.tasks
  for each row execute function public.refresh_project_progress();

create or replace function public.notify_task_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_changed boolean := true; v_profile uuid;
begin
  if tg_op = 'UPDATE' then
    v_changed := new.assignee_employee_id is distinct from old.assignee_employee_id;
  end if;
  if v_changed and new.assignee_employee_id is not null then
    select profile_id into v_profile from public.employees where id = new.assignee_employee_id;
    if v_profile is not null and v_profile is distinct from auth.uid() then
      perform public.notify(new.organization_id, v_profile, 'task_assigned', 'New task assigned',
        new.title, 'tasks', new.id);
    end if;
  end if;
  return null;
end $$;
create trigger trg_task_notify after insert or update of assignee_employee_id on public.tasks
  for each row execute function public.notify_task_assignment();

create or replace function public.leave_defaults_and_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select trim(first_name || ' ' || last_name) into v_name from public.employees where id = new.employee_id;
  perform public.notify_perm(new.organization_id, 'leave', 'approve', 'leave_request',
    'Leave request from ' || coalesce(v_name, 'an employee'),
    new.start_date || ' to ' || new.end_date || ' (' || new.days || ' days)',
    'leave_requests', new.id, 'pending');
  return null;
end $$;
create trigger trg_leave_notify after insert on public.leave_requests
  for each row execute function public.leave_defaults_and_notify();

-- ---------- workflow functions ----------------------------------------------
create or replace function public.decide_leave(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare lr public.leave_requests; lt public.leave_types; v_year int; v_remaining numeric; v_profile uuid;
begin
  select * into lr from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  perform public.assert_perm(lr.organization_id, 'leave', 'approve');
  if lr.status <> 'pending' then raise exception 'This request has already been decided'; end if;
  select * into lt from public.leave_types where id = lr.leave_type_id;
  v_year := extract(year from lr.start_date);

  if p_approve then
    select coalesce(allocated_days - used_days, lt.days_per_year) into v_remaining
    from (select 1) x left join public.leave_balances b
      on b.employee_id = lr.employee_id and b.leave_type_id = lr.leave_type_id and b.year = v_year;
    if lt.days_per_year > 0 and v_remaining < lr.days then
      raise exception 'Insufficient leave balance (% days remaining)', v_remaining;
    end if;
    insert into public.leave_balances (organization_id, employee_id, leave_type_id, year, allocated_days, used_days)
    values (lr.organization_id, lr.employee_id, lr.leave_type_id, v_year, lt.days_per_year, lr.days)
    on conflict (employee_id, leave_type_id, year)
    do update set used_days = public.leave_balances.used_days + excluded.used_days;
  end if;

  perform set_config('app.rpc', 'on', true);
  update public.leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      approver_id = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_id;

  update public.notifications set action_status = case when p_approve then 'approved' else 'rejected' end
  where entity_type = 'leave_requests' and entity_id = p_id and action_status = 'pending';

  select profile_id into v_profile from public.employees where id = lr.employee_id;
  perform public.notify(lr.organization_id, v_profile, 'leave_decision',
    'Leave request ' || case when p_approve then 'approved' else 'rejected' end,
    lr.start_date || ' to ' || lr.end_date, 'leave_requests', p_id);
end $$;

create or replace function public.cancel_leave(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lr public.leave_requests;
begin
  select * into lr from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if not (lr.employee_id = public.my_employee_id(lr.organization_id)
          or public.has_perm(lr.organization_id, 'leave', 'approve')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if lr.status not in ('pending','approved') then raise exception 'Only pending or approved requests can be cancelled'; end if;
  if lr.status = 'approved' then
    update public.leave_balances set used_days = greatest(used_days - lr.days, 0)
    where employee_id = lr.employee_id and leave_type_id = lr.leave_type_id and year = extract(year from lr.start_date);
  end if;
  perform set_config('app.rpc', 'on', true);
  update public.leave_requests set status = 'cancelled' where id = p_id;
  update public.notifications set action_status = 'none'
  where entity_type = 'leave_requests' and entity_id = p_id and action_status = 'pending';
end $$;

-- ---------- RLS ----------------------------------------------------------------
select public.apply_rls('departments', 'departments');
select public.apply_rls('employees', 'employees');
select public.apply_rls('attendance_records', 'attendance', 'employee_id = public.my_employee_id(organization_id)');
select public.apply_rls('leave_types', 'leave');
select public.apply_rls('leave_balances', 'leave', 'employee_id = public.my_employee_id(organization_id)');
select public.apply_rls('leave_requests', 'leave', 'employee_id = public.my_employee_id(organization_id)');
select public.apply_rls('projects', 'projects');
select public.apply_rls('project_members', 'projects');
select public.apply_rls('tasks', 'tasks');
select public.apply_rls('task_comments', 'tasks');

-- Leave balances are maintained by workflow functions only.
revoke insert, update, delete on public.leave_balances from authenticated;
-- Leave requests: status/decision fields are workflow-only.
revoke update on public.leave_requests from authenticated;
grant update (start_date, end_date, days, reason, leave_type_id) on public.leave_requests to authenticated;
