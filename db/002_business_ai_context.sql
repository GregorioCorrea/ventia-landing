create table if not exists public.business_settings (
  business_id uuid primary key references public.business(id) on delete cascade,
  sender_name text,
  sender_role text,
  greeting_style text,
  pronoun text,
  signature text,
  payment_method text,
  payment_details text,
  payment_callout text,
  entity_greeting_rule text,
  style_notes text,
  updated_at timestamptz not null default now()
);

alter table public.message_cache
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_variation_id text,
  add column if not exists last_prompt_hash text;
