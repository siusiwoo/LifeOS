
-- Memo image storage (run once in Supabase SQL Editor)
insert into storage.buckets (id, name, public)
values ('memo-images', 'memo-images', true)
on conflict (id) do update set public = true;

drop policy if exists "memo images upload own folder" on storage.objects;
create policy "memo images upload own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'memo-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "memo images update own folder" on storage.objects;
create policy "memo images update own folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'memo-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'memo-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "memo images delete own folder" on storage.objects;
create policy "memo images delete own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'memo-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

