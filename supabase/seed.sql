-- FitX seed data. Idempotent. Safe to run on Supabase and under PGlite.
-- Edit the two users' emails to the real addresses before going live.

-- Domains
insert into domains (id, name, sort_order) values
  ('strength',  'Strength',  1),
  ('cardio',    'Cardio',    2),
  ('body_comp', 'Body Comp', 3),
  ('habits',    'Habits',    4),
  ('sports',    'Sports',    5)
on conflict (id) do nothing;

-- Activity catalog (mirrors src/lib/game.ts)
insert into activity_types (id, domain_id, name, default_unit, sort_order) values
  ('strength_session', 'strength',  'Gym session',     'session', 1),
  ('cardio_session',   'cardio',    'Cardio session',  'min',     1),
  ('body_weighin',     'body_comp', 'Weigh-in',        'kg',      1),
  ('body_measurement', 'body_comp', 'Measurement',     'cm',      2),
  ('habit_sleep',      'habits',    'Sleep ≥7h',       '✓',       1),
  ('habit_nutrition',  'habits',    'Nutrition target','✓',       2),
  ('habit_mobility',   'habits',    'Mobility ≥10 min','✓',       3),
  ('habit_water',      'habits',    'Water target',    '✓',       4),
  ('habit_steps',      'habits',    'Steps target',    '✓',       5),
  ('sports_session',   'sports',    'Sports session',  'session', 1)
on conflict (id) do nothing;

-- Championship (the very-long-term arc) + pilot month + first trimester.
-- The long arc runs ~2 years; the dream trip is its apex, not a near-term goal.
insert into championships (id, name, starts_on, ends_on) values
  ('11111111-1111-1111-1111-111111111111', 'Campeonato 2026–2028', '2026-07-01', '2028-06-30')
on conflict (id) do nothing;

insert into seasons (id, championship_id, name, starts_on, ends_on, collab_goal_points, solo_goal_points, is_pilot, status) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Pilot (calibration)', '2026-07-01', '2026-07-31', 600, 300, true, 'active'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Trimester 1', '2026-08-01', '2026-10-31', 2000, 1000, false, 'upcoming')
on conflict (id) do nothing;

-- The two players. EDIT both emails to the real ones (must match each person's
-- login email). setup.sql is the file you actually run; keep names in sync here.
insert into users (id, email, display_name, color) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'boasgsv@gmail.com',         'Gabriele', 'primary'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'leticiaprado330@gmail.com', 'Letícia',  'accent')
on conflict (id) do nothing;

-- Scoring rules for every active/upcoming season (the configurable engine).
insert into scoring_rules (
  season_id, activity_type_id, base_points,
  overage_after_min, overage_block_min, overage_points, overage_cap_points,
  pr_bonus_points, together_bonus_points
)
select s.id, r.activity_type_id, r.base_points, r.oa, r.ob, r.op, r.ocap, r.pr, r.tog
from (values
  ('strength_session', 10, null::int, null::int, null::numeric, null::numeric, 8::numeric, null::numeric),
  ('cardio_session',   10, 20,        10,        2::numeric,    6::numeric,    8::numeric, null::numeric),
  ('body_weighin',      0, null,      null,      null,          null,          null,       null),
  ('body_measurement',  0, null,      null,      null,          null,          null,       null),
  ('habit_sleep',       3, null,      null,      null,          null,          null,       null),
  ('habit_nutrition',   3, null,      null,      null,          null,          null,       null),
  ('habit_mobility',    3, null,      null,      null,          null,          null,       null),
  ('habit_water',       2, null,      null,      null,          null,          null,       null),
  ('habit_steps',       2, null,      null,      null,          null,          null,       null),
  ('sports_session',   12, null,      null,      null,          null,          null,       4::numeric)
) as r(activity_type_id, base_points, oa, ob, op, ocap, pr, tog)
cross join seasons s
where s.status in ('active', 'upcoming')
on conflict (season_id, activity_type_id) do nothing;

