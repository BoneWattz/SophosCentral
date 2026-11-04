-- GT - IT Monitoring table. Run once in Supabase -> SQL Editor.
-- Safe to re-run: everything is "if not exists".

create table if not exists public.it_monitoring (
  id                   bigint generated always as identity primary key,  -- internal row id (not shown)
  id_number            integer,                                          -- "ID Number" (the sheet repeats a few, so not unique)
  ms365_email          text,                                             -- "MS 365 Email"
  sophos_email         text,                                             -- "Sophos Email"
  family_name          text,
  first_name           text,
  middle_name          text,
  complete_name        text,
  client_name          text,                                             -- "Department / Client name"
  division             text,
  cost_center          text,
  position             text,
  status               text,                                             -- Active, Deleted, Pending, No Record
  remarks              text,
  hc_status            text,                                             -- "Heartcount Status": Active, Resigned
  date_license_removal date,
  created_at           timestamptz not null default now(),
  created_by           text,
  updated_at           timestamptz,
  updated_by           text
);

create index if not exists it_monitoring_id_number_idx on public.it_monitoring (id_number);
create index if not exists it_monitoring_ms365_idx on public.it_monitoring (lower(ms365_email));
create index if not exists it_monitoring_sophos_idx on public.it_monitoring (lower(sophos_email));

-- Row Level Security on with no policies: the browser (anon key) can't touch this table.
-- Only the app's server, using the service-role key, reads and writes it.
alter table public.it_monitoring enable row level security;
