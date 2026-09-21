/* HorusClient — FX: плавные анимации и производительность */
(() => {
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const docEl = document.documentElement;
  docEl.classList.add('js-fx');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- scroll: progress, nav, to-top ---------- */
  const nav = $('#siteNav');
  const progress = $('#scrollProgress');
  const toTop = $('#toTop');

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (progress) progress.style.transform = `scaleX(${Math.min(y / max, 1)})`;
      if (nav) nav.classList.toggle('scrolled', y > 10);
      if (toTop) toTop.classList.toggle('show', y > 560);
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------- active nav link ---------- */
  function updateNavLinks() {
    const path = (location.hash || '#/').replace(/^#/, '');
    $$('.nav-links a').forEach(a => {
      const route = a.dataset.route || '/';
      a.classList.toggle('active', path === route || path === '/');
    });
  }
  updateNavLinks();
  window.addEventListener('hashchange', updateNavLinks);

  /* ---------- reveal on scroll ---------- */
  const io = ('IntersectionObserver' in window && !REDUCE)
    ? new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    : null;

  const seen = new WeakSet();

  function revealEl(el, delay = 0) {
    if (seen.has(el)) return;
    seen.add(el);
    el.classList.add('reveal');
    if (delay) el.style.setProperty('--d', delay + 'ms');
    if (io) io.observe(el);
    else el.classList.add('in');
  }

  const SEL = [
    '.hero-badge', '.hero > div:first-child h1', '.hero .lead', '.hero-cta', '.hero-stats',
    '.hero-preview', '.section .eyebrow', '.section .section-title', '.section .section-sub',
    '.section .features-grid .feature', '.section .pricing-grid .plan', '.section .com-grid .com-card',
    '.section .launch-window', '.section .dl-card', '.auth-wrap .form-card',
    '.cab-wrap .sidebar', '.cab-wrap .page-card'
  ].join(', ');

  function scanApp(root) {
    const scope = root || document;
    $$(SEL, scope).forEach((el, i) => revealEl(el, (i % 10) * 60));
    bindGlow(scope);
    bindCounters(scope);
    bindTilt(scope);
  }

  const app = $('#app');
  if (app && 'MutationObserver' in window) {
    let t = null;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => scanApp(app), 40);
    }).observe(app, { childList: true, subtree: true });
  }
  scanApp(app);

  /* ---------- hover glow following cursor ---------- */
  function bindGlow(scope) {
    if (IS_TOUCH || REDUCE) return;
    const cards = $$('.feature, .plan, .com-card, .preview-card, .launch-window', scope);
    if (!cards.length) return;
    let raf = null;
    const move = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const card = e.target.closest('.feature, .plan, .com-card, .preview-card, .launch-window');
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    };
    cards.forEach(c => {
      c.addEventListener('mousemove', move, { passive: true });
      c.addEventListener('mouseleave', () => {
        c.style.removeProperty('--mx');
        c.style.removeProperty('--my');
      }, { passive: true });
    });
  }

  /* ---------- 3D tilt ---------- */
  function bindTilt(scope) {
    if (IS_TOUCH || REDUCE) return;
    $$('.preview-card, .launch-window', scope).forEach(el => {
      if (el.dataset.tilt) return;
      el.dataset.tilt = '1';
      const MAX = 5;
      let raf = null;
      const move = (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(900px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg)`;
          el.style.setProperty('--mx', `${e.clientX - r.left}px`);
          el.style.setProperty('--my', `${e.clientY - r.top}px`);
        });
      };
      const leave = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        el.style.transform = '';
      };
      el.addEventListener('mousemove', move, { passive: true });
      el.addEventListener('mouseleave', leave, { passive: true });
    });
  }

  /* ---------- animated counters ---------- */
  let counterIO = null;
  if (!REDUCE && 'IntersectionObserver' in window) {
    counterIO = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        animateCounter(en.target);
        counterIO.unobserve(en.target);
      }
    }, { threshold: 0.5 });
  }

  function animateCounter(el) {
    if (!el.textContent) return;
    const txt = el.textContent.trim();
    if (!/^[\d\s.,]+$/.test(txt)) return;
    const target = parseInt(txt.replace(/[^\d]/g, ''), 10);
    if (!(target > 0)) return;
    const dur = 1400;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e).toLocaleString('ru-RU');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function bindCounters(scope) {
    $$('.hstat .num:not(#statUsers), .com-count b', scope).forEach(el => {
      if (el.dataset.fxCount) return;
      if (!/^[\d\s.,]+$/.test(el.textContent.trim())) return;
      el.dataset.fxCount = '1';
      if (counterIO) counterIO.observe(el);
      else animateCounter(el);
    });
    const su = $('#statUsers');
    if (su && !su.dataset.fxCount) {
      su.dataset.fxCount = '1';
      if ('MutationObserver' in window) {
        new MutationObserver((muts) => {
          for (const m of muts) {
            if (m.attributeName === 'data-fx-count' && m.target.attributes['data-fx-count']?.value === '1') continue;
            break;
          }
          const txt = su.textContent.trim();
          if (txt && txt !== '—' && /^[\d\s.,]+$/.test(txt) && !su._animating) {
            su._animating = 1;
            animateCounter(su);
          }
        }).observe(su, { childList: true, characterData: true, subtree: true });
      }
    }
  }

  /* ---------- particles background ---------- */
  const canvas = $('#fxCanvas');
  if (canvas && !REDUCE) {
    const ctx = canvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    let W = 0, H = 0, parts = [];

    function resize() {
      W = innerWidth;
      H = innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const n = Math.min(80, Math.round((W * H) / 22000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.4,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(Math.random() * 0.25 + 0.06),
        a: Math.random() * 0.4 + 0.15,
        tw: Math.random() * Math.PI * 2
      }));
    }

    function draw(t) {
      if (!document.hidden) {
        ctx.clearRect(0, 0, W, H);
        const s = t * 0.001;
        for (const p of parts) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; }
          if (p.x < -6) p.x = W + 6;
          else if (p.x > W + 6) p.x = -6;
          const alpha = p.a * (0.55 + 0.45 * Math.sin(s + p.tw));
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#8b5cf6';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });
    requestAnimationFrame(draw);
  }
})();