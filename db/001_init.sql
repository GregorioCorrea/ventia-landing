create extension if not exists pgcrypto;

create table if not exists public.business (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vertical text,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.debtor (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  name text not null,
  phone text not null,
  amount_ars integer not null,
  days_overdue integer not null,
  note text,
  last_status text,
  last_contact_at timestamptz,
  promise_date timestamptz,
  priority_score integer,
  priority_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debtor_event (
  id uuid primary key default gen_random_uuid(),
  debtor_id uuid not null references public.debtor(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.message_cache (
  id uuid primary key default gen_random_uuid(),
  debtor_id uuid not null references public.debtor(id) on delete cascade,
  tone text not null,
  message_text text not null,
  message_reason text,
  model text,
  created_at timestamptz not null default now(),
  unique (debtor_id, tone)
);

create index if not exists idx_debtor_business_priority
  on public.debtor (business_id, priority_score desc);

create index if not exists idx_debtor_event_debtor_created
  on public.debtor_event (debtor_id, created_at desc);
