const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const D = require('./db');
const { now } = D;
const TGBot = require('./tg');

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

function genTgCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
}

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
    const msg = (e && e.message) ? String(e.message) : String(e || '');
    if (/does not exist|schema cache|find the table|relation/i.test(msg)) {
      return fail(res, 'В базе нет нужной таблицы. Откройте Supabase → SQL Editor и выполните MIGRATION.sql', 500);
    }
    fail(res, 'Внутренняя ошибка сервера: ' + msg, 500);
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
  { key: 'kamiki30', name: 'Kamiki 1.21.4', tag: 'Базовый · 30 дней', price: 67, currency: '₽', forever: false, days: 30,
    desc: ['Базовый доступ на 30 дней', 'Поддержка 24/7', 'Продление из кабинета'] },
  { key: 'kamiki365', name: 'Kamiki 1.21.4', tag: 'Базовый · 365 дней', price: 199, currency: '₽', forever: false, days: 365,
    desc: ['Базовый доступ на 365 дней', 'Выбор игроков', 'Выгода: ~0.55 ₽ в день', 'Продление из кабинета'] },
  { key: 'kamiki', name: 'Kamiki 1.21.4', tag: 'Базовый · Навсегда', price: 300, currency: '₽', forever: true,
    desc: ['Базовый доступ к клиенту', 'Все будущие обновления', 'Поддержка 24/7'] },
  { key: 'alpha', name: 'Alpha 1.21.4', tag: 'Докупка · Навсегда', price: 199, currency: '₽', forever: true,
    featured: true, requires: 'kamiki', requiresForever: true,
    desc: ['Докупка к Kamiki 1.21.4', 'Ранние обновления', 'Сброс HWID раз в месяц', 'Приоритетная поддержка'] },
  { key: 'tester', name: 'Набор Тестера', tag: 'Набор · 30 дней', price: 129, currency: '₽', forever: false, days: 30, pack: true,
    badge: '10% выгоды',
    includes: ['kamiki30', 'hwid_reset'], discordRole: 'Пакет Тестер',
    desc: ['Kamiki 1.21.4 на 30 дней', 'Бесплатный сброс HWID x1', 'Роль в Discord «Пакет Тестер»'] },
  { key: 'hwid_reset', name: 'Сброс HWID', tag: 'Услуга', price: 100, currency: '₽', forever: false,
    cta: 'Купить сброс',
    desc: ['Разовое снятие привязки к устройству', 'Новый HWID можно привязать сразу'] }
];

