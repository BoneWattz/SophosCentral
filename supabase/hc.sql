-- HC (headcount) table. Run once in Supabase -> SQL Editor.
-- Safe to re-run: everything is "if not exists".

create table if not exists public.hc_employees (
  no            bigint generated always as identity primary key,  -- auto-increment "No."
  id_number     integer unique,                                   -- "ID Number" from the sheet (one row has none)
  email         text not null,
  family_name   text,
  first_name    text,
  middle_name   text,
  complete_name text not null,
  name_extension text,
  client_id     integer,
  client_name   text,                                             -- "Department / Client name"
  division      text,
  cost_center   text,
  position      text,
  status        text,
  remarks       text,
  date_created  date not null default ((now() at time zone 'Asia/Manila')::date),
  added_by      text not null,                                    -- email of the user who added the record
  date_deleted  date,                                             -- soft delete: set instead of removing the row
  deleted_by    text                                              -- email of the user who deleted it
);

create unique index if not exists hc_employees_email_key on public.hc_employees (lower(email));
create index if not exists hc_employees_client_idx on public.hc_employees (client_name);

-- Row Level Security on with no policies: the browser (anon key) can't touch this table.
-- Only the app's server, using the service-role key, reads and writes it.
alter table public.hc_employees enable row level security;
