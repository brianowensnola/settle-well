-- Add support for multiple phone numbers and email addresses with labels
alter table estate_contacts
  add column phones text[] default array[]::text[],
  add column phone_labels text[] default array[]::text[],
  add column emails text[] default array[]::text[],
  add column email_labels text[] default array[]::text[];

-- Migrate existing single phone/email to arrays if they exist
update estate_contacts
set phones = case when phone is not null and phone != '' then array[phone] else array[]::text[] end,
    phone_labels = case when phone is not null and phone != '' then array['Primary'] else array[]::text[] end;

update estate_contacts
set emails = case when email is not null and email != '' then array[email] else array[]::text[] end,
    email_labels = case when email is not null and email != '' then array['Primary'] else array[]::text[] end;

-- Keep old columns for backward compatibility (make nullable)
alter table estate_contacts alter column phone drop not null;
alter table estate_contacts alter column email drop not null;