async function publicUser(u) {
  const subs = await D.getSubs(u.id);
  const active = subs.find(s => s.status === 'active') || subs.find(s => s.status === 'frozen') || null;
  const planKey = active ? active.plan : null;
  const plan = PLANS.find(p => p.key === planKey) || null;
  const lastReset = await D.getLastHwReset(u.id);
  const tgInfo = await D.getTgByUserId(u.id);
  return {
    id: u.id,
    login: u.login,
    uid: u.uid,
    email: u.email,
    hwid: u.hwid || null,
    hwidBound: !!u.hwid,
    tg: tgInfo ? tgInfo.u : null,
    tgBound: tgInfo ? !!tgInfo.c : false,
    createdAt: u.created_at,
    lastHwidReset: lastReset ? lastReset.reset_at : null,
    canResetHwid: planKey === 'alpha' && active != null && active.status === 'active',
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

/* ============ TELEGRAM bind ============ */

const TG_USERNAME_RE = /^@?[A-Za-z_][A-Za-z0-9_]{2,30}$/;
const TG_CODE_TTL = 10 * 60 * 1000;

// Ссылка/имя бота для подсказок в интерфейсе
app.get('/api/tg/bot', (req, res) => {
  send(res, 200, { ok: true, bot: TGBot.botUsername || null, enabled: TGBot.isEnabled() });
});

// Шаг 1: пользователь запрашивает привязку TG — генерируем код и ждём подтверждения через бота
app.post('/api/tg/bind', requireAuth, ah(async (req, res) => {
  if (!TGBot.isEnabled()) return fail(res, 'Telegram-бот не настроен на сервере', 503);
  const raw = String(req.body?.tg || '').trim().replace(/^@/, '');
  if (!TG_USERNAME_RE.test(raw)) return fail(res, 'Некорректный Telegram username (без @, 3-32 символа)');

  const existing = await D.getTgByUserId(req.user.id);
  if (existing) {
    if (existing.u.toLowerCase() === raw.toLowerCase()) return fail(res, 'Этот Telegram уже привязан к вашему аккаунту');
  }
  if (await D.checkTgTaken(raw, req.user.id)) return fail(res, 'Этот Telegram уже привязан к другому аккаунту');

  const code = genTgCode();
  await D.setTgPending(req.user.id, {
    username: raw, login: req.user.login, code, exp: Date.now() + TG_CODE_TTL
  });
  TGBot.registerBindCode(code, req.user.id, TG_CODE_TTL);

  send(res, 200, {
    ok: true,
    code,
    bot: TGBot.botUsername || '',
    message: TGBot.botUsername
      ? 'Отправьте боту @' + TGBot.botUsername + ' код <b>' + code + '</b>. Код действителен 10 минут.'
      : 'Отправьте боту код <b>' + code + '</b>. Код действителен 10 минут.'
  });
}));

// Шаг 2: проверка — бот подтвердил привязку? Обновляем state.me
app.post('/api/tg/unbind', requireAuth, ah(async (req, res) => {
  const info = await D.getTgByUserId(req.user.id);
  const username = info ? info.u : null;
  await D.unbindTg(req.user.id, username);
  await D.clearTgPending(req.user.id);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

/* ============ FORGOT PASSWORD via TG ============ */

// Шаг 1: пользователь вводит логин — генерируем код и отправляем в привязанный Telegram (если есть)
app.post('/api/forgot/request', ah(async (req, res) => {
  const login = String(req.body?.login || '').trim();
  if (!rateLimit('forgot:' + req.ip, 5, 10 * 60 * 1000)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  if (!login) return fail(res, 'Введите логин');

  const user = await D.getUserByLogin(login);
  const tgInfo = user ? await D.getTgByUserId(user.id) : null;
  // Всегда отвечаем одинаково — не раскрываем существование аккаунта
  if (!user || !tgInfo || !tgInfo.c || !TGBot.isEnabled()) {
    return send(res, 200, {
      ok: true,
      sent: false,
      message: 'Если аккаунт с таким логином существует и к нему привязан Telegram — код отправлен туда.'
    });
  }

  const code = genTgCode();
  await D.setTgReset(user.id, {
    code, uid: user.uid, login: user.login, exp: Date.now() + TG_CODE_TTL, confirmed: false
  });
  TGBot.registerResetCode(code, user.id, TG_CODE_TTL);

  const sent = await TGBot.sendTgCode(tgInfo.c,
    'Восстановление пароля HorusClient.\n\nВаш код: <b>' + code + '</b>\nВведите его на сайте вместе с новым паролем. Код действителен 10 минут.');
  if (!sent) {
    await D.clearTgReset(user.id);
  }

  send(res, 200, {
    ok: true,
    sent,
    message: sent
      ? 'Код отправлен в ваш Telegram.'
      : 'Если аккаунт с таким логином существует и к нему привязан Telegram — код отправлен туда.'
  });
}));

// Шаг 2: код из TG + новый пароль
app.post('/api/forgot/confirm', ah(async (req, res) => {
  const { login, code, password } = req.body || {};
  if (!rateLimit('forgotc:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  const cl = String(login || '').trim().toLowerCase();
  const cc = String(code || '').trim().toUpperCase();
  if (!cl || !cc) return fail(res, 'Введите логин и код из Telegram');
  if (!password || password.length < 8) return fail(res, 'Новый пароль должен быть длиннее 8 символов');

  const user = await D.getUserByLogin(cl);
  if (!user) return fail(res, 'Неверный код или аккаунт не найден', 400);
  const rec = await D.getTgReset(user.id);
  if (!rec || rec.code.toUpperCase() !== cc) return fail(res, 'Неверный код');
  if (rec.exp < Date.now()) {
    await D.clearTgReset(user.id);
    return fail(res, 'Код истёк. Запросите новый.');
  }

  await D.updateUserPass(user.id, await hashPassword(password));
  await D.clearTgReset(user.id);
  await D.deleteSessionsForUser(user.id);
  res.clearCookie('hs_session', { path: '/' });
  send(res, 200, { ok: true, message: 'Пароль изменён. Войдите с новым паролем.' });
}));

// Проверка: пользователь подтвердил сброс через бота (/reset) — открываем форму установки пароля
app.get('/api/forgot/status', ah(async (req, res) => {
  const uid = String(req.query?.u || '');
  const code = String(req.query?.c || '').trim().toUpperCase();
  if (!uid || !code) return fail(res, 'Некорректная ссылка', 400);
  const rec = await D.getTgResetByUid(uid);
  if (!rec || rec.code.toUpperCase() !== code || !rec.confirmed) return send(res, 200, { ok: true, valid: false });
  if (rec.exp < Date.now()) return send(res, 200, { ok: true, valid: false });
  send(res, 200, { ok: true, valid: true, login: rec.login, code });
}));

/* ============ HWID ============ */

app.post('/api/hwid/bind', requireAuth, ah(async (req, res) => {
  const hwid = String(req.body?.hwid || '').trim();
  if (!hwid || hwid.length > 64) return fail(res, 'Некорректный HWID');
  const fresh = !req.user.hwid; // новая привязка (впервые) или смена устройства
  if (req.user.hwid && req.user.hwid !== hwid) return fail(res, 'Устройство уже привязано. Сбросьте привязку в кабинете.');
  const taken = await D.hwidTaken(hwid, req.user.id);
  if (taken) return fail(res, 'Это устройство уже привязано к другому аккаунту');
  await D.bindHwid(req.user.id, hwid);

  // Если это новая привязка и у пользователя привязан Telegram — оповещаем + кнопка «Это не я»
  if (fresh && TGBot.isEnabled()) {
    const code = genTgCode();
    await D.setTgHwCancel(req.user.id, { hwid, code, exp: Date.now() + 10 * 60 * 1000 });
    await TGBot.sendHwidAlert(req.user.id, hwid, code);
  }

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

/* ---------------- скидочные промокоды ---------------- */

app.post('/api/discount/create', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  const discount = parseInt((req.body && req.body.discount) || '0', 10);
  let plans = req.body && req.body.plans;
  if (!Array.isArray(plans)) plans = [];
  plans = plans.filter(p => PLANS.some(x => x.key === p));
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return fail(res, 'Название: 3–32 символа (латиница, цифры, - _)');
  if (!(discount >= 1 && discount <= 99)) return fail(res, 'Скидка должна быть от 1 до 99%');
  if (!plans.length) return fail(res, 'Выберите хотя бы один тариф');
  if (await D.getDiscountPromoByCode(code)) return fail(res, 'Такой промокод уже существует');
  await D.insertDiscountPromo({ code, discount, plans: JSON.stringify(plans), created_by: req.user.login, uses: 0, created_at: now() });
  return send(res, 200, { ok: true, message: 'Промокод «' + code + '» создан' });
}));

app.get('/api/discount/list', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const codes = await D.listDiscountPromos();
  return send(res, 200, { ok: true, codes });
}));

app.post('/api/discount/delete', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const id = parseInt((req.body && req.body.id) || '0', 10);
  if (!id) return fail(res, 'Не указан id');
  await D.deleteDiscountPromo(id);
  return send(res, 200, { ok: true, message: 'Промокод удалён' });
}));

app.post('/api/discount/validate', requireAuth, ah(async (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  const planKey = String((req.body && req.body.plan) || '');
  if (!code) return fail(res, 'Введите промокод');
  const rec = await D.getDiscountPromoByCode(code);
  if (!rec) return fail(res, 'Промокод не найден');
  const plan = PLANS.find(p => p.key === planKey);
  if (!plan) return fail(res, 'Тариф не найден');
  let allowed = true;
  try { const list = JSON.parse(rec.plans || '[]'); if (list.length) allowed = list.includes(planKey); } catch (_) { allowed = true; }
  if (!allowed) return fail(res, 'Промокод не подходит для этого тарифа');
  const finalPrice = Math.max(1, Math.round(plan.price * (100 - Number(rec.discount)) / 100));
  return send(res, 200, { ok: true, discount: rec.discount, finalPrice });
}));

/* ---------------- кастомные оплаты (тестирование) ---------------- */

app.post('/api/custom/create', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const title = String((req.body && req.body.title) || '').trim();
  const amount = Number((req.body && req.body.amount) || 0);
  let gives = req.body && req.body.plans;
  if (!Array.isArray(gives)) gives = [];
  gives = gives.filter(p => PLANS.some(x => x.key === p));
  if (title.length < 2 || title.length > 100) return fail(res, 'Название: 2–100 символов');
  if (!(amount >= 1 && amount <= 1000000)) return fail(res, 'Сумма от 1 до 1 000 000 ₽');
  await D.insertCustomOffer({ title, amount, description: JSON.stringify(gives), created_by: req.user.login, created_at: now() });
  return send(res, 200, { ok: true, message: 'Позиция создана' });
}));

app.get('/api/custom/list', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const offers = await D.listCustomOffers();
  const paidRows = await D.listPaidCustomOrders();
  const paidMap = {};
  paidRows.forEach(r => { paidMap[r.plan] = (paidMap[r.plan] || 0) + 1; });
  return send(res, 200, { ok: true, offers: offers.map(o => ({ ...o, paid_count: paidMap['custom:' + o.id] || 0 })) });
}));

app.post('/api/custom/delete', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const id = parseInt((req.body && req.body.id) || '0', 10);
  if (!id) return fail(res, 'Не указан id');
  await D.deleteCustomOffer(id);
  return send(res, 200, { ok: true, message: 'Удалено' });
}));