-- Prizes — edit the names freely; these are what the help screen shows.
--   kind 'winner' = INDIVIDUAL, won by the stage champion (most week wins).
--   kind 'collab' = SHARED, unlocked when the Team Bank reaches threshold_points.
-- Themed for two people who live apart: rewards center on visits, dates and
-- trips TOGETHER. The collab rows form a rising ladder of milestones.
-- Stable ids make re-running setup.sql idempotent.
insert into prizes (id, season_id, championship_id, name, kind, threshold_points) values
  -- Pilot month — individual + a short collab ladder
  ('ee000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', null,
     'Campeã do piloto: escolhe o programa do próximo encontro',          'winner', null),
  ('ee000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', null,
     'Café da manhã especial no próximo encontro',                        'collab', 300),
  ('ee000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', null,
     'Noite especial juntos (jantar + cinema)',                           'collab', 600),
  -- Trimester 1 — individual + a longer collab ladder
  ('ee000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', null,
     'Campeã do trimestre: o cinturão + o outro paga o próximo rolê',     'winner', null),
  ('ee000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', null,
     'Passeio bacana num fim de semana',                                  'collab', 1000),
  ('ee000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', null,
     'Escapada de fim de semana (1 noite fora)',                          'collab', 2000),
  -- Championship — the 2-year arc, building to the dream trip
  ('ee000000-0000-0000-0000-000000000007', null, '11111111-1111-1111-1111-111111111111',
     'Campeã do campeonato: troféu + mimo escolhido pela vencedora',      'winner', null),
  ('ee000000-0000-0000-0000-000000000008', null, '11111111-1111-1111-1111-111111111111',
     'Fim de semana prolongado juntos',                                   'collab', 4000),
  ('ee000000-0000-0000-0000-000000000009', null, '11111111-1111-1111-1111-111111111111',
     'Viagem curta (3–4 dias)',                                           'collab', 8000),
  ('ee000000-0000-0000-0000-000000000010', null, '11111111-1111-1111-1111-111111111111',
     'Viagem dos sonhos (o grande objetivo de 2 anos)',                   'collab', 16000)
on conflict (id) do nothing;

-- Shop catalog — spend COINS (earned as you log; separate from the ranking).
-- Edit names/costs freely. Stable ids keep re-runs idempotent.
insert into shop_items (id, name, description, emoji, cost_coins, kind, effect, sort_order) values
  -- 🎁 Mimos (treats you grant yourself)
  ('ff000000-0000-0000-0000-000000000001', 'Sobremesa sem culpa',   'Aquela sobremesa que você tava se segurando.',                 '🍰',  40, 'treat', null, 1),
  ('ff000000-0000-0000-0000-000000000002', 'Domingo preguiçoso',    'Um dia inteiro de descanso, sem cobrança de ninguém.',         '🛋️',  80, 'treat', null, 2),
  ('ff000000-0000-0000-0000-000000000003', 'Mini-splurge',          'Compre algo pequeno só pra você.',                             '🛍️', 150, 'treat', null, 3),
  -- 💞 Favores (the partner owes you on the next visit)
  ('ff000000-0000-0000-0000-000000000004', 'Escolhe o filme',       'Você decide o filme do próximo encontro — sem direito a choro.', '🎬',  60, 'favor', null, 4),
  ('ff000000-0000-0000-0000-000000000005', 'Café da manhã por conta', 'Na próxima visita, o café da manhã é por conta dela/dele.',   '🥐', 100, 'favor', null, 5),
  ('ff000000-0000-0000-0000-000000000006', 'Massagem de 15 min',    'Resgatável na próxima vez que vocês se virem.',                '💆', 120, 'favor', null, 6),
  -- 🎮 Meta (playful game perks, honored entre vocês)
  ('ff000000-0000-0000-0000-000000000007', 'Provocação oficial',    'Dispara um "tô na frente 😎" pra deixar a outra com raiva.',     '😈',  30, 'meta', 'taunt', 7),
  ('ff000000-0000-0000-0000-000000000008', 'Freeze',                'Anula uma semana ruim: ela não conta no duelo da semana.',     '🧊', 120, 'meta', 'freeze', 8),
  ('ff000000-0000-0000-0000-000000000009', 'Dia em dobro',          'Escolha um dia e seus pontos contam em dobro (na honra).',     '✨', 200, 'meta', 'double_day', 9)
on conflict (id) do nothing;
