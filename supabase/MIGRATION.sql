-- Миграция: скидочные промокоды
-- Выполнить ОДИН РАЗ: Supabase Dashboard -> SQL Editor -> New query -> Run

create table if not exists discount_promos (
  id bigint generated always as identity primary key,
  code text not null unique,
  discount int not null check (discount between 1 and 99),
  plans jsonb not null default '[]'::jsonb,
  created_by text not null default 'Howill_',
  uses int not null default 0,
  created_at timestamptz not null default now()
);

alter table orders add column if not exists amount numeric;
alter table orders add column if not exists promo_code text;
