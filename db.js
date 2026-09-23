const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'public' }
});

const now = () => new Date().toISOString();

// Проверка доступности и готовности схемы
async function ping() {
  const { error } = await sb.from('site_cfg').select('key').limit(1);
  return !error;
}

/* ---------------- users ---------------- */

function users() {
  return sb.from('users');
}

async function getUserById(id) {
  const { data, error } = await users().select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getUserByLogin(login) {
  const { data, error } = await users().select('*').ilike('login', login).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getUserByEmail(email) {
  const { data, error } = await users().select('*').ilike('email', email).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function uidExists(uid) {
  const { data, error } = await users().select('id').eq('uid', uid).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function loginExists(login) {
  const { data, error } = await users().select('id').ilike('login', login).maybeSingle();
  if (error) throw error;
  return !!data;
}

async function emailExists(email, excludeId) {
  let q = users().select('id').ilike('email', email);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return !!data;
}

async function insertUser(u) {
  const { data, error } = await users().insert({
    login: u.login, email: u.email, pass_hash: u.pass_hash, uid: u.uid, created_at: u.created_at
  }).select().single();
  if (error) throw error;
  return data;
}

async function updateUserPass(id, hash) {
  const { error } = await users().update({ pass_hash: hash }).eq('id', id);
  if (error) throw error;
}

async function updateUserEmail(id, email) {
  const { error } = await users().update({ email }).eq('id', id);
  if (error) throw error;
}

async function bindHwid(id, hwid) {
  const { error } = await users().update({ hwid }).eq('id', id);
  if (error) throw error;
}

async function unbindHwid(id) {
  const { error } = await users().update({ hwid: null }).eq('id', id);
  if (error) throw error;
}

async function resetHwid(id, resetAt) {
  const { error } = await users().update({ hwid: null, last_hwid_reset: resetAt }).eq('id', id);
  if (error) throw error;
}

async function hwidTaken(hwid, excludeId) {
  let q = users().select('login').eq('hwid', hwid);
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data ? data.login : null;
}

/* ---------------- sessions ---------------- */

async function insertSession(s) {
  const { error } = await sb.from('sessions').insert({
    token: s.token, user_id: s.user_id, created_at: s.created_at, expires_at: s.expires_at
  });
  if (error) throw error;
}

async function getSession(token) {
  const { data, error } = await sb.from('sessions').select('*').eq('token', token).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function deleteSession(token) {
  await sb.from('sessions').delete().eq('token', token);
}

async function deleteSessionsForUser(userId) {
  await sb.from('sessions').delete().eq('user_id', userId);
}

/* ---------------- subs ---------------- */

async function getSubs(userId) {
  const { data, error } = await sb.from('subs').select('*').eq('user_id', userId).order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function revokePromoSubs(userId) {
  await sb.from('subs').update({ status: 'revoked' })
    .eq('user_id', userId).eq('status', 'active').eq('source', 'promo');
}

async function insertSub(s) {
  const { error } = await sb.from('subs').insert({
    user_id: s.user_id, plan: s.plan, status: s.status || 'active',
    source: s.source, purchased_at: s.purchased_at, expires_at: s.expires_at || null
  });
  if (error) throw error;
}

// Заморозка: меняем статус активной подписки пользователя на 'frozen'
async function freezeSub(userId) {
  const { error } = await sb.from('subs').update({ status: 'frozen' })
    .eq('user_id', userId).eq('status', 'active');
  if (error) throw error;
}

// Разморозка: возвращаем самую свежую замороженную подписку в статус 'active'
async function unfreezeSub(userId) {
  const { data, error } = await sb.from('subs')
    .select('id').eq('user_id', userId).eq('status', 'frozen')
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return false;
  const { error: upErr } = await sb.from('subs').update({ status: 'active' }).eq('id', data.id);
  if (upErr) throw upErr;
  return true;
}

// Все пользователи (без паролей) для панели владельца и Глобалки
async function listUsers() {
  const { data, error } = await sb.from('users')
    .select('id, login, email, uid, hwid, avatar, banner, created_at')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Активные подписки с датой окончания (для напоминаний об истечении в Telegram)
async function getActiveSubsWithExpiry() {
  const { data, error } = await sb.from('subs').select('user_id, plan, status, expires_at')
    .eq('status', 'active').not('expires_at', 'is', null);
  if (error) throw error;
  return data || [];
}

// Все подписки (для определения заморозки каждого пользователя)
async function listAllSubs() {
  const { data, error } = await sb.from('subs')
    .select('user_id, plan, status, source, purchased_at, expires_at')
    .order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ---------------- hw_resets ---------------- */

async function getLastHwReset(userId) {
  const { data, error } = await sb.from('hw_resets').select('*').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertHwReset(userId, resetAt) {
  const { error } = await sb.from('hw_resets').insert({ user_id: userId, reset_at: resetAt });
  if (error) throw error;
}

/* ---------------- promo_codes ---------------- */

async function getPromoByCode(code) {
  const { data, error } = await sb.from('promo_codes').select('*').eq('code', code).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function promoCodeExists(code) {
  return !!(await getPromoByCode(code));
}

async function insertPromo(p) {
  const { error } = await sb.from('promo_codes').insert({
    code: p.code, plan: p.plan, max_uses: p.max_uses, days: p.days || 0,
    created_by: p.created_by, created_at: p.created_at
  });
  if (error) throw error;
}

async function listPromos() {
  const { data, error } = await sb.from('promo_codes').select('id, code, plan, max_uses, days, used_count, created_at').order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function bumpPromoUsed(id, usedCount) {
  const { error } = await sb.from('promo_codes').update({ used_count: usedCount }).eq('id', id);
  if (error) throw error;
}

async function deletePromo(id) {
  const { error } = await sb.from('promo_codes').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------- custom_offers ---------------- */

async function getCustomOfferById(id) {
  const { data, error } = await sb.from('custom_offers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertCustomOffer(o) {
  const { error } = await sb.from('custom_offers').insert(o);
  if (error) throw error;
}

async function listCustomOffers() {
  const { data, error } = await sb.from('custom_offers').select('*').order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deleteCustomOffer(id) {
  const { error } = await sb.from('custom_offers').delete().eq('id', id);
  if (error) throw error;
}

async function listCustomOrderStatuses() {
  const { data, error } = await sb.from('orders').select('plan,status').like('plan', 'custom:%');
  if (error) throw error;
  return data || [];
}

async function updateOrderStatus(id, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
}

async function getOrderByPaymentId(paymentId) {
  const { data, error } = await sb.from('orders').select('*').eq('payment_id', String(paymentId)).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function listRecentOrders(limit) {
  const { data, error } = await sb.from('orders').select('*').order('id', { ascending: false }).limit(limit || 200);
  if (error) throw error;
  return data || [];
}

// Заказы конкретного пользователя (для страницы «Мои покупки»)
async function getOrdersByUser(userId) {
  const { data, error } = await sb.from('orders').select('*').eq('user_id', userId).order('id', { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

async function setUserAvatar(id, data) {
  const { error } = await users().update({ avatar: data }).eq('id', id);
  if (error) throw error;
}

async function setUserBanner(id, data) {
  const { error } = await users().update({ banner: data }).eq('id', id);
  if (error) throw error;
}

/* ---------------- глянцевый профиль (Alpha) ---------------- */

// Флаг хранится в site_cfg: glossy:<userId> -> '1' | '0'
async function getGlossy(userId) {
  const raw = await getCfg(`glossy:${userId}`);
  return raw === '1';
}

async function setGlossy(userId, enabled) {
  await setCfg(`glossy:${userId}`, enabled ? '1' : '0');
}

/* ---------------- украшения аватарки (магазин) ---------------- */

async function getDeco(userId, key) {
  const raw = await getCfg(`deco:${key}:${userId}`);
  return raw === '1';
}

async function setDeco(userId, key) {
  await setCfg(`deco:${key}:${userId}`, '1');
}

async function getAvaDeco(userId) {
  return getDeco(userId, 'ava_deco');
}

async function setAvaDeco(userId) {
  return setDeco(userId, 'ava_deco');
}

/* ---------------- цвет логина (магазин) ---------------- */

async function getLoginColor(userId) {
  return (await getCfg(`login_color:${userId}`)) || null;
}

async function setLoginColor(userId, key) {
  await setCfg(`login_color:${userId}`, key);
}

/* ---------------- активное украшение аватара ---------------- */

async function getActiveDeco(userId) {
  return (await getCfg(`deco_active:${userId}`)) || null;
}

async function setActiveDeco(userId, key) {
  await setCfg(`deco_active:${userId}`, key);
}

/* ---------------- цвет роли (магазин) ---------------- */

async function getRoleColor(userId) {
  return (await getCfg(`role_color:${userId}`)) || null;
}

async function setRoleColor(userId, key) {
  await setCfg(`role_color:${userId}`, key);
}

/* ---------------- роли модерации ---------------- */

async function getUserRole(userId) {
  return (await getCfg(`role:${userId}`)) || null;
}

async function setUserRole(userId, role) {
  await setCfg(`role:${userId}`, role);
}

/* ---------------- медийка: баллы и покупки ---------------- */

// Баллы Медийки хранятся в site_cfg:
//   mp:<userId>          -> строка с числом баллов
//   mp_last:<userId>     -> ISO времени последней покупки (кулдаун 3 дня)

async function getMediaPoints(userId) {
  const raw = await getCfg(`mp:${userId}`);
  const n = parseInt(raw || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function setMediaPoints(userId, n) {
  await setCfg(`mp:${userId}`, String(Math.max(0, Math.floor(n))));
}

async function getMediaLastBuy(userId) {
  const raw = await getCfg(`mp_last:${userId}`);
  return raw || null;
}

async function setMediaLastBuy(userId, iso) {
  await setCfg(`mp_last:${userId}`, iso);
}

// Кулдаун по конкретному товару Медийки: mp_cd:<userId>:<key> -> ISO
async function getMediaItemCd(userId, itemKey) {
  const raw = await getCfg(`mp_cd:${userId}:${itemKey}`);
  return raw || null;
}

async function setMediaItemCd(userId, itemKey, iso) {
  await setCfg(`mp_cd:${userId}:${itemKey}`, iso);
}

// Гашение прежних активных подписок, выданных через Медийку
async function revokeMediaSubs(userId) {
  await sb.from('subs').update({ status: 'revoked' })
    .eq('user_id', userId).eq('status', 'active').eq('source', 'media');
}

/* ---------------- инвентарь (Медийка → предметы и ключи) ---------------- */

// Инвентарь хранится в site_cfg: inv:<userId> -> JSON-массив предметов
//   [{ id, itemKey, name, created_at, status: 'item'|'key', code|null }]
async function getInventory(userId) {
  const raw = await getCfg(`inv:${userId}`);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function setInventory(userId, items) {
  await setCfg(`inv:${userId}`, JSON.stringify(items));
}

async function addInvItem(userId, item) {
  const arr = await getInventory(userId);
  arr.push(item);
  await setInventory(userId, arr);
}

async function removeInvItem(userId, itemId) {
  const arr = await getInventory(userId);
  await setInventory(userId, arr.filter(i => String(i.id) !== String(itemId)));
}

// Ключи инвентаря: inv_key:<CODE> -> JSON { userId, itemId }
async function getInvKey(code) {
  const raw = await getCfg(`inv_key:${code}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function setInvKey(code, payload) {
  await setCfg(`inv_key:${code}`, JSON.stringify(payload));
}

async function deleteInvKey(code) {
  await deleteCfg(`inv_key:${code}`);
}

/* ---------------- друзья (Глобалка) ---------------- */

async function getFriends(userId) {
  const raw = await getCfg(`friends:${userId}`);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function setFriends(userId, logins) {
  await setCfg(`friends:${userId}`, JSON.stringify(logins));
}

async function getFriendReqsIn(userId) {
  const raw = await getCfg(`freq_in:${userId}`);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function setFriendReqsIn(userId, logins) {
  await setCfg(`freq_in:${userId}`, JSON.stringify(logins));
}

async function getFriendReqsOut(userId) {
  const raw = await getCfg(`freq_out:${userId}`);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function setFriendReqsOut(userId, logins) {
  await setCfg(`freq_out:${userId}`, JSON.stringify(logins));
}

/* ---------------- личные сообщения (ЛС в Глобалке) ---------------- */

// Переписка хранится в site_cfg: dm:<минId>:<максId> -> JSON [{from, login, text, ts}]
// Уведомления: dm_notifs:<userId> -> JSON [{from, login, text, ts}]

function dmKey(aId, bId) {
  return 'dm:' + (Number(aId) < Number(bId) ? aId + ':' + bId : bId + ':' + aId);
}

async function getDm(aId, bId) {
  const raw = await getCfg(dmKey(aId, bId));
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function appendDm(aId, bId, msg) {
  const arr = await getDm(aId, bId);
  msg.read = false;
  arr.push(msg);
  while (arr.length > 200) arr.shift();
  await setCfg(dmKey(aId, bId), JSON.stringify(arr));
}

// Отметить все сообщения от fromId в диалоге [aId, bId] как прочитанные
// Если передан уже загруженный массив — не делать лишний запрос к БД
async function markDmRead(aId, bId, fromId, existingArr) {
  const arr = existingArr || await getDm(aId, bId);
  let changed = false;
  for (const m of arr) {
    if (Number(m.from) === Number(fromId) && !m.read) {
      m.read = true;
      changed = true;
    }
  }
  if (changed) await setCfg(dmKey(aId, bId), JSON.stringify(arr));
  return changed;
}

async function getDmNotifs(userId) {
  const raw = await getCfg(`dm_notifs:${userId}`);
  try { return JSON.parse(raw || '[]'); } catch { return []; }
}

async function setDmNotifs(userId, arr) {
  await setCfg(`dm_notifs:${userId}`, JSON.stringify(arr));
}

async function pushDmNotif(userId, nt) {
  const arr = await getDmNotifs(userId);
  arr.push(nt);
  while (arr.length > 50) arr.shift();
  await setDmNotifs(userId, arr);
}

async function clearDmNotifsFrom(userId, fromLogin) {
  const arr = await getDmNotifs(userId);
  const next = arr.filter(n => n.login.toLowerCase() !== fromLogin.toLowerCase());
  if (next.length !== arr.length) await setDmNotifs(userId, next);
}

/* ---------------- тема сайта (Alpha) ---------------- */

async function getTheme(userId) {
  return (await getCfg(`theme:${userId}`)) || null;
}

async function setTheme(userId, key) {
  await setCfg(`theme:${userId}`, key);
}

async function setTg2fa(userId, enabled) {
  const raw = await getCfg(`tg_userid:${userId}`);
  if (!raw) return false;
  let obj;
  try { obj = JSON.parse(raw); } catch { obj = { u: raw, c: null }; }
  obj.fa = !!enabled;
  await setCfg(`tg_userid:${userId}`, JSON.stringify(obj));
  return true;
}

async function getUsersByIds(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return [];
  const { data, error } = await sb.from('users').select('id, login, email').in('id', uniq);
  if (error) throw error;
  return data || [];
}

/* ---------------- discount_promos ---------------- */

async function getDiscountPromoByCode(code) {
  const { data, error } = await sb.from('discount_promos').select('*').eq('code', code).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertDiscountPromo(p) {
  const { error } = await sb.from('discount_promos').insert(p);
  if (error) throw error;
}

async function listDiscountPromos() {
  const { data, error } = await sb.from('discount_promos').select('*').order('id', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deleteDiscountPromo(id) {
  const { error } = await sb.from('discount_promos').delete().eq('id', id);
  if (error) throw error;
}

async function bumpDiscountPromoByCode(code) {
  const rec = await getDiscountPromoByCode(code);
  if (!rec) return;
  const { error } = await sb.from('discount_promos').update({ uses: (rec.uses || 0) + 1 }).eq('id', rec.id);
  if (error) throw error;
}

/* ---------------- orders ---------------- */

async function insertOrder(o) {
  const row = { user_id: o.user_id, plan: o.plan, status: 'pending', created_at: o.created_at };
  if (o.amount != null) row.amount = o.amount;
  if (o.promo_code) row.promo_code = o.promo_code;
  const { data, error } = await sb.from('orders').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function getOrderById(id) {
  const { data, error } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function setOrderPaid(id, paidAt, provider) {
  const { error } = await sb.from('orders').update({ status: 'paid', paid_at: paidAt, provider }).eq('id', id);
  if (error) throw error;
}

async function saveOrderPayment(id, pid) {
  const { error } = await sb.from('orders').update({ payment_id: pid }).eq('id', id);
  if (error) throw error;
}

/* ---------------- tickets ---------------- */

async function insertTicket(t) {
  const { data, error } = await sb.from('tickets').insert({
    user_id: t.user_id, type: t.type, subject: t.subject, message: t.message, created_at: t.created_at
  }).select().single();
  if (error) throw error;
  return data;
}

/* ---------------- site_cfg ---------------- */

async function getAllCfg() {
  const { data, error } = await sb.from('site_cfg').select('*');
  if (error) throw error;
  return data || [];
}

async function getCfg(key) {
  const { data, error } = await sb.from('site_cfg').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

async function setCfg(key, value) {
  const { error } = await sb.from('site_cfg').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

async function deleteCfg(key) {
  await sb.from('site_cfg').delete().eq('key', key);
}

/* ---------------- рефералка: 5% от покупок ---------------- */
// Хранится в site_cfg:
//   ref_by:<userId>        -> String(referrerUserId)
//   ref_bal:<userId>       -> строка с числом (баланс в рублях)
//   ref_invited:<userId>   -> JSON-массив [{id, login, created_at}]

async function setRefBy(userId, referrerId) {
  await setCfg(`ref_by:${userId}`, String(referrerId));
}

async function getRefBy(userId) {
  const raw = await getCfg(`ref_by:${userId}`);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getRefBalance(userId) {
  const raw = await getCfg(`ref_bal:${userId}`);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function addRefBalance(userId, delta) {
  const cur = await getRefBalance(userId);
  const next = Math.round((cur + delta) * 100) / 100;
  await setCfg(`ref_bal:${userId}`, String(next));
  return next;
}

async function addRefInvited(userId, invited) {
  const raw = await getCfg(`ref_invited:${userId}`);
  let arr = [];
  try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  arr.unshift(invited);
  if (arr.length > 100) arr = arr.slice(0, 100);
  await setCfg(`ref_invited:${userId}`, JSON.stringify(arr));
}

async function getRefInvited(userId) {
  const raw = await getCfg(`ref_invited:${userId}`);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

/* ---------------- журнал действий модераторов ---------------- */
// Хранится в site_cfg: mod_log -> JSON-массив [{ts, actor, action, target, detail}]

async function logModAction(entry) {
  const raw = await getCfg('mod_log');
  let arr = [];
  try { arr = raw ? JSON.parse(raw) : []; } catch { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  arr.unshift(Object.assign({ ts: new Date().toISOString() }, entry));
  if (arr.length > 200) arr = arr.slice(0, 200);
  await setCfg('mod_log', JSON.stringify(arr));
}

async function getModLog() {
  const raw = await getCfg('mod_log');
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

/* ---------------- telegram ---------------- */

// Привязка Telegram хранится в site_cfg:
//   tg_userid:<userId> -> JSON {u: username, c: chatId}
//   tg_user:<username> -> userId
//   tg_pend:<userId>   -> JSON {o: username, code, exp}
//   tg_reset:<userId>  -> JSON {code, exp}

async function getTgByUserId(userId) {
  const raw = await getCfg(`tg_userid:${userId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return { u: raw, c: null }; }
}

async function getUserIdByTg(username) {
  const cfgKey = `tg_user:${String(username).toLowerCase()}`;
  const v = await getCfg(cfgKey);
  return v ? Number(v) : null;
}

async function checkTgTaken(username, excludeUserId) {
  const cfgKey = `tg_user:${String(username).toLowerCase()}`;
  const v = await getCfg(cfgKey);
  if (!v) return false;
  return Number(v) !== excludeUserId;
}

async function bindTg(userId, username, chatId) {
  // Убираем прежнюю привязку этого пользователя, чтобы не осталось висячих tg_user-ключей
  const prev = await getCfg(`tg_userid:${userId}`);
  if (prev) {
    try {
      const parsed = JSON.parse(prev);
      if (parsed.u) await sb.from('site_cfg').delete().eq('key', `tg_user:${String(parsed.u).toLowerCase()}`);
    } catch { /* игнорируем */ }
  }
  await sb.from('site_cfg').upsert({ key: `tg_userid:${userId}`, value: JSON.stringify({ u: username, c: chatId || null }) }, { onConflict: 'key' });
  await sb.from('site_cfg').upsert({ key: `tg_user:${String(username).toLowerCase()}`, value: String(userId) }, { onConflict: 'key' });
}

async function unbindTg(userId, username) {
  if (username) await sb.from('site_cfg').delete().eq('key', `tg_user:${String(username).toLowerCase()}`);
  await sb.from('site_cfg').delete().eq('key', `tg_userid:${userId}`);
}

async function setTgPending(userId, payload) {
  await setCfg(`tg_pend:${userId}`, JSON.stringify(payload));
}

async function getTgPending(userId) {
  const raw = await getCfg(`tg_pend:${userId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Поиск ожидающей привязки по коду (устойчиво к перезагрузке сервера)
async function findTgPendingByCode(code) {
  const all = await getAllCfg();
  for (const row of all) {
    if (!String(row.key || '').startsWith('tg_pend:')) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (parsed.code && String(parsed.code).toUpperCase() === String(code).toUpperCase()) {
        const userId = Number(String(row.key).split(':')[1]);
        if (Number.isInteger(userId)) return { userId, ...parsed };
      }
    } catch { /* пропускаем битые записи */ }
  }
  return null;
}

async function clearTgPending(userId) {
  await deleteCfg(`tg_pend:${userId}`);
}

async function setTgReset(userId, payload) {
  await setCfg(`tg_reset:${userId}`, JSON.stringify(payload));
}

async function getTgReset(userId) {
  const raw = await getCfg(`tg_reset:${userId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Поиск записи сброса по uid аккаунта (для ссылки-подтверждения из Telegram-бота)
async function getTgResetByUid(uid) {
  const all = await getAllCfg();
  for (const row of all) {
    if (!String(row.key || '').startsWith('tg_reset:')) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (String(parsed.uid) === String(uid)) return parsed;
    } catch { /* пропускаем битые записи */ }
  }
  return null;
}

// Поиск записи сброса по коду (для команды /reset в боте, устойчиво к перезагрузке)
async function findTgResetByCode(code) {
  const all = await getAllCfg();
  for (const row of all) {
    if (!String(row.key || '').startsWith('tg_reset:')) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (parsed.code && String(parsed.code).toUpperCase() === String(code).toUpperCase()) {
        const userId = Number(String(row.key).split(':')[1]);
        if (Number.isInteger(userId)) return { userId, ...parsed };
      }
    } catch { /* пропускаем битые записи */ }
  }
  return null;
}

async function clearTgReset(userId) {
  await deleteCfg(`tg_reset:${userId}`);
}

// Подтверждение привязки HWID через Telegram (кнопка «Это не я»):
//   tg_hwc:<userId> -> JSON {hwid, code, exp}
async function setTgHwCancel(userId, payload) {
  await setCfg(`tg_hwc:${userId}`, JSON.stringify(payload));
}

async function getTgHwCancel(userId) {
  const raw = await getCfg(`tg_hwc:${userId}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function clearTgHwCancel(userId) {
  await deleteCfg(`tg_hwc:${userId}`);
}

async function findTgHwCancelByCode(code) {
  const all = await getAllCfg();
  for (const row of all) {
    if (!String(row.key || '').startsWith('tg_hwc:')) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (parsed.code && String(parsed.code).toUpperCase() === String(code).toUpperCase()) {
        const userId = Number(String(row.key).split(':')[1]);
        if (Number.isInteger(userId)) return { userId, ...parsed };
      }
    } catch { /* пропускаем битые записи */ }
  }
  return null;
}

/* ---------------- stats ---------------- */

async function countUsers() {
  const { count, error } = await sb.from('users').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function countSales() {
  const { count, error } = await sb.from('subs').select('*', { count: 'exact', head: true }).neq('source', 'key');
  if (error) throw error;
  return count || 0;
}

module.exports = {
  sb, now,
  ping,
  getUserById, getUserByLogin, getUserByEmail,
  uidExists, loginExists, emailExists, insertUser,
  updateUserPass, updateUserEmail, bindHwid, unbindHwid, resetHwid, hwidTaken,
  insertSession, getSession, deleteSession, deleteSessionsForUser,
  getSubs, revokePromoSubs, insertSub, freezeSub, unfreezeSub, listUsers, listAllSubs, getActiveSubsWithExpiry,
  getLastHwReset, insertHwReset,
  getPromoByCode, promoCodeExists, insertPromo, listPromos, bumpPromoUsed, deletePromo,
  getDiscountPromoByCode, insertDiscountPromo, listDiscountPromos, deleteDiscountPromo, bumpDiscountPromoByCode,
  getCustomOfferById, insertCustomOffer, listCustomOffers, deleteCustomOffer, listCustomOrderStatuses, updateOrderStatus, getOrderByPaymentId,
  listRecentOrders, getOrdersByUser, getUsersByIds, setUserAvatar, setUserBanner, setTg2fa, getGlossy, setGlossy, getAvaDeco, setAvaDeco, getDeco, setDeco, getLoginColor, setLoginColor, getActiveDeco, setActiveDeco, getRoleColor, setRoleColor, getUserRole, setUserRole, getFriends, setFriends, getFriendReqsIn, setFriendReqsIn, getFriendReqsOut, setFriendReqsOut, getTheme, setTheme,
  getDm, appendDm, markDmRead, getDmNotifs, setDmNotifs, pushDmNotif, clearDmNotifsFrom,
  getMediaPoints, setMediaPoints, getMediaLastBuy, setMediaLastBuy, getMediaItemCd, setMediaItemCd, revokeMediaSubs,
  getInventory, setInventory, addInvItem, removeInvItem, getInvKey, setInvKey, deleteInvKey,
  insertOrder, getOrderById, setOrderPaid, saveOrderPayment, insertTicket,
  getAllCfg, getCfg, setCfg, deleteCfg,
  setRefBy, getRefBy, getRefBalance, addRefBalance, addRefInvited, getRefInvited,
  logModAction, getModLog,
  getTgByUserId, getUserIdByTg, checkTgTaken, bindTg, unbindTg,
  setTgPending, getTgPending, findTgPendingByCode, clearTgPending,
  setTgReset, getTgReset, getTgResetByUid, findTgResetByCode, clearTgReset,
  setTgHwCancel, getTgHwCancel, clearTgHwCancel, findTgHwCancelByCode,
  countUsers, countSales
};