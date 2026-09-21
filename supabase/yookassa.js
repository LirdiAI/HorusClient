/* YooKassa (ЮKassa) — приём платежей (карты, СБП, СБП T-Pay) через API v3.
   Ключи читаются ТОЛЬКО из env: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY.
   Требуется Node >= 18 (глобальный fetch). */

const crypto = require('crypto');

const API = 'https://api.yookassa.ru/v3';

function creds() {
  return {
    shopId: process.env.YOOKASSA_SHOP_ID || '',
    secretKey: process.env.YOOKASSA_SECRET_KEY || ''
  };
}

function enabled() {
  const c = creds();
  return !!(c.shopId && c.secretKey);
}

async function call(method, path, body, idemKey) {
  const c = creds();
  const auth = 'Basic ' + Buffer.from(c.shopId + ':' + c.secretKey).toString('base64');
  const headers = {
    Authorization: auth,
    'Content-Type': 'application/json',
    'Idempotence-Key': idemKey || crypto.randomUUID()
  };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(bodyapsed);
  const res = await fetch(API + path, opts);

  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }

  if (!res.ok) {
    const e = new Error(json.description || json.raw || 'ЮKassa: ошибка HTTP ' + res.status);
    e.status = res.status;
    e.code = json.code || null;
    throw e;
  }
  return json;
}

/* ---------------- методы платежа ----------------
   methodType:
     'card'   — карты (по умолчанию, страница выбора ЮKassa)
     'sbp'    — СБП (QR / по требованию НСПК)
     'tpay'   — СБП T-Pay через ЮKassa (type 'sbp' с методом T-Pay не нужен:
                ЮKassa сама показывает T-Pay при любом способе, если подключено)
   Реализация: намеренно не хардкодим 'tinkoff_bank' — ЮKassa по договору,
   выбранному у вас в кабинете (карты/СБП/Т-Плати), сама отдаёт доступные
   способы на странице оплаты. Метод задаём только если явно передан. */

function buildPayment({ amount, description, metadata, returnUrl, methodType }) {
  const body = {
    amount: { value: String(amount), currency: 'RUB' },
    capture: true,
    description: description || 'Оплата подписки',
    metadata: metadata || {},
    confirmation: { type: 'redirect', return_url: returnUrl }
  };
  if (methodType === 'sbp') body.payment_method_data = { type: 'sbp' };
  // T-Pay отдельным payment_method_data не слать: Юkassa сама показывает
  // T-Pay на странице оплаты магазинам с подключённым договором. Прямой
  // 'tinkoff_bank' без merchant-договора Юkassa отклоняет (RealId/MerchantId).
  return body;
}

/* Создать платёж -> { id, status, confirmationUrl } */
async function createPayment(p) {
  if (!enabled()) throw Object.assign(new Error('ЮKassa не настроена (нет shopId/secretKey)'), { code: 'YK_NOT_CONFIGURED' });
  const json = await call('POST', '/payments', buildPayment(p), p.idemKey);
  if (!json.confirmation || !json.confirmation.confirmation_url) {
    throw new Error('ЮKassa: не получен confirmation_url');
  }
  return {
    id: json.id,
    status: json.status,
    confirmationUrl: json.confirmation.confirmation_url,
    paid: !!json.paid,
    metadata: json.metadata || {}
  };
}

/* Запросить статус платежа по id (перепроверка вебхука / return_url) */
async function getPayment(paymentId) {
  if (!enabled()) throw Object.assign(new Error('ЮKassa не настроена'), { code: 'YK_NOT_CONFIGURED' });
  return await call('GET', '/payments/' + encodeURIComponent(paymentId));
}

/* Отменить неоплаченный платёж (например, по таймауту) */
async function cancelPayment(paymentId) {
  if (!enabled()) return;
  try { await call('POST', '/payments/' + encodeURIComponent(paymentId) + '/cancel'); } catch (e) { console.error('[YK] cancel fail', paymentId, e.message); }
}

module.exports = { enabled, createPayment, getPayment, cancelPayment };
