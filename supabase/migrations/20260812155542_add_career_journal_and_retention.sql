create extension if not exists pg_cron;

create table if not exists yakyulife.career_journal (
  career_id uuid not null references yakyulife.careers (id) on delete cascade,
  state_revision bigint not null check (state_revision >= 0),
  ordinal integer not null check (ordinal >= 0),
  game_year integer not null,
  player_age integer not null check (player_age >= 0),
  category text not null check (
    category in ('career', 'training', 'season', 'injury', 'contract', 'league', 'award', 'life')
  ),
  tone text not null check (tone in ('neutral', 'good', 'bad', 'gold')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  primary key (career_id, state_revision, ordinal)
);

create index if not exists career_journal_history_idx
  on yakyulife.career_journal (career_id, game_year, state_revision, ordinal);

create index if not exists careers_abandoned_retention_idx
  on yakyulife.careers (updated_at, id)
  where status = 'abandoned';

alter table yakyulife.career_journal enable row level security;
alter table yakyulife.career_journal force row level security;

drop policy if exists runtime_manage_career_journal on yakyulife.career_journal;
create policy runtime_manage_career_journal on yakyulife.career_journal
  for all to yakyulife_runtime
  using (true)
  with check (true);

grant select, insert, update, delete on yakyulife.career_journal to yakyulife_runtime;
revoke all on yakyulife.career_journal from public, anon, authenticated;

do $migration$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'yakyulife-delete-abandoned-careers';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$migration$;

select cron.schedule(
  'yakyulife-delete-abandoned-careers',
  '15 20 * * *',
  $job$
    delete from yakyulife.careers
    where id in (
      select id
      from yakyulife.careers
      where status = 'abandoned'
        and updated_at < now() - interval '30 days'
      order by updated_at
      limit 500
    )
  $job$
);
