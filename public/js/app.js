/* HorusClient — веб-приложение */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let modUsersCache = null;
  let TG_BOT_LINK = '';
  let TG_BOT_ENABLED = false;
  let shopTabCat = '';
  let globkaQuery = '';
  let globkaOwnedCat = '';
  let mediaPoll = null;
  let mediaCdTick = null;
  let dmPoll = null;
  let globaPoll = null;

  const state = {
    me: null,
    plans: [
      {
        key: 'kamiki30', name: 'Kamiki 1.21.4', tag: 'Базовый · 30 дней', price: 67, currency: '₽', forever: false, days: 30,
        desc: ['Базовый доступ на 30 дней', 'Поддержка 24/7', 'Продление из кабинета']
      },
      {
        key: 'kamiki365', name: 'Kamiki 1.21.4', tag: 'Базовый · 365 дней', price: 199, currency: '₽', forever: false, days: 365,
        desc: ['Базовый доступ на 365 дней', 'Выбор игроков', 'Выгода: ~0.55 ₽ в день', 'Продление из кабинета']
      },
      {
        key: 'kamiki', name: 'Kamiki 1.21.4', tag: 'Базовый · Навсегда', price: 300, currency: '₽', forever: true,
        desc: ['Базовый доступ к клиенту', 'Все будущие обновления', 'Поддержка 24/7']
      },
      {
        key: 'alpha', name: 'Alpha 1.21.4', tag: 'Докупка · Навсегда', price: 199, currency: '₽', forever: true,
        featured: true, requires: 'kamiki', requiresForever: true,
        desc: ['Докупка к Kamiki 1.21.4', 'Ранние обновления', 'Сброс HWID раз в месяц', 'Приоритетная поддержка']
      },
      {
        key: 'tester', name: 'Набор Тестера', tag: 'Набор · 30 дней', price: 129, currency: '₽', forever: false, days: 30,
        pack: true, badge: '10% выгоды',
        includes: ['kamiki30', 'hwid_reset'], discordRole: 'Пакет Тестер',
        desc: ['Kamiki 1.21.4 на 30 дней', 'Бесплатный сброс HWID x1', 'Роль в Discord «Пакет Тестер»']
      },
      {
        key: 'hwid_reset', name: 'Сброс HWID', tag: 'Услуга', price: 100, currency: '₽', forever: false,
        cta: 'Купить сброс',
        desc: ['Разовое снятие привязки к устройству', 'Новый HWID можно привязать сразу']
      }
    ],
    purchaseNote: 'Покупка через FunPay. Выберите тариф и переходите к оплате.',
    community: { discord: { members: 1421, url: 'https://discord.gg/sGjbnrdBfw' } }
  };

