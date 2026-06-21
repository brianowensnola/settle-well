-- Allow assigning a task to a contact (attorney, realtor, etc.), not just an
-- app user. assigned_to keeps the display name; assigned_contact_id links the
-- contact so the app can optionally notify them by email/text.
alter table estate_tasks add column if not exists assigned_contact_id uuid references estate_contacts(id) on delete set null;
