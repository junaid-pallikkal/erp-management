# 05 — Database Structure

Postgres on Supabase. This document describes structure only (no SQL).

## Conventions
- Every table: `id` (UUID, PK), `created_at`, `updated_at`.
- **Tenant tables** also have `organization_id` (FK → organizations, required, indexed). Marked 🏢 below.
- Business records carry `created_by` / `updated_by` (FK → profiles) and `deleted_at` for soft delete where noted.
- Money = exact decimal; one currency per organization. Status columns are constrained to the listed values.
- Names unique per organization where stated (e.g. SKU, document numbers).

## Entity Relationship Overview

```
organizations ─┬─ memberships ── profiles (auth users)
               ├─ roles ── role_permissions ── permissions
               ├─ departments ── employees ─┬─ attendance_records
               │                            ├─ leave_requests ── leave_types / leave_balances
               │                            └─ tasks (assignee)
               ├─ projects ─┬─ project_members
               │            └─ tasks ── task_comments
               ├─ customers ── customer_contacts ── sales_orders ── sales_order_items ── products
               ├─ suppliers ── supplier_contacts ── purchase_orders ── purchase_order_items ── products
               ├─ product_categories ── products ── stock_levels ── warehouses
               │                                  └─ stock_movements
               ├─ invoices ── invoice_items          (from sales_orders)
               ├─ bills                              (from purchase_orders)
               ├─ payments  (against invoices / bills)
               ├─ income_records / expense_records ── finance_categories
               ├─ notifications, audit_logs, attachments, document_sequences, invitations
```

---

## 1. Platform & Tenancy

### profiles
Extends the authentication user (1:1).
| Field | Type | Notes |
| --- | --- | --- |
| id | UUID | = auth user id |
| full_name | text | |
| avatar_url | text | |
| phone | text | |
| theme_preference | text | light / dark / system |
| is_platform_admin | boolean | default false |
| last_active_organization_id | UUID | FK organizations |

### organizations
| Field | Type | Notes |
| --- | --- | --- |
| name | text | |
| slug | text | unique |
| logo_url | text | |
| industry | text | |
| country | text | |
| timezone | text | |
| currency | text | ISO code |
| fiscal_year_start_month | int | 1–12 |
| date_format | text | |
| default_tax_rate | decimal | |
| status | text | active / suspended |
| created_by | UUID | FK profiles |

### roles 🏢
Per-organization roles seeded from system defaults.
| Field | Notes |
| --- | --- |
| name | organization_admin / manager / employee (system) — custom allowed later |
| is_system | boolean — system roles can't be deleted |
| description | |

### permissions
Global catalogue (not tenant-scoped): `module`, `action` (view/create/edit/delete/approve/export), unique pair.

### role_permissions 🏢
Links `role_id` ↔ `permission_id`; lets each organization customize its role matrix.

### memberships 🏢
| Field | Notes |
| --- | --- |
| profile_id | FK profiles |
| role_id | FK roles |
| status | active / disabled |
| employee_id | FK employees, optional link to HR record |
| joined_at | |
Unique: (organization_id, profile_id).

### invitations 🏢
`email`, `role_id`, `token`, `status` (pending/accepted/revoked/expired), `invited_by`, `expires_at`, `accepted_at`.

### document_sequences 🏢
Per-organization counters: `document_type` (sales_order, invoice, purchase_order, bill, employee_code…), `prefix`, `next_number`, `padding`. Unique: (organization_id, document_type).

### audit_logs 🏢
`actor_id`, `action` (create/update/delete/approve/login…), `table_name`, `record_id`, `changes` (before/after), `ip_address`, `created_at`. Append-only.

### attachments 🏢
Generic file records: `entity_type`, `entity_id`, `file_name`, `storage_path`, `mime_type`, `size_bytes`, `uploaded_by`. Used for employee documents, receipts, invoice PDFs, project files.

### notifications 🏢
| Field | Notes |
| --- | --- |
| recipient_id | FK profiles |
| type | task_assigned / leave_request / leave_decision / low_stock / invoice_overdue / approval_required / system |
| title, body | text |
| entity_type, entity_id | deep link target |
| is_read, read_at | |
| action_status | pending / approved / rejected / none (for inline approvals) |

---

## 2. HR Management

### departments 🏢
`name` (unique per org), `code`, `description`, `manager_employee_id`, `parent_department_id` (optional hierarchy), `status`.