/* ---------- helpers ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const fmtNum = (n) => Number(n).toLocaleString('ru-RU');

  const fmtMediaCd = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return (h > 0 ? h + ' ч ' : '') + (m > 0 ? m + ' мин' : '');
  };

  const icon = {
    eye: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.4"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    crown: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-1.5 11h-15z"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6M12 17v4"/></svg>',
    cart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M2 3h2.5l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h9.9a1.5 1.5 0 0 0 1.5-1.2L22 7H5.2"/></svg>',
    key: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L21 2M15 7l3 3M18 4l2 2"/></svg>',
    shield: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l8 3.5v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6z"/><path d="M9 12l2 2 4-4"/></svg>',
    support: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M16 3a2 2 0 0 0 2 2 2 2 0 0 0-2 2"/>' +
      '<rect x="17" y="3" width="5" height="6" rx="2" fill="currentColor" stroke="none" opacity="0.3"/></svg>',
    idea: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.9.8 1.5 2 1.5 3.5h5c0-1.5.6-2.7 1.5-3.5A6 6 0 0 0 12 3z"/></svg>',
    bug: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="8" y="6" width="8" height="13" rx="3"/><path d="M8 10H4M8 15H4M16 10h4M16 15h4M8 6l-2-3M16 6l2-3M9 19c.3 1.5 1.5 2.6 3 2.6s2.7-1.1 3-2.6"/></svg>',
    discord: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.7 1.4a18.3 18.3 0 0 0-12.9 0L1.1 3a19.8 19.8 0 0 0-5 1.4C-2.2 9-1 13.4-1 13.4c1.1 1.7 2.9 3 4.7 3.6l1.6-2.4a6 6 0 0 1-1.2-1.9l.6.4c.5.3.9.4 1.4.6a14.4 14.4 0 0 0 12.1 0c.4-.2.9-.3 1.4-.6l.6-.4a6 6 0 0 1-1.2 1.9l1.6 2.4a8.6 8.6 0 0 0 4.7-3.6s1.2-4.4-.4-9zM8.7 11.4c-.9 0-1.7-.8-1.7-1.8s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.8-1.7 1.8zm6.6 0c-.9 0-1.7-.8-1.7-1.8s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.8-1.7 1.8z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M21.9 3.2L2.5 10.8c-1.2.5-1.2 1.4-.2 1.7l4.9 1.5 1.9 5.8c.2.6.1.9.8.9.5 0 .7-.2 1-.6l2.5-2.4 5.1 3.8c1 .5 1.6.3 1.9-.8l3.4-15c.4-1-.3-1.4-1.1-1.1zM8 13.4l10.6-6.7c.5-.3 1-.1.6.2L11.5 15l-.3 3.6z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l2.1 6.2L20 10l-6 2.1L12 18l-2-5.9L4 10l5.9-1.8z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20.5S3.5 14.6 3.5 8.9A5 5 0 0 1 12 6.3a5 5 0 0 1 8.5 2.6c0 5.7-8.5 11.6-8.5 11.6z"/></svg>',
    speed: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 1 18 0M12 12l4-4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    layers: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/></svg>',
    monitor2: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M9 21h6M12 17v4"/></svg>',
    zap: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
    cooldown: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    tick1: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    tick2: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L15 8.5"/><path d="M13 17l2 2 5-6"/></svg>',
shieldFx: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l8 3.5v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6z"/><path d="M9 12l2 2 4-4"/></svg>',
    globe: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14.6 14.6 0 0 1 0 18 14.6 14.6 0 0 1 0-18z"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>'
  };

  /* ---------- network ---------- */
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    let data = null;
    try { data = await res.json(); } catch { /* пусто */ }
    if (!res.ok) throw new Error((data && data.error) || `Ошибка ${res.status}`);
    if (!data || data.ok === false) throw new Error((data && data.error) || 'Ошибка сервера');
    return data;
  }

  function toast(msg, type = 'info') {
    const w = $('#toastWrap');
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'error' ? 'err' : type === 'success' ? 'ok' : '');
    t.textContent = msg;
    w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 4200);
    setTimeout(() => t.remove(), 4600);
  }

  /* ---------- boot ---------- */
  async function boot() {
    try { state.community = (await api('/api/community')).community || state.community; } catch {}
    try { const p = await api('/api/plans'); state.plans = p.plans; state.purchaseNote = p.purchaseNote; } catch {}
    try { const b = await api('/api/tg/bot'); TG_BOT_LINK = b.bot || ''; TG_BOT_ENABLED = !!b.enabled; } catch {}
    try {
      const m = await api('/api/me');
      if (m.authed) state.me = m.user;
    } catch { state.me = null; }
renderNav();
    route();
    window.addEventListener('hashchange', route);
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dd.open')) return;
      if (e.target.closest('#promoCreateForm')) return;
      $$('.dd.open').forEach(d => d.classList.remove('open'));
    });
  }

  function renderNav() {
    applyTheme(state.me && state.me.theme);
    const el = $('#navAuth');
    if (state.me) {
      el.innerHTML = `
        <a href="#/cabinet" data-route="/cabinet" class="btn btn-ghost">
          ${icon.user} ${esc(state.me.login)}
        </a>
        <a href="#/cabinet" data-route="/cabinet" class="btn btn-gold">Кабинет</a>`;
    } else {
      el.innerHTML = `
        <a href="#/login" data-route="/login" class="btn btn-ghost">Войти</a>
        <a href="#/register" data-route="/register" class="btn btn-gold">Регистрация</a>`;
    }
  }

  /* ---------- routing ---------- */
  function route() {
    const h = location.hash || '#/';
    const path = h.replace(/^#/, '') || '/';

    $('#navBurger').classList.remove('open');
    $('#navLinks').classList.remove('open');
    window.scrollTo({ top: 0 });

    if (path.startsWith('/cabinet')) { routeCabinet(path); return; }
    if (path === '/login' || path === '/register') { routeAuth(path); return; }
    if (path === '/forgot') { routeForgot(); return; }
    if (path.startsWith('/pay-offer/')) { routePayOffer(path); return; }
    if (path.startsWith('/reset')) { routeReset(); return; }

    routeLanding(path);
  }

  /* ================= ОПЛАТА КАСТОМНОЙ ПОЗИЦИИ ================= */
  async function routePayOffer(path) {
    const id = Number(String(path).split('/')[2] || 0);
    const appEl = $('#app');
    document.title = 'Оплата — HorusClient';
    appEl.innerHTML = '<div style="max-width:900px;margin:0 auto;padding:60px 20px">Загрузка…</div>';
    let offer = null;
    try {
      const r = await api('/api/custom/get?id=' + id);
      offer = r.offer;
    } catch (e) { offer = null; }
    if (!offer) {
      appEl.innerHTML = '<div style="max-width:900px;margin:0 auto;padding:60px 20px"><div class="page-card">Позиция не найдена</div></div>';
      return;
    }
    let givesTxt = '';
    try {
      const arr = JSON.parse(offer.description || '[]');
      if (arr.length) givesTxt = 'Включает: ' + arr.map(k => { const p = (state.plans || []).find(x => x.key === k); return p ? p.name : k; }).join(', ');
    } catch (e) { givesTxt = offer.description || ''; }
    appEl.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:60px 20px">
      <div class="page-card" style="max-width:520px;margin:0 auto">
        <div class="page-title">${esc(offer.title)}</div>
        <div class="page-sub" style="margin:10px 0 16px">Сумма: <b>${esc(String(offer.amount))} ₽</b></div>
        ${givesTxt ? `<div class="page-sub" style="margin-bottom:18px;line-height:1.6">${esc(givesTxt)}</div>` : ''}
        <button class="btn btn-gold" id="payOfferBtn" style="width:100%">Оплатить через СБП · ${esc(String(offer.amount))} ₽</button>
      </div>
    </div>`;
    $('#payOfferBtn').addEventListener('click', async () => {
      const btn = $('#payOfferBtn');
      btn.disabled = true;
      try {
        const r = await api('/api/custom/pay', { method: 'POST', body: JSON.stringify({ id }) });
        if (r && r.ok && r.confirmationUrl) { window.location.href = r.confirmationUrl; return; }
        toast((r && (r.message || r.error)) || 'Ссылка на оплату не получена');
      } catch (err) {
        toast((err && err.message) || 'Ошибка подключения к оплате');
      }
      btn.disabled = false;
    });
  }

  /* ================= LANDING ================= */
  function routeLanding(path) {
    const store = state;
    const app = $('#app');
    app.innerHTML = landingHTML();

    const target = document.getElementById(path.replace(/^\/+/, '')) || null;
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      target.classList.add('fade-in');
    }

    document.title = 'HorusClient — Minecraft клиент';
    bindLanding(app, store);
  }

  function landingHTML() {
    const c = state.community;
    return `
    <section class="hero" id="top">
      <div>
        <div class="hero-badge"><span class="dot"></span> Minecraft 1.21.4 · FPS Boost · Защита от банов</div>
        <h1>Мир под контролем<br>с <span class="grad grad-anim">HorusClient</span></h1>
        <p class="lead">Современный клиент с расширенным функционалом: защита, комбат-модули, рендер,
          дискорд-статус и свой лаунчер. Одна подписка — все обновления.</p>
        <div class="hero-cta">
          <a href="${state.me ? ((hasSub() || state.me.subscription) ? '#launcher' : '#/cabinet/buy') : '#/register'}" class="btn btn-gold btn-lg">${!state.me ? 'Скачать лаунчер' : (hasSub() ? 'Скачать клиент' : (state.me.subscription ? 'Скачать невозможно' : 'Купить доступ'))}</a>
          <a href="#/pricing" class="btn btn-ghost btn-lg">Купить доступ</a>
        </div>
        <div class="hero-stats">
          <div class="hstat"><div class="num">${fmtNum(c.discord.members)}</div><div class="lbl">В сообществах</div></div>
          <div class="hstat"><div class="num">24/7</div><div class="lbl">Поддержка</div></div>
          <div class="hstat"><div class="num" id="statUsers">—</div><div class="lbl">Пользователей</div></div>
        </div>
      </div>
      <div class="hero-preview">
        <div class="preview-card">
          <div class="preview-titlebar"><span class="pc"></span><span class="pc"></span><span class="pc"></span><span class="pt">HORUSCLIENT</span></div>
          <div class="preview-body">
            <div class="preview-watermark"><img src="img/logo.png" class="w-eye" alt=""><span>Horus<b>Client</b>&nbsp;&nbsp;1.21.4</span></div>
            <div>
              <span class="preview-chip"><span class="ok">${icon.check}</span> Streamer Mode</span>
              <span class="preview-chip"><span class="ok">${icon.check}</span> BanBypass</span>
              <span class="preview-chip"><span class="ok">${icon.check}</span> AttackAura</span>
            </div>
            <div class="preview-lines">
              <div class="ln w80"></div><div class="ln w60"></div><div class="ln w40"></div>
            </div>
          </div>
          <div class="preview-fade"></div>
        </div>
        <div class="float-card fc-1"><div class="fc-icon">${icon.shieldFx}</div><div><div style="font-weight:700;font-size:13.5px">Защита включена</div><div class="muted" style="font-size:11.5px">BanBypass · HWID</div></div></div>
        <div class="float-card fc-2"><div class="fc-icon">${icon.zap}</div><div><div style="font-weight:700;font-size:13.5px">+120 FPS</div><div class="muted" style="font-size:11.5px">Оптимизация</div></div></div>
      </div>
    </section>

    <section class="section" id="features">
      <span class="eyebrow">${icon.spark} Возможности</span>
      <h2 class="section-title">Всё для побед и <span class="grad grad-anim">комфортной игры</span></h2>
      <p class="section-sub">Десятки модулей во всех категориях. Включаются в пару кликов через удобный ClickGUI.</p>
      <div class="features-grid">
        <div class="feature"><div class="fic">${icon.shieldFx}</div><h3>Защита</h3><p>Streamer Mode, скрытие ника, защита от отслеживания и банов.</p></div>
        <div class="feature"><div class="fic">${icon.zap}</div><h3>Комбат</h3><p>AttackAura, Velocity, AutoFarm, AutoMace и продвинутая система ротаций.</p></div>
        <div class="feature"><div class="fic">${icon.speed}</div><h3>Оптимизация</h3><p>Буст FPS, настройка рендера, отключение лишних эффектов и частиц.</p></div>
        <div class="feature"><div class="fic">${icon.cooldown}</div><h3>Скины и эффекты</h3><p>Анимации ударов, кастомные частицы, трейлы, модельки и капы.</p></div>
        <div class="feature"><div class="fic">${icon.monitor2}</div><h3>Интерфейс</h3><p>Кастомный HUD, таргет-худ, набор статистики и маркеры.</p></div>
        <div class="feature"><div class="fic">${icon.layers}</div><h3>Свой лаунчер</h3><p>Автообновление, управление аккаунтом и привязка устройства (HWID).</p></div>
      </div>
    </section>

    <section class="section" id="pricing">
      <span class="eyebrow">${icon.crown} Подписки и Наборы</span>
      <h2 class="section-title">Стань частью <span class="grad grad-anim">HorusClient</span></h2>
      <p class="section-sub">Активируй подписку на своём аккаунте и привяжи к устройству через лаунчер.
        Выбирай тариф под свой стиль игры или собирай выгодный набор.</p>

      <div class="subs-tabs" id="pricingTabs">
        <button type="button" class="subs-tab active" data-cat="subs">${icon.crown} Подписки</button>
        <button type="button" class="subs-tab" data-cat="packs">${icon.layers} Наборы</button>
      </div>

      <div class="pricing-grid" id="pricingGrid" data-grid="subs"></div>
    </section>

    <section class="section" id="launcher">
      <span class="eyebrow">${icon.layers} Лаунчер</span>
      <h2 class="section-title">Скачай <span class="grad grad-anim">HorusLauncher</span></h2>
      <p class="section-sub">Вход по логину и паролю от сайта, автоматическая установка и обновление клиента,
        привязка HWID и управление подпиской прямо в лаунчере.</p>
      <div class="launch-wrap mt-24">
        <div>
          <div class="launch-window">
            <div class="lw-top">
              <div class="lw-ava">${icon.eye}</div>
              <div><div class="lw-user">HorusLauncher</div><div class="lw-sub">Версия <span id="lwVersion">1.0.0</span> · stable</div></div>
            </div>
            <div class="lw-bar"><i></i></div>
            <div class="lw-row"><span>Скачивание</span><b>82% · 1.21.4</b></div>
          </div>
          <div class="dl-card">
            <span style="display:flex;align-items:center"><span>${icon.zap}</span></span>
            <div><div style="font-weight:700">Лаунчер для Windows</div><div class="muted" style="font-size:12.5px">exe · ~12 МБ</div></div>
            ${(state.me && state.me.subscription && !hasSub())
              ? `<span class="btn btn-gold" style="margin-left:auto;opacity:.55;cursor:not-allowed" title="Подписка заморожена">Скачать невозможно</span>`
              : `<a href="#download" class="btn btn-gold" style="margin-left:auto" data-scroll-dl>Скачать</a>`}
          </div>
          <div class="com-count" style="margin-top:12px">Сейчас онлайн: <b id="lwOnline">—</b></div>
        </div>
        <div>
          <span class="eyebrow" style="margin-bottom:14px">${icon.layers} Системные требования</span>
          <div class="feature"><h3>Минимальные</h3><p>Windows 10 · Intel Core i3 / AMD Ryzen 3 · 4 ГБ ОЗУ · 1 ГБ на диске · Minecraft Java 1.21.4</p></div>
          <div class="feature mt-16"><h3>Рекомендуемые</h3><p>Windows 10/11 · Intel Core i5 / AMD Ryzen 5 · 8 ГБ ОЗУ · SSD · видеокарта с 4 ГБ VRAM</p></div>
        </div>
      </div>
      <div id="download" style="margin-top:6px">
        ${(state.me && state.me.subscription && !hasSub())
          ? `<div class="dl-card" style="max-width:640px;opacity:.6">
              <span style="display:flex;align-items:center"><span>${icon.zap}</span></span>
              <div><div style="font-weight:700">HorusLauncher для Windows</div>
              <div class="muted" style="font-size:12.5px">Скачивание недоступно — подписка заморожена</div></div>
              <span class="btn btn-gold" style="margin-left:auto;opacity:.55;cursor:not-allowed">Скачать невозможно</span>
            </div>`
          : `<div class="dl-card" style="max-width:640px">
              <span style="display:flex;align-items:center"><span>${icon.zap}</span></span>
              <div><div style="font-weight:700">HorusLauncher для Windows</div>
              <div class="muted" style="font-size:12.5px">портативный zip · ~45 МБ · версия <span id="dlVersion">1.0.0</span></div></div>
              <a id="dlExeLink" href="/files/HorusLauncher.zip" class="btn btn-gold" style="margin-left:auto" download>Скачать</a>
            </div>`}
      </div>
    </section>

    <section class="section" id="community">
      <span class="eyebrow">${icon.heart} Сообщество</span>
      <h2 class="section-title">Присоединяйся к <span class="grad grad-anim">HorusClient</span></h2>
      <p class="section-sub">Новости, голосования за обновления, розыгрыши подписок и оперативная поддержка.</p>
      <div class="com-grid">
        <a class="com-card" href="${esc(c.discord.url)}" target="_blank" rel="noopener">
          <div class="com-ico ds">${icon.discord}</div>
          <div><h3>Discord</h3><div class="com-count">участников: <b>${fmtNum(c.discord.members)}</b></div></div>
          <div class="com-arrow">${icon.arrow}</div>
        </a>
      </div>
    </section>`;
  }

  function plansHTML(cat = 'all') {
    return state.plans
      .filter(p => cat === 'all' ? true : (cat === 'packs' ? !!p.pack : !p.pack))
      .map((p) => `
      <div class="plan ${p.featured ? 'featured' : ''} ${p.forever ? 'forever-badge' : ''}">
        ${p.key === 'kamiki365' ? '<div class="plan-tag">Выбор игроков</div>' : ''}
        <div class="plan-name">${esc(p.name)}</div>
        <div class="plan-sub">${esc(p.tag)}</div>
        <div class="plan-price">
          <span class="amount">${p.price}</span><span class="cur">${esc(p.currency)}</span>
          <span class="forever">${p.forever ? 'Действует: Навсегда' : p.days ? 'Действует: ' + p.days + ' дней' : ''}</span>
        </div>
        <ul class="plan-feats">${p.desc.map(d => `<li>${icon.check}<span>${esc(d)}</span></li>`).join('')}</ul>
        <button class="btn btn-block ${p.featured ? 'btn-gold' : 'btn-dark'}" data-buy="${p.key}">${esc(p.cta || 'Купить доступ')}</button>
      </div>`).join('');
  }

function bindLanding(app) {
    $$('[data-buy]', app).forEach(b => b.addEventListener('click', () => startPurchase(b.dataset.buy)));
    const pricingGrid = $('#pricingGrid', app);
    if (pricingGrid) {
      pricingGrid.innerHTML = plansHTML('subs');
      $$('[data-buy]', pricingGrid).forEach(b => b.addEventListener('click', () => startPurchase(b.dataset.buy)));
      $$('.subs-tab', app).forEach(t => t.addEventListener('click', () => {
        $$('.subs-tab', app).forEach(x => x.classList.toggle('active', x === t));
        pricingGrid.innerHTML = plansHTML(t.dataset.cat);
        $$('[data-buy]', pricingGrid).forEach(b => b.addEventListener('click', () => startPurchase(b.dataset.buy)));
      }));
    }
    $$('[data-scroll-dl]', app).forEach(dl => dl.addEventListener('click', (e) => {
      if (!hasSub()) {
        e.preventDefault();
        requireSub();
        return;
      }
      const target = document.getElementById('download');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const btn = $('.nav-burger');
    btn.addEventListener('click', () => {
      $('#navLinks').classList.toggle('open');
    });
    // Онлайн-статус лаунчера и последняя версия
    api('/api/launcher/status').then(s => {
      const el = $('#lwOnline');
      if (el && s && typeof s.online === 'number') el.textContent = fmtNum(s.online);
    }).catch(() => {});
    api('/api/launcher/latest').then(l => {
      const el = $('#lwVersion');
      if (el && l && l.version) el.textContent = esc(l.version);
      const dla = $('#dlExeLink');
      if (dla && l && l.url && l.url !== '#download') dla.href = l.url;
    }).catch(() => {});
    api('/api/stats').then(d => {
      const el = $('#statUsers');
      if (el && d && d.users != null) el.textContent = fmtNum(d.users);
    }).catch(() => {});
  }

  /* ---------- окно покупки ---------- */
  const PAY_METHODS = [
    { id: 'sbp',    img: 'img/sbp.jpg',    name: 'СБП',    kind: 'yookassa' },
    { id: 'funpay', img: 'img/funpay.jpg', name: 'FunPay', kind: 'external', url: 'https://funpay.com/lots/offer?id=77228605' },
  ];

  async function startPurchase(planKey) {
    const plan = (state.plans || []).find(p => p.key === planKey)
      || { key: planKey, name: planKey, tag: 'Доступ HorusClient', price: null, currency: '₽' };
    const duration = plan.forever ? 'Навсегда' : (plan.days ? plan.days + ' дней' : 'Разовая услуга');
    const shortDur = plan.key === 'alpha' ? 'Докупка'
      : plan.forever ? 'Навсегда'
      : (plan.days ? plan.days + ' дн' : 'Разовая услуга');
    const priceTxt = plan.price != null ? (plan.price + ' ' + (plan.currency || '₽')) : '';
    const reqPlan = plan.requires ? (state.plans || []).find(r => r.key === plan.requires) : null;
    const reqTxt = reqPlan ? (reqPlan.name + (reqPlan.forever ? ' Навсегда' : '')) : 'Kamiki 1.21.4 Навсегда';

    let selected = 'sbp';
    let promo = null;
    const overlay = document.createElement('div');
    overlay.className = 'buy-overlay';
    overlay.innerHTML = `
      <div class="buy-modal" role="dialog" aria-modal="true">
        <button class="buy-close" data-close aria-label="Закрыть">✕</button>
        <div class="buy-co-head">Оформление</div>
        ${plan.requires ? `<div class="buy-warn">⚠️ Этот товар докупается к подписке ${esc(reqTxt)} (Без нее не покупайте)</div>` : ''}
        <div class="buy-order-row">
          ${plan.pack ? '' : '<span class="buy-order-ic"><img src="img/order_icon.png" alt=""></span>'}
          <span class="buy-order-info">
            <span class="buy-order-name">${plan.pack ? esc(plan.name) : esc(plan.name + ' ' + shortDur)}</span>
          </span>
          <span class="buy-order-price" data-price>${esc(priceTxt)}</span>
          <span class="buy-order-disc" data-disc style="display:none"></span>
        </div>
        <div class="buy-divider"></div>
        <div class="buy-sec-label"><img class="buy-sec-img" src="img/pay_icon.png" alt=""> Способ оплаты</div>
        <div class="buy-chips">
          ${PAY_METHODS.map(m => `
            <button type="button" class="buy-chip" data-method="${m.id}">
              ${m.img ? `<img src="${m.img}" alt="${m.name}">` : `<span class="buy-chip-ic">${m.icon}</span>`}
              <span>${m.name}</span>
            </button>`).join('')}
        </div>
        <div class="buy-ext-note" data-ext-note style="display:none"></div>
        <div data-promo-box>
        <div class="buy-sec-label"><img class="buy-sec-img" src="img/promo_icon.png" alt=""> Промокод</div>
        <div class="buy-promo-row">
          <input type="text" data-promo-input placeholder="Введите промокод" autocomplete="off">
          <button type="button" class="buy-promo-apply" data-promo-apply>✓ Применить</button>
        </div>
        </div>
        <button type="button" class="buy-pay" data-go>Оплатить</button>
      </div>`;

    const goBtn = overlay.querySelector('[data-go]');
    const extNote = overlay.querySelector('[data-ext-note]');
    const promoBox = overlay.querySelector('[data-promo-box]');
    const syncGo = () => {
      const m = PAY_METHODS.find(x => x.id === selected);
      const eff = promo ? (promo.finalPrice + ' ' + (plan.currency || '₽')) : priceTxt;
      if (m.kind === 'external') {
        goBtn.innerHTML = 'Перейти на ' + esc(m.name) + ' ↗';
        if (extNote) {
          extNote.style.display = 'block';
          extNote.textContent = 'Вы будете перенаправлены на ' + m.name + ' для безопасной оплаты.';
        }
      } else {
        goBtn.innerHTML = '<img class="buy-pay-ic" src="img/pay_btn_icon.png" alt=""> ' + esc(!eff ? 'Оплатить' : (m.id === 'sbp' ? 'Оплатить через СБП · ' + eff : 'Оплатить · ' + eff));
        if (extNote) extNote.style.display = 'none';
      }
      overlay.querySelectorAll('.buy-chip').forEach(b =>
        b.classList.toggle('selected', b.dataset.method === selected));
      if (promoBox) promoBox.style.display = (m.kind === 'external') ? 'none' : 'block';
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    const close = () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 220);
    };

    const applyPromo = async () => {
      const input = overlay.querySelector('[data-promo-input]');
      const btn = overlay.querySelector('[data-promo-apply]');
      const code = ((input && input.value) || '').trim().toUpperCase();
      if (!code) return toast('Введите промокод');
      btn.disabled = true; btn.textContent = 'Проверка…';
      try {
        const r = await api('/api/discount/validate', { method: 'POST', body: JSON.stringify({ code, plan: plan.key }) });
        if (r && r.ok) {
          promo = { code, discount: r.discount, finalPrice: r.finalPrice };
          const priceEl = overlay.querySelector('[data-price]');
          if (priceEl) priceEl.innerHTML = priceTxt
            ? '<s>' + esc(priceTxt) + '</s>' + esc(r.finalPrice + ' ' + (plan.currency || '₽'))
            : esc(r.finalPrice + ' ' + (plan.currency || '₽'));
          const discEl = overlay.querySelector('[data-disc]');
          if (discEl) { discEl.textContent = '\u2212' + r.discount + '%'; discEl.style.display = 'inline-block'; }
          toast('Промокод применён: скидка ' + r.discount + '%', 'success');
          syncGo();
        } else {
          toast((r && (r.message || r.error)) || 'Промокод не подходит');
        }
      } catch (err) {
        toast((err && err.message) || 'Не удалось применить промокод');
      }
      btn.disabled = false; btn.textContent = '✓ Применить';
    };

    overlay.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]') || e.target === overlay) return close();
      const mBtn = e.target.closest('[data-method]');
      if (mBtn) { selected = mBtn.dataset.method; return syncGo(); }
      if (e.target.closest('[data-promo-apply]')) return applyPromo();
      if (!e.target.closest('[data-go]')) return;

      const m = PAY_METHODS.find(x => x.id === selected);
      if (m.kind === 'external') {
        window.open(m.url, '_blank', 'noopener');
        return close();
      }
      goBtn.disabled = true;
      goBtn.textContent = 'Создаём платёж…';
      try {
        const r = await api('/api/purchase/yookassa', {
          method: 'POST',
          body: JSON.stringify({ plan: plan.key, methodType: 'redirect', promo: promo ? promo.code : undefined }),
        });
        if (r && r.ok && r.confirmationUrl) {
          window.location.href = r.confirmationUrl;
          return;
        }
        toast((r && (r.message || r.error)) || 'Ссылка на оплату не получена');
      } catch (err) {
        toast((err && err.message) || 'Ошибка подключения к оплате');
      }
      goBtn.disabled = false;
      syncGo();
    });

    document.body.appendChild(overlay);
    syncGo();
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  function hasSub() {
    return !!(state.me && state.me.subscription && state.me.subscription.status === 'active');
  }

  /* Проверка доступа к скачиванию: только с активной подпиской */
  function requireSub() {
    if (hasSub()) return true;
    if (!state.me) {
      toast('Войдите в аккаунт, чтобы скачать лаунчер');
      location.hash = '#/login';
    } else if (state.me.subscription) {
      toast('Подписка заморожена — скачивание недоступно', 'error');
      location.hash = '#/cabinet/buy';
    } else {
      toast('Скачивание доступно только с подпиской', 'error');
      location.hash = '#/cabinet/buy';
    }
    return false;
  }

  /* ================= AUTH ================= */
  function routeAuth(path) {
    const isLogin = path === '/login';
    const app = $('#app');
    document.title = isLogin ? 'Вход — HorusClient' : 'Регистрация — HorusClient';

    const pending = sessionStorage.getItem('pendingBuy');
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="form-card">
        <div class="form-title">${isLogin ? 'С возвращением!' : 'Создать аккаунт'}</div>
        <div class="form-sub">${isLogin
          ? 'Войдите в личный кабинет, чтобы управлять подписками.'
          : 'Регистрация займёт полминуты. Понадобится только логин и почта.'}</div>
        <form id="authForm">
          ${isLogin ? '' : `
            <div class="field"><label>Логин</label>
              <input name="login" autocomplete="username" placeholder="0_0_Krolik" maxlength="20" required>
              <div class="hint">3-20 символов: латиница, цифры, подчёркивание</div></div>`}
          <div class="field"><label>${isLogin ? 'Логин или почта' : 'Почта'}</label>
            <input name="${isLogin ? 'login' : 'email'}" type="${isLogin ? 'text' : 'email'}" autocomplete="${isLogin ? 'username' : 'email'}"
              placeholder="${isLogin ? '0_0_Krolik или mail@example.com' : 'mail@example.com'}" required></div>
          <div class="field"><label>Пароль</label>
            <input name="password" type="password" autocomplete="current-password" placeholder="••••••••" minlength="8" required>
            <div class="hint">Минимум 8 символов</div></div>
          ${isLogin ? '' : `
            <div class="field"><label>Повторите пароль</label>
              <input name="password2" type="password" autocomplete="new-password" placeholder="••••••••" minlength="8" required></div>`}
          <button type="submit" class="btn btn-gold btn-block btn-lg">${isLogin ? 'Войти' : 'Зарегистрироваться'}</button>
        </form>
        <div class="form-switch">${isLogin
          ? 'Нет аккаунта? <a href="#/register">Зарегистрируйтесь</a>'
          : 'Уже есть аккаунт? <a href="#/login">Войти</a>'}</div>
        ${isLogin ? `<div class="form-switch" style="margin-top:6px"><a href="#/forgot" style="font-size:13px">Забыли пароль?</a></div>` : ''}
      </div>
    </div>`;

    $('#authForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = { login: f.login.value.trim(), password: f.password.value };
      if (!isLogin) body.email = f.email.value.trim();
      const btn = f.querySelector('button');
      btn.disabled = true; btn.textContent = 'Подождите...';
      try {
        if (!isLogin) {
          if (f.password.value !== f.password2.value) throw new Error('Пароли не совпадают');
          const r = await api('/api/register', { method: 'POST', body: JSON.stringify(body) });
          state.me = r.user;
        } else {
          const r = await api('/api/login', { method: 'POST', body: JSON.stringify(body) });
          if (r && r.ok && r.need2fa) {
            btn.disabled = false;
            showLogin2fa(r.token, body.login);
            return;
          }
          state.me = r.user;
        }
        renderNav();
        toast('Добро пожаловать, ' + state.me.login + '!', 'success');
        const buf = sessionStorage.getItem('pendingBuy');
        sessionStorage.removeItem('pendingBuy');
        location.hash = buf ? '#/cabinet/buy' : '#/cabinet';
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false; btn.textContent = isLogin ? 'Войти' : 'Зарегистрироваться';
      }
    });
  }

  function routeForgot() {
    const app = $('#app');
    document.title = 'Восстановление пароля — HorusClient';
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="form-card">
        <div class="form-title">Восстановление пароля</div>
        <div class="form-sub">Введите логин — код придёт в привязанный Telegram.</div>
        <form id="forgotForm">
          <div class="field"><label>Логин</label>
            <input name="login" autocomplete="username" placeholder="0_0_Krolik" maxlength="20" required></div>
          <button type="submit" class="btn btn-gold btn-block btn-lg">Получить код</button>
        </form>
        <div id="forgotResult"></div>
        <div class="form-switch"><a href="#/login">← Вернуться ко входу</a></div>
      </div>
    </div>`;

    $('#forgotForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      const box = $('#forgotResult');
      btn.disabled = true; btn.textContent = 'Подождите...';
      try {
        const r = await api('/api/forgot/request', {
          method: 'POST', body: JSON.stringify({ login: e.target.login.value.trim() })
        });
        if (r.sent) {
          if (box) { box.className = 'okbox'; box.textContent = r.message || 'Код отправлен.'; }
          e.target.reset();
          showForgotConfirm();
        } else if (box) {
          box.className = 'okbox';
          box.textContent = r.message || 'Если к аккаунту привязан Telegram — код будет отправлен туда.';
        }
      } catch (err) {
        if (box) { box.className = 'okbox err'; box.textContent = err.message; }
      } finally {
        btn.disabled = false; btn.textContent = 'Получить код';
      }
    });

    function showForgotConfirm() {
      const app = $('#app');
      document.title = 'Восстановление пароля — HorusClient';
      app.innerHTML = `
    <div class="auth-wrap">
      <div class="form-card">
        <div class="form-title">Введите код</div>
        <div class="form-sub">Код из Telegram + новый пароль.</div>
        <form id="forgotConfirmForm">
          <div class="field"><label>Логин</label>
            <input name="login" autocomplete="username" placeholder="0_0_Krolik" maxlength="20" required></div>
          <div class="field"><label>Код из Telegram</label>
            <input name="code" placeholder="XXXXXX" maxlength="6" autocapitalize="characters" autocomplete="one-time-code" required></div>
          <div class="field"><label>Новый пароль</label>
            <input name="password" type="password" autocomplete="new-password" placeholder="••••••••" minlength="8" required>
            <div class="hint">Минимум 8 символов</div></div>
          <button type="submit" class="btn btn-gold btn-block btn-lg">Сменить пароль</button>
        </form>
        <div id="forgotConfirmResult"></div>
        <div class="form-switch"><a href="#/login">← Вернуться ко входу</a></div>
      </div>
    </div>`;
      $('#forgotConfirmForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        const box = $('#forgotConfirmResult');
        btn.disabled = true; btn.textContent = 'Подождите...';
        try {
          const r = await api('/api/forgot/confirm', {
            method: 'POST', body: JSON.stringify({
              login: e.target.login.value.trim(),
              code: e.target.code.value.trim(),
              password: e.target.password.value
            })
          });
          if (box) { box.className = 'okbox'; box.textContent = 'Пароль изменён!'; }
          toast(r.message || 'Пароль изменён', 'success');
          setTimeout(() => { location.hash = '#/login'; }, 1200);
        } catch (err) {
          if (box) { box.className = 'okbox err'; box.textContent = err.message; }
          btn.disabled = false; btn.textContent = 'Сменить пароль';
        }
      });
    }
  }

  function routeReset() {
    const app = $('#app');
    document.title = 'Установка пароля — HorusClient';
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const u = params.get('u') || '';
    const c = params.get('c') || '';
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="form-card">
        <div class="form-title">Установка пароля</div>
        <div class="form-sub" id="resetSub">Проверяем ссылку...</div>
        <div id="resetBody"><div class="empty" style="padding:18px 0">Загрузка...</div></div>
        <div class="form-switch"><a href="#/login">← Вернуться ко входу</a></div>
      </div>
    </div>`;
    (async () => {
      const sub = $('#resetSub');
      const body = $('#resetBody');
      try {
        const r = await api('/api/forgot/status?u=' + encodeURIComponent(u) + '&c=' + encodeURIComponent(c));
        if (!r.valid) throw new Error('Код не подтверждён в Telegram. Откройте ссылку из сообщения бота.');
        if (sub) sub.textContent = 'Введите новый пароль для аккаунта <b>' + esc(r.login) + '</b>.';
        body.innerHTML = `
          <form id="resetForm">
            <div class="field"><label>Новый пароль</label>
              <input name="password" type="password" autocomplete="new-password" placeholder="••••••••" minlength="8" required>
              <div class="hint">Минимум 8 символов</div></div>
            <button type="submit" class="btn btn-gold btn-block btn-lg">Сменить пароль</button>
          </form>
          <div id="resetResult"></div>`;
        $('#resetForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = e.target.querySelector('button');
          const box = $('#resetResult');
          btn.disabled = true; btn.textContent = 'Подождите...';
          try {
            await api('/api/forgot/confirm', {
              method: 'POST', body: JSON.stringify({
                login: r.login, code: c, password: e.target.password.value
              })
            });
            toast('Пароль изменён. Войдите с новым паролем.', 'success');
            setTimeout(() => { location.hash = '#/login'; }, 1200);
          } catch (err) {
            if (box) { box.className = 'okbox err'; box.textContent = err.message; }
            btn.disabled = false; btn.textContent = 'Сменить пароль';
          }
        });
      } catch (err) {
        if (sub) sub.textContent = 'Ошибка';
        body.innerHTML = `<div class="empty" style="padding:18px 0">${esc(err.message)}</div>`;
      }
    })();
  }

