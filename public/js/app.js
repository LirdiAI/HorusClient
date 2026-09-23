/* HorusClient — веб-приложение */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let modUsersCache = null;
  let TG_BOT_LINK = '';
  let TG_BOT_ENABLED = false;

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
shieldFx: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l8 3.5v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6z"/><path d="M9 12l2 2 4-4"/></svg>',
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

  /* Баннер-таймер окончания подписки: за 3 дня и меньше — предупреждение */
  function subExpiryBanner(sub) {
    if (!sub || sub.status !== 'active' || sub.forever || !sub.expiresAt) return '';
    const left = new Date(sub.expiresAt).getTime() - Date.now();
    if (left > 3 * 24 * 60 * 60 * 1000) return '';
    const days = Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
    const hours = left > 0 ? Math.floor((left % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)) : 0;
    let txt;
    if (left <= 0) txt = '<b>Подписка истекла.</b>';
    else if (days === 0) txt = 'До конца подписки осталось <b>' + hours + ' ч.</b>';
    else if (days === 1) txt = 'Остался <b>1 день</b> подписки.';
    else txt = 'Осталось <b>' + days + ' дня</b>.';
    return `<div class="warn warn-sub" data-sub-warn>⏳ ${txt} Подписка закончится скоро — продлите, чтобы продолжить играть.
      <span style="display:block;margin-top:8px"><a href="#/cabinet/buy" data-cab="buy" class="btn btn-gold btn-sm">Продлить подписку</a></span></div>`;
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
    support: { icon: 'support', title: 'Поддержка' },
    idea: { icon: 'idea', title: 'Предложить идею' },
    bug: { icon: 'bug', title: 'Сообщить о баге' }
  };

  const isOwner = () => state.me && state.me.login === 'Howill_';

  function routeCabinet(path) {
    if (!state.me) {
      location.hash = '#/login';
      return;
    }
    const parts = path.split('/').filter(Boolean);
    let section = parts[1] || 'profile';
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
          <div class="sb-ava${u.decoActive === 'ava_deco' ? ' royal' : ''}${u.decoActive === 'ava_ice' ? ' sapphire' : ''}">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || 'H')[0].toUpperCase())}${u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>' : ''}${u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>' : ''}</div>
          <div style="min-width:0"><div class="sb-name${u.loginColor ? ' login-grad login-grad-' + u.loginColor : ''}">${esc(u.login)}</div>
          <div class="sb-uid">UID: <b>${esc(u.uid)}</b></div></div>
        </div>
