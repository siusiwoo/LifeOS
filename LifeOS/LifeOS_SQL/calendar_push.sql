-- Run once in the Supabase SQL Editor. Existing calendar data is untouched.
create table if not exists public.calendar_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists calendar_push_subscriptions_user_id_idx on public.calendar_push_subscriptions(user_id);
alter table public.calendar_push_subscriptions enable row level security;
revoke all on public.calendar_push_subscriptions from anon;
grant select, insert, update, delete on public.calendar_push_subscriptions to authenticated;
grant all on public.calendar_push_subscriptions to service_role;
drop policy if exists "users select own calendar push subscriptions" on public.calendar_push_subscriptions;
create policy "users select own calendar push subscriptions" on public.calendar_push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "users insert own calendar push subscriptions" on public.calendar_push_subscriptions;
create policy "users insert own calendar push subscriptions" on public.calendar_push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "users update own calendar push subscriptions" on public.calendar_push_subscriptions;
create policy "users update own calendar push subscriptions" on public.calendar_push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "users delete own calendar push subscriptions" on public.calendar_push_subscriptions;
create policy "users delete own calendar push subscriptions" on public.calendar_push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.calendar_push_deliveries (
  subscription_id uuid not null references public.calendar_push_subscriptions(id) on delete cascade,
  event_id text not null,
  occurrence_date date not null,
  reminder text not null,
  sent_at timestamptz not null default now(),
  primary key (subscription_id, event_id, occurrence_date, reminder)
);
alter table public.calendar_push_deliveries enable row level security;
revoke all on public.calendar_push_deliveries from anon, authenticated;
grant all on public.calendar_push_deliveries to service_role;
-- No browser policies: only the service role may read or write delivery records.