/* ================= CABINET ================= */
  const CAB_SECTIONS = {
    globa: { icon: 'globe', title: 'Глобалка' },
    shop: { icon: 'cart', title: 'Магазин' },
    profile: { icon: 'user', title: 'Профиль' },
    subs: { icon: 'crown', title: 'Подписки' },
    device: { icon: 'monitor', title: 'Привязка устройства' },
    buy: { icon: 'cart', title: 'Купить доступ' },
    security: { icon: 'shield', title: 'Безопасность' },
    promo: { icon: 'spark', title: 'Раздача' },
    discounts: { icon: 'zap', title: 'Создание скидок' },
    testing: { icon: 'bug', title: 'Тестирование' },
    ops: { icon: 'cart', title: 'Операции' },
    mod: { icon: 'shield', title: 'Модификация' },
    media: { icon: 'spark', title: 'Медийка' },
    inv: { icon: 'layers', title: 'Инвентарь' },
    support: { icon: 'support', title: 'Поддержка' },
    idea: { icon: 'idea', title: 'Предложить идею' },
    bug: { icon: 'bug', title: 'Сообщить о баге' }
  };

  const isOwner = () => state.me && state.me.login === 'Howill_';
  const isMedia = () => state.me && (state.me.role === 'media' || state.me.role === 'admin' || isOwner());
  const roleLabel = (r) => r === 'admin' ? 'Администратор' : r === 'mod' ? 'Модератор' : r === 'media' ? 'Медиа' : 'User';

  /* ---------- темы сайта (Alpha) ---------- */
  const THEMES = {
    violet:  { label: 'Фиолетовый', gold: '#a855f7', gold2: '#d8b4fe', dim: 'rgba(168,85,247,0.12)' },
    red:     { label: 'Красный',    gold: '#ef4444', gold2: '#fca5a5', dim: 'rgba(239,68,68,0.12)' },
    blue:    { label: 'Синий',      gold: '#3b82f6', gold2: '#93c5fd', dim: 'rgba(59,130,246,0.12)' },
    emerald: { label: 'Изумрудный', gold: '#10b981', gold2: '#6ee7b7', dim: 'rgba(16,185,129,0.12)' },
    gold:    { label: 'Золотой',    gold: '#f59e0b', gold2: '#fcd34d', dim: 'rgba(245,158,11,0.12)' },
    cyan:    { label: 'Бирюзовый',  gold: '#06b6d4', gold2: '#67e8f9', dim: 'rgba(6,182,212,0.12)' },
    pink:    { label: 'Розовый',    gold: '#ec4899', gold2: '#f9a8d4', dim: 'rgba(236,72,153,0.12)' }
  };

  function applyTheme(key) {
    const t = THEMES[key] || THEMES.violet;
    const r = document.documentElement.style;
    r.setProperty('--gold', t.gold);
    r.setProperty('--gold-2', t.gold2);
    r.setProperty('--gold-dim', t.dim);
  }

  function routeCabinet(path) {
    if (!state.me) {
      location.hash = '#/login';
      return;
    }
    const parts = path.split('/').filter(Boolean);
    let section = parts[1] || 'profile';
    if (section === 'media' && !isMedia()) section = 'profile';
    const ap = $('#app');

    document.title = (CAB_SECTIONS[section] ? CAB_SECTIONS[section].title + ' — ' : '') + 'HorusClient · Кабинет';
    ap.innerHTML = cabinetHTML();
    renderCabSidebar(section);
    renderCabContent(section, ap);

    $$('[data-cab]', ap).forEach(a => a.addEventListener('click', () => {
      renderCabSidebar(a.dataset.cab);
      renderCabContent(a.dataset.cab, ap);
      window.scrollTo({ top: 0 });
    }));
  }

  function cabinetHTML() {
    const u = state.me;
    return `
    <div class="cab-wrap">
      <aside class="sidebar">
        <div class="sb-user">
          <div class="sb-ava${u.decoActive === 'ava_deco' ? ' royal' : ''}${u.decoActive === 'ava_ice' ? ' sapphire' : ''}${u.decoActive === 'ava_white' ? ' white' : ''}">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || 'H')[0].toUpperCase())}${u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>' : ''}${u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>' : ''}${u.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : ''}</div>
          <div style="min-width:0"><div class="sb-name${u.loginColor ? ' login-grad login-grad-' + u.loginColor : ''}">${esc(u.login)}</div>
          ${u.role ? `<div class="sb-role ${u.roleColor ? 'role-grad role-grad-' + u.roleColor : ''}">${roleLabel(u.role)}</div>` : ''}
          <div class="sb-uid">UID: <b>${esc(u.uid)}</b></div></div>
        </div>
${sbGroup('Мой кабинет', [
          ['profile', 'user', 'Профиль'],
          ['globa', 'globe', 'Глобалка'],
          ['shop', 'cart', 'Магазин'],
          ...(isMedia() ? [['media', 'spark', 'Медийка']] : []),
          ['inv', 'layers', 'Инвентарь'],
          ['redeem', 'key', 'Активация ключа'],
          ['subs', 'crown', 'Подписки'],
          ['device', 'monitor', 'Привязка устройства'],
          ['buy', 'cart', 'Купить доступ'],
          ['security', 'shield', 'Безопасность'],
          ...(isOwner() ? [['mod', 'shield', 'Модификация']] : [])
        ])}
        ${sbGroup('Помощь', [
          ['support', 'support', 'Поддержка'],
          ['idea', 'idea', 'Предложить идею'],
          ['bug', 'bug', 'Сообщить о баге']
        ])}
        <div class="sb-group">
          <h5>Сообщество</h5>
          <a class="sb-item" href="${esc(state.community.discord.url)}" target="_blank" rel="noopener">
            <span style="color:#8b95ff">${icon.discord}</span>Discord
            <span style="margin-left:auto;color:var(--muted-2);font-size:12px">${fmtNum(state.community.discord.members)}</span>
          </a>
        </div>
        <div class="sb-sep"></div>
        <button class="sb-item" id="logoutBtn"><span style="color:var(--red)">${icon.lock}</span>Выйти</button>
      </aside>
      <main class="cab-main" id="cabMain"></main>
    </div>`;
  }

  function sbGroup(title, items) {
    return `<div class="sb-group"><h5>${title}</h5>${items.map(([id, ico, label]) => `
      <button class="sb-item" data-cab="${id}"><span>${icon[ico]}</span>${label}</button>`).join('')}</div>`;
  }

  function renderCabSidebar(section) {
    $$('.sb-item[data-cab]').forEach(b => b.classList.toggle('active', b.dataset.cab === section));
    const lb = $('#logoutBtn');
    if (lb) lb.addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch {}
      state.me = null; renderNav(); location.hash = '#/';
      toast('Вы вышли из аккаунта');
    });
  }

  function renderCabContent(section, ap) {
    const main = $('#cabMain');
    if (!main) return;
if (section === 'profile') main.innerHTML = viewProfile();
    else if (section === 'globa') main.innerHTML = viewGloba();
    else if (section === 'shop') main.innerHTML = viewShop();
    else if (section === 'media' && isMedia()) main.innerHTML = viewMedia();
    else if (section === 'inv') main.innerHTML = viewInv();
    else if (section === 'subs') main.innerHTML = viewSubs();
    else if (section === 'device') main.innerHTML = viewDevice();
    else if (section === 'buy') main.innerHTML = viewBuy();
    else if (section === 'redeem') main.innerHTML = viewRedeem();
    else if (section === 'invoice') main.innerHTML = viewProfile();
    else if (section === 'promo' && isOwner()) main.innerHTML = viewPromo();
    else if (section === 'discounts' && isOwner()) main.innerHTML = viewDiscounts();
    else if (section === 'testing' && isOwner()) main.innerHTML = viewTesting();
    else if (section === 'ops' && isOwner()) main.innerHTML = viewOps();
    else if (section === 'mod' && isOwner()) main.innerHTML = viewMod();
    else if (section === 'security') main.innerHTML = viewSecurity();
    else main.innerHTML = viewSupport(section, ap);
    bindSection(section, main, ap);
  }

  function fileToResizedDataUrl(file, maxW, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality || 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать картинку')); };
      img.src = url;
    });
  }

  async function uploadProfileImage(btn, kind) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = (state.me && state.me.hasAlpha) ? 'image/png,image/jpeg,image/webp,image/gif' : 'image/png,image/jpeg,image/webp';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      btn.disabled = true;
      try {
        const isGif = f.type === 'image/gif';
        let data;
        if (isGif) {
          if (!(state.me && state.me.hasAlpha)) { toast('GIF доступен только владельцам Alpha 1.21.4', 'error'); btn.disabled = false; return; }
          if (f.size > 8 * 1024 * 1024) { toast('GIF слишком большой (макс 8 МБ)', 'error'); btn.disabled = false; return; }
          data = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => rej(new Error('Не удалось прочитать файл'));
            r.readAsDataURL(f);
          });
        } else {
          data = await fileToResizedDataUrl(f, kind === 'banner' ? 1200 : 256, 0.82);
        }
        const r = await api('/api/profile/image', { method: 'POST', body: JSON.stringify({ kind, data }) });
        toast((r && r.message) || 'Обновлено', 'success');
        if (state.me) state.me[kind] = data;
        renderCabContent('profile');
        bindSection('profile');
      } catch (err) { toast(err.message, 'error'); }
      btn.disabled = false;
    });
    inp.click();
  }

  function viewProfile() {
    const u = state.me;
    const glossy = !!(u.glossy && u.glossyAllowed);
    const loginCls = u.loginColor ? ' login-grad login-grad-' + u.loginColor : '';
    return `
    <div class="page-card${glossy ? ' glossy-card' : ''}" id="glossyCard" style="overflow:hidden">
      <div class="profile-banner${glossy ? ' glossy-banner' : ''}" id="glossyBanner"${u.banner ? ` style="background-image:url('${u.banner}')"` : ''}>
        <button type="button" class="btn btn-ghost btn-sm" data-upload="banner">Сменить баннер</button>
      </div>
      <div class="profile-ava-wrap">
        <div class="profile-ava${glossy ? ' glossy-ava' : ''}${u.decoActive === 'ava_deco' ? ' royal' : ''}${u.decoActive === 'ava_ice' ? ' sapphire' : ''}${u.decoActive === 'ava_white' ? ' white' : ''}" id="glossyAva">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || '?')[0].toUpperCase())}${u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>' : ''}${u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>' : ''}${u.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : ''}</div>
        <div>
          <div class="${loginCls}" style="font-weight:800;font-size:16px">${esc(u.login)}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-upload="avatar" style="margin-top:6px">Сменить аватар</button>
          ${u.hasAlpha ? '<div style="color:var(--muted);font-size:11.5px;margin-top:4px">Доступен GIF — Alpha 1.21.4</div>' : ''}
        </div>
      </div>
      ${u.glossyAllowed ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.02)">
        <div>
          <div style="display:flex;align-items:center;gap:8px;font-weight:700">Глянцевый профиль <span class="alpha-badge">${icon.crown} Только Alpha</span></div>
          <div id="glossyHint" style="color:var(--muted);font-size:12.5px;margin-top:3px">${glossy ? 'Глянец включён — карточка профиля блестит ✨' : 'Включи глянец, чтобы карточка профиля блестела'}</div>
        </div>
        <button type="button" id="glossyToggle" class="btn btn-sm ${glossy ? 'btn-gold' : 'btn-dark'}">${glossy ? 'Выключить' : 'Включить'}</button>
      </div>` : ''}
      ${u.hasAlpha ? `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.02)">
        <div>
          <div style="display:flex;align-items:center;gap:8px;font-weight:700">Цвет темы сайта <span class="alpha-badge">${icon.crown} Только Alpha</span></div>
          <div style="color:var(--muted);font-size:12.5px;margin-top:3px">Кастомный акцент для всего сайта — сохраняется на вашем аккаунте</div>
        </div>
        <div class="theme-swatches" id="themeSwatches">
          ${Object.keys(THEMES).map(k => `<button type="button" class="theme-swatch${(u.theme || 'violet') === k ? ' active' : ''}" data-theme-key="${k}" title="${THEMES[k].label}" style="--sw:${THEMES[k].gold}"></button>`).join('')}
        </div>
      </div>` : ''}
      <div class="page-head" style="padding-top:16px"><div>
        <div class="page-title">Профиль</div>
        <div class="page-sub">Данные вашего аккаунта</div>
      </div></div>
      <div class="profile-grid">
        <div class="pfield"><div class="pl">Логин</div><div class="pv">${esc(u.login)}</div></div>
        <div class="pfield"><div class="pl">UID</div><div class="pv mono">${esc(u.uid)}</div></div>
        <div class="pfield"><div class="pl">Роль</div><div class="pv">${u.roleColor ? `<span class="role-grad role-grad-${u.roleColor}">${esc(roleLabel(u.role))}</span>` : `${u.role ? '<b style="color:var(--gold)">' + esc(roleLabel(u.role)) + '</b>' : 'User'}`}</div></div>
        <div class="pfield"><div class="pl">Почта</div><div class="pv">${esc(u.email)}</div></div>
        <div class="pfield"><div class="pl">Дата регистрации</div><div class="pv">${fmtDate(u.createdAt)}</div></div>
