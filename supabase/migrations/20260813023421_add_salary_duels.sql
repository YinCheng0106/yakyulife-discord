create table yakyulife.salary_duels (
  id uuid primary key,
  status text not null check (status in (
    'pending', 'active', 'completed', 'forfeited', 'declined', 'expired',
    'no_contest', 'cancelled_privacy', 'invalid'
  )),
  invite_code_hash char(64) unique,
  engine_version text not null,
  ruleset_version text not null,
  position_group text not null check (position_group in ('pitcher', 'catcher', 'infielder', 'outfielder')),
  private_seed text,
  seed_commitment char(64),
  winner_slot smallint check (winner_slot in (1, 2)),
  outcome_reason text check (outcome_reason in ('score', 'draw', 'forfeit', 'timeout', 'privacy', 'invalid')),
  created_at timestamptz not null default now(),
  invite_expires_at timestamptz not null,
  accepted_at timestamptz,
  deadline_at timestamptz,
  decided_at timestamptz,
  seed_revealed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and private_seed is null and seed_commitment is null) or status <> 'pending')
);

create table yakyulife.salary_duel_players (
  duel_id uuid not null references yakyulife.salary_duels (id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  discord_user_id text,
  player_name text,
  career_id uuid unique references yakyulife.careers (id) on delete set null,
  status text not null check (status in ('invited', 'playing', 'completed', 'forfeited', 'expired', 'deleted')),
  total_earnings bigint,
  peak_annual_salary integer,
  last_annual_salary integer,
  final_state_hash char(64),
  finished_at timestamptz,
  result_channel_id text,
  result_message_id text,
  primary key (duel_id, slot)
);

create unique index salary_duel_players_unique_user
  on yakyulife.salary_duel_players (duel_id, discord_user_id)
  where discord_user_id is not null;

create unique index salary_duel_players_one_live_per_user
  on yakyulife.salary_duel_players (discord_user_id)
  where discord_user_id is not null and status in ('invited', 'playing');

create index salary_duels_expiry_idx
  on yakyulife.salary_duels (invite_expires_at, deadline_at)
  where status in ('pending', 'active');

alter table yakyulife.salary_duels enable row level security;
alter table yakyulife.salary_duel_players enable row level security;
alter table yakyulife.salary_duels force row level security;
alter table yakyulife.salary_duel_players force row level security;

create policy runtime_manage_salary_duels on yakyulife.salary_duels
  for all to yakyulife_runtime using (true) with check (true);
create policy runtime_manage_salary_duel_players on yakyulife.salary_duel_players
  for all to yakyulife_runtime using (true) with check (true);

grant select, insert, update, delete on yakyulife.salary_duels to yakyulife_runtime;
grant select, insert, update, delete on yakyulife.salary_duel_players to yakyulife_runtime;
revoke all on yakyulife.salary_duels from public, anon, authenticated;
revoke all on yakyulife.salary_duel_players from public, anon, authenticated;

create or replace function yakyulife.maintain_salary_duels(p_now timestamptz default now())
returns void
language plpgsql
security invoker
set search_path = pg_catalog, yakyulife
as $$
begin
  with due as (
    select id from yakyulife.salary_duels
    where status = 'pending' and invite_expires_at <= p_now
    order by invite_expires_at
    for update skip locked limit 100
  )
  update yakyulife.salary_duels d
  set status = 'expired', decided_at = p_now, updated_at = p_now
  from due where d.id = due.id;

  with due as (
    select id from yakyulife.salary_duels
    where status = 'active' and deadline_at <= p_now
    order by deadline_at
    for update skip locked limit 100
  ), scores as (
    select p.duel_id,
      count(*) filter (where p.status = 'completed') as completed_players,
      min(p.slot) filter (where p.status = 'completed') as completed_slot
    from yakyulife.salary_duel_players p join due on due.id = p.duel_id
    group by p.duel_id
  )
  update yakyulife.salary_duels d set
    status = case when scores.completed_players = 1 then 'completed' else 'no_contest' end,
    outcome_reason = case when scores.completed_players = 1 then 'timeout' else null end,
    winner_slot = case when scores.completed_players = 1 then scores.completed_slot else null end,
    decided_at = p_now, seed_revealed_at = p_now, updated_at = p_now
  from scores where d.id = scores.duel_id;

  with purge as (
    select id from yakyulife.salary_duels
    where (status in ('pending', 'declined', 'expired', 'no_contest', 'cancelled_privacy') and updated_at < p_now - interval '30 days')
       or (status in ('completed', 'forfeited', 'invalid') and updated_at < p_now - interval '90 days')
    order by updated_at for update skip locked limit 500
  )
  delete from yakyulife.salary_duels d using purge where d.id = purge.id;
end;
$$;

revoke all on function yakyulife.maintain_salary_duels(timestamptz) from public, anon, authenticated;
grant execute on function yakyulife.maintain_salary_duels(timestamptz) to yakyulife_runtime;

select cron.schedule(
  'yakyulife-expire-and-purge-salary-duels',
  '*/15 * * * *',
  $job$
    select yakyulife.maintain_salary_duels(now());
  $job$
);
