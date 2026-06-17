insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  524288,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Avatar images can be uploaded for MVP" on storage.objects;
create policy "Avatar images can be uploaded for MVP" on storage.objects
  for insert with check (bucket_id = 'avatars');

drop policy if exists "Avatar images can be replaced for MVP" on storage.objects;
create policy "Avatar images can be replaced for MVP" on storage.objects
  for update using (bucket_id = 'avatars') with check (bucket_id = 'avatars');

drop policy if exists "Avatar images can be deleted for MVP" on storage.objects;
create policy "Avatar images can be deleted for MVP" on storage.objects
  for delete using (bucket_id = 'avatars');
