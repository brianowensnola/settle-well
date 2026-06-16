-- Photos attached to an asset (stored in the estate-documents bucket).
alter table estate_financials add column if not exists photo_paths text[] default '{}'::text[];
