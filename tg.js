const D = require('./db');

const TOKEN = process.env.TG_BOT_TOKEN || '';
const BOT_USERNAME = process.env.TG_BOT_USERNAME || '';

const API = 'https://api.telegram.org/bot' + TOKEN;
const TIMEOUT = 25;

let offset = 0;
let started = false;
let busy = false;
let reminderTimer = null;

const DAY_MS = 24 * 60 * 60 * 1000;

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

// Отправить личное сообщение по привязке пользователя сайта (по userId).
// Возвращает true, если бот включён и сообщение доставлено.
async function sendTgToUser(userId, text) {
  if (!TOKEN) return false;
  try {
    const bind = await D.getTgByUserId(userId);
    if (!bind) return false;
    const chatId = bind.c || bind.u; // chatId или @username
    return await sendChat(chatId, text);
  } catch (e) {
    console.error('[tg] sendTgToUser failed:', e.message);
    return false;
  }
}

// Отправить сообщение владельцу сайта (Howill_).
// Возвращает true, если бот включён и сообщение доставлено.
async function sendTgToOwner(text) {
  if (!TOKEN) return false;
  try {
    const owner = await D.getUserByLogin('Howill_');
    if (!owner) return false;
    return await sendTgToUser(owner.id, text);
  } catch (e) {
    console.error('[tg] sendTgToOwner failed:', e.message);
    return false;
  }
}

// Оповестить в Telegram о новой привязке HWID + кнопка «🏳 Это не я».
// code — код подтверждения (нужен для снятия привязки из бота).
async function sendHwidAlert(userId, hwid, code) {
  if (!TOKEN) return false;
  try {
    const bind = await D.getTgByUserId(userId);
    if (!bind) return false;
    const chatId = bind.c || bind.u;
    const d = await call('sendMessage', {
      chat_id: chatId,
      text:
        '🔐 К вашему аккаунту HorusClient привязано новое устройство.\n' +
        'HWID: <code>' + hwid + '</code>\n' +
        'Если это были не вы — нажмите «Это не я». Привязка будет немедленно снята.',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🏳 Это не я', callback_data: 'hwid_no:' + code },
          { text: 'Это я ✅', callback_data: 'hwid_yes:' + code }
        ]]
      }
    });
    return !!d.ok;
  } catch (e) {
    console.error('[tg] sendHwidAlert failed:', e.message);
    return false;
  }
}

// Проверка истекающих подписок: отправляет напоминания за 3/1/0 дней до конца.
// Запускается периодически. Отметка о отправке хранится в site_cfg (tg_rem:<userId>).
async function checkExpiryReminders() {
  if (!TOKEN) return;
  try {
    const subs = await D.getActiveSubsWithExpiry();
    const nowMs = Date.now();
    for (const sub of subs) {
      const expMs = new Date(sub.expires_at).getTime();
      if (isNaN(expMs)) continue;
      const daysLeft = Math.ceil((expMs - nowMs) / DAY_MS);
      if (daysLeft < 0) continue; // уже истекла — не спамим
      if (![3, 1, 0].includes(daysLeft)) continue;

      const cfgKey = `tg_rem:${sub.user_id}:${daysLeft}`;
      const sentMark = await D.getCfg(cfgKey);
      if (sentMark === sub.expires_at) continue; // уже напоминали для этой даты

      let text;
      if (daysLeft === 3) text = '⏳ Через 3 дня заканчивается ваша подписка <b>HorusClient</b>. Продлите заранее, чтобы не потерять доступ.';
      else if (daysLeft === 1) text = '⏳ Завтра заканчивается ваша подписка <b>HorusClient</b>. Продлите, чтобы не потерять доступ.';
      else text = '⏰ Ваша подписка <b>HorusClient</b> истекает сегодня. Продлите её прямо сейчас, чтобы продолжить пользоваться клиентом.';
      const sent = await sendTgToUser(sub.user_id, text + '\n\n<a href="' + (process.env.SITE_URL || 'https://horusclient-t7wn.onrender.com') + '/#/cabinet/buy">Продлить подписку</a>');
      if (sent) await D.setCfg(cfgKey, sub.expires_at);
    }
  } catch (e) {
    console.error('[tg] checkExpiryReminders error:', e.message);
  }
}

function startReminderLoop() {
  if (reminderTimer || !TOKEN) return;
  checkExpiryReminders();
  reminderTimer = setInterval(checkExpiryReminders, 6 * 60 * 60 * 1000); // каждые 6 часов
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

// Обработка нажатий на инлайн-кнопки
async function handleCallbackQuery(cb) {
  if (!cb || !cb.data) return;
  const chatId = cb.message && cb.message.chat && cb.message.chat.id;
  const data = String(cb.data || '');
  const answer = (text) => call('answerCallbackQuery', { callback_query_id: cb.id, text: text || '' });

  if (data.startsWith('hwid_no:') || data.startsWith('hwid_yes:')) {
    const code = data.split(':')[1];
    const rec = await D.findTgHwCancelByCode(code);
    if (!rec) { await answer('Запись не найдена или устарела'); return; }
    if (chatId == null) return;
    // Проверяем, что нажатие пришло из чата, к которому привязан аккаунт
    const bind = await D.getTgByUserId(rec.userId);
    const boundChat = bind ? String(bind.c || bind.u) : null;
    if (boundChat && String(chatId) !== boundChat) { await answer('Это действие доступно только с аккаунта, где привязан этот Telegram'); return; }

    if (rec.exp < Date.now()) {
      await D.clearTgHwCancel(rec.userId);
      await answer('Срок действия истёк');
      return;
    }

    if (data.startsWith('hwid_no:')) {
      // Пользователь говорит, что это не он — снимаем привязку HWID
      await D.unbindHwid(rec.userId);
      await D.clearTgHwCancel(rec.userId);
      await answer('Привязка устройства снята');
      const site = process.env.SITE_URL || 'https://horusclient-t7wn.onrender.com';
      await sendChat(chatId,
        '🏳 Привязка устройства <b>снята</b> с вашего аккаунта. Если это были вы и привязка нужна — войдите в лаунчер заново. ' +
        'Если устройство чужое — срочно смените пароль и отвяжите чужие Telegram-сессии:\n' + site + '/#/cabinet/security');
    } else {
      // Пользователь подтвердил привязку
      await D.clearTgHwCancel(rec.userId);
      await answer('Отлично, привязка подтверждена');
    }
    return;
  }

  await answer();
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
        else if (u.callback_query) await handleCallbackQuery(u.callback_query);
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
  startReminderLoop();
}

module.exports = {
  start, sendTgCode, sendTgToUser, sendTgToOwner, sendHwidAlert, checkExpiryReminders,
  registerBindCode, registerResetCode, isEnabled: () => !!TOKEN, botUsername: BOT_USERNAME
};