app.get('/api/custom/get', ah(async (req, res) => {
  const id = parseInt(String((req.query && req.query.id) || '0'), 10);
  const offer = id ? await D.getCustomOfferById(id) : null;
  if (!offer) return fail(res, 'Позиция не найдена', 404);
  return send(res, 200, { ok: true, offer });
}));

app.post('/api/custom/pay', requireAuth, ah(async (req, res) => {
  const id = parseInt((req.body && req.body.id) || '0', 10);
  const offer = id ? await D.getCustomOfferById(id) : null;
  if (!offer) return fail(res, 'Позиция не найдена');
  if (!YK.enabled()) return fail(res, 'Онлайн-оплата временно недоступна (ЮKassa не настроена на сервере)');
  const order = await D.insertOrder({ user_id: req.user.id, plan: 'custom:' + offer.id, created_at: now(), amount: offer.amount });
  const payment = await YK.createPayment({
    amount: offer.amount,
    description: `Оплата: ${offer.title} — заказ #${order.id}`,
    returnUrl: YK_RETURN_URL,
    idemKey: 'custom-' + order.id,
    methodType: 'redirect',
    metadata: { orderId: String(order.id), userId: String(req.user.id), plan: 'custom:' + offer.id, provider: 'yookassa' }
  });
  await D.saveOrderPayment(order.id, payment.id);
  return send(res, 200, { ok: true, confirmationUrl: payment.confirmationUrl });
}));

