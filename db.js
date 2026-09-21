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

// Все пользователи (без паролей) для панели владельца
async function listUsers() {
  const { data, error } = await sb.from('users')
    .select('id, login, email, uid, hwid, created_at')
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
  insertOrder, getOrderById, setOrderPaid, saveOrderPayment, insertTicket,
  getAllCfg, getCfg, setCfg, deleteCfg,
  getTgByUserId, getUserIdByTg, checkTgTaken, bindTg, unbindTg,
  setTgPending, getTgPending, findTgPendingByCode, clearTgPending,
  setTgReset, getTgReset, getTgResetByUid, findTgResetByCode, clearTgReset,
  setTgHwCancel, getTgHwCancel, clearTgHwCancel, findTgHwCancelByCode,
  countUsers, countSales
};