create schema if not exists yakyulife;

revoke all on schema yakyulife from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'yakyulife_runtime') then
    create role yakyulife_runtime nologin noinherit;
  end if;
end
$$;

grant yakyulife_runtime to current_user;

create table if not exists yakyulife.careers (
  id uuid primary key,
  discord_user_id text not null,
  status text not null check (status in ('active', 'completed', 'abandoned')),
  play_mode text not null check (play_mode in ('dm', 'channel')),
  guild_id text,
  channel_id text,
  message_id text,
  seed text not null,
  engine_version text not null,
  upstream_commit text not null,
  state_revision bigint not null default 0 check (state_revision >= 0),
  state jsonb not null,
  summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists careers_one_active_per_user
  on yakyulife.careers (discord_user_id)
  where status = 'active';

create index if not exists careers_user_updated_idx
  on yakyulife.careers (discord_user_id, updated_at desc);

create table if not exists yakyulife.career_actions (
  id bigint generated always as identity primary key,
  career_id uuid not null references yakyulife.careers (id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  discord_interaction_id text not null unique,
  action_type text not null,
  payload jsonb not null,
  before_revision bigint not null check (before_revision >= 0),
  after_revision bigint not null check (after_revision = before_revision + 1),
  created_at timestamptz not null default now(),
  unique (career_id, sequence)
);

alter table yakyulife.careers enable row level security;
alter table yakyulife.career_actions enable row level security;
alter table yakyulife.careers force row level security;
alter table yakyulife.career_actions force row level security;

drop policy if exists runtime_manage_careers on yakyulife.careers;
create policy runtime_manage_careers on yakyulife.careers
  for all to yakyulife_runtime
  using (true)
  with check (true);

drop policy if exists runtime_manage_career_actions on yakyulife.career_actions;
create policy runtime_manage_career_actions on yakyulife.career_actions
  for all to yakyulife_runtime
  using (true)
  with check (true);

grant usage on schema yakyulife to yakyulife_runtime;
grant select, insert, update, delete on yakyulife.careers to yakyulife_runtime;
grant select, insert, update, delete on yakyulife.career_actions to yakyulife_runtime;
grant usage, select on all sequences in schema yakyulife to yakyulife_runtime;

revoke all on all tables in schema yakyulife from anon, authenticated;
revoke all on all sequences in schema yakyulife from anon, authenticated;