app.post('/api/promo/redeem', requireAuth, ah(async (req, res) => {
  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!rateLimit('promo:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  if (!code) return fail(res, 'Введите промокод');
  const rec = await D.getPromoByCode(code);
  if (!rec) return fail(res, 'Промокод не найден');
  if (rec.used_count >= rec.max_uses) return fail(res, 'Промокод больше не действует');
  if (rec.plan === 'hwid_reset') {
    if (!req.user.hwid) return fail(res, 'Устройство ещё не привязано');
    await D.insertHwReset(req.user.id, now());
    await D.resetHwid(req.user.id, now());
    await D.bumpPromoUsed(rec.id, rec.used_count + 1);
    const user = await D.getUserById(req.user.id);
    return send(res, 200, { ok: true, user: await publicUser(user), message: 'Привязка HWID сброшена! Войдите в лаунчер заново.' });
  }
  await D.revokePromoSubs(req.user.id);
  const expires_at = rec.days > 0 ? new Date(Date.now() + rec.days * 86400000).toISOString() : null;
  await D.insertSub({ user_id: req.user.id, plan: rec.plan, status: 'active', source: 'promo', purchased_at: now(), expires_at });
  await D.bumpPromoUsed(rec.id, rec.used_count + 1);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user), message: 'Промокод активирован!' });
}));

