-- Who a reimbursed expense was paid to (vendor/payee); complements paid_by.
alter table public.estate_transactions add column if not exists paid_to text;
