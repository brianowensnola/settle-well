-- Link the app user (heir/collaborator/executor) a task is assigned to, so the
-- app can auto-notify them (email now, SMS when the toll-free number is live).
-- assigned_to keeps the display name; assigned_user_id is the notify target.
alter table estate_tasks add column if not exists assigned_user_id uuid references estate_users(id) on delete set null;