/* ============ MODERATION (владелец Howill_) ============ */

function requireOwner(req, res) {
  if (req.user.login !== 'Howill_') {
    fail(res, 'Доступно только владельцу', 403);
    return false;
  }
  return true;
}

app.get('/api/admin/users', requireAuth, ah(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const [users, subs] = await Promise.all([D.listUsers(), D.listAllSubs()]);
  const byUser = new Map();
  for (const s of subs) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(s);
  }
  const out = users.map(u => {
    const list = byUser.get(u.id) || [];
    const sub = list.find(s => s.status === 'active') || list.find(s => s.status === 'frozen') || null;
    const plan = sub ? PLANS.find(p => p.key === sub.plan) : null;
    return {
      id: u.id,
      login: u.login,
      email: u.email,
      uid: u.uid,
      hwid: u.hwid || null,
      createdAt: u.created_at,
      subscription: sub ? {
        plan: sub.plan,
        name: plan ? plan.name : sub.plan,
        status: sub.status,
        source: sub.source,
        forever: !!sub.expires_at ? false : true,
        expiresAt: sub.expires_at,
        purchasedAt: sub.purchased_at
      } : null
    };
  });
  send(res, 200, { ok: true, users: out });
}));

app.post('/api/admin/freeze', requireAuth, ah(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const userId = Number(req.body?.userId);
  const action = String(req.body?.action || '');
  if (!Number.isInteger(userId) || userId <= 0) return fail(res, 'Некорректный пользователь');
  const target = await D.getUserById(userId);
  if (!target) return fail(res, 'Пользователь не найден');
  if (action === 'freeze') {
    await D.freezeSub(userId);
    if (TGBot.isEnabled()) {
      await TGBot.sendTgToUser(userId, '⛔️ Ваша подписка была <b>заморожена</b> администратором. Доступ временно приостановлен.');
    }
    send(res, 200, { ok: true, message: 'Подписка @' + target.login + ' заморожена' });
  } else if (action === 'unfreeze') {
    const ok = await D.unfreezeSub(userId);
    if (!ok) return fail(res, 'У пользователя нет замороженной подписки');
    if (TGBot.isEnabled()) {
      await TGBot.sendTgToUser(userId, '✅ Ваша подписка <b>разморожена</b>. Доступ восстановлен!');
    }
    send(res, 200, { ok: true, message: 'Подписка @' + target.login + ' разморожена' });
  } else {
    fail(res, 'Некорректное действие');
  }
}));

/* ============ SHOP ============ */

app.get('/api/plans', ah(async (req, res) => {
  const cfg = Object.fromEntries((await D.getAllCfg()).map(r => [r.key, r.value]));
  send(res, 200, { ok: true, plans: PLANS, purchaseNote: cfg.purchase_note || '' });
}));

