# 03 — Pages & Navigation

## Application Layout
- **Left sidebar** — logo/organization switcher, module navigation grouped by area, collapsible; becomes a slide-over menu on mobile.
- **Topbar** — global search, notifications bell (unread count), theme toggle, profile menu.
- **Main content** — page header (title, breadcrumbs, primary action), filters/toolbar, then tables, cards or detail views.
- **Drawers / Modals** — create, edit and quick-view operations without leaving the list page. Drawers for forms, modals for confirmations.

Sidebar groups: *Overview* (Dashboard) · *People* (HR, Projects & Tasks) · *Operations* (Customers, Suppliers, Inventory, Sales, Purchases) · *Money* (Finance, Reports) · *System* (Notifications, Settings).

## Page Types
1. **Auth pages** — Login, Registration, forgot/reset password, accept invitation.
2. **Organization Setup** — first-run wizard.
3. **Dashboard** — widgets overview.
4. **Module list pages** — searchable, filterable, sortable, paginated tables.
5. **Detailed record pages** — full record with tabs (overview, related records, activity).
6. **Create/Edit forms** — in drawers (short) or full pages (long, e.g. orders with line items).
7. **Notifications** — inbox of alerts and approvals.
8. **Reports & Analytics**.
9. **User Profile**.
10. **Organization Settings**.

## Site Map and Page Contents

### Auth
- **Login** — email + password, forgot password link, link to registration.
- **Registration** — name, email, password, organization name (creates organization + Organization Admin).
- **Accept invitation** — set password, join organization with assigned role.

### Organization Setup (wizard)
1. Organization details (name, logo, industry, country, timezone).
2. Business defaults (currency, fiscal year start, date format, tax rate).
3. Departments (optional quick-add).
4. Invite team members (optional).

### Dashboard
- KPI cards: revenue, expenses, profit, open orders, low-stock items, pending approvals.
- Charts: revenue vs expenses (monthly), sales by status, top products.
- Lists: recent activity, upcoming tasks, overdue invoices, employees on leave today.
- Manager/Employee dashboards show only scoped widgets.

### HR Management
- **Employees** — list (name, department, position, status), detail page (personal, job, documents, leave balance, attendance, tasks).
- **Departments** — list, detail with members and manager.
- **Attendance** — daily/monthly view, check-in/out, status (present, absent, late, remote), manager edits.
- **Leave** — requests list, request form, approval queue, leave types and balances, team calendar.

### Projects & Tasks
- **Projects** — list/cards with status, owner, dates, progress; detail with tasks, members, activity.
- **Tasks** — list and board (to do / in progress / review / done), assignee, priority, due date, comments.
- **My Tasks** — personal task view for all roles.

### Customers
- List (name, contact, status, total sales); detail with profile, contacts, orders, invoices, payments, notes.

### Suppliers
- List (name, contact, status); detail with profile, purchase orders, bills, payments, notes.

### Inventory
- **Products** — list (SKU, name, category, stock, price, status); detail with stock history.
- **Categories** — manage product categories.
- **Stock** — current levels per warehouse, low-stock filter.
- **Stock movements** — adjustments, transfers, sales/purchase effects.
- **Warehouses** — manage locations.

### Sales
- **Orders** — list and create/edit with line items, discounts, taxes; status flow draft → confirmed → fulfilled → closed/cancelled.
- **Invoices** — generated from orders, printable/PDF, status draft/sent/paid/overdue/void.
- **Payments received** — recorded against invoices.

### Purchases
- **Purchase orders** — list and create/edit with line items; status draft → approved → received → closed/cancelled.
- **Supplier bills** — recorded against purchase orders.
- **Payments made** — recorded against bills.

### Finance
- **Overview** — cash position, income vs expenses.
- **Income** — list of income records (auto from payments + manual).
- **Expenses** — list with category, vendor, receipt attachment, approval status.
- **Payments** — unified ledger of payments in and out.
- **Accounts/categories** — income and expense categories, payment methods.

### Reports & Analytics
- Report library by module: sales, purchases, inventory valuation, attendance, leave, project progress, profit & loss, receivables/payables.
- Filters by date range, department, customer, product.
- Export to CSV and PDF.

### Notifications
- Inbox with filters (all, unread, approvals); mark read; deep link to related record; approval actions inline.
- Notification preferences (in-app per event type).

### User Profile
- Personal info, avatar, password change, theme preference, notification preferences, active sessions.

### Settings
- **Organization** — profile, branding, business defaults, numbering formats (invoice/order prefixes).
- **Users** — members list, invite, deactivate, change role.
- **Roles & Permissions** — view and customize permission matrix.
- **Master data** — leave types, expense categories, tax rates, payment methods.
- **Audit log** — searchable activity history.

### Platform Admin (separate area)
- Organizations list (status, plan, members count), suspend/reactivate, view platform usage, manage platform admins.

## Standard List Page Behavior
Search, column filters, sort, pagination, bulk select (where useful), export, empty state, loading skeleton, error state. Row click opens a drawer (quick view) or detail page.

## Standard Form Behavior
Inline validation, required markers, unsaved-changes warning, success/error toasts, disabled submit while saving, permission-aware fields.
