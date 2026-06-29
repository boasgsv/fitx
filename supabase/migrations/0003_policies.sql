-- FitX — Supabase-specific: RLS, auth-user linking, storage.
-- This file references the Supabase `auth` schema and is NOT run by the
-- offline PGlite test (which only loads 0001 + 0002 + seed).

-- Map the logged-in auth user to their row in public.users.
create or replace function app_user_id()
returns uuid language sql stable as $$
  select id from public.users where auth_user_id = auth.uid()
$$;

-- When someone signs in for the first time, link their auth account to the
-- pre-seeded users row by matching email (case-insensitive).
create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.users
     set auth_user_id = new.id
   where lower(email) = lower(new.email)
     and auth_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Pre-auth allowlist check used by the login screen: is this email one of the
-- seeded players? SECURITY DEFINER so it can read public.users before the user
-- is authenticated. Returns only a boolean (never the list). Callable by anon.
create or replace function email_is_player(check_email text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.users where lower(email) = lower(trim(check_email))
  );
$$;
grant execute on function email_is_player(text) to anon, authenticated;

-- Enable RLS everywhere.
alter table users          enable row level security;
alter table domains        enable row level security;
alter table activity_types enable row level security;
alter table championships  enable row level security;
alter table seasons        enable row level security;
alter table scoring_rules  enable row level security;
alter table activities     enable row level security;
alter table prizes         enable row level security;
alter table freeze_tokens  enable row level security;
alter table shop_items     enable row level security;
alter table shop_purchases enable row level security;

-- The two partners share full read access to everything (transparent rivalry).
do $$
declare t text;
begin
  foreach t in array array[
    'users','domains','activity_types','championships','seasons',
    'scoring_rules','activities','prizes','freeze_tokens',
    'shop_items','shop_purchases'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_select', t);
  end loop;
end $$;

-- Each player may write only their OWN activities and freeze tokens.
create policy activities_insert on activities
  for insert to authenticated with check (user_id = app_user_id());
create policy activities_update on activities
  for update to authenticated using (user_id = app_user_id());
create policy activities_delete on activities
  for delete to authenticated using (user_id = app_user_id());

create policy freeze_insert on freeze_tokens
  for insert to authenticated with check (user_id = app_user_id());
create policy freeze_update on freeze_tokens
  for update to authenticated using (user_id = app_user_id());

-- Each player may only spend their own coins.
create policy shop_purchases_insert on shop_purchases
  for insert to authenticated with check (user_id = app_user_id());

-- Storage bucket for workout photos (run once; ignore if it already exists).
insert into storage.buckets (id, name, public)
values ('activity-photos', 'activity-photos', true)
on conflict (id) do nothing;

create policy "photos read"  on storage.objects
  for select to authenticated using (bucket_id = 'activity-photos');
create policy "photos write" on storage.objects
  for insert to authenticated with check (bucket_id = 'activity-photos');