app.post('/api/purchase', requireAuth, ah(async (req, res) => {
  const plan = String(req.body?.plan || '');
  const p = PLANS.find(x => x.key === plan);
  if (!p) return fail(res, 'Неизвестный тариф');
  if (p.requires) {
    const subs = await D.getSubs(req.user.id);
    const reqPlan = p.requires;
    const hasReq = subs.some(s => s.plan === reqPlan && s.status === 'active'
      && (!p.requiresForever || !s.expires_at));
    if (!hasReq) return fail(res, 'Для покупки «' + p.name + '» нужен активный тариф «'
      + (PLANS.find(x => x.key === reqPlan)?.name || reqPlan) + '» ' + (p.requiresForever ? '(навсегда)' : ''));
  }
  const order = await D.insertOrder({ user_id: req.user.id, plan, created_at: now() });
  const cfgNote = await D.getCfg('purchase_note');
  send(res, 200, { ok: true, orderId: order.id, message: cfgNote || '' });
}));

/* ---------------- Покупка через ЮKassa (карты / СБП / СБП T-Pay) ---------------- */

const YK = require('./yookassa');
const YK_RETURN_URL = (process.env.SITE_ORIGIN || '') + '/cabinet?paid=1';

// Создать платёж в ЮKassa и вернуть confirmation_url для редиректа
app.post('/api/purchase/yookassa', requireAuth, ah(async (req, res) => {
  const { plan: planKey, methodType } = req.body || {};
  const plan = PLANS.find(p => p.key === planKey);
  if (!plan) return fail(res, 'Неизвестный тариф');
  if (!YK.enabled()) return fail(res, 'Онлайн-оплата временно недоступна (ЮKassa не настроена на сервере)');

  // Докупка: Alpha продаётся только владельцам Kamiki (навсегда)
  if (plan.requires) {
    const subs = await D.getSubs(req.user.id);
    const reqPlan = plan.requires;
    const hasReq = subs.some(s => s.plan === reqPlan && s.status === 'active'
      && (!plan.requiresForever || !s.expires_at));
    if (!hasReq) return fail(res, 'Для покупки «' + plan.name + '» нужен активный тариф «'
      + (PLANS.find(x => x.key === reqPlan)?.name || reqPlan) + '» ' + (plan.requiresForever ? '(навсегда)' : ''));
  }

  // Скидочный промокод
  let promoCode = null;
  let finalAmount = plan.price;
  const rawPromo = String((req.body && req.body.promo) || '').trim().toUpperCase();
  if (rawPromo) {
    const rec = await D.getDiscountPromoByCode(rawPromo);
    if (!rec) return fail(res, 'Промокод не найден');
    let allowed = true;
    try { const list = JSON.parse(rec.plans || '[]'); if (list.length) allowed = list.includes(planKey); } catch (_) { allowed = true; }
    if (!allowed) return fail(res, 'Промокод не подходит для этого тарифа');
    finalAmount = Math.max(1, Math.round(plan.price * (100 - Number(rec.discount)) / 100));
    promoCode = rec.code;
  }

  const order = await D.insertOrder({ user_id: req.user.id, plan: planKey, created_at: now(), promo_code: promoCode, amount: finalAmount });
  const idem = crypto.randomUUID();
  const createdAt = now();

  // Идемпотентность: связываем платёж с нашим заказом через метод-данные и метаданные
  const payment = await YK.createPayment({
    amount: finalAmount,
    description: `Подписка «${plan.name}»${plan.forever ? ' навсегда' : ''} — заказ #${order.id}`,
    returnUrl: YK_RETURN_URL,
    idem,
    methodType,
    metadata: {
      orderId: String(order.id),
      userId: String(req.user.id),
      plan: planKey,
      provider: 'yookassa'
    }
  });

  await D.saveOrderPayment(order.id, payment.id);
  send(res, 200, { ok: true, orderId: order.id, paymentId: payment.id, confirmationUrl: payment.confirmationUrl });
}));

