begin;

alter table public.books
  add column if not exists category text,
  add column if not exists reading_level int;

update public.books
set category = 'daily'
where category is null;

update public.books
set reading_level = 1
where reading_level is null;

alter table public.books
  alter column category set default 'daily',
  alter column category set not null,
  alter column reading_level set default 1,
  alter column reading_level set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'books_category_allowed_chk'
  ) then
    alter table public.books
      add constraint books_category_allowed_chk
      check (category in ('animal', 'adventure', 'daily', 'science', 'emotion'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'books_reading_level_range_chk'
  ) then
    alter table public.books
      add constraint books_reading_level_range_chk
      check (reading_level between 1 and 3);
  end if;
end $$;

create index if not exists idx_books_category on public.books(category);
create index if not exists idx_books_reading_level on public.books(reading_level);

commit;
