const D = require('./db');

const TOKEN = process.env.TG_BOT_TOKEN || '';
const BOT_USERNAME = process.env.TG_BOT_USERNAME || '';

const API = 'https://api.telegram.org/bot' + TOKEN;
const TIMEOUT = 25;

let offset = 0;
let started = false;
let busy = false;

async function call(method, body, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal
    });
    return await r.json();
  } catch (e) {
    console.error('[tg] call failed:', method, e.message);
    return { ok: false };
  } finally {
    clearTimeout(t);
  }
}

async function sendChat(chatId, text) {
  if (!TOKEN) return false;
  const d = await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
  return !!d.ok;
}

// Отправить код в Telegram пользователю. Возвращает true/false.
async function sendTgCode(tgUsername, text) {
  if (!TOKEN) return false;
  const chatId = tgUsername; // @username или chat_id
  return await sendChat(chatId, text);
}

function extractCode(text) {
  return (text || '').trim().replace(/^\/?bind\s*/i, '').match(/([A-Z0-9]{6})\b/i)?.[1] || null;
}

function extractReset(text) {
  return (text || '').trim().replace(/^\/?reset\s*/i, '').match(/([A-Z0-9]{6})\b/i)?.[1] || null;
}

const CODES = {
  bind: new Map(),  // key: code -> userId
  reset: new Map()  // key: code -> userId
};

// Регистрация кода для бота (вызывается из server.js при генерации)
function registerBindCode(code, userId, ttlMs = 10 * 60 * 1000) {
  CODES.bind.set(code, userId);
  setTimeout(() => { if (CODES.bind.get(code) === userId) CODES.bind.delete(code); }, ttlMs);
}

function registerResetCode(code, userId, ttlMs = 10 * 60 * 1000) {
  CODES.reset.set(code, userId);
  setTimeout(() => { if (CODES.reset.get(code) === userId) CODES.reset.delete(code); }, ttlMs);
}

async function handleMessage(msg) {
  if (!msg || !msg.text) return;
  const upper = msg.text.trim().toUpperCase();
  const chatId = msg.chat.id;
  const fromUsername = (msg.from && msg.from.username) ? '@' + msg.from.username : null;
  const firstName = (msg.from && (msg.from.first_name || msg.from.last_name || 'Пользователь')) || 'Пользователь';

  if (/^\/START/.test(upper)) {
    return sendChat(chatId, 'Привет, <b>' + firstName + '</b>!\nЯ бот HorusClient.\n\n• <b>Привязка:</b> привяжите аккаунт на сайте (кабинет → Безопасность → Telegram) и отправьте мне выданный 6-значный код.\n• <b>Забыли пароль?</b> начните сброс на сайте (Вход → Забыли пароль?), я пришлю вам код. После этого отправьте его мне командой /reset.');
  }

  const code = extractCode(upper);
  if (code) {
    // Привязка: ищем ожидающий код в БД (устойчиво к перезагрузке)
    const pend = await D.findTgPendingByCode(code);
    if (pend) {
      if (pend.exp < Date.now()) {
        await D.clearTgPending(pend.userId);
        CODES.bind.delete(code);
        return sendChat(chatId, 'Срок действия кода истёк. Повторите привязку на сайте.');
      }
      // Подтверждаем, что код прислал именно владелец привязываемого username
      if (!fromUsername || fromUsername.toLowerCase() !== '@' + String(pend.username).toLowerCase().replace(/^@/, '')) {
        return sendChat(chatId, 'Отправьте код с аккаунта привязываемого Telegram (@' + pend.username + '), а не с другого.');
      }
      await D.bindTg(pend.userId, pend.username, chatId);
      await D.clearTgPending(pend.userId);
      CODES.bind.delete(code);
      return sendChat(chatId, 'Отлично, привязка к аккаунту <b>' + pend.login + '</b> завершена!\nТеперь через меня можно восстанавливать пароль, если вы его забудете.');
    }
  }

  // Сброс пароля: /reset <код> — подтверждение ссылкой для установки нового пароля
  const rcode = extractReset(upper);
  if (rcode) {
    const rec = await D.findTgResetByCode(rcode);
    if (rec && String(rec.code).toUpperCase() === rcode && rec.exp >= Date.now()) {
      const base = process.env.SITE_URL || 'https://horusclient-t7wn.onrender.com';
      await D.setTgReset(rec.userId, { code: rec.code, uid: rec.uid, login: rec.login, exp: rec.exp, confirmed: true });
      return sendChat(chatId, 'Код подтверждён. Установите новый пароль по ссылке:\n' + base + '/#/reset?u=' + rec.uid + '&c=' + rcode);
    }
    return sendChat(chatId, 'Код сброса не найден или истёк. Начните сброс заново на сайте.');
  }

  return sendChat(chatId, 'Не понял команду. Отправьте /start, чтобы увидеть подсказку.');
}

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const d = await call('getUpdates', { offset, timeout: TIMEOUT }, (TIMEOUT + 10) * 1000);
    if (d.ok && Array.isArray(d.result)) {
      for (const u of d.result) {
        offset = Math.max(offset, u.update_id + 1);
        if (u.message) await handleMessage(u.message);
      }
    } else if (d && d.description && d.error_code === 409) {
      console.error('[tg] конфликт: ещё один экземпляр бота уже работает');
      started = false;
      return;
    }
  } catch (e) {
    console.error('[tg] poll error:', e.message);
  } finally {
    busy = false;
  }
}

function schedule() {
  setTimeout(async () => {
    if (started) await poll();
    schedule();
  }, 1000);
}

function start() {
  if (!TOKEN) {
    console.warn('[tg] TG_BOT_TOKEN не задан — бот не запущен. Привязка Telegram и сброс пароля через TG недоступны.');
    return;
  }
  if (started) return;
  started = true;
  console.log('[tg] бот запущен' + (BOT_USERNAME ? ' (@' + BOT_USERNAME + ')' : ''));
  schedule();
}

module.exports = { start, sendTgCode, registerBindCode, registerResetCode, isEnabled: () => !!TOKEN, botUsername: BOT_USERNAME };