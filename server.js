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

app.use(express.json({ limit: '15mb' }));
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
    desc: ['Докупка к Kamiki 1.21.4', 'Ранние обновления', 'Сброс HWID раз в месяц', 'Приоритетная поддержка', 'Кастомизация профиля'] },
  { key: 'tester', name: 'Набор Тестера', tag: 'Набор · 30 дней', price: 129, currency: '₽', forever: false, days: 30, pack: true,
    badge: '10% выгоды',
    includes: ['kamiki30', 'hwid_reset'], discordRole: 'Пакет Тестер',
    desc: ['Kamiki 1.21.4 на 30 дней', 'Бесплатный сброс HWID x1', 'Роль в Discord «Пакет Тестер»'] },
  { key: 'hwid_reset', name: 'Сброс HWID', tag: 'Услуга', price: 100, currency: '₽', forever: false,
    cta: 'Купить сброс',
    desc: ['Разовое снятие привязки к устройству', 'Новый HWID можно привязать сразу'] }
];

/* Товары магазина (раздел «Магазин»). Ключи оплаты: shop:<key> */
const SHOP_ITEMS = [
  { key: 'ava_deco', kind: 'deco', cat: 'Украшение аватарки', name: 'Золотой Ореол', price: 99, currency: '₽', forever: true,
    desc: ['Золотой переливающийся ободок с короной ♛', 'Видно в профиле, кабинете и сайдбаре', 'Навсегда, один раз на аккаунт'] },
  { key: 'ava_ice', kind: 'deco', cat: 'Украшение аватарки', name: 'Сапфировый Ореол', price: 149, currency: '₽', forever: true,
    desc: ['Ледяной сияющий ободок с искрой ❄', 'Видно в профиле, кабинете и сайдбаре', 'Навсегда, один раз на аккаунт'] },
  { key: 'ava_white', kind: 'deco', cat: 'Украшение аватарки', name: 'Белый Ореол', price: 129, currency: '₽', forever: true,
    desc: ['Белоснежный сияющий ободок ✦', 'Видно в профиле, кабинете и сайдбаре', 'Навсегда, один раз на аккаунт'] },
  { key: 'lc_magma', kind: 'login_color', cat: 'Цвет логина', name: 'Магма', price: 49, currency: '₽', forever: true,
    desc: ['Огненно-оранжевое свечение логина', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'lc_volt', kind: 'login_color', cat: 'Цвет логина', name: 'Электро', price: 49, currency: '₽', forever: true,
    desc: ['Сине-фиолетовый неоновый градиент', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'lc_emerald', kind: 'login_color', cat: 'Цвет логина', name: 'Изумруд', price: 49, currency: '₽', forever: true,
    desc: ['Зелёно-бирюзовое свечение', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'lc_kings', kind: 'login_color', cat: 'Цвет логина', name: 'Королевский', price: 49, currency: '₽', forever: true,
    desc: ['Золотисто-розовый дворцовый градиент', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'lc_aurora', kind: 'login_color', cat: 'Цвет логина', name: 'Аврора', price: 49, currency: '₽', forever: true,
    desc: ['Радужный перелив всех цветов', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'lc_white', kind: 'login_color', cat: 'Цвет логина', name: 'Белый', price: 49, currency: '₽', forever: true,
    desc: ['Белоснежный серебристый перелив', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'rc_white', kind: 'role_color', cat: 'Цвет роли', name: 'Белый', price: 24, currency: '₽', forever: true,
    desc: ['Белый перелив с ноткой чёрного', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'rc_red', kind: 'role_color', cat: 'Цвет роли', name: 'Красный', price: 24, currency: '₽', forever: true,
    desc: ['Алый с белым бликом', 'Переливающийся градиент', 'Навсегда'] },
  { key: 'rc_blue', kind: 'role_color', cat: 'Цвет роли', name: 'Синий', price: 24, currency: '₽', forever: true,
    desc: ['Синий перелив с фиолетовым', 'Переливающийся градиент', 'Навсегда'] }
];

async function publicUser(u) {
  const subs = await D.getSubs(u.id);
  const active = subs.find(s => s.status === 'active') || subs.find(s => s.status === 'frozen') || null;
  const planKey = active ? active.plan : null;
  const plan = PLANS.find(p => p.key === planKey) || null;
  const lastReset = await D.getLastHwReset(u.id);
  const tgInfo = await D.getTgByUserId(u.id);
  const decos = {};
  for (const it of SHOP_ITEMS) decos[it.key] = await D.getDeco(u.id, it.key);
  return {
    id: u.id,
    login: u.login,
    uid: u.uid,
    email: u.email,
    avatar: u.avatar || null,
    banner: u.banner || null,
    hwid: u.hwid || null,
    hwidBound: !!u.hwid,
    tg: tgInfo ? tgInfo.u : null,
    tg2fa: tgInfo ? !!tgInfo.fa : false,
    tgBound: tgInfo ? !!tgInfo.c : false,
    createdAt: u.created_at,
    lastHwidReset: lastReset ? lastReset.reset_at : null,
    canResetHwid: planKey === 'alpha' && active != null && active.status === 'active',
    hasAlpha: subs.some(s => s.plan === 'alpha' && s.status === 'active'),
    glossy: await D.getGlossy(u.id),
    glossyAllowed: subs.some(s => s.plan === 'alpha' && s.status === 'active'),
    theme: await D.getTheme(u.id),
    avaDeco: !!decos['ava_deco'],
    decos,
    decoActive: (await D.getActiveDeco(u.id)) || null,
    loginColor: await D.getLoginColor(u.id),
    roleColor: await D.getRoleColor(u.id),
    role: await D.getUserRole(u.id),
    subscription: plan ? {
      plan: plan.key,
      name: plan.name,
      tag: active.expires_at
        ? (() => {
            const days = Math.max(1, Math.ceil((Date.parse(active.expires_at) - Date.now()) / 86400000));
            return days === 1 ? 'остался 1 день' : 'ещё ' + days + ' дн.';
          })()
        : 'Навсегда',
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
    invalidateGlobkaCaches();
    send(res, 200, { ok: true, user: await publicUser(user) });
  } catch (e) {
    console.error('[register]', e);
    send(res, 500, { ok: false, error: 'Ошибка регистрации' });
  }
}));

const TG_2FA = new Map(); // token -> { userId, code, exp }

app.post('/api/login', ah(async (req, res) => {
  const { login, password } = req.body || {};
  if (!rateLimit('login:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  if (!login || !password) return fail(res, 'Введите логин и пароль');

  const user = await D.getUserByLogin(login) || await D.getUserByEmail(login);
  if (!user || !(await verifyPassword(password, user.pass_hash))) {
    return fail(res, 'Неверный логин или пароль', 401);
  }
  // 2FA через Telegram
  try {
    const bind = await D.getTgByUserId(user.id);
    const isLauncher = /^HorusLauncher\//.test(String(req.get('user-agent') || ''));
    if (bind && bind.c && bind.fa && !isLauncher) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const token = Date.now().toString(36) + Math.random().toString(36).slice(2);
      for (const [k, v] of TG_2FA) if (v.exp < Date.now()) TG_2FA.delete(k);
      TG_2FA.set(token, { userId: user.id, code, exp: Date.now() + 5 * 60 * 1000 });
      const sent = await TGBot.sendTgToUser(user.id, '\uD83D\uDD11 <b>\u041A\u043E\u0434 \u0432\u0445\u043E\u0434\u0430 HorusClient:</b> <b>' + code + '</b>\n\u041A\u043E\u0434 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442 5 \u043C\u0438\u043D\u0443\u0442. \u0415\u0441\u043B\u0438 \u044D\u0442\u043E \u043D\u0435 \u0432\u044B \u2014 \u0441\u0440\u043E\u0447\u043D\u043E \u0441\u043C\u0435\u043D\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C.');
      if (!sent) return fail(res, '2FA: не удалось отправить код в Telegram. Попробуйте позже.', 503);
      return send(res, 200, { ok: true, need2fa: true, token });
    }
  } catch (_) { /* TG недоступен — не блокируем вход */ }

  await setSession(req, res, user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

app.post('/api/login/2fa', ah(async (req, res) => {
  const token = String((req.body && req.body.token) || '');
  const code = String((req.body && req.body.code) || '').trim();
  const rec = TG_2FA.get(token);
  if (!rec) return fail(res, 'Сессия входа истекла. Войдите заново.', 401);
  if (rec.exp < Date.now()) { TG_2FA.delete(token); return fail(res, 'Код истёк. Войдите заново.', 401); }
  if (code !== rec.code) return fail(res, 'Неверный код', 401);
  TG_2FA.delete(token);
  const user = await D.getUserById(rec.userId);
  if (!user) return fail(res, 'Аккаунт не найден', 401);
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
app.post('/api/tg/2fa', requireAuth, ah(async (req, res) => {
  const bind = await D.getTgByUserId(req.user.id);
  if (!bind || !bind.c) return fail(res, 'Сначала привяжите и подтвердите Telegram');
  await D.setTg2fa(req.user.id, !!(req.body && req.body.enabled));
  return send(res, 200, { ok: true, message: (req.body && req.body.enabled) ? '2FA включена. При входе нужен код из Telegram.' : '2FA выключена' });
}));

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
  const rows = await D.listCustomOrderStatuses();
  const statMap = {};
  rows.forEach(r => {
    if (!statMap[r.plan]) statMap[r.plan] = { paid: 0, refunded: 0, canceled: 0 };
    if (r.status === 'paid') statMap[r.plan].paid++;
    else if (r.status === 'refunded') statMap[r.plan].refunded++;
    else if (r.status === 'canceled') statMap[r.plan].canceled++;
  });
  return send(res, 200, { ok: true, offers: offers.map(o => ({ ...o, stats: statMap['custom:' + o.id] || { paid: 0, refunded: 0, canceled: 0 } })) });
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

/* ---------------- операции (заказы) ---------------- */

app.get('/api/orders/list', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Недоступно', 403);
  const orders = await D.listRecentOrders(200);
  const users = await D.getUsersByIds(orders.map(o => o.user_id));
  const umap = {};
  users.forEach(u => { umap[u.id] = u; });
  const offers = await D.listCustomOffers();
  const omap = {};
  offers.forEach(o => { omap[o.id] = o.title; });
  const items = orders.map(o => {
    const isCustom = String(o.plan).startsWith('custom:');
    const plan = isCustom ? null : PLANS.find(p => p.key === o.plan);
    const what = isCustom
      ? (omap[Number(String(o.plan).split(':')[1])] || 'Кастомная позиция')
      : (plan ? plan.name + (plan.forever ? ' Навсегда' : plan.days ? ' ' + plan.days + ' дн' : '') : o.plan);
    const amount = o.amount != null ? o.amount : (plan ? plan.price : null);
    return {
      id: o.id, status: o.status, what, amount,
      provider: o.provider || null,
      currency: (plan && plan.currency) || '₽',
      created_at: o.created_at,
      login: (umap[o.user_id] && umap[o.user_id].login) || '—',
      email: (umap[o.user_id] && umap[o.user_id].email) || '—',
    };
  });
  return send(res, 200, { ok: true, orders: items });
}));

/* ---------------- оформление профиля (аватар/баннер) ---------------- */

app.post('/api/profile/image', requireAuth, ah(async (req, res) => {
  const kind = String((req.body && req.body.kind) || '');
  const data = String((req.body && req.body.data) || '');
  if (kind !== 'avatar' && kind !== 'banner') return fail(res, 'Неизвестный тип изображения');
  const isGif = /^data:image\/gif;base64,[A-Za-z0-9+/=]+$/.test(data);
  if (!isGif && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return fail(res, 'Нужна картинка PNG/JPEG/WebP');
  if (isGif) {
    const subs = await D.getSubs(req.user.id);
    const hasAlpha = subs.some(s => s.plan === 'alpha' && s.status === 'active');
    if (!hasAlpha) return fail(res, 'GIF доступен только владельцам Alpha 1.21.4');
    if (data.length > 11000000) return fail(res, 'GIF слишком большой, максимум ~8 МБ');
  } else if (data.length > 600000) {
    return fail(res, 'Картинка слишком большая, попробуй другую');
  }
  if (kind === 'avatar') await D.setUserAvatar(req.user.id, data);
  else await D.setUserBanner(req.user.id, data);
  return send(res, 200, { ok: true, message: kind === 'avatar' ? 'Аватар обновлён' : 'Баннер обновлён' });
}));

// Глянцевый профиль — только с активной подпиской Alpha 1.21.4
app.post('/api/profile/glossy', requireAuth, ah(async (req, res) => {
  const enabled = !!(req.body && req.body.enabled);
  const subs = await D.getSubs(req.user.id);
  const hasAlpha = subs.some(s => s.plan === 'alpha' && s.status === 'active');
  if (!hasAlpha) return fail(res, 'Глянцевый профиль доступен только с подпиской Alpha 1.21.4', 403);
  await D.setGlossy(req.user.id, enabled);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
}));

// Цвет темы сайта — только с активной подпиской Alpha 1.21.4
app.post('/api/profile/theme', requireAuth, ah(async (req, res) => {
  const subs = await D.getSubs(req.user.id);
  const hasAlpha = subs.some(s => s.plan === 'alpha' && s.status === 'active');
  if (!hasAlpha) return fail(res, 'Изменение темы доступно только с подпиской Alpha 1.21.4', 403);
  const allowed = ['violet', 'red', 'blue', 'emerald', 'gold', 'cyan', 'pink'];
  const key = allowed.includes(String((req.body && req.body.key) || '')) ? String(req.body.key) : null;
  await D.setTheme(req.user.id, key);
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user) });
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

// Магазин: список товаров, что куплено и что активно (опционально ?for=<login> — чужое состояние, только владельцу)
app.get('/api/shop', requireAuth, ah(async (req, res) => {
  let forId = req.user.id;
  let forLogin = null;
  if (req.query.for) {
    if (req.user.login !== 'Howill_') return send(res, 403, { ok: false, message: 'Доступ только для владельца' });
    const t = await D.getUserByLogin(String(req.query.for).trim());
    if (!t) return send(res, 400, { ok: false, message: 'Пользователь с таким логином не найден' });
    forId = t.id;
    forLogin = t.login;
  }
  const owned = {};
  const activeDeco = await D.getActiveDeco(forId);
  const activeColor = await D.getLoginColor(forId);
  const activeRole = await D.getRoleColor(forId);
  for (const it of SHOP_ITEMS) {
    owned[it.key] = (await D.getDeco(forId, it.key))
      || (it.kind === 'login_color' ? activeColor === it.key
        : it.kind === 'role_color' ? activeRole === it.key
        : false);
  }
  send(res, 200, { ok: true, items: SHOP_ITEMS, owned, activeDeco, activeColor, activeRole, forLogin });
}));

// Использовать / убрать украшение, цвет логина или цвет роли (включает только если куплено)
app.post('/api/shop/use', requireAuth, ah(async (req, res) => {
  const { key, on } = req.body || {};
  const item = SHOP_ITEMS.find(i => i.key === key);
  if (!item) return send(res, 400, { ok: false, message: 'Товар не найден' });
  const owned = (await D.getDeco(req.user.id, key))
    || (item.kind === 'login_color' && (await D.getLoginColor(req.user.id)) === key)
    || (item.kind === 'role_color' && (await D.getRoleColor(req.user.id)) === key);
  if (!owned) return send(res, 403, { ok: false, message: 'Украшение не куплено' });
  const onState = on !== false;
  if (item.kind === 'login_color') {
    await D.setLoginColor(req.user.id, onState ? key : null);
  } else if (item.kind === 'role_color') {
    await D.setRoleColor(req.user.id, onState ? key : null);
  } else {
    await D.setActiveDeco(req.user.id, onState ? key : null);
  }
  invalidateGlobkaCaches();
  const my = await publicUser(req.user);
  send(res, 200, { ok: true, user: my,
    activeDeco: await D.getActiveDeco(req.user.id),
    activeColor: await D.getLoginColor(req.user.id),
    activeRole: await D.getRoleColor(req.user.id) });
}));

// Выдача украшений (только для Howill_)
app.post('/api/shop/grant', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return send(res, 403, { ok: false, message: 'Доступ только для владельца' });
  const { key, target } = req.body || {};
  const item = SHOP_ITEMS.find(i => i.key === key);
  if (!item) return send(res, 400, { ok: false, message: 'Товар не найден' });
  let targetId = req.user.id;
  if (target && String(target).trim()) {
    const t = await D.getUserByLogin(String(target).trim());
    if (!t) return send(res, 400, { ok: false, message: 'Пользователь с таким логином не найден' });
    targetId = t.id;
  }
  if (item.kind === 'login_color') {
    await D.setDeco(targetId, item.key);
    await D.setLoginColor(targetId, item.key);
  } else if (item.kind === 'role_color') {
    await D.setDeco(targetId, item.key);
    await D.setRoleColor(targetId, item.key);
  } else {
    await D.setDeco(targetId, item.key);
  }
  invalidateGlobkaCaches();
  send(res, 200, { ok: true, item: item.key });
}));

// Модерация: выдача/снятие ролей (только для Howill_)
app.post('/api/admin/role', requireAuth, ah(async (req, res) => {
  if (!requireOwner(req, res)) return;
  const { login, role } = req.body || {};
  const target = await D.getUserByLogin(String(login || '').trim());
  if (!target) return fail(res, 'Пользователь не найден');
  const allowed = ['', 'mod', 'media', 'admin'];
  const val = allowed.includes(String(role)) ? String(role) : '';
  await D.setUserRole(target.id, val);
  invalidateGlobkaCaches();
  const label = val === 'admin' ? 'Администратор' : val === 'mod' ? 'Модератор' : val === 'media' ? 'Медиа' : 'снята';
  send(res, 200, { ok: true, login: target.login, role: val, message: `Роль ${label} — @${target.login}` });
}));

/* ============ МЕДИЙКА: баллы и мини-магазин ============ */

const MEDIA_ITEMS = [
  { key: 'kamiki30', name: 'Kamiki 1.21.4 · 30 дней', cost: 5, plan: 'kamiki30', forever: false, days: 30 },
  { key: 'kamiki365', name: 'Kamiki 1.21.4 · 365 дней', cost: 12, plan: 'kamiki365', forever: false, days: 365 },
  { key: 'kamiki', name: 'Kamiki 1.21.4 · Навсегда', cost: 15, plan: 'kamiki', forever: true },
  { key: 'alpha', name: 'Alpha 1.21.4 · Навсегда', cost: 30, plan: 'alpha', forever: true },
  { key: 'hwid_reset', name: 'Сброс HWID', cost: 3, plan: 'hwid_reset' }
];

const MEDIA_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

async function genInvKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 200; i++) {
    let s = '';
    for (let j = 0; j < 10; j++) s += chars[crypto.randomInt(chars.length)];
    const code = 'HORUS-INV-' + s;
    if (!(await D.getInvKey(code))) return code;
  }
  return 'HORUS-INV-' + Array.from({ length: 10 }, () => chars[crypto.randomInt(chars.length)]).join('');
}

async function requireMedia(req, res) {
  const role = await D.getUserRole(req.user.id);
  if (req.user.login !== 'Howill_' && role !== 'media' && role !== 'admin') {
    fail(res, 'Доступно только ролям Медиа и Администратор', 403);
    return false;
  }
  return true;
}

// Состояние Медийки: баллы и список товаров с персональным кулдауном
app.get('/api/media/state', requireAuth, ah(async (req, res) => {
  if (!(await requireMedia(req, res))) return;
  const points = await D.getMediaPoints(req.user.id);
  const items = [];
  for (const it of MEDIA_ITEMS) {
    const cdIso = await D.getMediaItemCd(req.user.id, it.key);
    let cdLeft = 0;
    if (cdIso) {
      const left = MEDIA_COOLDOWN_MS - (Date.now() - new Date(cdIso).getTime());
      if (left > 0) cdLeft = Math.ceil(left / 1000);
    }
    items.push({ ...it, cdLeft });
  }
  const lastBuy = await D.getMediaLastBuy(req.user.id);
  let cooldownLeft = 0;
  if (lastBuy) {
    const left = MEDIA_COOLDOWN_MS - (Date.now() - new Date(lastBuy).getTime());
    if (left > 0) cooldownLeft = Math.ceil(left / 1000);
  }
  send(res, 200, { ok: true, points, cooldownLeft, items, canGrant: req.user.login === 'Howill_' });
}));

// Выдача баллов (только Howill_)
app.post('/api/media/grant', requireAuth, ah(async (req, res) => {
  if (req.user.login !== 'Howill_') return fail(res, 'Баллы может выдавать только владелец', 403);
  const { login, amount } = req.body || {};
  const target = await D.getUserByLogin(String(login || '').trim());
  if (!target) return fail(res, 'Пользователь не найден');
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt < 1 || amt > 1000000) return fail(res, 'Некорректное количество баллов');
  const cur = await D.getMediaPoints(target.id);
  await D.setMediaPoints(target.id, cur + amt);
  send(res, 200, { ok: true, message: `@${target.login}: выдано ${amt} баллов (баланс ${cur + amt})` });
}));

// Покупка подарка любому игроку по логину (Медиа / Админ / владелец)
app.post('/api/media/buy', requireAuth, ah(async (req, res) => {
  if (!(await requireMedia(req, res))) return;
  const { login, itemKey } = req.body || {};
  const item = MEDIA_ITEMS.find(i => i.key === itemKey);
  if (!item) return fail(res, 'Товар не найден');
  const target = await D.getUserByLogin(String(login || '').trim());
  if (!target) return fail(res, 'Пользователь не найден');

  const points = await D.getMediaPoints(req.user.id);
  if (points < item.cost) return fail(res, `Недостаточно баллов (нужно ${item.cost})`);

  // Кулдаун вешается на конкретный товар, а не на все сразу
  const itemCd = await D.getMediaItemCd(req.user.id, item.key);
  if (itemCd) {
    const left = MEDIA_COOLDOWN_MS - (Date.now() - new Date(itemCd).getTime());
    if (left > 0) {
      const hms = Math.floor(left / 1000);
      const h = Math.floor(hms / 3600);
      const m = Math.floor((hms % 3600) / 60);
      return fail(res, `Кулдаун на «${item.name}»: ещё ${h} ч ${m} мин`);
    }
  }

  await D.setMediaPoints(req.user.id, points - item.cost);
  await D.setMediaLastBuy(req.user.id, now());
  await D.setMediaItemCd(req.user.id, item.key, now());

  // Предмет ложится в инвентарь игрока — он сам его применит или превратит в ключ
  await D.addInvItem(target.id, {
    id: randomToken(12),
    itemKey: item.plan,
    name: item.name,
    created_at: now(),
    status: 'item',
    code: null
  });

  invalidateGlobkaCaches();
  if (TGBot.isEnabled()) {
    TGBot.sendTgToOwner(
      '🎁 Медийка: ' + item.name +
      ' → в инвентарь @' + target.login + '\nВыдал: @' + req.user.login + ' (баллов осталось: ' + (points - item.cost) + ')'
    ).catch(() => {});
  }
  send(res, 200, { ok: true, message: `${item.name} → инвентарь @${target.login}`, points: points - item.cost });
}));

/* ============ ИНВЕНТАРЬ: предметы из Медийки ============ */

// Предметы текущего пользователя
app.get('/api/inventory', requireAuth, ah(async (req, res) => {
  const items = await D.getInventory(req.user.id);
  send(res, 200, { ok: true, items: items.slice().reverse() });
}));

// Применить предмет к своему аккаунту (своему)
app.post('/api/inventory/apply', requireAuth, ah(async (req, res) => {
  const id = String((req.body && req.body.id) || '');
  const items = await D.getInventory(req.user.id);
  const item = items.find(i => String(i.id) === String(id) && i.status === 'item');
  if (!item) return fail(res, 'Предмет не найден');
  try { await applyInvItem(req.user.id, item); } catch (e) { return fail(res, e.message || 'Не удалось применить', 400); }
  await D.removeInvItem(req.user.id, id);
  invalidateGlobkaCaches();
  const user = await D.getUserById(req.user.id);
  send(res, 200, { ok: true, user: await publicUser(user), message: `${item.name} — применён!` });
}));

// Превратить предмет в ключ (чтобы другой игрок мог активировать)
app.post('/api/inventory/key', requireAuth, ah(async (req, res) => {
  const id = String((req.body && req.body.id) || '');
  const items = await D.getInventory(req.user.id);
  const item = items.find(i => String(i.id) === String(id) && i.status === 'item');
  if (!item) return fail(res, 'Предмет не найден');
  const code = await genInvKey();
  item.status = 'key';
  item.code = code;
  await D.setInventory(req.user.id, items);
  await D.setInvKey(code, { userId: req.user.id, itemId: item.id });
  send(res, 200, { ok: true, code, message: 'Ключ создан: ' + code });
}));

// Активация ключа другим игроком: ключ уходит из инвентаря владельца, предмет применяется активатору
app.post('/api/inventory/activate', requireAuth, ah(async (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!rateLimit('inv:' + req.ip)) return fail(res, 'Слишком много попыток. Подождите.', 429);
  if (!code) return fail(res, 'Введите код ключа');
  const ref = await D.getInvKey(code);
  if (!ref) return fail(res, 'Ключ не найден');
  const ownerItems = await D.getInventory(ref.userId);
  const item = ownerItems.find(i => String(i.id) === String(ref.itemId) && i.status === 'key');
  if (!item) { await D.deleteInvKey(code); return fail(res, 'Ключ не найден'); }
  if (String(ref.userId) === String(req.user.id)) return fail(res, 'Нельзя активировать свой собственный ключ');

  try { await applyInvItem(req.user.id, item); } catch (e) { return fail(res, e.message || 'Не удалось активировать', 400); }

  await D.removeInvItem(ref.userId, ref.itemId);
  await D.deleteInvKey(code);
  invalidateGlobkaCaches();

  const user = await D.getUserById(req.user.id);
  const owner = await D.getUserById(ref.userId);
  if (TGBot.isEnabled()) {
    TGBot.sendTgToOwner(
      '🔑 Ключ активирован: ' + item.name + '\nАктивировал: @' + user.login + '\nВыдал(владелец ключа): @' + (owner ? owner.login : '?')
    ).catch(() => {});
  }
  send(res, 200, { ok: true, user: await publicUser(user), message: `${item.name} — активирован!` });
}));

// Общая логика применения предмета инвентаря к аккаунту (подписка / сброс HWID)
async function applyInvItem(userId, item) {
  const spec = MEDIA_ITEMS.find(i => i.plan === item.itemKey);
  if (item.itemKey === 'hwid_reset') {
    if (!(await D.getUserById(userId)).hwid) throw new Error('Устройство ещё не привязано');
    await D.resetHwid(userId, now());
    await D.insertHwReset(userId, now());
    return;
  }
  if (!spec) throw new Error('Неизвестный предмет');
  await D.revokeMediaSubs(userId);
  const expires_at = spec.forever ? null : new Date(Date.now() + spec.days * 86400000).toISOString();
  await D.insertSub({ user_id: userId, plan: spec.plan, status: 'active', source: 'media', purchased_at: now(), expires_at });
}

/* ============ ГЛОБАЛКА: поиск по логину, профили и друзья ============ */

// Кэш списка пользователей и кратких данных профилей (поиск в Глобалке)
let globkaUsersCache = { ts: 0, users: null };
const GLOBKA_USERS_TTL = 30 * 1000;
const globkaBriefCache = new Map(); // userId -> { ts, data }
const GLOBKA_BRIEF_TTL = 60 * 1000;

async function cachedListUsers() {
  const now = Date.now();
  if (globkaUsersCache.users && now - globkaUsersCache.ts < GLOBKA_USERS_TTL) return globkaUsersCache.users;
  const users = await D.listUsers();
  globkaUsersCache = { ts: now, users };
  return users;
}

async function cachedBriefUser(t) {
  const hit = globkaBriefCache.get(t.id);
  if (hit && Date.now() - hit.ts < GLOBKA_BRIEF_TTL) return hit.data;
  const data = await briefUser(t);
  globkaBriefCache.set(t.id, { ts: Date.now(), data });
  return data;
}

function invalidateGlobkaCaches() {
  globkaUsersCache = { ts: 0, users: null };
  globkaBriefCache.clear();
}

async function briefUser(t) {
  const [role, roleColor, loginColor, decoActive, subs] = await Promise.all([
    D.getUserRole(t.id), D.getRoleColor(t.id), D.getLoginColor(t.id), D.getActiveDeco(t.id), D.getSubs(t.id)
  ]);
  const active = subs.find(s => s.status === 'active') || subs.find(s => s.status === 'frozen') || null;
  const plan = PLANS.find(p => p.key === (active ? active.plan : null)) || null;
  return {
    id: t.id,
    login: t.login,
    uid: t.uid,
    avatar: t.avatar || null,
    role,
    roleColor,
    loginColor,
    decoActive,
    online: launcherSeen.has(t.id),
    subscription: plan ? { name: plan.name, tag: plan.tag, status: active.status, forever: !!plan.forever } : null
  };
}

async function fullPublicProfile(t, isFriend) {
  const [role, roleColor, loginColor, decoActive, glossy, subs] = await Promise.all([
    D.getUserRole(t.id), D.getRoleColor(t.id), D.getLoginColor(t.id), D.getActiveDeco(t.id), D.getGlossy(t.id), D.getSubs(t.id)
  ]);
  const active = subs.find(s => s.status === 'active') || subs.find(s => s.status === 'frozen') || null;
  const plan = PLANS.find(p => p.key === (active ? active.plan : null)) || null;
  const hasAlpha = subs.some(s => s.plan === 'alpha' && s.status === 'active');
  return {
    id: t.id,
    login: t.login,
    uid: t.uid,
    avatar: t.avatar || null,
    banner: t.banner || null,
    role,
    roleColor,
    loginColor,
    decoActive,
    glossy,
    glossyAllowed: hasAlpha,
    hasAlpha,
    createdAt: t.created_at,
    isFriend,
    online: launcherSeen.has(t.id),
    subscription: plan ? { name: plan.name, tag: plan.tag, status: active.status, forever: !!plan.forever } : null
  };
}

async function shopStateFor(userId) {
  const [activeDeco, activeColor, activeRole] = await Promise.all([
    D.getActiveDeco(userId), D.getLoginColor(userId), D.getRoleColor(userId)
  ]);
  const owned = {};
  for (const it of SHOP_ITEMS) {
    owned[it.key] = (await D.getDeco(userId, it.key))
      || (it.kind === 'login_color' ? activeColor === it.key
        : it.kind === 'role_color' ? activeRole === it.key
        : false);
  }
  return { items: SHOP_ITEMS, owned, activeDeco, activeColor, activeRole };
}

// Поиск пользователей по логину (частичное совпадение)
app.get('/api/globka/find', requireAuth, ah(async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) return send(res, 200, { ok: true, users: [] });
  const [users, friends, reqsIn, reqsOut] = await Promise.all([
    cachedListUsers(), D.getFriends(req.user.id), D.getFriendReqsIn(req.user.id), D.getFriendReqsOut(req.user.id)
  ]);
  const matches = users.filter(u => u.login && u.login.toLowerCase() !== req.user.login.toLowerCase() && u.login.toLowerCase().includes(q)).slice(0, 8);
  const briefs = await Promise.all(matches.map(async (u) => {
    const b = await cachedBriefUser(u);
    b.isFriend = friends.includes(u.login);
    b.isReqIn = reqsIn.includes(u.login);
    b.isReqOut = reqsOut.includes(u.login);
    return b;
  }));
  send(res, 200, { ok: true, users: briefs });
}));

// Публичный профиль игрока + что куплено в магазине
app.get('/api/globka/profile', requireAuth, ah(async (req, res) => {
  const login = String(req.query.login || '').trim();
  const t = await D.getUserByLogin(login);
  if (!t) return send(res, 400, { ok: false, message: 'Пользователь не найден' });
  const [friends, reqsIn, reqsOut] = await Promise.all([
    D.getFriends(req.user.id), D.getFriendReqsIn(req.user.id), D.getFriendReqsOut(req.user.id)
  ]);
  const user = await fullPublicProfile(t, friends.includes(t.login));
  const shop = await shopStateFor(t.id);
  user.isReqIn = reqsIn.includes(t.login);
  user.isReqOut = reqsOut.includes(t.login);
  send(res, 200, { ok: true, user, shop, reqsIn, reqsOut });
}));

// Список моих друзей
app.get('/api/friends', requireAuth, ah(async (req, res) => {
  const logins = await D.getFriends(req.user.id);
  const users = await Promise.all(logins.map(async (l) => {
    const t = await D.getUserByLogin(l);
    if (!t) return null;
    const b = await cachedBriefUser(t);
    b.isFriend = true;
    return b;
  }));
  send(res, 200, { ok: true, users: users.filter(Boolean) });
}));

app.post('/api/friends/add', requireAuth, ah(async (req, res) => {
  const login = String((req.body || {}).login || '').trim();
  if (!login || login === req.user.login) return send(res, 400, { ok: false, message: 'Некорректный логин' });
  const t = await D.getUserByLogin(login);
  if (!t) return send(res, 400, { ok: false, message: 'Пользователь не найден' });
  const list = await D.getFriends(req.user.id);
  const next = list.includes(login) ? list : [...list, login];
  await D.setFriends(req.user.id, next);
  send(res, 200, { ok: true, message: '@' + login + ' добавлен в друзья' });
}));

app.post('/api/friends/remove', requireAuth, ah(async (req, res) => {
  const login = String((req.body || {}).login || '').trim();
  const list = await D.getFriends(req.user.id);
  const next = list.filter(l => l.toLowerCase() !== login.toLowerCase());
  await D.setFriends(req.user.id, next);
  send(res, 200, { ok: true, message: '@' + login + ' удалён из друзей' });
}));

// Мои входящие заявки в друзья
app.get('/api/friends/requests', requireAuth, ah(async (req, res) => {
  const [inLogins, outLogins] = await Promise.all([
    D.getFriendReqsIn(req.user.id), D.getFriendReqsOut(req.user.id)
  ]);
  const build = async (l) => {
    const t = await D.getUserByLogin(l);
    if (!t) return null;
    const b = await cachedBriefUser(t);
    b.isFriend = false;
    return b;
  };
  const [users, outgoing] = await Promise.all([
    Promise.all(inLogins.map(build)),
    Promise.all(outLogins.map(build))
  ]);
  send(res, 200, { ok: true, users: users.filter(Boolean), outgoing: outgoing.filter(Boolean) });
}));

// Отправить заявку в друзья
app.post('/api/friends/request', requireAuth, ah(async (req, res) => {
  const login = String((req.body || {}).login || '').trim();
  if (!login || login.toLowerCase() === req.user.login.toLowerCase()) return send(res, 400, { ok: false, message: 'Нельзя отправить заявку самому себе' });
  const t = await D.getUserByLogin(login);
  if (!t) return send(res, 400, { ok: false, message: 'Пользователь не найден' });
  const [friends, reqsOut] = await Promise.all([D.getFriends(req.user.id), D.getFriendReqsOut(req.user.id)]);
  if (friends.includes(t.login)) return send(res, 400, { ok: false, message: '@' + login + ' уже у вас в друзьях' });
  if (reqsOut.includes(t.login)) return send(res, 400, { ok: false, message: 'Заявка @' + login + ' уже отправлена' });
  const theirIn = await D.getFriendReqsIn(t.id);
  if (!theirIn.includes(req.user.login)) {
    await D.setFriendReqsIn(t.id, [...theirIn, req.user.login]);
  }
  await D.setFriendReqsOut(req.user.id, [...reqsOut, t.login]);
  send(res, 200, { ok: true, message: 'Заявка в друзья отправлена @' + login });
}));

// Принять / отклонить заявку ({ accept: true|false })
app.post('/api/friends/respond', requireAuth, ah(async (req, res) => {
  const login = String((req.body || {}).login || '').trim();
  const accept = !!(req.body && req.body.accept);
  const t = await D.getUserByLogin(login);
  if (!t) return send(res, 400, { ok: false, message: 'Пользователь не найден' });
  const reqsIn = await D.getFriendReqsIn(req.user.id);
  if (!reqsIn.includes(t.login)) return send(res, 400, { ok: false, message: 'Заявка не найдена' });
  await D.setFriendReqsIn(req.user.id, reqsIn.filter(l => l !== t.login));
  const theirOut = await D.getFriendReqsOut(t.id);
  await D.setFriendReqsOut(t.id, theirOut.filter(l => l !== req.user.login));
  if (accept) {
    const [mine, theirs] = await Promise.all([D.getFriends(req.user.id), D.getFriends(t.id)]);
    await D.setFriends(req.user.id, mine.includes(t.login) ? mine : [...mine, t.login]);
    await D.setFriends(t.id, theirs.includes(req.user.login) ? theirs : [...theirs, req.user.login]);
    send(res, 200, { ok: true, message: '@' + login + ' — теперь вы друзья' });
  } else {
    send(res, 200, { ok: true, message: 'Заявка @' + login + ' отклонена' });
  }
}));

// Отменить свою исходящую заявку
app.post('/api/friends/cancel', requireAuth, ah(async (req, res) => {
  const login = String((req.body || {}).login || '').trim();
  const t = await D.getUserByLogin(login);
  if (!t) return send(res, 400, { ok: false, message: 'Пользователь не найден' });
  const reqsOut = await D.getFriendReqsOut(req.user.id);
  await D.setFriendReqsOut(req.user.id, reqsOut.filter(l => l !== t.login));
  const theirIn = await D.getFriendReqsIn(t.id);
  await D.setFriendReqsIn(t.id, theirIn.filter(l => l !== req.user.login));
  send(res, 200, { ok: true, message: 'Заявка @' + login + ' отменена' });
}));

// ============ ЛИЧНЫЕ СООБЩЕНИЯ (ЛС в Глобалке) ============

// Мой диалог с игроком ({ with: login })
// Фильтр нецензурной лексики в личных сообщениях:
// плохие слова заменяются на *, по одной звездочке на каждую букву
const BAD_WORDS = [
  'хуй', 'хуя', 'хуе', 'хуи', 'хуёв', 'хуев', 'хуйня', 'хуйни', 'хуйню', 'хуйней',
  'нахуй', 'нахуя', 'нихуя', 'похуй', 'похуя', 'охуен', 'охуител', 'ахуен', 'хуйло',
  'хуесос', 'херня', 'нафиг', 'нахер', 'нахрак',
  'пизд', 'пися', 'пиздец', 'пизда', 'пиздаг', 'пиздюк', 'распизд',
  'бля', 'блять', 'блядь', 'бляд', 'блд',
  'сука', 'суки', 'сук', 'сучар', 'сучка', 'сучье',
  'ебать', 'ебат', 'ебан', 'ебаш', 'уёб', 'уеб', 'ёб', 'ебу', 'выеб', 'заеб',
  'гандон', 'гандонский', 'шлюха', 'проститутк', 'козел', 'мудак', 'мудацк',
  'говно', 'гавно', 'дерьмо', 'ссанина', 'ссать', 'залупа', 'член', 'манда',
  'педрил', 'пидор', 'пидорк', 'петух', 'гомик', 'гомосек',
  'fuck', 'fck', 'fuc', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt', 'bastard', 'damn'
].sort((a, b) => b.length - a.length);
const BAD_WORDS_RE = new RegExp(
  '(?<![\\p{L}\\p{N}_])(?:' + BAD_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}_])',
  'giu'
);
function filterBadWords(text) {
  return String(text).replace(BAD_WORDS_RE, (m) => '*'.repeat(m.length));
}

app.get('/api/dm', requireAuth, ah(async (req, res) => {
  const login = String(req.query.with || '').trim();
  if (!login) return fail(res, 'Укажите собеседника');
  if (login.toLowerCase() === req.user.login.toLowerCase()) return fail(res, 'Это ваш логин');
  const t = await D.getUserByLogin(login);
  if (!t) return fail(res, 'Пользователь не найден');
  const [messages, notifs] = await Promise.all([D.getDm(req.user.id, t.id), D.getDmNotifs(req.user.id)]);
  messages.forEach(m => { if (m.text) m.text = filterBadWords(m.text); });
  // Убрать уведомления от этого собеседника (диалог просмотрен)
  const rest = notifs.filter(n => n.login.toLowerCase() !== t.login.toLowerCase());
  if (rest.length !== notifs.length) await D.setDmNotifs(req.user.id, rest);
  const brief = await cachedBriefUser(t);
  send(res, 200, { ok: true, user: brief, messages });
}));

// Отправить сообщение игроку ({ to: login, text })
app.post('/api/dm/send', requireAuth, ah(async (req, res) => {
  const to = String((req.body || {}).to || '').trim();
  const rawText = String((req.body || {}).text || '').trim();
  if (!to) return fail(res, 'Кому пишем?');
  if (!rawText) return fail(res, 'Сообщение пустое');
  if (rawText.length > 500) return fail(res, 'Сообщение слишком длинное (макс. 500 символов)');
  if (!rateLimit('dm:' + req.user.id, 20, 60000)) return fail(res, 'Слишком много сообщений, подождите', 429);
  if (to.toLowerCase() === req.user.login.toLowerCase()) return fail(res, 'Нельзя писать самому себе');
  const t = await D.getUserByLogin(to);
  if (!t) return fail(res, 'Пользователь не найден');
  const text = filterBadWords(rawText);
  if (!text) return fail(res, 'Сообщение пустое');
  const msg = { from: req.user.id, login: req.user.login, text, ts: now() };
  await D.appendDm(req.user.id, t.id, msg);
  await D.pushDmNotif(t.id, msg);
  invalidateGlobkaCaches();
  send(res, 200, { ok: true, message: 'Сообщение отправлено ' + '@' + t.login });
}));

// Мои уведомления о новых сообщениях
app.get('/api/dm/notifs', requireAuth, ah(async (req, res) => {
  const notifs = await D.getDmNotifs(req.user.id);
  // Группируем по собеседникам: оставляем только последнее сообщение от каждого + счётчик
  const byLogin = {};
  for (const n of notifs) {
    const k = n.login.toLowerCase();
    if (!byLogin[k]) byLogin[k] = { login: n.login, text: n.text, ts: n.ts, count: 0 };
    byLogin[k].count++;
    if (new Date(n.ts) >= new Date(byLogin[k].ts)) { byLogin[k].text = n.text; byLogin[k].ts = n.ts; }
  }
  const list = Object.values(byLogin);
  list.forEach(n => { if (n.text) n.text = filterBadWords(n.text); });
  const enriched = await Promise.all(list.map(async (n) => {
    const t = await D.getUserByLogin(n.login);
    if (!t) return n;
    const b = await cachedBriefUser(t);
    return Object.assign(n, b);
  }));
  send(res, 200, { ok: true, notifs: enriched });
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
  // Товар магазина (shop:<key>) — платится как разовая покупка без привязки к тарифам
  const shopItem = /^shop:/.test(planKey) ? SHOP_ITEMS.find(i => i.key === planKey.slice(5)) : null;
  const isShop = !!shopItem;
  const plan = shopItem
    ? { key: planKey, name: shopItem.name, price: shopItem.price, currency: shopItem.currency || '₽', forever: true }
    : PLANS.find(p => p.key === planKey);
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
  if (rawPromo && !isShop) {
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
    description: `${isShop ? 'Товар' : 'Подписка'} «${plan.name}»${!isShop && plan.forever ? ' навсегда' : ''} — заказ #${order.id}`,
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
  // Отмена платежа покупателем
  if (event === 'payment.canceled') {
    try {
      const remoteC = await YK.getPayment(obj.id);
      const metaC = (remoteC && remoteC.metadata) || {};
      const orderIdC = Number(metaC.orderId || 0);
      if (orderIdC) {
        const o = await D.getOrderById(orderIdC);
        if (o && o.status === 'pending') await D.updateOrderStatus(orderIdC, 'canceled');
      }
    } catch (e) { console.error('[HorusWebsite] cancel webhook error:', e); }
    return send(res, 200, { ok: true, canceled: true });
  }

  // Возврат средств
  if (event === 'refund.succeeded') {
    try {
      const paymentId = obj.payment_id;
      if (paymentId) {
        const o = await D.getOrderByPaymentId(paymentId);
        if (o && o.status === 'paid') await D.updateOrderStatus(o.id, 'refunded');
      }
    } catch (e) { console.error('[HorusWebsite] refund webhook error:', e); }
    return send(res, 200, { ok: true, refunded: true });
  }

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
      if (String(planKey).startsWith('shop:')) {
        const shopItem = SHOP_ITEMS.find(i => i.key === planKey.slice(5));
        const order = await D.getOrderById(orderId);
        if (!order) return send(res, 200, { ok: false, code: 'no_order' });
        const want = String(Number(order.amount ?? shopItem?.price ?? 0)) + '.00';
        const got = remote.amount && remote.amount.value;
        if (got !== want) return send(res, 200, { ok: false, code: 'amount_mismatch' });
        if (order.status === 'pending') {
          await D.setOrderPaid(orderId, now(), 'yookassa');
          if (shopItem) {
            await D.setDeco(order.user_id, shopItem.key);
            if (shopItem.kind === 'login_color') await D.setLoginColor(order.user_id, shopItem.key);
            else if (shopItem.kind === 'role_color') await D.setRoleColor(order.user_id, shopItem.key);
          }
        }
        return send(res, 200, { ok: true, shop: true });
      }
      return send(res, 200, { ok: false, code: 'unknown_plan' });
    }

    // 2) Заказ + сверка суммы (защита от подмены цены)
    const order = await D.getOrderById(orderId);
    if (!order) return send(res, 200, { ok: false, code: 'no_order' });
    const want = String(Number(order.amount ?? plan.price)) + '.00';
    const got = remote.amount && remote.amount.value;
    if (got !== want) return send(res, 200, { ok: false, code: 'amount_mismatch', want, got });

    // 3) Идемпотентность: выдаём подписку ровно один раз на заказ
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
    url: cfg.launcher_url || '#download',
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
  migrateOwnedColors().catch(e => console.error('[migrate]', e));
  app.listen(PORT, () => {
    console.log(`[HorusWebsite] запущен: http://${HOST}:${PORT}`);
    TGBot.start();
  });
}

// Однократная миграция: помечаем владение (deco:<key>) для ранее купленных цветов логина/роли
async function migrateOwnedColors() {
  try {
    const rows = await D.getAllCfg();
    let n = 0;
    for (const r of rows || []) {
      const m = /^(login_color|role_color):(\d+)$/.exec(r.key);
      if (m && r.value && !(await D.getDeco(m[2], r.value))) {
        await D.setDeco(m[2], r.value);
        n += 1;
      }
    }
    if (n) console.log(`[migrate] отмечены владения цветов: ${n}`);
  } catch (e) { console.error('[migrate] не удалось:', e && e.message); }
}

module.exports = app;