### employees 🏢
| Field | Notes |
| --- | --- |
| employee_code | unique per org |
| profile_id | FK profiles, nullable (employee without login) |
| first_name, last_name, email, phone | |
| date_of_birth, gender | |
| address fields | street, city, state, postal_code, country |
| department_id | FK departments |
| manager_employee_id | FK employees (reports-to) |
| job_title | |
| employment_type | full_time / part_time / contract / intern |
| hire_date, termination_date | |
| status | active / on_leave / terminated |
| emergency_contact_name / phone | |
| deleted_at | soft delete |

### attendance_records 🏢
`employee_id`, `date`, `check_in`, `check_out`, `status` (present/absent/late/half_day/remote/on_leave), `notes`, `edited_by`. Unique: (employee_id, date).

### leave_types 🏢
`name`, `days_per_year`, `is_paid`, `requires_approval`, `carry_forward_limit`, `status`.

### leave_balances 🏢
`employee_id`, `leave_type_id`, `year`, `allocated_days`, `used_days`. Unique: (employee, type, year). Remaining = allocated − used.

### leave_requests 🏢
`employee_id`, `leave_type_id`, `start_date`, `end_date`, `days`, `reason`, `status` (pending/approved/rejected/cancelled), `approver_id`, `decided_at`, `decision_note`.

---

## 3. Projects & Tasks

### projects 🏢
`name`, `code`, `description`, `status` (planned/active/on_hold/completed/cancelled), `priority`, `start_date`, `due_date`, `owner_employee_id`, `department_id`, `customer_id` (optional), `progress_percent` (derived from tasks), `deleted_at`.

### project_members 🏢
`project_id`, `employee_id`, `project_role` (lead/member/viewer). Unique: (project, employee).

### tasks 🏢
`project_id`, `title`, `description`, `status` (todo/in_progress/review/done/cancelled), `priority` (low/medium/high/urgent), `assignee_employee_id`, `reporter_id`, `due_date`, `estimated_hours`, `completed_at`, `parent_task_id` (subtasks), `position` (board ordering), `deleted_at`.

### task_comments 🏢
`task_id`, `author_id`, `body`, `created_at`.

---

## 4. Customers & Suppliers

### customers 🏢
`customer_code` (unique per org), `name`, `type` (individual/company), `email`, `phone`, `tax_id`, billing & shipping address fields, `payment_terms_days`, `credit_limit`, `status` (active/inactive), `notes`, `deleted_at`.

### customer_contacts 🏢
`customer_id`, `name`, `position`, `email`, `phone`, `is_primary`.

### suppliers 🏢
`supplier_code` (unique per org), `name`, `email`, `phone`, `tax_id`, address fields, `payment_terms_days`, `status`, `notes`, `deleted_at`.

### supplier_contacts 🏢
`supplier_id`, `name`, `position`, `email`, `phone`, `is_primary`.

---

## 5. Inventory

### product_categories 🏢
`name` (unique per org), `parent_category_id`, `description`.

### products 🏢
| Field | Notes |
| --- | --- |
| sku | unique per org |
| name, description | |
| category_id | FK product_categories |
| unit_of_measure | pcs / kg / box … |
| cost_price, sale_price | decimal |
| tax_rate | decimal, optional override |
| reorder_level | low-stock threshold |
| track_inventory | boolean |
| image_url | |
| status | active / inactive / discontinued |
| deleted_at | |

### warehouses 🏢
`name`, `code`, `address`, `is_default`, `status`.

### stock_levels 🏢
`product_id`, `warehouse_id`, `quantity_on_hand`, `quantity_reserved`. Unique: (product, warehouse). Available = on hand − reserved.

### stock_movements 🏢
Append-only ledger; stock levels are the sum of movements.
`product_id`, `warehouse_id`, `movement_type` (purchase_receipt / sale / adjustment / transfer_in / transfer_out / return), `quantity` (signed), `reference_type`, `reference_id` (order/PO/etc.), `reason`, `performed_by`, `created_at`.

---

## 6. Sales

### sales_orders 🏢
| Field | Notes |
| --- | --- |
| order_number | unique per org, from sequence |
| customer_id | FK customers |
| order_date, expected_delivery_date | |
| status | draft / confirmed / fulfilled / closed / cancelled |
| warehouse_id | fulfillment source |
| subtotal, discount_total, tax_total, total | computed from items |
| notes | |
| salesperson_employee_id | |
| deleted_at | |

