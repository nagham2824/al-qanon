alter table public.articles
  add column rejection_reason text,
  add constraint articles_rejection_reason_valid
    check (
      rejection_reason is null
      or (status is not distinct from 'rejected' and char_length(btrim(rejection_reason)) between 1 and 1000)
    );

create index articles_volunteer_id_article_id_idx
  on public.articles (volunteer_id, id desc)
  where volunteer_id is not null;
