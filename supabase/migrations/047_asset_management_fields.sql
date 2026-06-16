-- Asset management: richer fields on asset records, and a document↔asset link.
alter table estate_financials add column if not exists asset_type text;        -- vehicle | real_estate | personal | business | financial | other
alter table estate_financials add column if not exists vin_serial text;
alter table estate_financials add column if not exists location text;
alter table estate_financials add column if not exists condition text;
alter table estate_financials add column if not exists valuation_date date;
alter table estate_financials add column if not exists valuation_source text;
alter table estate_financials add column if not exists beneficiary text;        -- who keeps / receives it (keep/gift/transfer)

alter table estate_documents add column if not exists asset_id uuid references estate_financials(id) on delete set null;