// Вебхук ЮKassa: автовыдача подписки после успешной оплаты.
// Подлинность уведомления не полагается на HTTP-подпись: статус ПЕРЕПРОВЕРЯЕТСЯ
// через API ЮKassa (GET /payments/{id}) — подделать уведомление нельзя.
app.post('/api/yookassa/webhook', async (req, res) => {
  const body = req.body || {};
  const event = body.event;
  const obj = body.object;
  if (!event || !obj || !obj.id) return send(res, 200, { ok: false, code: 'bad_payload' });
  if (event !== 'payment.succeeded') return send(res, 200, { ok: true, ignored: event });

  try {
    // 1) Перепроверка статуса у ЮKassa
    const remote = await YK.getPayment(obj.id);
    if (remote.status !== 'succeeded' || !remote.paid) {
      return send(res, 200, { ok: false, code: 'not_succeeded' });
    }

    const meta = remote.metadata || {};
    const orderId = Number(meta.orderId || 0);
    const planKey = meta.plan;
    const userId = Number(meta.userId || 0);
    if (!orderId || !planKey || !userId) return send(res, 200, { ok: false, code: 'no_metadata' });

    const plan = PLANS.find(p => p.key === planKey);
    if (!plan) {
      if (String(planKey).startsWith('custom:')) {
        const customOrder = await D.getOrderById(orderId);
        if (customOrder && customOrder.status === 'pending') {
          await D.setOrderPaid(orderId, now(), 'yookassa');
        }
        return send(res, 200, { ok: true, custom: true });
      }
      return send(res, 200, { ok: false, code: 'unknown_plan' });
    }

    // 2) Сверка суммы (защита от подмены цены)
    const want = String(Number(order.amount ?? plan.price)) + '.00';
    const got = remote.amount && remote.amount.value;
    if (got !== want) return send(res, 200, { ok: false, code: 'amount_mismatch', want, got });

    // 3) Идемпотентность: выдаём подписку ровно один раз на заказ
    const order = await D.getOrderById(orderId);
    if (!order) return send(res, 200, { ok: false, code: 'no_order' });
    if (order.status !== 'pending') {
      return send(res, 200, { ok: true, already: true }); // уже выдана или отменена
    }

    const nowIso = now();
    const expires_at = plan.forever ? null : new Date(Date.now() + plan.days * 86400000).toISOString();
    await D.insertSub({
      user_id: userId,
      plan: planKey,
      status: 'active',
      source: 'yookassa',
      purchased_at: nowIso,
      expires_at
    });
    if (order.promo_code) { try { await D.bumpDiscountPromoByCode(order.promo_code); } catch (_) {} }
      await D.setOrderPaid(orderId, nowIso, 'yookassa');

    console.log(`[YK] подписка выдана: user=${userId} plan=${planKey} order=${orderId}`);
    send(res, 200, { ok: true, activated: true });
  } catch (e) {
    console.error('[YK] webhook error', e);
    return send(res, 200, { ok: false, code: 'server_error' });
  }
});

// Статус заказа (для return_url и кнопки «Уже оплатил»)
app.get('/api/purchase/status', requireAuth, ah(async (req, res) => {
  const orderId = Number(req.query.orderId || 0);
  if (!orderId) return fail(res, 'Не передан orderId');
  const order = await D.getOrderById(orderId);
  if (!order || order.user_id !== req.user.id) return fail(res, 'Заказ не найден');
  send(res, 200, { ok: true, status: order.status, paidAt: order.paid_at || null, plan: order.plan });
}));

const TICKET_TYPES = { support: 'Поддержка', idea: 'Предложить идею', bug: 'Сообщить о баге' };

