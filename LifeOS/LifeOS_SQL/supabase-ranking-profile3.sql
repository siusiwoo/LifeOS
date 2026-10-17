-- 랭킹 프로필 사진 저장용 컬럼 (Supabase SQL Editor에서 한 번 실행)
alter table public.profiles
  add column if not exists avatar_url text;
