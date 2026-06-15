-- Attach a receipt file (stored in the estate-documents bucket) to a ledger entry.
alter table estate_transactions add column if not exists receipt_path text;
