-- Link a task to an asset/financial record so assets show their related tasks
-- and adding an asset can auto-create a linked disposition task.
alter table estate_tasks
  add column if not exists linked_financial_id uuid references estate_financials(id) on delete set null;
