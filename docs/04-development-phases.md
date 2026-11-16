# 04 — Development Phases

Five phases, each ending in a usable, testable increment. Each phase lists goals, deliverables, database work and exit criteria.

## Phase 1 — Foundation
**Goal:** a secure, multi-tenant shell that every later module plugs into.

**Deliverables**
- Project setup: Vite, Tailwind, Supabase connection, environment configuration, folder conventions, routing.
- UI design system: tokens, light/dark themes, base components (buttons, inputs, tables, drawers, modals, toasts).
- App shell: sidebar, topbar, page layouts, responsive behavior.
- Authentication: registration, login, logout, password reset, invitation acceptance, session handling.
- Multi-tenancy: organizations, memberships, organization switching, tenant-scoped data access.
- Roles & permissions: four roles, permission definitions, route/menu guards, database access policies.
- Organization setup wizard.
- Audit log and shared infrastructure (file storage, activity tracking).

**Database:** organizations, profiles, memberships, roles, permissions, invitations, audit_logs, number sequences.

**Exit criteria**
- A user can register, create an organization, invite a teammate and sign in with the correct role.
- Two organizations cannot see each other's data (verified by tests).
- Theme toggle and responsive shell work on all breakpoints.

## Phase 2 — Core Management
**Goal:** run the internal organization: people, work and visibility.

**Deliverables**
- Dashboard (initial widgets for HR and tasks, structure ready for more).
- Departments and employees (list, detail, create/edit, status, documents).
- Attendance (check-in/out, daily and monthly views).
- Leave (types, balances, requests, approval flow).
- Projects and tasks (list/board, assignment, priority, due dates, progress, comments).
- My Tasks view and basic notifications for assignments and approvals.

**Database:** departments, employees, attendance_records, leave_types, leave_balances, leave_requests, projects, project_members, tasks, task_comments, notifications.

**Exit criteria**
- Employees can request leave; managers approve it; balance updates.
- Tasks can be created, assigned and progressed; project progress reflects task completion.
- Manager sees only their department scope; employee sees only their own data.

## Phase 3 — Business Operations
**Goal:** manage the commercial cycle from supplier to customer.

**Deliverables**
- Customers and suppliers (profiles, contacts, notes, history).
- Inventory: categories, products, warehouses, stock levels, stock movements, low-stock alerts.
- Sales orders with line items, status flow, stock deduction.
- Purchase orders with line items, approval, receiving, stock increase.
- Document numbering (order/PO prefixes per organization).

**Database:** customers, customer_contacts, suppliers, supplier_contacts, product_categories, products, warehouses, stock_levels, stock_movements, sales_orders, sales_order_items, purchase_orders, purchase_order_items.

**Exit criteria**
- Confirming a sales order reduces stock; receiving a purchase order increases stock.
- Stock never silently goes negative (blocked or flagged by rule).
- Customer and supplier detail pages show full transaction history.

## Phase 4 — Finance & Reports
**Goal:** money tracking, invoicing and insight.

**Deliverables**
- Invoices generated from sales orders (print/PDF), supplier bills from purchase orders.
- Payments in/out recorded against invoices and bills; statuses update automatically (paid, partial, overdue).
- Income and expense records with categories, receipts and approval.
- Finance overview (cash position, income vs expenses).
- Reports library with filters and CSV/PDF export; full dashboard widgets (revenue, profit, receivables, payables).

**Database:** invoices, invoice_items, bills, payments, finance_categories, income_records, expense_records, attachments, report views/aggregations.

**Exit criteria**
- Invoice → payment → income flow works end-to-end with correct totals.
- Profit & loss and receivables/payables reports reconcile with underlying records.
- Exports match on-screen data.

## Phase 5 — Finalization
**Goal:** polish, harden and prepare for release.

**Deliverables**
- Notifications center completed (all event types, preferences, approvals inline).
- Settings completed: organization, users, role/permission editor, master data, audit log viewer.
- Platform Admin area (organization management).
- Full permission review across all modules.
- Testing: functional, role-based access, tenant isolation, responsive, accessibility.
- Performance: query indexing, pagination everywhere, lazy-loaded routes, bundle review.
- Documentation: user guide, admin guide, deployment guide.

**Exit criteria**
- Every role walkthrough passes without access leaks.
- All pages usable on desktop, tablet and mobile in both themes.
- Production deployment checklist complete.

## Dependencies Between Phases
Phase 1 → everything. Phase 2 employees/departments feed Phase 3 ownership fields and Phase 4 approvals. Phase 3 orders feed Phase 4 invoices. Phase 5 touches every module.

## Cross-Phase Practices
- Every new table ships with tenant column, access policies, indexes and audit hooks.
- Every module page uses the shared list/detail/form patterns.
- Each phase ends with a role-based test pass and a short demo script.