### sales_order_items 🏢
`sales_order_id`, `product_id`, `description`, `quantity`, `unit_price`, `discount_percent`, `tax_rate`, `line_total`, `position`.

---

## 7. Purchases

### purchase_orders 🏢
`po_number` (unique per org), `supplier_id`, `order_date`, `expected_date`, `status` (draft/pending_approval/approved/received/partially_received/closed/cancelled), `warehouse_id`, `subtotal`, `tax_total`, `total`, `approved_by`, `approved_at`, `notes`, `deleted_at`.

### purchase_order_items 🏢
`purchase_order_id`, `product_id`, `description`, `quantity`, `quantity_received`, `unit_cost`, `tax_rate`, `line_total`, `position`.

---

## 8. Finance

### finance_categories 🏢
`name`, `type` (income/expense), `parent_category_id`, `status`. Unique: (organization, type, name).

### invoices 🏢
`invoice_number` (unique per org), `sales_order_id`, `customer_id`, `issue_date`, `due_date`, `status` (draft/sent/partially_paid/paid/overdue/void), `subtotal`, `discount_total`, `tax_total`, `total`, `amount_paid`, `balance_due`, `notes`, `deleted_at`.

### invoice_items 🏢
Snapshot of sold lines: `invoice_id`, `product_id`, `description`, `quantity`, `unit_price`, `tax_rate`, `line_total`.

### bills 🏢
Supplier bills: `bill_number` (supplier's reference), `purchase_order_id`, `supplier_id`, `issue_date`, `due_date`, `status` (open/partially_paid/paid/overdue/void), `total`, `amount_paid`, `balance_due`, `notes`.

### payments 🏢
Unified payment ledger.
| Field | Notes |
| --- | --- |
| direction | in / out |
| invoice_id / bill_id | exactly one set, or neither for standalone payments |
| amount | decimal |
| payment_date | |
| method | cash / bank_transfer / card / cheque / other |
| reference | transaction ref |
| recorded_by | |

### income_records 🏢
`category_id`, `amount`, `date`, `description`, `source_type` (payment/manual), `payment_id` (if auto-created), `customer_id` (optional), `attachment_id`.

### expense_records 🏢
`category_id`, `amount`, `date`, `description`, `supplier_id` (optional), `payment_id`, `status` (pending/approved/rejected/paid), `submitted_by`, `approved_by`, `receipt_attachment_id`.

---

## 9. Key Relationships & Rules
| Rule | Detail |
| --- | --- |
| Tenant isolation | Every 🏢 table filtered by organization membership via access policies |
| Order → stock | Confirming a sales order writes `sale` stock movements; receiving a PO writes `purchase_receipt` movements |
| Order → invoice | Invoice created from a confirmed order copies its items |
| Payment → balance | Recording a payment updates `amount_paid`, `balance_due` and status of its invoice/bill |
| Payment → finance | Payments in create income records; payments out create expense records |
| Overdue | Invoices/bills past `due_date` with balance flip to overdue and raise a notification |
| Low stock | `quantity_on_hand` ≤ `reorder_level` raises a notification |
| Leave | Approval deducts `used_days` from the balance; rejection/cancel restores it |
| Cascade | Deleting parents is blocked when children exist; soft delete preferred |
| Last admin | An organization must always keep at least one active Organization Admin |

## 10. Indexing Guidance
- `organization_id` on every tenant table (composite with common filters: status, date, foreign keys).
- Unique composite indexes for per-organization codes/numbers.
- Search indexes on names, SKUs, emails.
- Date indexes on attendance, orders, invoices, payments for reporting.

## 11. Storage Buckets
| Bucket | Contents | Path pattern |
| --- | --- | --- |
| avatars | profile and employee photos | organization / user |
| org-assets | organization logos | organization |
| documents | employee documents, project files | organization / entity / file |
| receipts | expense receipts | organization / expense / file |
| invoices | generated invoice PDFs | organization / invoice |
All paths begin with the organization id and are protected by matching access policies.

## 12. Seed Data (per new organization)
- System roles (Organization Admin, Manager, Employee) with default permissions.
- Default leave types, finance categories, warehouse, and document sequences.