app.post('/api/support', requireAuth, ah(async (req, res) => {
  const { type, subject, message } = req.body || {};
  if (!TICKET_TYPES[type]) return fail(res, 'Неизвестный тип обращения');
  if (!subject || subject.length > 100) return fail(res, 'Тема: 1-100 символов');
  if (!message || message.length < 10 || message.length > 2000) return fail(res, 'Сообщение: 10-2000 символов');
  const ticket = await D.insertTicket({ user_id: req.user.id, type, subject, message, created_at: now() });

  // Уведомляем владельца в Telegram
  if (TGBot.isEnabled()) {
    TGBot.sendTgToOwner(
      '📩 Новое обращение #' + ticket.id + ' («' + TICKET_TYPES[type] + '»)\n' +
      'От: <b>@' + req.user.login + '</b> (UID ' + req.user.uid + ')\n' +
      'Тема: <b>' + subject.slice(0, 120) + '</b>\n\n' +
      message.slice(0, 500)
    ).catch(() => {});
  }

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
  const manualDiscord = Number(cfg.discord_members || 0);
  send(res, 200, {
    ok: true,
    discord: { url: cfg.discord_url, members: manualDiscord > 0 ? manualDiscord : (liveDiscord ?? 0) },
    telegram: { url: cfg.telegram_url, members: Number(cfg.telegram_members || 0) }
  });
}));

/* ============ LAUNCHER ============ */

// Последняя версия лаунчера/клиента — публично (без подписки), чтобы можно было
// проверить обновление ДО входа в аккаунт. Значения хранятся в site_cfg.
app.get('/api/launcher/latest', ah(async (req, res) => {
  const cfg = Object.fromEntries((await D.getAllCfg()).map(r => [r.key, r.value]));
  send(res, 200, {
    ok: true,
    version: cfg.launcher_version || '1.0.0',
    url: '#download',
    gameVersion: cfg.game_version || '1.21.4',
    build: 'stable'
  });
}));

// Объявления для лаунчера (лента новостей в шапке приложения)
app.get('/api/announce', ah(async (req, res) => {
  const raw = await D.getCfg('announce');
  let items = [];
  try { items = raw ? JSON.parse(raw) : []; } catch { items = []; }
  send(res, 200, { ok: true, items: Array.isArray(items) ? items : [] });
}));

// Владелец задаёт версии и объявления: { announceText?, launcherVersion?, gameVersion? }
app.post('/api/admin/launcher-meta', requireAuth, ah(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const body = req.body || {};
  if (body.announceText !== undefined) {
    const text = String(body.announceText).trim().slice(0, 1000);
    const items = text ? [{ id: Date.now(), text, date: now() }] : [];
    await D.setCfg('announce', JSON.stringify(items));
  }
  if (body.launcherVersion !== undefined) await D.setCfg('launcher_version', String(body.launcherVersion).trim() || '1.0.0');
  if (body.gameVersion !== undefined) await D.setCfg('game_version', String(body.gameVersion).trim() || '1.21.4');
  send(res, 200, { ok: true });
}));

// Онлайн-статус лаунчеров. Лаунчер шлёт heartbeat раз в минуту (см. ниже).
const launcherSeen = new Map(); // userId -> lastSeenMs
const LAUNCHER_ONLINE_TTL = 3 * 60 * 1000; // считаем онлайн 3 минуты

// Heartbeat от лаунчера — пока он запущен и вы залогинены
app.post('/api/launcher/heartbeat', requireAuth, (req, res) => {
  launcherSeen.set(req.user.id, Date.now());
  send(res, 200, { ok: true });
});

// Публичный статус: сколько лаунчеров сейчас онлайн
app.get('/api/launcher/status', (req, res) => {
  const nowT = Date.now();
  for (const [id, ts] of launcherSeen) {
    if (nowT - ts > LAUNCHER_ONLINE_TTL) launcherSeen.delete(id);
  }
  send(res, 200, { ok: true, online: launcherSeen.size });
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
    TGBot.start();
  });
}

module.exports = app;