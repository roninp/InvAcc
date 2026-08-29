-- Миграция: профили пользователей и назначение тарифов (вручную через БД).
-- Создано через Supabase MCP для проекта hqpskrzxodjhbnucguww.

-- Таблица профилей пользователей: тариф назначается вручную (free по умолчанию).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  tier text not null default 'free' check (tier in ('free', 'basic', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- Автосоздание профиля со тарифом free при регистрации пользователя.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, tier)
  values (new.id, new.email, 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Безопасность: RLS включён, у пользователей нет прав на изменение тарифа.
alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);