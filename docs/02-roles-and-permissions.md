# 02 — Roles & Permissions

## Roles

| Role | Scope | Responsibility |
| --- | --- | --- |
| **Platform Admin** | Entire platform | Manages the ERP platform and all organizations (create, suspend, support). Does not browse organization business data by default. |
| **Organization Admin** | One organization | Full control of their workspace: users, roles, settings and all modules. |
| **Manager** | Assigned departments/teams | Manages their team, approves leave, runs projects, views module data relevant to their department. |
| **Employee** | Own work | Views permitted modules, performs assigned tasks, submits attendance and leave requests. |

## Permission Model
- Each user has **one membership per organization** with one role.
- Permissions are defined as `module + action` pairs: `view`, `create`, `edit`, `delete`, `approve`, `export`.
- Roles carry a default permission set; Organization Admin can customize permissions for Manager and Employee roles.
- Platform Admin is a platform-level flag, separate from organization roles.

## Default Permission Matrix

Legend: **F** full (view/create/edit/delete/approve/export) · **V** view · **C** create/edit own · **A** approve · **S** scoped to own department/team · **—** no access

| Module | Platform Admin | Org Admin | Manager | Employee |
| --- | --- | --- | --- | --- |
| Platform / Organizations | F | — | — | — |
| Dashboard | — | F | V (S) | V (own) |
| HR – Employees | — | F | V, edit (S) | V (own profile) |
| HR – Departments | — | F | V | V |
| HR – Attendance | — | F | V, edit (S) | C (own) |
| HR – Leave | — | F | A (S) | C (own) |
| Projects & Tasks | — | F | F (S) | V assigned, update own tasks |
| Customers | — | F | V, C | V (if granted) |
| Suppliers | — | F | V, C | — |
| Inventory | — | F | V, C | V (if granted) |
| Sales | — | F | V, C, A | C (if granted) |
| Purchases | — | F | V, C, A | — |
| Finance | — | F | V (S) | — |
| Reports | — | F | V (S), export | — |
| Notifications | — | F | V (own) | V (own) |
| Settings – Organization | — | F | — | — |
| Settings – Users & Roles | — | F | — | — |
| Profile | — | F | F (own) | F (own) |

## Access Rules
1. A user can only access data where `organization_id` matches an active membership.
2. Department scope ("S") limits a Manager to departments where they are the manager or a member.
3. Approvals (leave, purchase orders above threshold, expenses) follow a pending → approved/rejected flow and raise notifications.
4. Disabled or removed members lose access immediately; their historic records remain.
5. The last Organization Admin of an organization cannot be removed or demoted.
6. Permissions are enforced in the database (row-level security) and mirrored in the UI (hidden menus/actions) — UI hiding is never the only guard.

## Onboarding & Invitations
- First registrant creating an organization becomes its Organization Admin.
- Admins invite users by email with a pre-assigned role; invitations expire and can be revoked.
- Platform Admins are created manually by the platform owner, never via public sign-up.
