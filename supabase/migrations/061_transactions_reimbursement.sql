-- Track pending reimbursements in the ledger.
-- reimburse_status: null = normal txn; 'pending' = owed, excluded from balances;
--   'reimbursed' = paid back (posts to the chosen account). paid_by = who is owed.
alter table public.estate_transactions add column if not exists reimburse_status text;
alter table public.estate_transactions add column if not exists paid_by text;
