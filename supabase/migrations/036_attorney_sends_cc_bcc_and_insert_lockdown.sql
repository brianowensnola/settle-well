-- Record CC/BCC on a document send.
alter table attorney_document_sends add column if not exists recipient_cc text;
alter table attorney_document_sends add column if not exists recipient_bcc text;

-- Only the executor may log a send (was: any estate member). Reads stay open to
-- all estate members so heirs/observers see the send history (transparency).
drop policy if exists "Users can insert sends for their estates" on attorney_document_sends;
create policy "attorney_sends_insert_executor" on attorney_document_sends for insert
  with check (get_estate_role(estate_id) = 'administrator');
