-- Выполнить в Supabase Dashboard -> SQL Editor ПОСЛЕ импорта данных из SQLite
select setval(pg_get_serial_sequence('users', 'id'), (select coalesce(max(id), 0) + 1 from users), false);
select setval(pg_get_serial_sequence('subs', 'id'), (select coalesce(max(id), 0) + 1 from subs), false);
select setval(pg_get_serial_sequence('hw_resets', 'id'), (select coalesce(max(id), 0) + 1 from hw_resets), false);
select setval(pg_get_serial_sequence('promo_codes', 'id'), (select coalesce(max(id), 0) + 1 from promo_codes), false);
select setval(pg_get_serial_sequence('orders', 'id'), (select coalesce(max(id), 0) + 1 from orders), false);
select setval(pg_get_serial_sequence('tickets', 'id'), (select coalesce(max(id), 0) + 1 from tickets), false);