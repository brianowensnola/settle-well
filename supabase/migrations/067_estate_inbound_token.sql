-- Each estate gets a short, stable, unguessable token used as the local part of
-- its inbound email address (e.g. <token>@estate.bastroplaundrypro.com). The
-- catch-all inbound webhook looks the estate up by this token, so addresses are
-- generated automatically and scale to any number of estates with no per-estate
-- provisioning. Swapping the email domain later does not touch these tokens.
alter table estates add column if not exists inbound_token text;

update estates
  set inbound_token = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  where inbound_token is null;

alter table estates alter column inbound_token set default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

create unique index if not exists idx_estates_inbound_token on estates(inbound_token);