${sbGroup('Мой кабинет', [
          ['shop', 'cart', 'Магазин'],
          ['redeem', 'key', 'Активация ключа'],
          ['profile', 'user', 'Профиль'],
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
    else if (section === 'shop') main.innerHTML = viewShop();
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
        <div class="profile-ava${glossy ? ' glossy-ava' : ''}${u.decoActive === 'ava_deco' ? ' royal' : ''}${u.decoActive === 'ava_ice' ? ' sapphire' : ''}" id="glossyAva">${u.avatar ? `<img src="${u.avatar}" alt="">` : esc(String(u.login || '?')[0].toUpperCase())}${u.decoActive === 'ava_deco' ? '<span class="c-gold">♛</span>' : ''}${u.decoActive === 'ava_ice' ? '<span class="c-ice">❄</span>' : ''}</div>
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
      <div class="page-head" style="padding-top:16px"><div>
        <div class="page-title">Профиль</div>
        <div class="page-sub">Данные вашего аккаунта</div>
      </div></div>
      <div class="profile-grid">
        <div class="pfield"><div class="pl">Логин</div><div class="pv">${esc(u.login)}</div></div>
        <div class="pfield"><div class="pl">UID</div><div class="pv mono">${esc(u.uid)}</div></div>
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
       ${subExpiryBanner(u.subscription)}
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

  function viewSubs() {
    const u = state.me;
    return `
    <div class="page-card">
      <div class="page-head"><div>
        <div class="page-title">Подписки</div>
        <div class="page-sub">Ваши подписки и продление</div>
      </div></div>
      ${subExpiryBanner(u.subscription)}
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
    ava_ice: { cls: 'sapphire', span: '<span class="c-ice">❄</span>' }
  };

  function shopCardsHTML() {
    const items = (state.shop && state.shop.items) || [];
    const owned = (state.shop && state.shop.owned) || {};
    const activeDeco = (state.shop && state.shop.activeDeco) || null;
    const activeColor = (state.shop && state.shop.activeColor) || null;
    const cats = [...new Set(items.map(i => i.cat || 'Товары'))];
    const u = state.me || {};
    const letter = esc(String(u.login || 'H')[0].toUpperCase());
    return cats.map(cat => `
        <div class="shop-cat-title">${esc(cat)}</div>
        ${items.filter(i => (i.cat || 'Товары') === cat).map(it => {
          const mine = !!owned[it.key];
          const used = it.kind === 'login_color' ? activeColor === it.key : activeDeco === it.key;
          const st = DECO_STYLE[it.key] || { cls: '', span: '' };
          return `
          <div class="shop-item${mine ? ' owned' : ''}${used ? ' used' : ''}">
            <div class="shop-prev">
              ${it.kind === 'login_color'
                ? `<div class="login-prev${used ? ' is-active' : ''}"><span class="login-grad login-grad-${it.key}">${esc(u.login)}</span></div>`
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
    const u = state.me || {};
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Магазин</div>
        <div class="page-sub">Украшения и мелочи для профиля</div>
      </div>
      ${(u.login || '') === 'Howill_' ? '<button class="btn btn-sm" data-grant-shop style="font-size:12px">${icon.crown} Выдача</button>' : ''}</div>
      ${u.loginColor ? `<div class="shop-my-login"><span class="muted">Ваш логин:</span> <span class="login-grad login-grad-${u.loginColor}">${esc(u.login)}</span></div>` : ''}
      ${items.length === 0 ? '<div class="empty" style="padding:22px 0">Загрузка…</div>' : `<div id="shopItems">${shopCardsHTML()}</div>`}
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
    const overlay = document.createElement('div');
    overlay.className = 'buy-overlay';
    overlay.innerHTML = `
      <div class="buy-modal">
        <button class="buy-close" data-close aria-label="Закрыть">✕</button>
        <div class="buy-co-head">${icon.crown} Выдача украшений</div>
        <div class="grant-target">
          <label for="grantLogin">Логин получателя</label>
          <input type="text" id="grantLogin" placeholder="Например: TestUser (пусто — себе)" maxlength="30" autocomplete="off">
        </div>
        <div class="grant-list">
          ${items.map(it => {
            const owned = !!(state.shop.owned && state.shop.owned[it.key]);
            return `<div class="grant-row">
              <div class="grant-name">${esc(it.name)} <span class="muted">· ${esc(it.cat || '')}</span></div>
              <button class="btn btn-sm ${owned ? 'btn-dark' : 'btn-gold'}" data-grant-item="${it.key}">${owned ? 'Выдано ✓' : 'Выдать'}</button>
            </div>`;
          }).join('')}
        </div>
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
    overlay.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]') || e.target === overlay) return close();
      const b = e.target.closest('[data-grant-item]');
      if (!b) return;
      b.disabled = true;
      const login = (($('#grantLogin', overlay) || {}).value || '').trim();
      try {
        const r = await api('/api/shop/grant', { method: 'POST', body: JSON.stringify({ key: b.dataset.grantItem, target: login || undefined }) });
        if (r && r.ok) {
          toast('Выдано: ' + ((items.find(i => i.key === b.dataset.grantItem) || {}).name || '') + (login ? ' → ' + login : ''), 'success');
          state.shop = await api('/api/shop');
          if (!login) {
            const meR = await api('/api/me');
            if (meR && meR.authed && meR.user) state.me = meR.user;
          }
          close();
          renderCabContent('shop');
          bindSection('shop');
        } else { b.disabled = false; toast((r && r.message) || 'Не удалось выдать'); }
      } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
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
    if (section === 'shop') {
      if (!state.shop) {
        (async () => {
          try {
            state.shop = await api('/api/shop');
            const meR = await api('/api/me');
            if (meR && meR.authed && meR.user) state.me = meR.user;
          } catch (_) { state.shop = { items: [], owned: {} }; }
          renderCabContent('shop');
          bindSection('shop');
        })();
        return;
      }
      const bindShopCards = (scope) => {
        $$('[data-buy-shop]', scope).forEach(b => b.addEventListener('click', () => {
          shopBuy(((state.shop && state.shop.items) || []).find(i => i.key === b.dataset.buyShop));
        }));
        $$('[data-use-shop]', scope).forEach(b => b.addEventListener('click', async () => {
          const on = b.dataset.on === '1';
          b.disabled = true;
          try {
            const r = await api('/api/shop/use', {
              method: 'POST',
              body: JSON.stringify({ key: b.dataset.useShop, on: !on })
            });
            if (r && r.ok) {
              state.me = r.user;
              if (state.shop) { state.shop.activeDeco = r.activeDeco; state.shop.activeColor = r.activeColor; }
              const wrap = $('#shopItems');
              if (wrap) { wrap.innerHTML = shopCardsHTML(); bindShopCards(wrap.parentElement); }
            } else { b.disabled = false; toast((r && r.message) || 'Не удалось применить'); }
          } catch (err) { b.disabled = false; toast(err.message, 'error'); }
        }));
      };
      bindShopCards(main);
      const grantBtn = $('[data-grant-shop]', main);
      if (grantBtn) grantBtn.addEventListener('click', () => grantShop());
      return;
    }
    if (section === 'profile' && $('[data-upload]')) {
      $$('[data-upload]').forEach(btn => btn.addEventListener('click', () => uploadProfileImage(btn, btn.dataset.upload)));
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
    if (section === 'mod' && isOwner()) {
      const modBox = $('#modContent', main);
      if (modBox && !modDefaultHtmlCache) modDefaultHtmlCache = modBox.innerHTML;
      const modViews = { promo: viewPromo, discounts: viewDiscounts, testing: viewTesting, ops: viewOps };
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