<div class="pfield"><div class="pl">HWID</div>
          <div class="pv mono">${u.hwid ? esc(u.hwid) : '<span class="badge badge-gray">Не привязано</span>'}</div></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        ${u.subscription && u.subscription.status === 'active'
          ? `<a href="#/launcher" class="btn btn-gold btn-lg">${icon.layers} Скачать клиент</a>`
          : (u.subscription ? `<span class="btn btn-gold btn-lg" style="opacity:.55;cursor:not-allowed;pointer-events:none">${icon.x} Скачать невозможно</span>` : `<a href="#/cabinet/buy" data-cab="buy" class="btn btn-gold btn-lg">${icon.crown} Купить доступ</a>`)}
      </div>
    </div>
    <div class="page-card">
      <div class="page-head"><div>
        <div class="page-title">Подписка</div>
        <div class="page-sub">Текущая подписка на аккаунт</div>
      </div>
      ${u.subscription ? '' : `<a href="#/cabinet/buy" data-cab="buy" class="btn btn-gold">Купить доступ</a>`}</div>
       ${u.subscription
        ? `<div class="sub-name">${esc(u.subscription.name)}</div>
           ${u.subscription.status === 'frozen'
            ? `<div class="sub-status" style="color:var(--red)">${icon.x} Заморожена владельцем</div>
               <div class="sub-rows">
                 <div class="sub-row"><span>Действует</span><b>${u.subscription.forever ? 'Навсегда' : fmtDate(u.subscription.expiresAt)}</b></div>
                 <div class="sub-row"><span>Дата покупки</span><b>${fmtDate(u.subscription.purchasedAt)}</b></div>
               </div>
               <div class="warn" style="margin-top:14px">Подписка заморожена — запуск клиента заблокирован. Обратитесь в поддержку Discord.</div>`
            : `<div class="sub-status active">${icon.check} Активна · ${esc(u.subscription.tag)}</div>
               <div class="sub-rows">
                 <div class="sub-row"><span>Действует</span><b>${u.subscription.forever ? 'Навсегда' : fmtDate(u.subscription.expiresAt)}</b></div>
                 <div class="sub-row"><span>Дата покупки</span><b>${fmtDate(u.subscription.purchasedAt)}</b></div>
               </div>`}`
        : `<div class="empty">${icon.crown}<b>Подписка не активна</b>Нажмите «Купить доступ» или активируйте промокод.</div>`}
    </div>`;
  }

  /* ---------- Глобалка: поиск игроков, профили, друзья ---------- */
  function viewGloba() {
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Глобалка</div>
        <div class="page-sub">Поиск друзей по логину и просмотр их профилей</div>
      </div><button type="button" class="btn btn-dark" id="globkaSelf">${icon.user} Свой профиль</button></div>
      <div class="globka-search">
        <div class="field" style="flex:1;margin-bottom:0;min-width:260px">
          <label>Поиск по логину</label>
          <input type="text" id="globkaSearch" placeholder="Например: 0_0_Krolik" maxlength="30" autocomplete="off" spellcheck="false">
        </div>
        <button type="button" class="btn btn-gold" id="globkaSearchBtn">${icon.search} Поиск</button>
      </div>
      <div id="globkaResults" class="globka-results"></div>
    </div>
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Уведомления</div>
        <div class="page-sub">Заявки в друзья — примите, отклоните или дождитесь подтверждения</div>
      </div></div>
      <div id="globkaReqs" class="globka-results"></div>
    </div>
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Сообщения</div>
        <div class="page-sub">Новые личные сообщения от игроков</div>
      </div></div>
      <div id="globkaDm" class="globka-results"></div>
    </div>
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Мои друзья</div>
        <div class="page-sub">Нажмите «Профиль», чтобы посмотреть, что купил друг в магазине</div>
      </div></div>
      <div id="globkaFriends" class="globka-results"></div>
    </div>`;
  }

  function globkaRowHTML(u) {
    const avaCls = 'sb-ava' + (u.decoActive === 'ava_deco' ? ' royal' : '') + (u.decoActive === 'ava_ice' ? ' sapphire' : '') + (u.decoActive === 'ava_white' ? ' white' : '');
    const avaSpan = u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>'
      : u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>'
      : u.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : '';
    const subTxt = u.subscription && u.subscription.status === 'active'
      ? ` · <span style="color:var(--green)">${esc(u.subscription.name)}</span>` : '';
    let friendBtn;
    if (u.isFriend) friendBtn = `<button type="button" class="btn btn-sm ${u.isReqIn ? 'btn-gold' : 'btn-dark'}" data-globka-friend="${esc(u.login)}" data-globka-isfriend="1" data-globka-reqin="${u.isReqIn ? 1 : 0}">${u.isReqIn ? 'Принять заявку' : 'В друзьях ✓'}</button>`;
    else if (u.isReqOut) friendBtn = `<button type="button" class="btn btn-sm btn-dark" data-globka-friend="${esc(u.login)}" data-globka-isfriend="0" data-globka-reqout="1" title="Отменить заявку">Заявка отправлена</button>`;
    else friendBtn = `<button type="button" class="btn btn-sm btn-gold" data-globka-friend="${esc(u.login)}" data-globka-isfriend="0">Добавить в друзья</button>`;
    return `
    <div class="globka-row">
      <div class="${avaCls}">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || '?')[0].toUpperCase())}${avaSpan}</div>
      <div style="min-width:0">
        <div class="sb-name${u.loginColor ? ' login-grad login-grad-' + u.loginColor : ''}">${esc(u.login)}</div>
        ${u.online ? '<div class="globka-online"><span class="gdot"></span>Онлайн</div>' : ''}
        ${u.role ? `<div class="sb-role ${u.roleColor ? 'role-grad role-grad-' + u.roleColor : ''}">${roleLabel(u.role)}</div>` : ''}
        <div class="sb-uid">UID: <b>${esc(u.uid)}</b>${subTxt}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap">
        ${friendBtn}
        <button type="button" class="btn btn-sm btn-ghost" data-globka-dm="${esc(u.login)}">${icon.support} Сообщение</button>
        <button type="button" class="btn btn-sm btn-ghost" data-globka-profile="${esc(u.login)}">Профиль</button>
      </div>
    </div>`;
  }

  function globkaReqRowHTML(u) {
    const avaCls = 'sb-ava' + (u.decoActive === 'ava_deco' ? ' royal' : '') + (u.decoActive === 'ava_ice' ? ' sapphire' : '') + (u.decoActive === 'ava_white' ? ' white' : '');
    const avaSpan = u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>'
      : u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>'
      : u.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : '';
    return `
    <div class="globka-row">
      <div class="${avaCls}">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || '?')[0].toUpperCase())}${avaSpan}</div>
      <div style="min-width:0">
        <div class="sb-name${u.loginColor ? ' login-grad login-grad-' + u.loginColor : ''}">${esc(u.login)}</div>
        ${u.online ? '<div class="globka-online"><span class="gdot"></span>Онлайн</div>' : ''}
        ${u.role ? `<div class="sb-role ${u.roleColor ? 'role-grad role-grad-' + u.roleColor : ''}">${roleLabel(u.role)}</div>` : ''}
        <div class="sb-uid">UID: <b>${esc(u.uid)}</b> · хочет добавить вас в друзья</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-gold" data-globka-accept="${esc(u.login)}">${icon.check} Принять</button>
        <button type="button" class="btn btn-sm btn-ghost" data-globka-decline="${esc(u.login)}">Отклонить</button>
        <button type="button" class="btn btn-sm btn-ghost" data-globka-dm="${esc(u.login)}">${icon.support} Сообщение</button>
        <button type="button" class="btn btn-sm btn-ghost" data-globka-profile="${esc(u.login)}">Профиль</button>
      </div>
    </div>`;
  }

  function globkaDmRowHTML(n) {
    const avaCls = 'sb-ava' + (n.decoActive === 'ava_deco' ? ' royal' : '') + (n.decoActive === 'ava_ice' ? ' sapphire' : '') + (n.decoActive === 'ava_white' ? ' white' : '');
    const avaSpan = n.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>'
      : n.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>'
      : n.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : '';
    return `
    <div class="globka-row">
      <div class="${avaCls}">${n.avatar ? `<img src="${n.avatar}" alt="">` : esc(String(n.login || '?')[0].toUpperCase())}${avaSpan}</div>
      <div style="min-width:0">
        <div class="sb-name${n.loginColor ? ' login-grad login-grad-' + n.loginColor : ''}">${esc(n.login)}</div>
        ${n.online ? '<div class="globka-online"><span class="gdot"></span>Онлайн</div>' : ''}
        <div class="dm-notif-text">${icon.cooldown} Что написано: <span>${esc(n.text)}</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-gold" data-globka-dm="${esc(n.login)}">${icon.support} Сообщения (Перейти в чат)</button>
      </div>
    </div>`;
  }

  function globkaReqOutRowHTML(u) {
    const avaCls = 'sb-ava' + (u.decoActive === 'ava_deco' ? ' royal' : '') + (u.decoActive === 'ava_ice' ? ' sapphire' : '') + (u.decoActive === 'ava_white' ? ' white' : '');
    const avaSpan = u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>'
      : u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>'
      : u.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : '';
    return `
    <div class="globka-row">
      <div class="${avaCls}">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || '?')[0].toUpperCase())}${avaSpan}</div>
      <div style="min-width:0">
        <div class="sb-name${u.loginColor ? ' login-grad login-grad-' + u.loginColor : ''}">${esc(u.login)}</div>
        ${u.online ? '<div class="globka-online"><span class="gdot"></span>Онлайн</div>' : ''}
        ${u.role ? `<div class="sb-role ${u.roleColor ? 'role-grad role-grad-' + u.roleColor : ''}">${roleLabel(u.role)}</div>` : ''}
        <div class="sb-uid">UID: <b>${esc(u.uid)}</b> · <span style="color:var(--gold)">ждет подтверждения</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-ghost" data-globka-cancel="${esc(u.login)}">Отменить</button>
        <button type="button" class="btn btn-sm btn-ghost" data-globka-dm="${esc(u.login)}">${icon.support} Сообщение</button>
        <button type="button" class="btn btn-sm btn-ghost" data-globka-profile="${esc(u.login)}">Профиль</button>
      </div>
    </div>`;
  }

  function profileOwnedHTML(p, s, catFilter) {
    const items = s.items || [];
    const owned = s.owned || {};
    const cats = [...new Set(items.filter(i => owned && owned[i.key]).map(i => i.cat || 'Товары'))];
    const u = p;
    const letter = esc(String(u.login || 'H')[0].toUpperCase());
    const isActive = (it) => it.kind === 'login_color' ? s.activeColor === it.key
      : it.kind === 'role_color' ? s.activeRole === it.key
      : s.activeDeco === it.key;
    const inCat = (it) => (it.cat || 'Товары') === catFilter;
    return items.filter(i => owned && owned[i.key] && (!catFilter || inCat(i))).map(it => {
      const used = isActive(it);
      const st = DECO_STYLE[it.key] || { cls: '', span: '' };
      return `
      <div class="shop-item${used ? ' used' : ''}">
        <div class="shop-prev">
          ${it.kind === 'login_color'
            ? `<div class="login-prev${used ? ' is-active' : ''}"><span class="login-grad login-grad-${it.key}">${esc(u.login)}</span></div>`
            : it.kind === 'role_color'
              ? `<div class="login-prev${used ? ' is-active' : ''}"><span class="role-grad role-grad-${it.key}">${esc(u.role ? roleLabel(u.role) : 'Роль')}</span></div>`
              : `<div class="shop-ava ${st.cls}">${u.avatar ? `<img src="${u.avatar}" alt="">` : letter}${st.span}</div>`}
        </div>
        <div class="shop-info">
          <div class="shop-name">${esc(it.name)}</div>
          <div class="shop-sub">${esc(it.cat || '')}</div>
        </div>
        <div class="shop-cta">${used ? '<span class="stb stb-ok" style="white-space:nowrap">' + icon.check + ' Используется</span>' : '<span class="stb">Куплено</span>'}</div>
      </div>`;
    }).join('');
  }

  async function renderGlobaProfile(login, main) {
    main.innerHTML = '<div class="page-card"><div class="empty" style="padding:22px 0">Загрузка профиля…</div></div>';
    try {
      const r = await api('/api/globka/profile?login=' + encodeURIComponent(login));
      if (!r || !r.user) { main.innerHTML = '<div class="page-card"><div class="empty">Профиль не найден</div></div>'; return; }
      const p = r.user;
      const s = r.shop || { items: [], owned: {}, activeColor: null, activeRole: null, activeDeco: null };
      const glossy = !!(p.glossy && p.glossyAllowed);
      const loginCls = p.loginColor ? ' login-grad login-grad-' + p.loginColor : '';
      const items = s.items || [];
      const ownedItems = items.filter(i => s.owned && s.owned[i.key]);
      const ownedCats = [...new Set(ownedItems.map(i => i.cat || 'Товары'))];
      const activeCat = globkaOwnedCat && ownedCats.includes(globkaOwnedCat) ? globkaOwnedCat : (ownedCats[0] || '');
      main.innerHTML = `
      <div class="page-card${glossy ? ' glossy-card' : ''}" style="overflow:hidden;max-width:820px">
        <div class="profile-banner${glossy ? ' glossy-banner' : ''}"${p.banner ? ` style="background-image:url('${p.banner}')"` : ''}></div>
        <div class="profile-ava-wrap">
          <div class="profile-ava${glossy ? ' glossy-ava' : ''}${p.decoActive === 'ava_deco' ? ' royal' : ''}${p.decoActive === 'ava_ice' ? ' sapphire' : ''}${p.decoActive === 'ava_white' ? ' white' : ''}">${p.avatar ? `<img src="${p.avatar}" alt="">` : esc(String(p.login || '?')[0].toUpperCase())}${p.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>' : ''}${p.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>' : ''}${p.decoActive === 'ava_white' ? '<span class="c-white">✦</span>' : ''}</div>
          <div style="min-width:0">
            <div class="${loginCls}" style="font-weight:800;font-size:16px">${esc(p.login)}</div>
            ${p.online ? '<div class="globka-online" style="margin-top:2px"><span class="gdot"></span>Онлайн</div>' : ''}
            <div style="color:var(--muted);font-size:12.5px;margin-top:3px">UID: <b>${esc(p.uid)}</b></div>
            ${p.role ? `<div class="sb-role ${p.roleColor ? 'role-grad role-grad-' + p.roleColor : ''}" style="display:inline-flex;margin-top:2px">${roleLabel(p.role)}</div>` : ''}
          </div>
          ${p.isFriend ? `<div style="display:flex;align-items:center;gap:8px;margin-left:auto">
            <button type="button" class="btn btn-sm btn-ghost" data-globka-dm="${esc(p.login)}">${icon.support} Сообщение</button>
            <span class="stb stb-ok" style="white-space:nowrap">${icon.check} Друзья</span></div>`
          : (state.me && p.login !== state.me.login) ? `
            <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
              <button type="button" class="btn btn-sm btn-ghost" data-globka-dm="${esc(p.login)}">${icon.support} Сообщение</button>
              <button type="button" class="btn btn-sm ${p.isReqOut ? 'btn-dark' : 'btn-gold'}" data-globka-profile-friend="${esc(p.login)}" data-globka-pfriend="0" data-globka-preqin="${p.isReqIn ? 1 : 0}" data-globka-preqout="${p.isReqOut ? 1 : 0}">${p.isReqIn ? 'Принять заявку' : (p.isReqOut ? 'Заявка отправлена' : 'Добавить в друзья')}</button>
            </div>` : ''}
        </div>
        <div class="profile-grid" style="margin-top:18px">
          <div class="pfield"><div class="pl">Подписка</div><div class="pv">${p.subscription ? esc(p.subscription.name) + (p.subscription.status === 'active' ? '' : ' · заморожена') : 'Нет подписки'}</div></div>
          <div class="pfield"><div class="pl">Статус</div><div class="pv">${p.subscription ? (p.subscription.status === 'active' ? '<span style="color:var(--green)">Активна</span>' : 'Заморожена') : '—'}</div></div>
          <div class="pfield"><div class="pl">Дата регистрации</div><div class="pv">${fmtDate(p.createdAt)}</div></div>
          <div class="pfield"><div class="pl">Alpha</div><div class="pv">${p.hasAlpha ? '<span class="alpha-badge">' + icon.crown + ' GIF профиль</span>' : 'Нет'}</div></div>
        </div>
      </div>
      <div class="page-card" style="max-width:820px">
        <div class="page-head"><div>
          <div class="page-title">Куплено в магазине</div>
          <div class="page-sub">Украшения, цвета логина и роли @${esc(p.login)}</div>
        </div></div>
        ${ownedItems.length === 0 ? '<div class="empty">' + icon.cart + '<b>Пока ничего не куплено</b>В магазине пока пусто.</div>'
          : `<div class="subs-tabs" id="shopTabs">
              ${ownedCats.map(c => `<button type="button" class="subs-tab${c === activeCat ? ' active' : ''}" data-globka-owned-cat="${esc(c)}">${esc(c)}</button>`).join('')}
            </div>
            <div id="globkaOwned" class="globka-inv">${profileOwnedHTML(p, s, activeCat)}</div>`}
        <button type="button" class="btn btn-dark" data-globka-back style="margin-top:16px">← Назад к поиску</button>
      </div>`;
      const pBackBtn = $('[data-globka-back]', main);
      if (pBackBtn) pBackBtn.addEventListener('click', () => { main.innerHTML = viewGloba(); bindSection('globa', main); });
      $$('[data-globka-dm]', main).forEach(b => b.addEventListener('click', () => openDmChat(b.dataset.globkaDm)));
      $$('[data-globka-owned-cat]', main).forEach(t => t.addEventListener('click', () => {
        globkaOwnedCat = t.dataset.globkaOwnedCat;
        $$('[data-globka-owned-cat]', main).forEach(x => x.classList.toggle('active', x === t));
        const wrap = $('#globkaOwned', main);
        if (wrap) wrap.innerHTML = profileOwnedHTML(p, s, globkaOwnedCat);
      }));
      $$('[data-globka-profile-friend]', main).forEach(b => b.addEventListener('click', async () => {
        const tLogin = b.dataset.globkaProfileFriend;
        const isReqIn = b.dataset.globkaPreqIn === '1';
        const isReqOut = b.dataset.globkaPreqOut === '1';
        b.disabled = true;
        let ep;
        if (isReqIn) ep = { u: '/api/friends/respond', body: { login: tLogin, accept: true } };
        else if (isReqOut) ep = { u: '/api/friends/cancel', body: { login: tLogin } };
        else ep = { u: '/api/friends/request', body: { login: tLogin } };
        try {
          const r = await api(ep.u, { method: 'POST', body: JSON.stringify(ep.body) });
          toast(r.message, 'success');
          renderGlobaProfile(tLogin, main);
        } catch (err) { toast(err.message, 'error'); b.disabled = false; }
      }));
    } catch (err) {
      main.innerHTML = '<div class="page-card"><div class="empty">' + esc(err.message) + '</div></div>';
    }
  }

  function viewSubs() {
    const u = state.me;
    return `
    <div class="page-card">
      <div class="page-head"><div>
        <div class="page-title">Подписки</div>
        <div class="page-sub">Ваши подписки и продление</div>
      </div></div>
      ${u.subscription ? `
        <div class="plan featured" style="max-width:520px;border-color:rgba(55,211,154,0.45)">
          <span class="stb stb-ok" style="position:absolute;top:18px;right:16px">${icon.check} Активна</span>
          <div class="plan-name">${esc(u.subscription.name)}</div>
          <div class="plan-sub">${esc(u.subscription.tag)}</div>
          <div class="plan-price"><span class="amount" style="font-size:26px">Подписка</span>
            <span class="forever" style="color:var(--green)">${u.subscription.forever ? 'Действует: Навсегда' : 'Действует до: ' + fmtDate(u.subscription.expiresAt)}</span></div>
          <button class="btn btn-dark" style="align-self:flex-start" data-buy="${u.subscription.plan}">Продлить подписку</button>
        </div>` : `
        <div class="empty">${icon.crown}<b>Нет активных подписок</b>Оформите тариф — скидочный промокод можно ввести при оплате.</div>`}
    </div>`;
  }

  /* ---------- Магазин: украшения аватара ---------- */
  const DECO_STYLE = {
    ava_deco: { cls: 'royal', span: '<span class="c-gold">♛</span>' },
    ava_ice: { cls: 'sapphire', span: '<span class="c-ice">❄</span>' },
    ava_white: { cls: 'white', span: '<span class="c-white">✦</span>' }
  };

  function shopCardsHTML(catFilter) {
    const items = (state.shop && state.shop.items) || [];
    const owned = (state.shop && state.shop.owned) || {};
    const activeDeco = (state.shop && state.shop.activeDeco) || null;
    const activeColor = (state.shop && state.shop.activeColor) || null;
    const activeRole = (state.shop && state.shop.activeRole) || null;
    const cats = [...new Set(items.map(i => i.cat || 'Товары'))];
    const u = state.me || {};
    const letter = esc(String(u.login || 'H')[0].toUpperCase());
    return cats.filter(c => !catFilter || c === catFilter).map(cat => `
        <div class="shop-cat-title">${esc(cat)}</div>
        ${items.filter(i => (i.cat || 'Товары') === cat).map(it => {
          const mine = !!owned[it.key];
          const used = it.kind === 'login_color' ? activeColor === it.key
            : it.kind === 'role_color' ? activeRole === it.key
            : activeDeco === it.key;
          const st = DECO_STYLE[it.key] || { cls: '', span: '' };
          return `
          <div class="shop-item${mine ? ' owned' : ''}${used ? ' used' : ''}">
            <div class="shop-prev">
              ${it.kind === 'login_color'
                ? `<div class="login-prev${used ? ' is-active' : ''}"><span class="login-grad login-grad-${it.key}">${esc(u.login)}</span></div>`
                : it.kind === 'role_color'
                  ? `<div class="login-prev${used ? ' is-active' : ''}"><span class="role-grad role-grad-${it.key}">${esc(u.role ? roleLabel(u.role) : 'Роль')}</span></div>`
                  : `<div class="shop-ava ${st.cls}">${u.avatar ? `<img src="${u.avatar}" alt="">` : letter}${st.span}</div>`}
            </div>
            <div class="shop-info">
              <div class="shop-name">${esc(it.name)}</div>
            </div>
            <div class="shop-cta">
              ${mine
                ? `<button class="btn btn-sm ${used ? 'btn-gold' : 'btn-dark'}" data-use-shop="${it.key}" data-on="${used ? 1 : 0}">${used ? 'Используется ✓' : 'Использовать'}</button>`
                : `<div class="shop-price">${it.price} ${esc(it.currency || '₽')}</div>
                   <button class="btn btn-gold" data-buy-shop="${it.key}">Купить</button>`}
            </div>
          </div>`;
        }).join('')}
      `).join('');
  }

  function viewShop() {
    const items = (state.shop && state.shop.items) || [];
    const cats = [...new Set(items.map(i => i.cat || 'Товары'))];
    const activeCat = shopTabCat && cats.includes(shopTabCat) ? shopTabCat : cats[0];
    const u = state.me || {};
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Магазин</div>
        <div class="page-sub">Украшения и мелочи для профиля</div>
      </div>
      ${(u.login || '') === 'Howill_' ? '<button class="btn btn-sm" data-grant-shop style="font-size:12px">Выдача</button>' : ''}</div>
      ${u.loginColor ? `<div class="shop-my-login"><span class="muted">Ваш логин:</span> <span class="login-grad login-grad-${u.loginColor}">${esc(u.login)}</span></div>` : ''}
      ${items.length === 0 ? '<div class="empty" style="padding:22px 0">Загрузка…</div>'
        : `<div class="subs-tabs" id="shopTabs">
            ${cats.map(c => `<button type="button" class="subs-tab${c === activeCat ? ' active' : ''}" data-shop-cat="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
          <div id="shopItems">${shopCardsHTML(activeCat)}</div>`}
    </div>`;
  }

  function viewMedia() {
    const owner = isOwner();
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Медийка</div>
        <div class="page-sub">Мини-магазин за баллы — покупка подписок и сброса HWID любому игроку по логину</div>
      </div>
      ${owner ? `<button class="btn btn-sm" data-media-grant style="font-size:12px">+ Баллы</button>` : ''}</div>
      <div class="media-balance">
        <span class="muted">Ваш баланс:</span> <b style="font-size:22px;color:var(--gold)" id="mediaPoints">—</b> <span class="muted">баллов</span>
      </div>
    </div>
    ${owner ? `
    <div class="page-card" style="max-width:820px" id="mediaGrantCard" hidden>
      <div class="page-head"><div>
        <div class="page-title">Выдача баллов</div>
        <div class="page-sub">Только для владельца: начислить баллы по логину</div>
      </div></div>
      <div class="grant-target">
        <input id="mediaGrantLogin" maxlength="20" placeholder="Логин игрока" autocomplete="off">
        <input id="mediaGrantAmount" type="number" min="1" placeholder="Количество баллов" style="margin-top:8px">
        <button class="btn btn-gold" id="mediaGrantBtn" style="margin-top:10px">Выдать</button>
        <div id="mediaGrantResult"></div>
      </div>
    </div>` : ''}
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Мини-магазин</div>
        <div class="page-sub">Покупка для другого игрока · на купленный товар вешается кулдаун 3 дня</div>
      </div></div>
      <div id="mediaItems">Загрузка…</div>
    </div>`;
  }

  function viewInv() {
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Инвентарь</div>
        <div class="page-sub">Предметы в Инвентаре. Примените на себя или превратите в ключ — и передайте другому игроку.</div>
      </div></div>
      <div id="invItems">Загрузка…</div>
    </div>
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Активация ключа</div>
        <div class="page-sub">Введите ключ, полученный от другого игрока, — предмет попадёт на ваш аккаунт, а ключ исчезнет из инвентаря владельца.</div>
      </div></div>
      <div class="grant-target" id="invKeyRow">
        <input id="invKeyInput" maxlength="30" placeholder="HORUS-INV-XXXXXXXXXX" autocomplete="off">
        <button class="btn btn-gold" id="invKeyBtn" style="margin-top:10px">Активировать</button>
        <div id="invKeyResult"></div>
      </div>
    </div>`;
  }

  async function shopBuy(item) {
    if (!item) return;
    let selected = 'sbp';
    const overlay = document.createElement('div');
    overlay.className = 'buy-overlay';
    overlay.innerHTML = `
      <div class="buy-modal">
        <button class="buy-close" data-close aria-label="Закрыть">✕</button>
        <div class="buy-co-head">Покупка</div>
        <div class="buy-order-row">
          <span class="buy-order-info"><span class="buy-order-name">${esc(item.name)}</span></span>
          <span class="buy-order-price">${item.price} ${esc(item.currency || '₽')}</span>
        </div>
        <div class="buy-divider"></div>
        <div class="buy-sec-label"><img class="buy-sec-img" src="img/pay_icon.png" alt=""> Способ оплаты</div>
        <div class="buy-chips">
          ${PAY_METHODS.map(m => `
            <button type="button" class="buy-chip" data-method="${m.id}">
              ${m.img ? `<img src="${m.img}" alt="${m.name}">` : ''}<span>${m.name}</span>
            </button>`).join('')}
        </div>
        <div class="buy-ext-note" data-ext-note style="display:none"></div>
        <button type="button" class="buy-pay" data-go>Оплатить</button>
      </div>`;
    const goBtn = overlay.querySelector('[data-go]');
    const extNote = overlay.querySelector('[data-ext-note]');
    const syncGo = () => {
      const m = PAY_METHODS.find(x => x.id === selected);
      if (m.kind === 'external') {
        goBtn.innerHTML = 'Перейти на ' + esc(m.name) + ' ↗';
        if (extNote) { extNote.style.display = 'block'; extNote.textContent = 'Вы будете перенаправлены на ' + m.name + ' для безопасной оплаты.'; }
      } else {
        goBtn.innerHTML = '<img class="buy-pay-ic" src="img/pay_btn_icon.png" alt=""> Оплатить · ' + item.price + ' ' + esc(item.currency || '₽');
        if (extNote) extNote.style.display = 'none';
      }
      overlay.querySelectorAll('.buy-chip').forEach(b => b.classList.toggle('selected', b.dataset.method === selected));
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const close = () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 220);
    };
    overlay.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]') || e.target === overlay) return close();
      const mBtn = e.target.closest('[data-method]');
      if (mBtn) { selected = mBtn.dataset.method; return syncGo(); }
      if (!e.target.closest('[data-go]')) return;
      const m = PAY_METHODS.find(x => x.id === selected);
      if (m.kind === 'external') { window.open(m.url, '_blank', 'noopener'); return close(); }
      goBtn.disabled = true;
      goBtn.textContent = 'Создаём платёж…';
      try {
        const r = await api('/api/purchase/yookassa', {
          method: 'POST',
          body: JSON.stringify({ plan: 'shop:' + item.key, methodType: 'redirect' })
        });
        if (r && r.ok && r.confirmationUrl) { window.location.href = r.confirmationUrl; return; }
        toast((r && (r.message || r.error)) || 'Ссылка на оплату не получена');
        goBtn.disabled = false;
      } catch (err) { toast((err && err.message) || 'Ошибка подключения к оплате'); goBtn.disabled = false; }
    });
    syncGo();
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  async function grantShop() {
    const items = (state.shop && state.shop.items) || [];
    if (!items.length) return toast('Магазин ещё не загружен');
    let grantOwned = Object.assign({}, (state.shop && state.shop.owned) || {});
    let targetLogin = '';
    const rowsHTML = () => items.map(it => {
      const owned = !!grantOwned[it.key];
      return `<div class="grant-row">
        <div class="grant-name">${esc(it.name)} <span class="muted">· ${esc(it.cat || '')}</span></div>
        <button class="btn btn-sm ${owned ? 'btn-dark' : 'btn-gold'}" data-grant-item="${it.key}" ${owned ? 'disabled' : ''}>${owned ? 'Выдано ✓' : 'Выдать'}</button>
      </div>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.className = 'buy-overlay';
    overlay.innerHTML = `
      <div class="buy-modal">
        <button class="buy-close" data-close aria-label="Закрыть">✕</button>
        <div class="buy-co-head">${icon.crown} Выдача украшений</div>
        <div class="grant-target">
          <label for="grantLogin">Логин получателя</label>
          <input type="text" id="grantLogin" placeholder="Например: TestUser (пусто — себе)" maxlength="30" autocomplete="off">
          <div class="hint" id="grantStatus">Выдаётся себе (${esc(state.me.login)})</div>
        </div>
        <div class="grant-list" id="grantList">${rowsHTML()}</div>
      </div>`;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const close = () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 220);
    };
    const input = $('#grantLogin', overlay);
    const status = $('#grantStatus', overlay);
    const listEl = $('#grantList', overlay);
    let deb = null;
    input.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(async () => {
        const v = input.value.trim();
        if (!v) {
          targetLogin = '';
          grantOwned = Object.assign({}, (state.shop && state.shop.owned) || {});
          status.textContent = 'Выдаётся себе (' + state.me.login + ')';
          listEl.innerHTML = rowsHTML();
          return;
        }
        status.textContent = 'Ищем @' + v + '…';
        try {
          const r = await api('/api/shop?for=' + encodeURIComponent(v));
          if (r && r.ok) { targetLogin = r.forLogin; grantOwned = r.owned; status.innerHTML = 'Выдаётся: <b>' + esc(r.forLogin) + '</b>'; listEl.innerHTML = rowsHTML(); }
          else status.textContent = (r && r.message) || 'Пользователь не найден';
        } catch (err) { status.textContent = err.message || 'Ошибка'; }
      }, 450);
    });
    overlay.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]') || e.target === overlay) return close();
      const b = e.target.closest('[data-grant-item]');
      if (!b) return;
      b.disabled = true;
      const login = targetLogin || input.value.trim() || '';
      const key = b.dataset.grantItem;
      const it = items.find(i => i.key === key);
      try {
        const r = await api('/api/shop/grant', { method: 'POST', body: JSON.stringify({ key, target: login || undefined }) });
        if (r && r.ok) {
          grantOwned[key] = true;
          if (!login && state.shop) {
            state.shop.owned = Object.assign({}, grantOwned);
            if (it) {
              if (it.kind === 'login_color') { state.shop.activeColor = key; if (state.me) state.me.loginColor = key; }
              else if (it.kind === 'role_color') { state.shop.activeRole = key; if (state.me) state.me.roleColor = key; }
            }
          }
          listEl.innerHTML = rowsHTML();
          if (!login) { renderCabContent('shop'); bindSection('shop'); }
          toast('Выдано' + (login ? ' @' + login : '') + ': ' + ((it || {}).name || ''), 'success');
        } else { b.disabled = false; toast((r && r.message) || 'Не удалось выдать'); }
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }

  /* ---------- ЛС: чат с игроком ---------- */
  function dmUsl(msg, meLogin) {
    const isMine = msg.login.toLowerCase() === String(meLogin || '').toLowerCase();
    const t = utcTime(msg.ts);
    const ticks = (isMine && msg.read)
      ? '<span class="dm-tick read" title="Прочитано">' + icon.tick2 + '</span>'
      : (isMine ? '<span class="dm-tick" title="Отправлено">' + icon.tick1 + '</span>' : '');
    return `
    <div class="dm-bubble ${isMine ? 'mine' : ''}">
      <div class="dm-bubble-login">${isMine ? 'Вы' : esc(msg.login)}</div>
      <div class="dm-bubble-text">${esc(msg.text)}</div>
      <div class="dm-bubble-time">${t}${ticks ? ' ' + ticks : ''}</div>
    </div>`;
  }
  function utcTime(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('ru-RU', { day: 'numeric', month: '2-digit' });
    } catch { return ''; }
  }
  function openDmChat(login) {
    if (!login) return;
    const meLogin = state.me && state.me.login;
    const overlay = document.createElement('div');
    overlay.className = 'buy-overlay';
    overlay.innerHTML = `
      <div class="buy-modal dm-modal">
        <button class="buy-close" data-close aria-label="Закрыть">✕</button>
        <div class="buy-co-head">${icon.support} Сообщения — @${esc(login)}</div>
        <div class="dm-header" id="dmHeader">
          <span class="dm-hlog">@${esc(login)}</span>
          <span>Роль: <b data-h-role>…</b></span>
          <span>UID: <b data-h-uid>…</b></span>
          <span class="dm-hdot" id="dmOnline">В сети</span>
        </div>
        <div class="dm-messages" id="dmMsgs"><div class="empty">Загрузка…</div></div>
        <div class="dm-send-row">
          <input type="text" id="dmInput" maxlength="500" placeholder="Писать в чат…" autocomplete="off" spellcheck="false">
          <button type="button" class="btn btn-gold" id="dmSendBtn">${icon.arrow} Отправить</button>
        </div>
      </div>`;
    document.body.style.overflow = 'hidden';
    const msgsEl = $('#dmMsgs', overlay);
    const input = $('#dmInput', overlay);
    const sendBtn = $('#dmSendBtn', overlay);
    const close = () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (dmPoll) { clearInterval(dmPoll); dmPoll = null; }
      overlay.classList.add('hide');
      setTimeout(() => overlay.remove(), 220);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    let lastSig = '';
    const load = async (silent) => {
      try {
        const r = await api('/api/dm?with=' + encodeURIComponent(login));
        const msgs = (r && r.messages) || [];
        // Инкрементальный рендер: пересобираем DOM только когда набор сообщений изменился
        const sig = msgs.length + '|' + msgs.map(m => m.ts + ':' + m.from + (m.read ? 'r' : '')).join('|');
        if (sig !== lastSig) {
          const wasAtBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 40;
          const prev = msgsEl.scrollHeight - msgsEl.scrollTop;
          msgsEl.innerHTML = msgs.length ? msgs.map(m => dmUsl(m, meLogin)).join('') : '<div class="empty" style="padding:22px 0">Напишите первым!</div>';
          if (!lastSig || wasAtBottom || !silent) {
            msgsEl.scrollTop = msgsEl.scrollHeight;
          } else {
            msgsEl.scrollTop = msgsEl.scrollHeight - prev;
          }
          lastSig = sig;
        }
        if (r && r.user) {
          const hrole = $('[data-h-role]', overlay);
          if (hrole) hrole.textContent = roleLabel(r.user.role || 'User');
          const huid = $('[data-h-uid]', overlay);
          if (huid) huid.textContent = (r.user.uid != null && r.user.uid !== '') ? r.user.uid : '—';
          const chip = $('#dmOnline', overlay);
          if (chip) chip.style.display = r.user.online ? '' : 'none';
        }
      } catch (err) { if (!silent) msgsEl.innerHTML = '<div class="empty err">' + esc(err.message) + '</div>'; }
    };
    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      // Мгновенный (оптимистичный) показ: пузырь рисуем сразу, сервер догоняет в фоне
      const optimistic = { from: state.me ? state.me.id : null, login: meLogin, text, ts: new Date().toISOString() };
      const empty = msgsEl.querySelector('.empty');
      if (empty) empty.remove();
      msgsEl.insertAdjacentHTML('beforeend', dmUsl(optimistic, meLogin));
      msgsEl.scrollTop = msgsEl.scrollHeight;
      input.value = '';
      sendBtn.disabled = true;
      try {
        const r = await api('/api/dm/send', { method: 'POST', body: JSON.stringify({ to: login, text }) });
        toast(r.message || 'Отправлено', 'success');
        load(true);
      } catch (err) {
        toast(err.message, 'error');
        load(true);
      }
      sendBtn.disabled = false;
      input.focus();
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    overlay.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === overlay) close(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    if (dmPoll) clearInterval(dmPoll);
    dmPoll = setInterval(() => load(true), 1000);
    load(false);
    setTimeout(() => input.focus(), 250);
  }

  function viewDevice() {
    const u = state.me;
    const bound = !!u.hwid;
    const alpha = u.subscription && u.subscription.plan === 'alpha';
    const last = u.lastHwidReset ? new Date(u.lastHwidReset) : null;
    const canReset = alpha && bound && (!last || Date.now() - last.getTime() >= 30*24*60*60*1000);
    let daysLeft = 0;
    if (last) daysLeft = Math.ceil((30*24*60*60*1000 - (Date.now() - last.getTime())) / (24*60*60*1000));
    return `
    <div class="page-card">
      <div class="page-head"><div>
        <div class="page-title">Привязка устройства</div>
        <div class="page-sub">HWID — привязка доступа к конкретному компьютеру</div>
      </div></div>
      <div class="panel-row">
        <div class="panel-ic ${bound ? 'g' : 'r'}">${icon.monitor}</div>
        <div class="panel-rg">
          <div class="pt">${bound ? 'HWID Привязан' : 'Устройство не привязано'}</div>
          <div class="ps">${bound
            ? (u.hwid.startsWith('HWID-') ? esc(u.hwid) : '<span class="mono">' + esc(u.hwid) + '</span>')
            : 'Подключите лаунчер и войдите в аккаунт — устройство привяжется автоматически.'}</div>
        </div>
        ${bound
          ? `<span class="stb stb-ok">${icon.check} Привязано</span>`
          : `<span class="stb stb-ok">${icon.x} Не привязано</span>`}
      </div>
    </div>
    <div class="page-card">
      <div class="page-head"><div>
        <div class="page-title">Сброс привязки</div>
        <div class="page-sub">Сброс доступен раз в месяц</div>
      </div></div>
      <div class="panel-row">
        <div class="panel-ic">${icon.cooldown}</div>
        <div class="panel-rg">
          <div class="pt">Сбросить привязку HWID</div>
          <div class="ps">${alpha ? (last ? 'Последний сброс: ' + fmtDate(u.lastHwidReset) + (daysLeft > 0 ? ' · Доступно через ' + daysLeft + ' дн.' : '') : 'Сброс ещё не использовался.') : 'Доступно только с подписки Alpha.'}</div>
        </div>
        <div class="panel-cta">
          <button class="btn ${canReset ? 'btn-danger' : 'btn-dark'}" data-hwid-reset ${canReset ? '' : 'disabled'} title="${alpha ? '' : 'Требуется подписка Alpha'}">
            ${alpha ? '' : icon.lock} Сбросить
          </button>
        </div>
      </div>
      ${alpha ? '' : '<div class="warn">Сброс HWID доступен только с подпиской <b>Alpha 1.21.4</b>.</div>'}
    </div>`;
  }

  function viewBuy() {
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Купить доступ</div>
        <div class="page-sub">Выбери срок доступа: навсегда или по подписке. Активация мгновенная.</div>
      </div></div>
      <div class="pricing-grid">${plansHTML()}</div>
      ${state.purchaseNote ? `<div class="okbox mt-24">${esc(state.purchaseNote)}</div>` : ''}
    </div>`;
  }

function viewRedeem() {
    return `
    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div>
        <div class="page-title">Активация ключа</div>
        <div class="page-sub">Введите ключ доступа или промокод — подписка активируется мгновенно.</div>
      </div></div>
      <form id="promoForm">
        <div class="field">
          <label>Ключ / промокод</label>
          <input name="code" placeholder="HORUS-XXXX-XXXX" maxlength="30" required>
          <div class="hint">Ключи и промокоды выдают в Discord во время раздач</div>
        </div>
        <button type="submit" class="btn btn-gold">Активировать</button>
      </form>
      <div id="promoResult"></div>
    </div>`;
  }

  function viewPromo() {
    return `
    <div class="page-card" style="max-width:640px">
      <div class="page-head"><div>
        <div class="page-title">Раздача</div>
        <div class="page-sub">Создание собственных промокодов для розыгрышей</div>
      </div></div>
      <form id="promoCreateForm">
        <div class="field"><label>Тариф</label>
          <div class="dd" id="planDD">
            <input type="hidden" name="plan" value="kamiki">
            <button type="button" class="dd-head" id="planDDHead">
              <span class="dd-txt">Kamiki 1.21.4</span>
              <span class="dd-caret"></span>
            </button>
            <div class="dd-menu">
              <div class="dd-item selected" data-plan-value="kamiki">Kamiki 1.21.4</div>
              <div class="dd-item" data-plan-value="kamiki30">Kamiki 1.21.4 · 30 дней</div>
              <div class="dd-item" data-plan-value="kamiki365">Kamiki 1.21.4 · 365 дней</div>
              <div class="dd-item" data-plan-value="alpha">Alpha 1.21.4</div>
              <div class="dd-item" data-plan-value="hwid_reset">Сброс HWID</div>
            </div>
          </div></div>
        <div class="field" id="daysField"><label>Срок подписки (дней)</label>
          <input name="days" type="number" min="0" max="3650" value="0" required>
          <div class="hint">0 — навсегда. Иначе подписка истечёт через указанный срок</div></div>
        <div class="field"><label>Сколько раз можно активировать</label>
          <input name="maxUses" type="number" min="1" max="1000" value="1" required></div>
        <button type="submit" class="btn btn-gold">Создать промокод</button>
      </form>
      <div id="promoResult"></div>
    </div>
    <div class="page-card" style="max-width:640px" id="promoListWrap">
      <div class="page-head"><div>
        <div class="page-title">Созданные промокоды</div>
        <div class="page-sub">Список промокодов и их использование</div>
      </div></div>
      <div id="promoList"></div>
    </div>`;
  }

  function viewOps() {
    return `
    <div class="page-card" style="max-width:720px">
      <div class="page-head"><div>
        <div class="page-title">Операции</div>
        <div class="page-sub">Покупки игроков: последние 200 заказов</div>
      </div></div>
      <div class="field" style="margin-bottom:14px">
        <input id="opsSearch" type="text" placeholder="Поиск по логину…" autocomplete="off">
      </div>
      <div id="opsList" class="promo-list"><div class="empty" style="padding:18px 0">Загрузка…</div></div>
    </div>`;
  }

  function viewTesting() {
    const plans = (state.plans || []);
    return `
    <div class="page-card" style="max-width:640px">
      <div class="page-head"><div>
        <div class="page-title">Тестирование</div>
        <div class="page-sub">Свои позиции для оплаты: название, сумма и что даёт</div>
      </div></div>
      <form id="customForm">
        <div class="field"><label>Название (что оплачиваю)</label>
          <input name="title" required minlength="2" maxlength="100" placeholder="Например: Тестовый доступ">
        </div>
        <div class="field"><label>Сумма оплаты, ₽</label>
          <input name="amount" type="number" min="1" max="1000000" required placeholder="100">
        </div>
        <div class="field"><label>Что даёт (тарифы)</label>
          <div class="promo-plans" id="customPlans">
            ${plans.map(p => `<label class="promo-plan"><input type="checkbox" name="cplan" value="${p.key}"> <span>${esc(p.name)}${p.forever ? ' · Навсегда' : p.days ? ' · ' + p.days + ' дн.' : ''}</span></label>`).join('')}
          </div>
        </div>
        <button class="btn btn-gold" type="submit">Создать позицию</button>
      </form>
      <div class="page-title" style="margin-top:26px;font-size:17px">Созданные позиции</div>
      <div id="customList" class="promo-list"></div>
    </div>`;
  }

  function viewDiscounts() {
    const plans = (state.plans || []);
    return `
    <div class="page-card" style="max-width:640px">
      <div class="page-head"><div>
        <div class="page-title">Создание скидок</div>
        <div class="page-sub">Скидочные промокоды на тарифы</div>
      </div></div>
      <form id="discountCreateForm">
        <div class="field"><label>Название промокода</label>
          <input name="code" required minlength="3" maxlength="32" placeholder="Например: SALE20" style="text-transform:uppercase">
        </div>
        <div class="field"><label>Скидка, %</label>
          <input name="discount" type="number" min="1" max="99" required placeholder="20">
        </div>
        <div class="field"><label>Режим</label>
          <div class="promo-modes">
            <button type="button" class="buy-chip selected" data-mode="media">🎬 Медиа — на все тарифы</button>
            <button type="button" class="buy-chip" data-mode="custom">🎯 Кастом — выбрать самому</button>
          </div>
        </div>
        <div class="field"><label>Тарифы</label>
          <div class="promo-plans" id="discountPlans">
            ${plans.map(p => `<label class="promo-plan"><input type="checkbox" name="plan" value="${p.key}" checked disabled> <span>${esc(p.name)}${p.forever ? ' · Навсегда' : p.days ? ' · ' + p.days + ' дн.' : ''}</span></label>`).join('')}
          </div>
        </div>
        <button class="btn btn-gold" type="submit">Создать промокод</button>
      </form>
      <div class="page-title" style="margin-top:26px;font-size:17px">Активные промокоды</div>
      <div id="discountList" class="promo-list"></div>
    </div>`;
  }

  function viewMod() {
    return `
    <div class="mod-cards">
      <button type="button" class="mod-card active" data-modsec="">
        <div class="mod-card-ic">${icon.shield}</div>
        <div class="mod-card-title">Модификация</div>
        <div class="mod-card-sub">Управление пользователями: поиск, блокировка, настройки лаунчера и новостей</div>
      </button>
      <button type="button" class="mod-card" data-modsec="promo">
        <div class="mod-card-ic">${icon.spark}</div>
        <div class="mod-card-title">Раздача</div>
        <div class="mod-card-sub">Промокоды-раздачи на тарифы сайта</div>
      </button>
      <button type="button" class="mod-card" data-modsec="discounts">
        <div class="mod-card-ic">${icon.zap}</div>
        <div class="mod-card-title">Создание скидок</div>
        <div class="mod-card-sub">Скидочные промокоды на тарифы сайта</div>
      </button>
      <button type="button" class="mod-card" data-modsec="testing">
        <div class="mod-card-ic">${icon.bug}</div>
        <div class="mod-card-title">Тестирование</div>
        <div class="mod-card-sub">Свои позиции для оплаты: название, сумма и что даёт</div>
      </button>
      <button type="button" class="mod-card" data-modsec="ops">
        <div class="mod-card-ic">${icon.cart}</div>
        <div class="mod-card-title">Операции</div>
        <div class="mod-card-sub">Покупки игроков: статусы, суммы, поиск по логину</div>
      </button>
      <button type="button" class="mod-card" data-modsec="moderation">
        <div class="mod-card-ic">${icon.shield}</div>
        <div class="mod-card-title">Выдача КПС</div>
        <div class="mod-card-sub">Выдача ролей Модератор, Медиа и Администратор</div>
      </button>
    </div>
    <div id="modContent">
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Модификация</div>
        <div class="page-sub">Пользователи сайта: аккаунты, подписки и заморозка доступа</div>
      </div></div>
      <div class="mod-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>
        <input id="modSearch" type="text" placeholder="Поиск по логину..." autocomplete="off" spellcheck="false">
      </div>
      <div id="modUsersList"><div class="empty" style="padding:18px 0">Загрузка пользователей...</div></div>
    </div>
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Лаунчер и новости</div>
        <div class="page-sub">Объявление в лаунчере и версии, видимые всем пользователям</div>
      </div></div>
      <form id="launcherMetaForm">
        <div class="field"><label>Объявление (показывается в лаунчере; пусто — убрать)</label>
          <textarea name="announceText" maxlength="1000" placeholder="Например: вышло обновление 1.21.4 — изменился список модулей..."></textarea></div>
        <div class="field" style="display:inline-block;width:calc(50% - 6px);margin-right:12px"><label>Версия лаунчера</label>
          <input name="launcherVersion" maxlength="20" placeholder="1.0.0"></div>
        <div class="field" style="display:inline-block;width:calc(50% - 6px)"><label>Версия клиента (Minecraft)</label>
          <input name="gameVersion" maxlength="20" placeholder="1.21.4"></div>
        <button type="submit" class="btn btn-gold">Сохранить</button>
        <div id="launcherMetaResult"></div>
      </form>
    </div>
    </div>`;
  }

  function viewModeration() {
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Выдача КПС</div>
        <div class="page-sub">Выдача ролей Модератор, Медиа и Администратор по логину</div>
      </div></div>
      <form id="modRoleForm">
        <div class="field"><label>Логин пользователя</label>
          <input name="login" placeholder="Например: Alone" maxlength="20" required>
        </div>
        <div class="field"><label>Роль</label>
          <div class="dd" id="roleDD">
            <input type="hidden" name="role" value="mod">
            <button type="button" class="dd-head" id="roleDDHead">
              <span class="dd-txt">Модератор</span>
              <span class="dd-caret"></span>
            </button>
            <div class="dd-menu">
              <div class="dd-item selected" data-role-value="mod">Модератор</div>
              <div class="dd-item" data-role-value="media">Медиа</div>
              <div class="dd-item" data-role-value="admin">Администратор</div>
              <div class="dd-item" data-role-value="">Снять роль</div>
            </div>
          </div></div>
        <button type="submit" class="btn btn-gold">Назначить</button>
        <div id="modRoleResult"></div>
      </form>
    </div>`;
  }

  function showLogin2fa(token, login) {
    const app = $('#app');
    app.innerHTML = `
    <div style="max-width:440px;margin:70px auto;padding:0 16px">
      <div class="page-card">
        <div class="page-head"><div>
          <div class="page-title">Код из Telegram</div>
          <div class="page-sub">Отправили 6-значный код для аккаунта <b>${esc(login)}</b></div>
        </div></div>
        <form id="faForm">
          <div class="field"><label>Код подтверждения</label>
            <input name="code" required maxlength="6" minlength="6" inputmode="numeric" pattern="[0-9]{6}" placeholder="123456" autocomplete="one-time-code">
          </div>
          <button type="submit" class="btn btn-gold" style="width:100%">Войти</button>
        </form>
        <div class="hint" style="margin-top:12px">Код действует 5 минут и пришёл в чат с ботом.</div>
      </div>
    </div>`;
    $('#faForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const r = await api('/api/login/2fa', { method: 'POST', body: JSON.stringify({ token, code: e.target.code.value.trim() }) });
        state.me = r.user;
        renderNav();
        toast('Добро пожаловать, ' + state.me.login + '!', 'success');
        const buf = sessionStorage.getItem('pendingBuy');
        sessionStorage.removeItem('pendingBuy');
        location.hash = buf ? '#/cabinet/buy' : '#/cabinet/profile';
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  function viewSecurity() {
    const u = state.me;
    const tg = u.tg;
    const tgBound = u.tgBound;
    return `
    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div>
        <div class="page-title">Безопасность</div>
        <div class="page-sub">Управление доступом к аккаунту</div>
      </div></div>

    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div><div class="page-title" style="font-size:17px">Пароль</div></div></div>
      <form id="passForm">
        <div class="field"><label>Текущий пароль</label><input name="current" type="password" required></div>
        <div class="field"><label>Новый пароль</label><input name="next" type="password" minlength="8" required></div>
        <button type="submit" class="btn btn-dark">Сменить пароль</button>
      </form>
    </div>

    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div><div class="page-title" style="font-size:17px">Telegram</div>
      <div class="page-sub">Восстановление пароля через Telegram</div></div></div>
      <div class="panel-row">
        <div class="panel-ic ${tg ? 'g' : ''}">${icon.telegram}</div>
        <div class="panel-rg">
          <div class="pt">${tg ? esc('@' + tg) : 'Telegram не привязан'}</div>
          <div class="ps">${tg
            ? (tgBound ? 'Привязан. Если забудете пароль — сможете восстановить через Telegram.' : 'Ожидает подтверждения в Telegram. Отправьте код боту.')
            : 'Начните чат с ботом, затем введите @username и получите код.'}</div>
        </div>
        <div class="panel-cta">
          ${tg
            ? `<button class="btn btn-danger btn-sm" id="tgUnbindBtn">Отвязать</button>`
            : ''}
        </div>
      </div>
      ${tg ? '' : `
      <div class="field" style="margin-top:10px;max-width:340px">
        <label>Ваш Telegram username</label>
        <input name="tg" id="tgInput" placeholder="@username" maxlength="32" autocomplete="off">
        <div class="hint">2. Напишите боту @${esc(TG_BOT_LINK || '...')} любое сообщение (команду /start), затем нажмите «Получить код».</div>
      </div>
      <button class="btn btn-gold" id="tgBindBtn" ${TG_BOT_ENABLED ? '' : 'disabled'}>Получить код</button>
      ${TG_BOT_ENABLED ? '' : '<div class="warn" style="margin-top:12px">Telegram-бот временно недоступен. Попробуйте позже.</div>'}
      <div id="tgResult"></div>`}
    </div>

    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div><div class="page-title" style="font-size:17px">Двухфакторная аутентификация</div>
      <div class="page-sub">Код при входе в Telegram</div></div></div>
      ${u.tgBound ? `
      <div class="panel-row">
        <div class="panel-ic ${u.tg2fa ? 'g' : ''}">${icon.lock}</div>
        <div class="panel-rg">
          <div class="pt">2FA ${u.tg2fa ? 'включена' : 'выключена'}</div>
          <div class="ps">${u.tg2fa ? 'При входе на сайт в Telegram будет приходить код подтверждения.' : 'Для входа достаточно логина и пароля.'}</div>
        </div>
        <div class="panel-cta">
          <button class="btn ${u.tg2fa ? 'btn-danger' : 'btn-gold'} btn-sm" id="tg2faBtn">${u.tg2fa ? 'Выключить' : 'Включить'}</button>
        </div>
      </div>` : `
      <div class="warn">Сначала привяжите Telegram (раздел выше) — 2FA работает через бота.</div>`}
    </div>
    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div><div class="page-title" style="font-size:17px">Сессии</div>
      <div class="page-sub">Завершить вход на всех устройствах</div></div></div>
      <button class="btn btn-danger" id="logoutAllBtn">Выйти со всех устройств</button>
    </div>`;
  }

  function viewSupport(section, ap) {
    const t = CAB_SECTIONS[section];
    const ph = {
      support: 'Опишите вашу проблему: не работает модуль, вопрос по подписке...',
      idea: 'Опишите вашу идею по развитию клиента...',
      bug: 'Что произошло? К каком модуле? Приложите ссылку на видео/скриншот...'
    }[section];
    return `
    <div class="page-card" style="max-width:640px">
      <div class="page-head"><div>
        <div class="page-title">${t.title}</div>
        <div class="page-sub">Мы отвечаем в течение 24 часов в Discord</div>
      </div></div>
      <form id="supportForm">
        <div class="field"><label>Тема</label><input name="subject" maxlength="100" placeholder="Коротко о вопросе" required></div>
        <div class="field"><label>Сообщение</label><textarea name="message" maxlength="2000" placeholder="${ph}" required></textarea></div>
        <button type="submit" class="btn btn-gold">Отправить</button>
      </form>
      <div id="supportResult"></div>
    </div>`;
  }

  /* ---------- bind actions ---------- */
  let modDefaultHtmlCache = '';

  function bindSection(section, main, ap) {
    if (mediaPoll) { clearInterval(mediaPoll); mediaPoll = null; }
    if (mediaCdTick) { clearInterval(mediaCdTick); mediaCdTick = null; }
    if (globaPoll) { clearInterval(globaPoll); globaPoll = null; }
    if (section === 'shop') {
      if (!state.shop) {
        (async () => {
          try {
            state.shop = await api('/api/shop');
            const meR = await api('/api/me');
            if (meR && meR.authed && meR.user) state.me = meR.user;
          } catch (_) { state.shop = { items: [], owned: {} }; }
          const active = document.querySelector('.sb-item[data-cab].active');
          if (active && active.dataset.cab === 'shop') renderCabContent('shop');
        })();
        return;
      }
      const bindShopCards = (scope) => {
        const items = () => (state.shop && state.shop.items) || [];
        $$('[data-buy-shop]', scope).forEach(b => b.addEventListener('click', () => {
          shopBuy(items().find(i => i.key === b.dataset.buyShop));
        }));
        const applyUse = (key, target) => {
          const it = items().find(i => i.key === key);
          const s = state.shop;
          const m = state.me;
          if (it && it.kind === 'login_color') { if (s) s.activeColor = target ? key : null; if (m) m.loginColor = target ? key : null; }
          else if (it && it.kind === 'role_color') { if (s) s.activeRole = target ? key : null; if (m) m.roleColor = target ? key : null; }
          else { if (s) s.activeDeco = target ? key : null; if (m) m.decoActive = target ? key : null; }
          const wrap = $('#shopItems');
          if (wrap) { wrap.innerHTML = shopCardsHTML(shopTabCat); bindShopCards(wrap.parentElement); }
        };
        $$('[data-use-shop]', scope).forEach(b => b.addEventListener('click', () => {
          const on = b.dataset.on === '1';
          const key = b.dataset.useShop;
          const target = !on;
          applyUse(key, target);
          api('/api/shop/use', { method: 'POST', body: JSON.stringify({ key, on: target }) })
            .then(r => {
              if (r && r.ok) {
                state.me = r.user;
                if (state.shop) { state.shop.activeDeco = r.activeDeco; state.shop.activeColor = r.activeColor; state.shop.activeRole = r.activeRole; }
              } else { toast((r && r.message) || 'Не удалось применить', 'error'); applyUse(key, on); }
            })
            .catch(err => { toast(err.message || 'Ошибка', 'error'); applyUse(key, on); });
        }));
      };
      bindShopCards(main);
      const shopTabs = $$('[data-shop-cat]', main);
      if (shopTabs.length) {
        shopTabs.forEach(t => t.addEventListener('click', () => {
          shopTabCat = t.dataset.shopCat;
          shopTabs.forEach(x => x.classList.toggle('active', x === t));
          const wrap = $('#shopItems', main);
          if (wrap) { wrap.innerHTML = shopCardsHTML(shopTabCat); bindShopCards(main); }
        }));
      }
      const grantBtn = $('[data-grant-shop]', main);
      if (grantBtn) grantBtn.addEventListener('click', () => grantShop());
      return;
    }
    if (section === 'globa') {
      const renderInto = (boxId, users, emptyText) => {
        const box = $(boxId, main);
        if (!box) return;
        if (!users || !users.length) { box.innerHTML = '<div class="empty" style="padding:14px 0">' + (emptyText || 'Никого не найдено') + '</div>'; return; }
        box.innerHTML = users.map(u => globkaRowHTML(u)).join('');
      };
      const renderReqs = (users, outgoing, emptyText) => {
        const box = $('#globkaReqs', main);
        if (!box) return;
        const inc = users && users.length ? users.map(u => globkaReqRowHTML(u)).join('') : '';
        const out = outgoing && outgoing.length ? outgoing.map(u => globkaReqOutRowHTML(u)).join('') : '';
        if (!inc && !out) { box.innerHTML = '<div class="empty" style="padding:14px 0">' + (emptyText || 'Заявок нет') + '</div>'; return; }
        box.innerHTML = inc + out;
      };
      const attachGlobkaActions = () => {
        $$('[data-globka-dm]', main).forEach(b => b.addEventListener('click', () => openDmChat(b.dataset.globkaDm)));
        $$('[data-globka-friend]', main).forEach(b => b.addEventListener('click', async () => {
          const login = b.dataset.globkaFriend;
          const reqin = b.dataset.globkaReqIn === '1';
          const reqout = b.dataset.globkaReqOut === '1';
          const isfriend = b.dataset.globkaIsfriend === '1';
          b.disabled = true;
          let ep;
          if (isfriend && reqin) ep = { u: '/api/friends/respond', body: { login, accept: true } };
          else if (isfriend) ep = { u: '/api/friends/remove', body: { login } };
          else if (reqout) ep = { u: '/api/friends/cancel', body: { login } };
          else ep = { u: '/api/friends/request', body: { login } };
          try {
            const r = await api(ep.u, { method: 'POST', body: JSON.stringify(ep.body) });
            toast(r.message, 'success');
            await refreshGlobka(true);
          } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        }));
        $$('[data-globka-accept]', main).forEach(b => b.addEventListener('click', async () => {
          const login = b.dataset.globkaAccept;
          b.disabled = true;
          try {
            const r = await api('/api/friends/respond', { method: 'POST', body: JSON.stringify({ login, accept: true }) });
            toast(r.message, 'success');
            await refreshGlobka(true);
          } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        }));
        $$('[data-globka-decline]', main).forEach(b => b.addEventListener('click', async () => {
          const login = b.dataset.globkaDecline;
          b.disabled = true;
          try {
            const r = await api('/api/friends/respond', { method: 'POST', body: JSON.stringify({ login, accept: false }) });
            toast(r.message, 'success');
            await refreshGlobka(true);
          } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        }));
        $$('[data-globka-cancel]', main).forEach(b => b.addEventListener('click', async () => {
          const login = b.dataset.globkaCancel;
          b.disabled = true;
          try {
            const r = await api('/api/friends/cancel', { method: 'POST', body: JSON.stringify({ login }) });
            toast(r.message, 'success');
            await refreshGlobka(true);
          } catch (err) { toast(err.message, 'error'); b.disabled = false; }
        }));
        $$('[data-globka-profile]', main).forEach(b => b.addEventListener('click', () => renderGlobaProfile(b.dataset.globkaProfile, main)));
      };
      const refreshGlobka = async (withSearch) => {
        const loadAll = [];
        if (withSearch && globkaQuery) {
          loadAll.push(api('/api/globka/find?q=' + encodeURIComponent(globkaQuery)).then(r => renderInto('#globkaResults', r.users, 'Никого не найдено')));
        }
        loadAll.push(
          api('/api/dm/notifs').then(r => {
            const box = $('#globkaDm', main);
            if (!box) return;
            const list = (r && r.notifs) || [];
            if (!list.length) { box.innerHTML = '<div class="empty" style="padding:14px 0">Новых сообщений нет</div>'; return; }
            box.innerHTML = list.map(n => globkaDmRowHTML(n)).join('');
          }).catch(() => { const box = $('#globkaDm', main); if (box) box.innerHTML = '<div class="empty" style="padding:14px 0">Не удалось загрузить сообщения</div>'; }),
          api('/api/friends/requests').then(r => renderReqs(r.users, r.outgoing, 'Заявок нет')).catch(() => renderReqs(null, null, 'Не удалось загрузить заявки')),
          api('/api/friends').then(r => renderInto('#globkaFriends', r.users, 'Пока пусто — добавьте друзей через поиск')).catch(() => renderInto('#globkaFriends', null, 'Не удалось загрузить друзей'))
        );
        await Promise.all(loadAll);
        attachGlobkaActions();
      };
      const searchBtn = $('#globkaSearchBtn', main);
      if (searchBtn) {
        const input = $('#globkaSearch', main);
        const run = async () => {
          const q = String((input && input.value) || '').trim();
          const box = $('#globkaResults', main);
          if (!q) { box.innerHTML = '<div class="empty" style="padding:14px 0">Введите логин для поиска</div>'; return; }
          if (state.me && q.toLowerCase() === String(state.me.login).toLowerCase()) {
            box.innerHTML = '<div class="empty" style="padding:14px 0">Это ваш логин. Откройте свой профиль кнопкой <b>«Свой профиль»</b> выше.</div>';
            return;
          }
          globkaQuery = q;
          box.innerHTML = '<div class="empty" style="padding:14px 0">Ищем…</div>';
          try {
            const r = await api('/api/globka/find?q=' + encodeURIComponent(q));
            renderInto('#globkaResults', r.users, 'Никого не найдено');
            attachGlobkaActions();
          } catch (err) { box.innerHTML = '<div class="empty err" style="padding:14px 0">' + esc(err.message) + '</div>'; }
        };
        searchBtn.addEventListener('click', run);
        if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      }
      const selfBtn = $('#globkaSelf', main);
      if (selfBtn) selfBtn.addEventListener('click', () => renderGlobaProfile(state.me.login, main));
      const backBtn = $('[data-globka-back]', main);
      if (backBtn) backBtn.addEventListener('click', () => { main.innerHTML = viewGloba(); bindSection('globa', main); });
      attachGlobkaActions();
      refreshGlobka(true);
      const loadDmNotifs = async () => {
        try {
          const r = await api('/api/dm/notifs');
          const box = $('#globkaDm', main);
          if (!box) return;
          const list = (r && r.notifs) || [];
          if (!list.length) { return; }
          box.innerHTML = list.map(n => globkaDmRowHTML(n)).join('');
          attachGlobkaActions();
        } catch (_) { /* тихо */ }
      };
      if (globaPoll) clearInterval(globaPoll);
      globaPoll = setInterval(loadDmNotifs, 2500);
    }
    if (section === 'media' && isMedia()) {
      const loadMedia = async () => {
        try {
          const r = await api('/api/media/state');
          const pts = $('#mediaPoints', main);
          if (pts) pts.textContent = esc(String(r.points));
          const box = $('#mediaItems', main);
          if (!box) return;
          const logins = {};
          $$('[data-login]', box).forEach(i => { logins[i.dataset.login] = i.value; });
          box.innerHTML = r.items.map(it => {
            const onCd = it.cdLeft > 0;
            return `
            <div class="media-row">
              <div class="media-info">
                <div class="media-name">${esc(it.name)}</div>
                <div class="media-cost">${it.cost} ${it.cost === 1 ? 'балл' : (it.cost < 5 ? 'балла' : 'баллов')}</div>
              </div>
              ${onCd ? `
              <div class="media-buy">
                <span class="media-cd">${icon.cooldown} <b class="media-cd-live" data-cd-end="${Math.ceil(Date.now() / 1000) + it.cdLeft}">${fmtMediaCd(it.cdLeft)}</b></span>
              </div>` : `
              <div class="media-buy">
                <input class="media-login" data-login="${esc(it.key)}" maxlength="20" placeholder="Логин игрока" autocomplete="off">
                <button class="btn btn-gold btn-sm" data-media-buy="${esc(it.key)}">Купить</button>
              </div>`}
            </div>`;
          }).join('');
          $$('[data-login]', box).forEach(i => { if (logins[i.dataset.login]) i.value = logins[i.dataset.login]; });
          $$('[data-media-buy]', main).forEach(b => b.addEventListener('click', async () => {
            const key = b.dataset.mediaBuy;
            const inp = $('[data-login="' + CSS.escape(key) + '"]', main);
            const login = String((inp && inp.value) || '').trim();
            if (!login) { toast('Введите логин игрока', 'error'); return; }
            b.disabled = true;
            try {
              const r = await api('/api/media/buy', { method: 'POST', body: JSON.stringify({ login, itemKey: key }) });
              toast(r.message, 'success');
              if ($('#mediaPoints', main)) $('#mediaPoints', main).textContent = esc(String(r.points));
              loadMedia();
            } catch (err) { toast(err.message, 'error'); b.disabled = false; }
          }));
        } catch (err) { const box = $('#mediaItems', main); if (box) box.innerHTML = '<div class="empty err" style="padding:14px 0">' + esc(err.message) + '</div>'; }
      };
      // Живой отсчёт кулдауна по каждому товару
      if (mediaCdTick) clearInterval(mediaCdTick);
      mediaCdTick = setInterval(() => {
        let expired = false;
        $$('.media-cd-live', main).forEach(el => {
          const end = Number(el.dataset.cdEnd || 0);
          const left = end - Math.ceil(Date.now() / 1000);
          if (left <= 0) { expired = true; return; }
          el.textContent = fmtMediaCd(left);
        });
        if (expired) loadMedia();
      }, 1000);
      const grantBtn = $('[data-media-grant]', main);
      if (grantBtn) grantBtn.addEventListener('click', () => {
        const card = $('#mediaGrantCard', main);
        if (card) card.hidden = !card.hidden;
      });
      const grantSubmit = $('#mediaGrantBtn', main);
      if (grantSubmit) grantSubmit.addEventListener('click', async () => {
        const login = String(($('#mediaGrantLogin', main) || {}).value || '').trim();
        const amount = Number(($('#mediaGrantAmount', main) || {}).value || 0);
        if (!login || !(amount > 0)) { toast('Введите логин и количество баллов', 'error'); return; }
        grantSubmit.disabled = true;
        try {
          const r = await api('/api/media/grant', { method: 'POST', body: JSON.stringify({ login, amount }) });
          const box = $('#mediaGrantResult', main);
          if (box) { box.className = 'okbox'; box.textContent = r.message; }
          toast(r.message, 'success');
          $('#mediaGrantAmount', main).value = '';
        } catch (err) { toast(err.message, 'error'); }
        grantSubmit.disabled = false;
      });
      loadMedia();
      mediaPoll = setInterval(loadMedia, 2000);
    }
    if (section === 'inv') {
      const box = $('#invItems', main);
      const loadInv = async () => {
        if (!box) return;
        try {
          const r = await api('/api/inventory');
          box.innerHTML = r.items && r.items.length
            ? r.items.map(it => `
              <div class="media-row">
                <div class="media-info">
                  <div class="media-name">${esc(it.name)}</div>
                  <div class="media-cost">${it.status === 'key' ? '🔑 ' + esc(it.code) : 'Не активирован · ' + fmtDate(it.created_at)}</div>
                </div>
                <div class="media-buy" style="justify-content:flex-end">
                  ${it.status === 'item' ? `
                    <button class="btn btn-gold btn-sm" data-inv-apply="${esc(it.id)}">Применить</button>
                    <button class="btn btn-sm" data-inv-key="${esc(it.id)}" style="font-size:12px">Сделать ключом</button>` : `
                    <button class="btn btn-sm" data-inv-copy="${esc(it.code)}" style="font-size:12px">Копировать ключ</button>`}
                </div>
              </div>`).join('')
            : '<div class="empty" style="padding:18px 0">Инвентарь пустой</div>';
          $$('[data-inv-apply]', box).forEach(b => b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              const r = await api('/api/inventory/apply', { method: 'POST', body: JSON.stringify({ id: b.dataset.invApply }) });
              state.me = r.user;
              toast(r.message, 'success');
              loadInv();
            } catch (err) { toast(err.message, 'error'); b.disabled = false; }
          }));
          $$('[data-inv-key]', box).forEach(b => b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              const r = await api('/api/inventory/key', { method: 'POST', body: JSON.stringify({ id: b.dataset.invKey }) });
              toast('Ключ создан: ' + r.code, 'success');
              loadInv();
              if (navigator.clipboard) navigator.clipboard.writeText(r.code).catch(() => {});
            } catch (err) { toast(err.message, 'error'); b.disabled = false; }
          }));
          $$('[data-inv-copy]', box).forEach(b => b.addEventListener('click', () => {
            if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.invCopy).then(() => toast('Ключ скопирован', 'success')).catch(() => {});
          }));
        } catch (err) { box.innerHTML = '<div class="empty err" style="padding:14px 0">' + esc(err.message) + '</div>'; }
      };
      const keyBtn = $('#invKeyBtn', main);
      if (keyBtn) keyBtn.addEventListener('click', async () => {
        const input = $('#invKeyInput', main);
        const code = String((input && input.value) || '').trim().toUpperCase();
        if (!code) { toast('Введите код ключа', 'error'); return; }
        keyBtn.disabled = true;
        try {
          const r = await api('/api/inventory/activate', { method: 'POST', body: JSON.stringify({ code }) });
          state.me = r.user;
          const result = $('#invKeyResult', main);
          if (result) { result.className = 'okbox'; result.textContent = r.message; }
          toast(r.message, 'success');
          if (input) input.value = '';
        } catch (err) { toast(err.message, 'error'); }
        keyBtn.disabled = false;
      });
      const keyInput = $('#invKeyInput', main);
      if (keyInput) keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (keyBtn) keyBtn.click(); } });
      loadInv();
    }
    if (section === 'profile' && $('[data-upload]')) {
      $$('[data-upload]').forEach(btn => btn.addEventListener('click', () => uploadProfileImage(btn, btn.dataset.upload)));
    }

    const themeSwatches = $('.theme-swatches', main);
    if (section === 'profile' && themeSwatches) {
      $$('.theme-swatch', themeSwatches).forEach(s => s.addEventListener('click', async () => {
        const key = s.dataset.themeKey;
        s.disabled = true;
        try {
          const r = await api('/api/profile/theme', { method: 'POST', body: JSON.stringify({ key }) });
          state.me = r.user;
          applyTheme(r.user.theme);
          $$('.theme-swatch', themeSwatches).forEach(x => x.classList.toggle('active', x === s));
          toast('Цвет темы: ' + (THEMES[key] ? THEMES[key].label : 'Фиолетовый'), 'success');
        } catch (err) { toast(err.message, 'error'); }
        s.disabled = false;
      }));
    }

    const glossyBtn = $('#glossyToggle');
    if (section === 'profile' && glossyBtn) {
      const setGlossyUi = (on) => {
        const card = $('#glossyCard');
        const banner = $('#glossyBanner');
        const ava = $('#glossyAva');
        const hint = $('#glossyHint');
        if (card) card.classList.toggle('glossy-card', on);
        if (banner) banner.classList.toggle('glossy-banner', on);
        if (ava) ava.classList.toggle('glossy-ava', on);
        if (hint) hint.textContent = on ? 'Глянец включён — карточка профиля блестит ✨' : 'Включи глянец, чтобы карточка профиля блестела';
        if (glossyBtn) {
          glossyBtn.classList.toggle('btn-gold', on);
          glossyBtn.classList.toggle('btn-dark', !on);
          glossyBtn.textContent = on ? 'Выключить' : 'Включить';
        }
      };
      glossyBtn.addEventListener('click', async () => {
        const enabled = !(state.me && state.me.glossy);
        setGlossyUi(enabled);
        glossyBtn.disabled = true;
        try {
          const r = await api('/api/profile/glossy', { method: 'POST', body: JSON.stringify({ enabled }) });
          state.me = r.user;
          setGlossyUi(!!(r.user && r.user.glossy));
          toast('Глянцевый профиль ' + (r.user.glossy ? 'включён ✨' : 'выключен'), 'success');
        } catch (err) { setGlossyUi(!enabled); toast(err.message, 'error'); }
        finally { glossyBtn.disabled = false; }
      });
    }

    if (section === 'profile' || section === 'subs' || section === 'buy') {
      $$('[data-buy]', main).forEach(b => b.addEventListener('click', () => startPurchase(b.dataset.buy)));
    }
if (section === 'redeem' && $('#promoForm')) {
      $('#promoForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          const r = await api('/api/promo/redeem', {
            method: 'POST', body: JSON.stringify({ code: e.target.code.value })
          });
          state.me = r.user;
          toast(r.message || 'Промокод активирован!', 'success');
          setTimeout(() => routeCabinet('/cabinet/subs'), 600);
        } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
      });
    }
    if (section === 'promo' && isOwner() && $('#promoCreateForm')) {
      const dd = $('#planDD');
      if (dd) {
        $('#planDDHead').addEventListener('click', (e) => {
          e.stopPropagation();
          dd.classList.toggle('open');
        });
        $$('.dd-item', dd).forEach(item => item.addEventListener('click', (e) => {
          e.stopPropagation();
          const plan = item.dataset.planValue;
          dd.querySelector('input[name="plan"]').value = plan;
          dd.querySelector('.dd-txt').textContent = item.textContent.trim();
          $$('.dd-item', dd).forEach(i => i.classList.toggle('selected', i === item));
          if (plan === 'hwid_reset') {
            $$('#daysField', main).forEach(f => f.style.display = 'none');
          } else {
            $$('#daysField', main).forEach(f => f.style.display = '');
            if (plan === 'kamiki30') $$('#daysField input', main).forEach(i => i.value = '30');
            if (plan === 'kamiki365') $$('#daysField input', main).forEach(i => i.value = '365');
          }
          dd.classList.remove('open');
        }));
      }
      $('#promoCreateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          const r = await api('/api/promo/create', {
            method: 'POST', body: JSON.stringify({
              plan: e.target.plan.value,
              days: Number(e.target.days.value) || 0,
              maxUses: Number(e.target.maxUses.value)
            })
          });
          toast(r.message || 'Промокод создан', 'success');
          e.target.reset();
          e.target.maxUses.value = '1';
          e.target.days.value = '0';
          if (dd) {
            dd.querySelector('input[name="plan"]').value = 'kamiki';
            dd.querySelector('.dd-txt').textContent = 'Kamiki 1.21.4';
            $$('#daysField', main).forEach(f => f.style.display = '');
            $$('.dd-item', dd).forEach(i => i.classList.toggle('selected', i.dataset.planValue === 'kamiki'));
          }
          loadPromoList();
        } catch (err) {
          toast(err.message, 'error');
          const box = $('#promoCreateForm').parentElement.querySelector('#promoResult');
          if (box) { box.className = 'okbox err'; box.textContent = err.message; }
        }
        btn.disabled = false;
      });
      loadPromoList();
    }
    if (section === 'ops' && isOwner() && $('#opsList')) {
      loadOpsList();
      const s = $('#opsSearch');
      if (s) s.addEventListener('input', () => renderOps(s.value.trim().toLowerCase()));
    }

    if (section === 'testing' && isOwner() && $('#customForm')) {
      $('#customForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const title = e.target.title.value.trim();
        const amount = Number(e.target.amount.value);
        const plans = $$('input[name="cplan"]:checked', $('#customPlans')).map(inp => inp.value);
        if (!title || !(amount >= 1)) return toast('Проверьте название и сумму', 'error');
        btn.disabled = true;
        try {
          const r = await api('/api/custom/create', { method: 'POST', body: JSON.stringify({ title, amount, plans }) });
          toast((r && r.message) || 'Позиция создана', 'success');
          e.target.reset();
          loadCustomList();
        } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
      });
      loadCustomList();
    }

    if (section === 'discounts' && isOwner() && $('#discountCreateForm')) {
      let mode = 'media';
      const plansBox = $('#discountPlans');
      const syncMode = () => {
        $$('.promo-modes .buy-chip', main).forEach(c => c.classList.toggle('selected', c.dataset.mode === mode));
        $$('input[name="plan"]', plansBox).forEach(inp => {
          inp.disabled = (mode === 'media');
          if (mode === 'media') inp.checked = true;
        });
      };
      $$('.promo-modes .buy-chip', main).forEach(c => c.addEventListener('click', () => { mode = c.dataset.mode; syncMode(); }));
      syncMode();
      $('#discountCreateForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const code = e.target.code.value.trim().toUpperCase();
        const discount = parseInt(e.target.discount.value, 10);
        const plans = $$('input[name="plan"]:checked', plansBox).map(inp => inp.value);
        if (!code || !(discount >= 1 && discount <= 99)) return toast('Проверьте название и скидку', 'error');
        if (!plans.length) return toast('Выберите хотя бы один тариф', 'error');
        btn.disabled = true;
        try {
          const r = await api('/api/discount/create', { method: 'POST', body: JSON.stringify({ code, discount, plans }) });
          toast((r && r.message) || 'Промокод создан', 'success');
          e.target.reset(); mode = 'media'; syncMode();
          loadDiscountList();
        } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
      });
      loadDiscountList();
    }
    if (section === 'moderation' && isOwner() && $('#modRoleForm')) {
      const dd = $('#roleDD');
      if (dd) {
        $('#roleDDHead').addEventListener('click', (e) => {
          e.stopPropagation();
          dd.classList.toggle('open');
        });
        $$('.dd-item', dd).forEach(item => item.addEventListener('click', (e) => {
          e.stopPropagation();
          dd.querySelector('input[name="role"]').value = item.dataset.roleValue;
          dd.querySelector('.dd-txt').textContent = item.textContent.trim();
          $$('.dd-item', dd).forEach(i => i.classList.toggle('selected', i === item));
          dd.classList.remove('open');
        }));
      }
      $('#modRoleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        const box = $('#modRoleResult');
        try {
          const r = await api('/api/admin/role', {
            method: 'POST',
            body: JSON.stringify({
              login: String(e.target.login.value || '').trim(),
              role: String((e.target.role && e.target.role.value) || '')
            })
          });
          toast(r.message, 'success');
          if (box) { box.className = 'okbox'; box.textContent = '✅ ' + r.message; }
          try {
            const meR = await api('/api/me');
            if (meR && meR.authed && meR.user) {
              state.me = meR.user;
              const cur = $('[data-cab].active');
              if (cur && cur.dataset.cab === 'profile') { renderCabContent('profile'); bindSection('profile'); }
              applyTheme(state.me.theme);
            }
          } catch (_) {}
        } catch (err) {
          toast(err.message, 'error');
          if (box) { box.className = 'okbox err'; box.textContent = err.message; }
        }
        btn.disabled = false;
      });
    }
    if (section === 'mod' && isOwner()) {
      const modBox = $('#modContent', main);
      if (modBox && !modDefaultHtmlCache) modDefaultHtmlCache = modBox.innerHTML;
      const modViews = { promo: viewPromo, discounts: viewDiscounts, testing: viewTesting, ops: viewOps, moderation: viewModeration };
      $$('.mod-card', main).forEach(card => {
        card.onclick = () => {
          const key = card.dataset.modsec || '';
          if (!modBox) return;
          $$('.mod-card', main).forEach(c => c.classList.toggle('active', c === card));
          if (!key) {
            modBox.innerHTML = modDefaultHtmlCache;
            bindSection('mod', main, ap);
            $$('.mod-card', main).forEach(c => c.classList.toggle('active', c === card));
          } else {
            modBox.innerHTML = modViews[key]();
            bindSection(key, main, ap);
          }
        };
      });
      loadModUsers();
      loadLauncherMeta();
      const form = $('#launcherMetaForm');
      if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        const box = $('#launcherMetaResult');
        try {
          const r = await api('/api/admin/launcher-meta', { method: 'POST', body: JSON.stringify({
            announceText: String(e.target.announceText.value || ''),
            launcherVersion: String(e.target.launcherVersion.value || ''),
            gameVersion: String(e.target.gameVersion.value || '')
          }) });
          toast('Настройки сохранены', 'success');
          if (box) { box.className = 'okbox'; box.textContent = 'Объявление и версии обновлены.'; }
        } catch (err) {
          toast(err.message, 'error');
          if (box) { box.className = 'okbox err'; box.textContent = err.message; }
        }
        btn.disabled = false;
      });
    }
    if (section === 'device' && $('[data-hwid-reset]', main)) {
      $('[data-hwid-reset]', main).addEventListener('click', async (e) => {
        if (!confirm('Сбросить привязку HWID? Это действие доступно раз в месяц.')) return;
        e.currentTarget.disabled = true;
        try {
          const r = await api('/api/hwid/reset', { method: 'POST' });
          state.me = r.user;
          toast('Привязка сброшена. Войдите в лаунчере заново.', 'success');
          renderCabContent('device', ap);
        } catch (err) { toast(err.message, 'error'); e.currentTarget.disabled = false; }
      });
    }
    if (section === 'security') {
      const t2btn = $('#tg2faBtn');
      if (t2btn) t2btn.addEventListener('click', async () => {
        t2btn.disabled = true;
        try {
          const r = await api('/api/tg/2fa', { method: 'POST', body: JSON.stringify({ enabled: !(state.me && state.me.tg2fa) }) });
          toast((r && r.message) || 'Готово', 'success');
          if (state.me) state.me.tg2fa = !state.me.tg2fa;
          renderCabContent('security');
          bindSection('security', main, ap);
        } catch (err) { toast(err.message, 'error'); }
        t2btn.disabled = false;
      });
      $('#passForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          await api('/api/change-password', {
            method: 'POST', body: JSON.stringify({ current: e.target.current.value, next: e.target.next.value })
          });
          state.me = null;
          toast('Пароль изменён. Войдите заново.', 'success');
          setTimeout(() => { renderNav(); location.hash = '#/login'; }, 800);
        } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
      });
      $('#logoutAllBtn').addEventListener('click', async () => {
        await api('/api/logout-all', { method: 'POST' });
        state.me = null; renderNav(); location.hash = '#/';
        toast('Все сессии завершены');
      });
      const bindBtn = $('#tgBindBtn');
      if (bindBtn) bindBtn.addEventListener('click', async () => {
        const input = $('#tgInput');
        const box = $('#tgResult');
        if (!input || !input.value.trim()) { toast('Введите @username', 'error'); return; }
        bindBtn.disabled = true;
        try {
          const r = await api('/api/tg/bind', { method: 'POST', body: JSON.stringify({ tg: input.value.trim() }) });
          const bot = r.bot || TG_BOT_LINK || '';
          if (box) {
            box.className = 'okbox';
            box.innerHTML = 'Код: <b>' + esc(r.code) + '</b>' + (bot ? '. Отправьте его боту @' + esc(bot) : '') + ', затем вернитесь сюда — страница обновится автоматически.';
          }
          toast('Отправьте код боту в Telegram', 'success');
          pollTgBind();
        } catch (err) { toast(err.message, 'error'); }
        bindBtn.disabled = false;
      });
      const unbindBtn = $('#tgUnbindBtn');
      if (unbindBtn) unbindBtn.addEventListener('click', async () => {
        const ok = await askFreeze({ title: 'Отвязать Telegram', text: 'Убрать привязку Telegram от вашего аккаунта? Вы не сможете восстанавливать пароль через Telegram.', confirm: 'Отвязать', danger: true });
        if (!ok) return;
        unbindBtn.disabled = true;
        try {
          const r = await api('/api/tg/unbind', { method: 'POST' });
          state.me = r.user;
          toast('Telegram отвязан', 'success');
          renderCabContent('security', ap);
        } catch (err) { toast(err.message, 'error'); unbindBtn.disabled = false; }
      });
    }
    if (['support', 'idea', 'bug'].includes(section) && $('#supportForm')) {
      $('#supportForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          const r = await api('/api/support', {
            method: 'POST', body: JSON.stringify({
              type: section,
              subject: e.target.subject.value.trim(),
              message: e.target.message.value.trim()
            })
          });
          const box = $('#supportResult');
          box.className = 'okbox';
          box.textContent = 'Заявка #' + r.ticketId + ' («' + r.typeName + '») отправлена. Мы ответим в Discord.';
          e.target.reset();
        } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
      });
    }
  }

  let tgPollTimer = null;
  function pollTgBind() {
    if (tgPollTimer) return;
    let attempts = 0;
    tgPollTimer = setInterval(async () => {
      attempts += 1;
      try {
        const m = await api('/api/me');
        if (m.authed && m.user.tgBound) {
          state.me = m.user;
          clearInterval(tgPollTimer);
          tgPollTimer = null;
          const el = $('#app');
          if (el) renderCabContent('security', el);
          toast('Telegram привязан!', 'success');
          return;
        }
      } catch {}
      if (attempts >= 20) {
        clearInterval(tgPollTimer);
        tgPollTimer = null;
      }
    }, 3000);
  }

  async function loadPromoList() {
    const el = $('#promoList');
    if (!el) return;
    try {
      const r = await api('/api/promo/list');
      if (!r.codes.length) { el.innerHTML = '<div class="empty" style="padding:18px 0">Пока нет промокодов</div>'; return; }
      el.innerHTML = r.codes.map(c => {
        const planLabel = c.plan === 'alpha' ? 'Alpha 1.21.4' : c.plan === 'hwid_reset' ? 'Сброс HWID' : c.plan === 'kamiki30' ? 'Kamiki 1.21.4 · 30 дней' : c.plan === 'kamiki365' ? 'Kamiki 1.21.4 · 365 дней' : 'Kamiki 1.21.4';
        const fullyUsed = c.used_count >= c.max_uses;
        const dur = c.days > 0 ? ` · ${c.days} дн.` : '';
        return `<div class="panel-row" style="border-bottom:1px solid var(--line);flex-wrap:wrap">
          <div class="panel-rg" style="min-width:0;flex:1">
            <div class="pt" style="font-weight:700;font-size:14px;word-break:break-all">${esc(c.code)}</div>
            <div class="ps">${planLabel}${dur} · ${c.used_count}/${c.max_uses} использовано · ${fmtDate(c.created_at)}</div>
          </div>
          ${fullyUsed
            ? `<span class="stb stb-ok">${icon.x} Исчерпан</span>`
            : `<span class="stb stb-ok">${icon.check} Активен</span>`}
          <button class="btn btn-dark btn-sm promo-copy" style="flex-shrink:0" data-code="${esc(c.code)}">${icon.copy} Копировать</button>
          <button class="btn btn-danger btn-sm promo-del" style="flex-shrink:0" data-id="${c.id}" data-code="${esc(c.code)}">${icon.trash} Удалить</button>
        </div>`;
      }).join('');
      el.querySelectorAll('.promo-copy').forEach(b => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const code = b.dataset.code || '';
        let ok = false;
        try {
          await navigator.clipboard.writeText(code);
          ok = true;
        } catch {
          const ta = document.createElement('textarea');
          ta.value = code;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); ok = true; } catch {}
          ta.remove();
        }
        if (!ok) { toast('Не удалось скопировать', 'error'); return; }
        const orig = b.innerHTML;
        b.style.transition = 'opacity .25s ease, background .25s ease, border-color .25s ease';
        b.style.opacity = '0';
        setTimeout(() => {
          b.classList.add('copied');
          b.innerHTML = `${icon.check} Скопировано`;
          b.style.opacity = '1';
        }, 250);
        setTimeout(() => {
          b.style.opacity = '0';
          setTimeout(() => {
            b.classList.remove('copied');
            b.innerHTML = orig;
            b.style.opacity = '1';
          }, 250);
        }, 3250);
      }));
      el.querySelectorAll('.promo-del').forEach(b => b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = b.dataset.id;
        if (!confirm('Удалить промокод ' + b.dataset.code + '?')) return;
        const btn = b;
        btn.disabled = true;
        btn.textContent = 'Удаляю...';
        try {
          const r = await api('/api/promo/delete', { method: 'POST', body: JSON.stringify({ id: Number(id) }) });
          if (r.ok) {
            toast('Промокод удалён', 'success');
            loadPromoList();
          } else {
            toast(r.error || 'Ошибка', 'error');
            btn.disabled = false;
            btn.innerHTML = `${icon.trash} Удалить`;
          }
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.innerHTML = `${icon.trash} Удалить`;
        }
      }));
    } catch (err) { el.innerHTML = '<div class="empty">Ошибка загрузки</div>'; }
  }

  let opsCache = [];

  async function loadOpsList() {
    const el = $('#opsList');
    if (!el) return;
    try {
      const r = await api('/api/orders/list');
      opsCache = r.orders || [];
      renderOps('');
    } catch (err) { el.innerHTML = '<div class="empty" style="padding:18px 0">Ошибка загрузки: ' + esc(err.message || '') + '</div>'; }
  }

  function renderOps(filter) {
    const el = $('#opsList');
    if (!el) return;
    const list = filter ? opsCache.filter(o => (o.login || '').toLowerCase().includes(filter)) : opsCache;
    if (!list.length) {
      el.innerHTML = '<div class="empty" style="padding:18px 0">' + (filter ? 'По запросу ничего не найдено' : 'Заказов пока нет') + '</div>';
      return;
    }
    el.innerHTML = list.map(o => {
      const badge = o.status === 'paid'
        ? '<span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#7ee2a8;background:rgba(46,204,113,.14);border:1px solid rgba(46,204,113,.4)">оплачено</span>'
        : (o.status === 'refunded' || o.status === 'canceled')
          ? '<span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#ffe08a;background:rgba(240,180,41,.15);border:1px solid rgba(240,180,41,.5)">возврат</span>'
          : '<span style="padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#ffb3b9;background:rgba(255,95,109,.12);border:1px solid rgba(255,95,109,.4)">не оплачено</span>';
      const date = o.created_at ? new Date(o.created_at).toLocaleString('ru-RU') : '';
      const payName = o.provider === 'yookassa' ? 'СБП (ЮKassa)' : (o.provider || '—');
      const sum = o.amount != null ? esc(String(o.amount)) + ' ' + esc(o.currency || '\u20bd') : '\u2014';
      return `<div class="promo-item">
        <div style="min-width:0">
          <b>${esc(o.login)}</b> \u00b7 <span style="color:var(--muted)">${esc(o.email)}</span>
          <div class="promo-item-sub">\u0427\u0442\u043e: ${esc(o.what)} \u00b7 \u0421\u0443\u043c\u043c\u0430: <b>${sum}</b>${o.provider ? ' · Оплата: ' + esc(payName) : ''}</div>
          <div class="promo-item-sub">\u0417\u0430\u043a\u0430\u0437 #${o.id}${date ? ' \u00b7 ' + esc(date) : ''}</div>
        </div>
        <div style="flex-shrink:0">${badge}</div>
      </div>`;
    }).join('');
  }

  async function loadCustomList() {
    const el = $('#customList');
    if (!el) return;
    try {
      const r = await api('/api/custom/list');
      if (!r.offers || !r.offers.length) { el.innerHTML = '<div class="empty" style="padding:18px 0">Пока нет позиций</div>'; return; }
      el.innerHTML = r.offers.map(o => {
        const link = location.origin + '/#/pay-offer/' + o.id;
        const st = o.stats || { paid: 0, refunded: 0, canceled: 0 };
        const badges = [];
        if (st.paid > 0) badges.push(`<span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#7ee2a8;background:rgba(46,204,113,.14);border:1px solid rgba(46,204,113,.4)">оплачено${st.paid > 1 ? ' · ' + st.paid : ''}</span>`);
        const ret = (st.refunded || 0) + (st.canceled || 0);
        if (ret > 0) badges.push(`<span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#ffe08a;background:rgba(240,180,41,.15);border:1px solid rgba(240,180,41,.5)">возврат${ret > 1 ? ' · ' + ret : ''}</span>`);
        if (!st.paid && !ret) badges.push(`<span style="margin-left:8px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#ffb3b9;background:rgba(255,95,109,.12);border:1px solid rgba(255,95,109,.4)">не оплачено</span>`);
        const status = badges.join('');
        let gives = '';
        try {
          const arr = JSON.parse(o.description || '[]');
          if (arr.length) gives = 'Даёт: ' + arr.map(k => { const p = (state.plans || []).find(x => x.key === k); return p ? p.name : k; }).join(', ');
        } catch (e) { if (o.description) gives = o.description; }
        return `<div class="promo-item">
          <div>
            <b>${esc(o.title)}</b> · ${esc(String(o.amount))} ₽${status}
            ${gives ? `<div class="promo-item-sub">${esc(gives)}</div>` : ''}
            <div class="promo-item-sub"><a href="${link}" target="_blank" rel="noopener">${esc(link)}</a></div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button class="btn btn-ghost" data-copy-offer="${esc(link)}">Копировать</button>
            <button class="btn btn-ghost" data-del-offer="${o.id}">Удалить</button>
          </div>
        </div>`;
      }).join('');
      $$('[data-del-offer]', el).forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Удалить позицию?')) return;
        try {
          await api('/api/custom/delete', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.delOffer) }) });
          toast('Удалено', 'success');
          loadCustomList();
        } catch (err) { toast(err.message, 'error'); }
      }));
      $$('[data-copy-offer]', el).forEach(b => b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.copyOffer); toast('Ссылка скопирована', 'success'); }
        catch (err) { toast('Не удалось скопировать', 'error'); }
      }));
    } catch (err) { el.innerHTML = '<div class="empty" style="padding:18px 0">Ошибка загрузки</div>'; }
  }

  async function loadDiscountList() {
    const el = $('#discountList');
    if (!el) return;
    try {
      const r = await api('/api/discount/list');
      if (!r.codes || !r.codes.length) { el.innerHTML = '<div class="empty" style="padding:18px 0">Пока нет промокодов</div>'; return; }
      el.innerHTML = r.codes.map(c => {
        let names = 'Все тарифы';
        try {
          const l = JSON.parse(c.plans || '[]');
          if (l.length) names = l.map(k => { const p = (state.plans || []).find(x => x.key === k); return p ? p.name : k; }).join(', ');
        } catch (_) {}
        return `<div class="promo-item">
          <div><b>${esc(c.code)}</b> · −${c.discount}%<div class="promo-item-sub">${esc(names)} · использований: ${c.uses || 0}</div></div>
          <button class="btn btn-ghost" data-del-promo="${c.id}">Удалить</button>
        </div>`;
      }).join('');
      $$('[data-del-promo]', el).forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Удалить промокод?')) return;
        try {
          await api('/api/discount/delete', { method: 'POST', body: JSON.stringify({ id: Number(b.dataset.delPromo) }) });
          toast('Промокод удалён', 'success');
          loadDiscountList();
        } catch (err) { toast(err.message, 'error'); }
      }));
    } catch (err) { el.innerHTML = '<div class="empty" style="padding:18px 0">Ошибка загрузки</div>'; }
  }

  async function loadLauncherMeta() {
    const form = $('#launcherMetaForm');
    if (!form) return;
    try {
      const [a, l] = await Promise.all([
        api('/api/announce').catch(() => ({ items: [] })),
        api('/api/launcher/latest').catch(() => ({}))
      ]);
      const items = Array.isArray(a.items) ? a.items : [];
      const text = items.length ? items[0].text : '';
      form.announceText.value = text || '';
      form.launcherVersion.value = (l && l.version) || '';
      form.gameVersion.value = (l && l.gameVersion) || '';
    } catch {}
  }

  async function loadModUsers() {
    const el = $('#modUsersList');
    if (!el) return;
    const input = $('#modSearch');
    const render = (users, q) => {
      const query = (q || '').trim().toLowerCase();
      const filtered = query ? users.filter(u => u.login.toLowerCase().includes(query)) : users;
      if (!filtered.length) { el.innerHTML = '<div class="empty" style="padding:18px 0">' + (query ? 'Никто не найден по запросу <b>' + esc(query) + '</b>' : 'Пока нет пользователей') + '</div>'; return; }
      el.innerHTML = filtered.map(u => {
        const sub = u.subscription;
        const frozen = sub && sub.status === 'frozen';
        const planName = sub ? esc(sub.name) : '<span style="color:var(--muted-2)">Нет подписки</span>';
        return `<div class="panel-row" style="border-bottom:1px solid var(--line);flex-wrap:wrap">
          <div class="panel-rg" style="min-width:0">
            <div class="pt" style="font-weight:700;font-size:14px">${esc(u.login)} <span class="mono" style="opacity:.6;font-weight:400;font-size:12px">#${esc(u.uid)}</span></div>
            <div class="ps" style="word-break:break-all">${esc(u.email)}${u.hwid ? '<br><span style="opacity:.5">HWID: <span class="mono">' + esc(u.hwid) + '</span></span>' : ''}</div>
          </div>
          <div class="panel-rg" style="min-width:120px">
            <div class="pt" style="font-size:13px">${planName}</div>
            <div class="ps">${sub ? (frozen ? '<span style="color:var(--red)">Заморожена</span>' : '<span style="color:var(--green)">Активна</span>') : '—'}</div>
          </div>
          <div class="panel-cta">
            ${sub
              ? `<button class="btn ${frozen ? 'btn-gold' : 'btn-danger'} btn-sm" data-mod-freeze="${u.id}" data-login="${esc(u.login)}" ${frozen ? 'data-op="unfreeze"' : 'data-op="freeze"'}>${frozen ? `${icon.check} Разморозить` : `${icon.lock} Заморозить`}</button>`
              : '<span style="color:var(--muted-2);font-size:13px">нет подписки</span>'}
          </div>
        </div>`;
      }).join('');
      el.querySelectorAll('[data-mod-freeze]').forEach(b => b.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const userId = btn.dataset.modFreeze;
        const op = btn.dataset.op;
        const login = btn.dataset.login;
        const ok = await askFreeze(op === 'freeze'
          ? { title: 'Заморозить подписку', text: 'Пользователь <b>' + login + '</b> не сможет запустить клиент, пока вы не разморозите его подписку.', confirm: 'Заморозить', danger: true }
          : { title: 'Разморозить подписку', text: 'Вернуть доступ к клиенту пользователю <b>' + login + '</b>?', confirm: 'Разморозить', danger: false });
        if (!ok) return;
        btn.disabled = true;
        try {
          const res = await api('/api/admin/freeze', { method: 'POST', body: JSON.stringify({ userId: Number(userId), action: op }) });
          toast(res.message || (op === 'freeze' ? 'Заморожено' : 'Разморожено'), 'success');
          loadModUsers();
        } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
      }));
    };
    if (input) {
      input.oninput = () => render(modUsersCache || [], input.value);
      input.focus();
    }
    try {
      const r = await api('/api/admin/users');
      modUsersCache = r.users;
      render(r.users, input ? input.value : '');
    } catch (err) { el.innerHTML = '<div class="empty">Ошибка загрузки</div>'; }
  }

  function askFreeze({ title, text, confirm, danger }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card ${danger ? 'modal-danger' : ''}" role="dialog">
          <div class="modal-head ${danger ? 'mod-danger' : ''}">
            <div class="modal-ic">${danger ? icon.lock : icon.check}</div>
            <div class="modal-title">${esc(title)}</div>
          </div>
          <div class="modal-text">${text}</div>
          <div class="modal-btns">
            <button class="btn btn-dark" data-modal-cancel>Отмена</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-modal-ok>${esc(confirm)}</button>
          </div>
        </div>`;
      const close = (val) => { overlay.classList.add('hide'); setTimeout(() => overlay.remove(), 200); resolve(val); };
      overlay.querySelector('[data-modal-cancel]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-modal-ok]').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); }, { once: true });
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('show'));
    });
  }

  boot();
})();
