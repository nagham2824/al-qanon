create table public.article_translations (
  article_id bigint not null references public.articles(id) on delete cascade,
  language text not null check (language in ('ar','nl','en','tr')),
  title text not null check (length(btrim(title)) > 0),
  content text not null check (length(btrim(content)) > 0),
  status text not null default 'draft' check (status in ('draft','published')),
  primary key (article_id, language)
);
alter table public.article_translations enable row level security;
revoke all on public.article_translations from public, anon, authenticated;
grant select on public.article_translations to anon, authenticated;
grant insert, update on public.article_translations to authenticated;
create policy "Read published translations of published articles"
on public.article_translations for select to anon, authenticated
using (status = 'published' and exists (
  select 1 from public.articles a where a.id = article_id and a.status = 'published'
));
create policy "Administrator reads translations"
on public.article_translations for select to authenticated
using ((select auth.uid()) = '04a0788a-6043-4383-875e-8edd68c9adf3'::uuid);
create policy "Administrator inserts translations"
on public.article_translations for insert to authenticated
with check ((select auth.uid()) = '04a0788a-6043-4383-875e-8edd68c9adf3'::uuid);
create policy "Administrator updates translations"
on public.article_translations for update to authenticated
using ((select auth.uid()) = '04a0788a-6043-4383-875e-8edd68c9adf3'::uuid)
with check ((select auth.uid()) = '04a0788a-6043-4383-875e-8edd68c9adf3'::uuid);
