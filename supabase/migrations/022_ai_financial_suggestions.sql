-- AI-populated finances: let suggestions also propose a financial entry
-- (account / obligation / liability / asset / insurance) that the executor
-- accepts straight into the Finances section. kind 'financial' uses these.
alter table estate_ai_suggestions add column if not exists fin_category text;          -- account|obligation|liability|asset|insurance_resolved|insurance_pending
alter table estate_ai_suggestions add column if not exists fin_amount numeric;
alter table estate_ai_suggestions add column if not exists fin_lender text;
alter table estate_ai_suggestions add column if not exists fin_status text;
alter table estate_ai_suggestions add column if not exists created_financial_id uuid references estate_financials(id) on delete set null;
