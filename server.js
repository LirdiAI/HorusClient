const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const D = require('./db');
const { now } = D;

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const HOST = process.env.HOST || 'localhost';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';

app.use(express.json({ limit: '256kb' }));
app.use('/api', (req, res, next) => {
  res.set({ 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await new Promise((res, rej) =>
    crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
  return `s1$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(pw, stored) {
  try {
    const [, saltHex, keyHex] = stored.split('$');
    const salt = Buffer.from(saltHex, 'hex');
    const key = Buffer.from(keyHex, 'hex');
    const out = await new Promise((res, rej) =>
      crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
    return crypto.timingSafeEqual(key, out);
  } catch {
    return false;
  }
}

const randomToken = (n = 32) => crypto.randomBytes(n).toString('hex');
const randomUid = () => String(crypto.randomInt(100, 100000));

async function makeUidUnique() {
  for (let i = 0; i < 200; i++) {
    const u = randomUid();
    if (!(await D.uidExists(u))) return u;
  }
  return String(crypto.randomInt(100, 100000) + Date.now() % 1000);
}

async function genPromoCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 200; i++) {
    let s = '';
    for (let j = 0; j < 10; j++) s += chars[crypto.randomInt(chars.length)];
    const code = 'HORUS-' + s;
    if (!(await D.promoCodeExists(code))) return code;
  }
  return 'HORUS-' + Array.from({ length: 10 }, () => chars[crypto.randomInt(chars.length)]).join('');
}

function send(res, status, payload) {
  res.status(status).json(payload);
}

function fail(res, msg, status = 400) {
  send(res, status, { ok: false, error: msg });
}

// обёртка для async-роутов: ловит ошибки в единый JSON
function ah(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error('[HorusWebsite] route error:', e);
    fail(res, 'Внутренняя ошибка сервера', 500);
  });
}

const rateBuckets = new Map();
function rateLimit(key, max = 10, windowMs = 60000) {
  const nowT = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.t < nowT - windowMs) {
    rateBuckets.set(key, { t: nowT, n: 1 });
    return true;
  }
  b.n += 1;
  if (b.n > max) return false;
  return true;
}

app.use((req, res, next) => {
  const prev = req.get('origin');
  if (prev) {
    const p = new URL(prev);
    if (p.hostname !== req.hostname) return fail(res, 'Запрос отклонён', 403);
  }
  next();
});

const sessCookie = { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS };

async function setSession(req, res, userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await D.insertSession({ token, user_id: userId, created_at: now(), expires_at: expires });
  res.cookie('hs_session', token, sessCookie);
  return token;
}

async function clearSession(token) {
  if (token) await D.deleteSession(token);
}

async function getAuth(req) {
  const token = req.cookies && req.cookies.hs_session;
  if (!token) return null;
  const s = await D.getSession(token);
  if (!s) return null;
  if (new Date(s.expires_at).getTime() < Date.now()) {
    await D.deleteSession(token);
    return null;
  }
  return s;
}

app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie;
  if (raw) {
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  next();
});

async function requireAuth(req, res, next) {
  const s = await getAuth(req);
  if (!s) return fail(res, 'Требуется вход', 401);
  const user = await D.getUserById(s.user_id);
  if (!user) return fail(res, 'Требуется вход', 401);
  req.user = user;
  req.sessionToken = s.token;
  next();
}

const PLANS = [
  { key: 'kamiki', name: 'HorusClient Kamiki', tag: 'Базовый', price: 199, currency: '₽', forever: true,
    desc: ['Базовый доступ к клиенту', 'Все будущие обновления', 'Поддержка 24/7'] },
  { key: 'alpha', name: 'HorusClient Alpha', tag: 'Расширенный', price: 349, currency: '₽', forever: true,
    featured: true,
    desc: ['Всё из Kamiki', 'Ранние обновления', 'Сброс HWID раз в месяц', 'Приоритетная поддержка'] }
];

async function publicUser(u) {
  const subs = await D.getSubs(u.id);
  const active = subs.find(s => s.status === 'active');
  const planKey = active ? active.plan : null;
  const plan = PLANS.find(p => p.key === planKey) || null;
  const lastReset = await D.getLastHwReset(u.id);
  return {
    id: u.id,
    login: u.login,
    uid: u.uid,
    email: u.email,
    hwid: u.hwid || null,
    hwidBound: !!u.hwid,
    createdAt: u.created_at,
    lastHwidReset: lastReset ? lastReset.reset_at : null,
    canResetHwid: planKey === 'alpha',
    subscription: plan ? {
      plan: plan.key,
      name: plan.name,
      tag: plan.tag,
      status: active.status,
      forever: !!active.expires_at ? false : true,
      expiresAt: active.expires_at,
      purchasedAt: active.purchased_at
    } : null
  };
}

/* ============ AUTH ============ */

app.post('/api/register', ah(async (req, res) => {
  const { login, email, password } = req.body || {};
  if (!rateLimit('reg:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);

  const validLogin = /^[A-Za-z0-9_]{3,20}$/.test(login || '');
  if (!validLogin) return fail(res, 'Логин: 3-20 символов, только латиница, цифры и _');
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
  if (!validEmail) return fail(res, 'Некорректная почта');
  if (!password || password.length < 8) return fail(res, 'Пароль должен быть длиннее 8 символов');

  if (await D.loginExists(login)) return fail(res, 'Логин уже занят');
  if (await D.emailExists(email)) return fail(res, 'Почта уже зарегистрирована');

  const hash = await hashPassword(password);
  const uid = await makeUidUnique();
  try {
    const user = await D.insertUser({ login, email, pass_hash: hash, uid, created_at: now() });
    await setSession(req, res, user.id);
    send(res, 200, { ok: true, user: await publicUser(user) });
  } catch (e) {
    console.error('[register]', e);
    send(res, 500, { ok: false, error: 'Ошибка регистрации' });
  }
}));

app.post('/api/login', ah(async (req, res) => {
  const { login, password } = req.body || {};
  if (!rateLimit('login:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  if (!login || !password) return fail(res, 'Введите логин и пароль');

  const user = await D.getUserByLogin(login) || await D.getUserByEmail(login);
  if (!user || !(await verifyPassword(password, user.pass_hash))) {
    return fail(res, 'Неверный логин или пароль', 401);
  }
  await setSession(req, res, user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

app.post('/api/logout', ah(async (req, res) => {
  await clearSession((await getAuth(req))?.token);
  res.clearCookie('hs_session', { path: '/' });
  send(res, 200, { ok: true });
}));

app.post('/api/logout-all', requireAuth, ah(async (req, res) => {
  await D.deleteSessionsForUser(req.user.id);
  res.clearCookie('hs_session', { path: '/' });
  send(res, 200, { ok: true });
}));

app.get('/api/me', ah(async (req, res) => {
  const s = await getAuth(req);
  if (!s) return send(res, 200, { ok: true, authed: false });
  const user = await D.getUserById(s.user_id);
  if (!user) return send(res, 200, { ok: true, authed: false });
  send(res, 200, { ok: true, authed: true, user: await publicUser(user) });
}));

app.post('/api/change-password', requireAuth, ah(async (req, res) => {
  const { current, next: nextPass } = req.body || {};
  if (!await verifyPassword(current || '', req.user.pass_hash)) return fail(res, 'Текущий пароль неверен');
  if (!nextPass || nextPass.length < 8) return fail(res, 'Новый пароль должен быть длиннее 8 символов');
  await D.updateUserPass(req.user.id, await hashPassword(nextPass));
  await D.deleteSessionsForUser(req.user.id);
  res.clearCookie('hs_session', { path: '/' });
  send(res, 200, { ok: true, message: 'Пароль изменён. Войдите заново.' });
}));

app.post('/api/change-email', requireAuth, ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!await verifyPassword(password || '', req.user.pass_hash)) return fail(res, 'Пароль неверен');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '')) return fail(res, 'Некорректная почта');
  if (await D.emailExists(email, req.user.id)) return fail(res, 'Почта уже используется');
  await D.updateUserEmail(req.user.id, email);
  send(res, 200, { ok: true, user: await publicUser(req.user) });
}));

/* ============ HWID ============ */

app.post('/api/hwid/bind', requireAuth, ah(async (req, res) => {
  const hwid = String(req.body?.hwid || '').trim();
  if (!hwid || hwid.length > 64) return fail(res, 'Некорректный HWID');
  if (req.user.hwid && req.user.hwid !== hwid) return fail(res, 'Устройство уже привязано. Сбросьте привязку в кабинете.');
  const taken = await D.hwidTaken(hwid, req.user.id);
  if (taken) return fail(res, 'Это устройство уже привязано к другому аккаунту');
  await D.bindHwid(req.user.id, hwid);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

app.post('/api/hwid/unbind', requireAuth, ah(async (req, res) => {
  await D.unbindHwid(req.user.id);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

app.post('/api/hwid/reset', requireAuth, ah(async (req, res) => {
  const last = await D.getLastHwReset(req.user.id);
  const days = 30 * 24 * 60 * 60 * 1000;
  if (last && Date.now() - new Date(last.reset_at).getTime() < days) {
    const left = Math.ceil((days - (Date.now() - new Date(last.reset_at).getTime())) / (24 * 60 * 60 * 1000));
    return fail(res, `Сброс доступен раз в месяц. Осталось дней: ${left}`);
  }
  const plan = (await D.getSubs(req.user.id)).find(s => s.status === 'active');
  if (!plan || plan.plan !== 'alpha') return fail(res, 'Сброс HWID доступен только с подпиской Alpha');
  if (!req.user.hwid) return fail(res, 'Устройство ещё не привязано');

  await D.insertHwReset(req.user.id, now());
  await D.resetHwid(req.user.id, now());
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

/* ============ LICENCE ============ */

app.get('/api/license/check', requireAuth, ah(async (req, res) => {
  const u = await publicUser(req.user);
  const sub = u.subscription;
  const allowed = !!sub && sub.status === 'active' && (!sub.expiresAt || new Date(sub.expiresAt).getTime() > Date.now());
  send(res, 200, {
    ok: true,
    allowed,
    user: u.login,
    uid: u.uid,
    hwid: u.hwid,
    hwidBound: u.hwidBound,
    plan: sub ? sub.plan : null,
    planName: sub ? sub.name : null,
    forever: sub ? !!sub.forever : false,
    expiresAt: sub ? sub.expiresAt : null
  });
}));

app.post('/api/promo/create', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Доступно только владельцу', 403);
  const plan = String(req.body?.plan || '');
  const maxUses = Math.max(1, Math.min(1000, Number(req.body?.maxUses) || 1));
  const days = Math.max(0, Math.min(36500, Number(req.body?.days) || 0));
  if (!PLANS.find(p => p.key === plan)) return fail(res, 'Неизвестный тариф');
  const code = await genPromoCode();
  await D.insertPromo({ code, plan, max_uses: maxUses, days, created_by: req.user.id, created_at: now() });
  send(res, 200, { ok: true, message: 'Промокод создан: ' + code });
}));

app.get('/api/promo/list', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Доступно только владельцу', 403);
  const codes = await D.listPromos();
  send(res, 200, { ok: true, codes });
}));

app.post('/api/promo/delete', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Доступно только владельцу', 403);
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id <= 0) return fail(res, 'Некорректный id');
  await D.deletePromo(id);
  send(res, 200, { ok: true, message: 'Промокод удалён' });
}));

app.post('/api/promo/redeem', requireAuth, ah(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!rateLimit('promo:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  if (!code) return fail(res, 'Введите промокод');
  const rec = await D.getPromoByCode(code);
  if (!rec) return fail(res, 'Промокод не найден');
  if (rec.used_count >= rec.max_uses) return fail(res, 'Промокод больше не действует');
  await D.revokePromoSubs(req.user.id);
  const expires_at = rec.days > 0 ? new Date(Date.now() + rec.days * 86400000).toISOString() : null;
  await D.insertSub({ user_id: req.user.id, plan: rec.plan, status: 'active', source: 'promo', purchased_at: now(), expires_at });
  await D.bumpPromoUsed(rec.id, rec.used_count + 1);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user), message: 'Промокод активирован!' });
}));

/* ============ SHOP ============ */

app.get('/api/plans', ah(async (req, res) => {
  const cfg = Object.fromEntries((await D.getAllCfg()).map(r => [r.key, r.value]));
  send(res, 200, { ok: true, plans: PLANS, purchaseNote: cfg.purchase_note || '' });
}));

app.post('/api/purchase', requireAuth, ah(async (req, res) => {
  const plan = String(req.body?.plan || '');
  if (!PLANS.find(p => p.key === plan)) return fail(res, 'Неизвестный тариф');
  const order = await D.insertOrder({ user_id: req.user.id, plan, created_at: now() });
  const cfgNote = await D.getCfg('purchase_note');
  send(res, 200, { ok: true, orderId: order.id, message: cfgNote || '' });
}));

/* ============ SUPPORT ============ */

const TICKET_TYPES = { support: 'Поддержка', idea: 'Предложить идею', bug: 'Сообщить о баге' };

app.post('/api/support', requireAuth, ah(async (req, res) => {
  const { type, subject, message } = req.body || {};
  if (!TICKET_TYPES[type]) return fail(res, 'Неизвестный тип обращения');
  if (!subject || subject.length > 100) return fail(res, 'Тема: 1-100 символов');
  if (!message || message.length < 10 || message.length > 2000) return fail(res, 'Сообщение: 10-2000 символов');
  const ticket = await D.insertTicket({ user_id: req.user.id, type, subject, message, created_at: now() });
  send(res, 200, { ok: true, ticketId: ticket.id, typeName: TICKET_TYPES[type] });
}));

/* ============ STATS ============ */

app.get('/api/stats', ah(async (req, res) => {
  const users = await D.countUsers();
  const sales = await D.countSales();
  send(res, 200, { ok: true, users, sales });
}));

/* ============ COMMUNITY ============ */

let discordCache = { members: null, ts: 0 };
const DISCORD_INVITE = 'sGjbnrdBfw';
const CACHE_TTL = 10 * 60 * 1000;

async function getDiscordMembers() {
  try {
    if (discordCache.members !== null && Date.now() - discordCache.ts < CACHE_TTL) return discordCache.members;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE}?with_counts=true`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return discordCache.members ?? null;
    const d = await r.json();
    if (typeof d.approximate_member_count === 'number') {
      discordCache = { members: d.approximate_member_count, ts: Date.now() };
      return d.approximate_member_count;
    }
    return discordCache.members ?? null;
  } catch {
    return discordCache.members ?? null;
  }
}

app.get('/api/community', ah(async (req, res) => {
  const cfg = Object.fromEntries((await D.getAllCfg()).map(r => [r.key, r.value]));
  const liveDiscord = await getDiscordMembers();
  send(res, 200, {
    ok: true,
    discord: { url: cfg.discord_url, members: liveDiscord ?? Number(cfg.discord_members || 0) },
    telegram: { url: cfg.telegram_url, members: Number(cfg.telegram_members || 0) }
  });
}));

/* ============ LAUNCHER ============ */

app.get('/api/launcher/latest', requireAuth, async (req, res) => {
  const active = (await D.getSubs(req.user.id)).find(s => s.status === 'active');
  if (!active) return fail(res, 'Скачивание доступно только с активной подпиской', 403);
  send(res, 200, {
    ok: true,
    version: '1.0.0',
    url: '#download',
    gameVersion: '1.21.4',
    build: 'stable'
  });
});

/* ============ HEALTH ============ */

app.get('/api/health', async (req, res) => {
  try {
    const up = await D.ping();
    if (!up) return fail(res, 'DB unavailable', 503);
    send(res, 200, { ok: true });
  } catch {
    fail(res, 'DB unavailable', 503);
  }
});

/* ============ SPA fallback + start ============ */

app.use((err, req, res, next) => {
  if (err) return fail(res, err.message || 'Ошибка', err.status || 500);
  next();
});

app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[HorusWebsite] запущен: http://${HOST}:${PORT}`);
  });
}

module.exports = app;