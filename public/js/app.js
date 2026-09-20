/* HorusClient — веб-приложение */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = {
    me: null,
    plans: [
      {
        key: 'kamiki', name: 'Kamiki', tag: 'Базовый', price: 199, currency: '₽', forever: true,
        desc: ['Базовый доступ к клиенту', 'Все будущие обновления', 'Поддержка 24/7']
      },
      {
        key: 'alpha', name: 'Alpha', tag: 'Расширенный', price: 349, currency: '₽', forever: true,
        featured: true,
        desc: ['Всё из Kamiki', 'Ранние обновления', 'Сброс HWID раз в месяц', 'Приоритетная поддержка']
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

    routeLanding(path);
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
          <a href="${state.me ? (state.me.subscription ? '#launcher' : '#/cabinet/buy') : '#/register'}" class="btn btn-gold btn-lg">${state.me ? (state.me.subscription ? 'Скачать клиент' : 'Купить доступ') : 'Скачать лаунчер'}</a>
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
            <div class="preview-watermark"><img src="img/logo.svg" class="w-eye" alt=""><span>Horus<b>Client</b>&nbsp;&nbsp;1.21.4</span></div>
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
      <span class="eyebrow">${icon.crown} Тарифы</span>
      <h2 class="section-title">Одна покупка — <span class="grad grad-anim">доступ навсегда</span></h2>
      <p class="section-sub">Активируй подписку на своём аккаунте и привяжи к устройству через лаунчер.</p>
      <div class="pricing-grid">${plansHTML()}</div>
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
              <div><div class="lw-user">HorusLauncher</div><div class="lw-sub">Версия 1.0.0 · stable</div></div>
            </div>
            <div class="lw-bar"><i></i></div>
            <div class="lw-row"><span>Скачивание</span><b>82% · 1.21.4</b></div>
          </div>
          <div class="dl-card">
            <div class="fc-icon">${icon.zap}</div>
            <div><div style="font-weight:700">Лаунчер для Windows</div><div class="muted" style="font-size:12.5px">exe · ~12 МБ</div></div>
            <a href="#download" class="btn btn-gold" style="margin-left:auto" data-scroll-dl>Скачать</a>
          </div>
        </div>
        <div>
          <span class="eyebrow" style="margin-bottom:14px">${icon.layers} Системные требования</span>
          <div class="feature"><h3>Минимальные</h3><p>Windows 10 · Intel Core i3 / AMD Ryzen 3 · 4 ГБ ОЗУ · 1 ГБ на диске · Minecraft Java 1.21.4</p></div>
          <div class="feature mt-16"><h3>Рекомендуемые</h3><p>Windows 10/11 · Intel Core i5 / AMD Ryzen 5 · 8 ГБ ОЗУ · SSD · видеокарта с 4 ГБ VRAM</p></div>
        </div>
      </div>
      <div id="download" style="margin-top:6px"></div>
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

  function plansHTML() {
    return state.plans.map((p, i) => `
      <div class="plan ${p.featured ? 'featured' : ''} ${p.forever ? 'forever-badge' : ''}">
        ${p.featured ? '<div class="plan-tag">Выбор игроков</div>' : ''}
        <div class="plan-name">${esc(p.name)}</div>
        <div class="plan-sub">${esc(p.tag)}</div>
        <div class="plan-price">
          <span class="amount">${p.price}</span><span class="cur">${esc(p.currency)}</span>
          <span class="forever">${p.forever ? 'Действует: Навсегда' : ''}</span>
        </div>
        <ul class="plan-feats">${p.desc.map(d => `<li>${icon.check}<span>${esc(d)}</span></li>`).join('')}</ul>
        <button class="btn btn-block ${p.featured ? 'btn-gold' : 'btn-dark'}" data-buy="${p.key}">${esc(p.cta || 'Купить доступ')}</button>
      </div>`).join('');
  }

function bindLanding(app) {
    $$('[data-buy]', app).forEach(b => b.addEventListener('click', () => startPurchase(b.dataset.buy)));
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
    api('/api/stats').then(d => {
      const el = $('#statUsers');
      if (el && d && d.users != null) el.textContent = fmtNum(d.users);
    }).catch(() => {});
  }

async function startPurchase(plan) {
    window.open('https://funpay.com/lots/offer?id=77228605', '_blank', 'noopener');
  }

  function hasSub() {
    return !!(state.me && state.me.subscription);
  }

  /* Проверка доступа к скачиванию: только с активной подпиской */
  function requireSub() {
    if (hasSub()) return true;
    if (!state.me) {
      toast('Войдите в аккаунт, чтобы скачать клиент');
      location.hash = '#/login';
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

/* ================= CABINET ================= */
  const CAB_SECTIONS = {
    profile: { icon: 'user', title: 'Профиль' },
    subs: { icon: 'crown', title: 'Подписки' },
    device: { icon: 'monitor', title: 'Привязка устройства' },
    buy: { icon: 'cart', title: 'Купить доступ' },
    redeem: { icon: 'key', title: 'Ввести промокод' },
    security: { icon: 'shield', title: 'Безопасность' },
    promo: { icon: 'spark', title: 'Раздача' },
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
          <div class="sb-ava">${esc(u.login[0] || 'H')}</div>
          <div style="min-width:0"><div class="sb-name">${esc(u.login)}</div>
          <div class="sb-uid">UID: <b>${esc(u.uid)}</b></div></div>
        </div>
${sbGroup('Мой кабинет', [
          ['profile', 'user', 'Профиль'],
          ['subs', 'crown', 'Подписки'],
          ['device', 'monitor', 'Привязка устройства'],
          ['buy', 'cart', 'Купить доступ'],
          ['redeem', 'key', 'Ввести промокод'],
          ['security', 'shield', 'Безопасность'],
          ...(isOwner() ? [['mod', 'shield', 'Модификация'], ['promo', 'spark', 'Раздача']] : [])
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
    else if (section === 'subs') main.innerHTML = viewSubs();
    else if (section === 'device') main.innerHTML = viewDevice();
    else if (section === 'buy') main.innerHTML = viewBuy();
    else if (section === 'redeem') main.innerHTML = viewRedeem();
    else if (section === 'promo' && isOwner()) main.innerHTML = viewPromo();
    else if (section === 'mod' && isOwner()) main.innerHTML = viewMod();
    else if (section === 'security') main.innerHTML = viewSecurity();
    else main.innerHTML = viewSupport(section, ap);
    bindSection(section, main, ap);
  }

  function viewProfile() {
    const u = state.me;
    return `
    <div class="page-card">
      <div class="page-head"><div>
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
        ${u.subscription
          ? `<a href="#/launcher" class="btn btn-gold btn-lg">${icon.layers} Скачать клиент</a>`
          : `<a href="#/cabinet/buy" data-cab="buy" class="btn btn-gold btn-lg">${icon.crown} Купить доступ</a>`}
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
        <div class="empty">${icon.crown}<b>Нет активных подписок</b>Оформите тариф или введите промокод в разделе «Ввести промокод».</div>`}
    </div>`;
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
      ${alpha ? '' : '<div class="warn">У вас подписка Kamiki. Сброс HWID доступен только с подпиской <b>Alpha</b>.</div>'}
    </div>`;
  }

  function viewBuy() {
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Купить доступ</div>
        <div class="page-sub">Одна покупка — доступ навсегда. Активация мгновенная.</div>
      </div></div>
      <div class="pricing-grid">${plansHTML()}</div>
      ${state.purchaseNote ? `<div class="okbox mt-24">${esc(state.purchaseNote)}</div>` : ''}
    </div>`;
  }

function viewRedeem() {
    return `
    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div>
        <div class="page-title">Ввести промокод</div>
        <div class="page-sub">Активируйте промокод из раздачи</div>
      </div></div>
      <form id="promoForm">
        <div class="field">
          <label>Промокод</label>
          <input name="code" placeholder="HORUS-GIVEAWAY" maxlength="30" required>
          <div class="hint">Промокоды выдают в Discord во время раздач</div>
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
              <span class="dd-txt">Kamiki</span>
              <span class="dd-caret"></span>
            </button>
            <div class="dd-menu">
              <div class="dd-item selected" data-plan-value="kamiki">Kamiki</div>
              <div class="dd-item" data-plan-value="alpha">Alpha</div>
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

  function viewMod() {
    return `
    <div class="page-card" style="max-width:820px">
      <div class="page-head"><div>
        <div class="page-title">Модификация</div>
        <div class="page-sub">Пользователи сайта: аккаунты, подписки и заморозка доступа</div>
      </div></div>
      <div id="modUsersList"><div class="empty" style="padding:18px 0">Загрузка пользователей...</div></div>
    </div>`;
  }

  function viewSecurity() {
    return `
    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div>
        <div class="page-title">Безопасность</div>
        <div class="page-sub">Управление доступом к аккаунту</div>
      </div></div>

      <form id="emailForm" class="mt-16">
        <div class="page-head" style="margin-bottom:8px"><div><div class="pt" style="font-weight:700;font-size:15px">Сменить почту</div></div></div>
        <div class="field"><label>Новая почта</label><input name="email" type="email" placeholder="mail@example.com" required></div>
        <div class="field"><label>Пароль</label><input name="password" type="password" placeholder="••••••••" required></div>
        <button type="submit" class="btn btn-dark">Сохранить почту</button>
      </form>
    </div>

    <div class="page-card" style="max-width:620px">
      <div class="page-head"><div><div class="page-title" style="font-size:17px">Пароль</div></div></div>
      <form id="passForm">
        <div class="field"><label>Текущий пароль</label><input name="current" type="password" required></div>
        <div class="field"><label>Новый пароль</label><input name="next" type="password" minlength="8" required></div>
        <button type="submit" class="btn btn-dark">Сменить пароль</button>
      </form>
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
  function bindSection(section, main, ap) {
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
          dd.querySelector('input[name="plan"]').value = item.dataset.planValue;
          dd.querySelector('.dd-txt').textContent = item.textContent.trim();
          $$('.dd-item', dd).forEach(i => i.classList.toggle('selected', i === item));
          if (item.dataset.planValue === 'hwid_reset') {
            $$('#daysField', main).forEach(f => f.style.display = 'none');
          } else {
            $$('#daysField', main).forEach(f => f.style.display = '');
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
            dd.querySelector('.dd-txt').textContent = 'Kamiki';
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
    if (section === 'mod' && isOwner()) {
      loadModUsers();
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
      $('#emailForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        try {
          const r = await api('/api/change-email', {
            method: 'POST', body: JSON.stringify({ email: e.target.email.value.trim(), password: e.target.password.value })
          });
          state.me = r.user; toast('Почта обновлена', 'success');
          e.target.reset();
        } catch (err) { toast(err.message, 'error'); }
        btn.disabled = false;
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

  async function loadPromoList() {
    const el = $('#promoList');
    if (!el) return;
    try {
      const r = await api('/api/promo/list');
      if (!r.codes.length) { el.innerHTML = '<div class="empty" style="padding:18px 0">Пока нет промокодов</div>'; return; }
      el.innerHTML = r.codes.map(c => {
        const planLabel = c.plan === 'alpha' ? 'Alpha' : c.plan === 'hwid_reset' ? 'Сброс HWID' : 'Kamiki';
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

  async function loadModUsers() {
    const el = $('#modUsersList');
    if (!el) return;
    try {
      const r = await api('/api/admin/users');
      if (!r.users.length) { el.innerHTML = '<div class="empty" style="padding:18px 0">Пока нет пользователей</div>'; return; }
      el.innerHTML = r.users.map(u => {
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
        if (!confirm(op === 'freeze'
          ? 'Заморозить подписку ' + login + '? Он не сможет запустить игру.'
          : 'Разморозить подписку ' + login + '?')) return;
        btn.disabled = true;
        try {
          const res = await api('/api/admin/freeze', { method: 'POST', body: JSON.stringify({ userId: Number(userId), action: op }) });
          toast(res.message || (op === 'freeze' ? 'Заморожено' : 'Разморожено'), 'success');
          loadModUsers();
        } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
      }));
    } catch (err) { el.innerHTML = '<div class="empty">Ошибка загрузки</div>'; }
  }

  boot();
})();
