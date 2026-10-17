create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '사용자',
  ranking_visible boolean not null default true,
  total_points integer not null default 0,
  tree_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles are publicly readable when visible" on public.profiles for select using (ranking_visible = true or auth.uid() = id);
create policy "users can insert their profile" on public.profiles for insert with check (auth.uid() = id);
create policy "users can update their profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
