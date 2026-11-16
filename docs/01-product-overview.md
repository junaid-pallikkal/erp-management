# 01 — Product Overview

## Vision
A centralized, secure, scalable ERP platform where multiple organizations independently manage their complete business operations through one simple, consistent interface.

## Goals
- One workspace per organization covering HR, projects, sales, purchasing, inventory and finance.
- Strict data isolation between organizations (multi-tenancy).
- Role-based access: each person sees and does only what their role allows.
- Minimal, premium SaaS look with light and dark themes.
- Usable on desktop, tablet and mobile.

## Modules

| Module | Main features |
| --- | --- |
| Dashboard | Business overview, statistics, recent activity, insights |
| HR Management | Employees, departments, attendance, leave |
| Projects & Tasks | Projects, task assignment, progress tracking |
| Customers | Customer profiles and records |
| Suppliers | Supplier management and transaction history |
| Inventory | Products, categories, stock levels and movements |
| Sales | Orders, sales records, invoices |
| Purchases | Purchase orders, supplier transactions |
| Finance | Income, expenses, payments |
| Reports | Analytics, summaries, exports |
| Notifications | Alerts, updates, pending approvals |
| Settings | Organization profile, users, roles, permissions |

## Module Relationships
- **Sales order** → reduces inventory stock → generates invoice → invoice payment creates finance income.
- **Purchase order** → on receipt increases inventory stock → supplier bill → payment creates finance expense.
- **Employees** belong to departments; managers lead departments; tasks are assigned to employees within projects.
- **Customers** link to sales orders/invoices; **suppliers** link to purchase orders.
- **Notifications** are produced by events in every module (low stock, overdue invoice, leave request, task assigned).

## Scope Rules
- Everything a user touches is scoped to their organization.
- Records are soft-deleted (archived) where history matters (invoices, orders, employees).
- Every create/update/delete on business data is recorded in an audit log.

## Non-Goals (initial release)
- Payroll calculation, tax filing, bank integrations.
- Native mobile apps (web is responsive only).
- Third-party marketplace/integrations.
- Multi-currency conversion (single currency per organization).

## Success Criteria
- A new organization can sign up, set up its workspace and invite staff in minutes.
- No user can read or write another organization's data.
- All module pages share consistent tables, forms and workflows.
