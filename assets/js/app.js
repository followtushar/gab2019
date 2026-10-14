/* ==========================================================================
   12 Reasons Why with Tech Experts - site behaviour and motion
   ========================================================================== */
(() => {
  'use strict';

  const doc = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const motion = Boolean(gsap && ScrollTrigger) && !reduceMotion;
  if (motion) gsap.registerPlugin(ScrollTrigger);

  const CHANNEL_URL = 'https://www.youtube.com/@TheAzWay';
  const YT_ID = /^[\w-]{11}$/;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Data ---------- */

  // Minimal RFC 4180 parser - enough for podcasts.csv (quoted fields, escaped quotes, CRLF).
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        quoted = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }

    const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()));
    if (!head) return [];
    const keys = head.map((h) => h.replace(/^﻿/, '').trim());
    return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] || ''])));
  }

  function youTubeId(url) {
    const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  // "12 Reasons Why Azure ARC - Saeid Dahl" -> { topic: "Azure ARC", guest: "Saeid Dahl" }
  function splitTitle(raw) {
    const title = String(raw || '').replace(/\s+/g, ' ').trim();
    const body = title.replace(/^12\s+reasons?\s+why\s*/i, '');
    const m = body.match(/^(.+?)\s*(?:\s-|-\s)\s*(.+)$/);
    return m ? { title, topic: m[1].trim(), guest: m[2].trim() } : { title, topic: body || title, guest: '' };
  }

  async function loadEpisodes() {
    const res = await fetch('podcasts.csv', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`podcasts.csv returned ${res.status}`);
    return parseCsv(await res.text())
      .map((row) => {
        const id = youTubeId(row.video_url);
        return id ? { id, ...splitTitle(row.title) } : null;
      })
      .filter(Boolean)
      .map((ep, i) => ({ ...ep, number: i + 1 }));
  }

  const thumb = (id, quality = 'hqdefault') => `https://i.ytimg.com/vi/${id}/${quality}.jpg`;

  /* ---------- Player ---------- */

  const player = $('#player');
  const playerFrame = $('#player-frame');

  function openPlayer(ep) {
    if (!ep || !YT_ID.test(ep.id)) return;
    if (!player || typeof player.showModal !== 'function') {
      window.open(`https://www.youtube.com/watch?v=${ep.id}`, '_blank', 'noopener');
      return;
    }
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${ep.id}?autoplay=1&rel=0`;
    iframe.title = ep.title;
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.allowFullscreen = true;
    playerFrame.replaceChildren(iframe);
    player.showModal();
    document.body.style.overflow = 'hidden';
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'play_episode', { video_id: ep.id, episode_title: ep.title });
    }
  }

  if (player) {
    player.addEventListener('close', () => {
      playerFrame.replaceChildren();
      document.body.style.overflow = '';
    });
    player.addEventListener('click', (e) => { if (e.target === player) player.close(); });
    $('.player__close', player).addEventListener('click', () => player.close());
  }

  /* ---------- Rendering ---------- */

  let latestEpisode = null;

  $('#play-latest').addEventListener('click', () => {
    if (latestEpisode) openPlayer(latestEpisode);
    else window.open(CHANNEL_URL, '_blank', 'noopener');
  });

  function attachTilt(card) {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
      if (motion) {
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
        card.style.setProperty('--rx', `${(0.5 - py) * 9}deg`);
      }
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  }

  function renderFeature(ep) {
    const feature = $('#feature');
    $('.feature__ep', feature).textContent = `EP ${pad(ep.number)}`;
    $('.feature__topic', feature).textContent = ep.topic;
    const guest = $('.feature__guest', feature);
    guest.textContent = ep.guest;
    guest.hidden = !ep.guest;
    $('.feature__blurb', feature).textContent = ep.guest
      ? `${ep.guest} makes the case for ${ep.topic} - twelve reasons, straight talk and practical takeaways.`
      : `The case for ${ep.topic}, in twelve reasons.`;

    // maxresdefault is not generated for every video; YouTube serves a 120px placeholder when missing.
    const img = $('.feature__thumb', feature);
    img.addEventListener('load', () => {
      if (img.naturalWidth <= 120) img.src = thumb(ep.id);
    }, { once: true });
    img.addEventListener('error', () => { img.src = thumb(ep.id); }, { once: true });
    img.src = thumb(ep.id, 'maxresdefault');

    $('.feature__media', feature).setAttribute('aria-label', `Play episode ${ep.number}: ${ep.title}`);
    $$('[data-play]', feature).forEach((btn) => btn.addEventListener('click', () => openPlayer(ep)));
    feature.hidden = false;
  }

  function renderGrid(list) {
    const grid = $('#episode-grid');
    const tpl = $('#tpl-episode');
    const frag = document.createDocumentFragment();
    list.forEach((ep) => {
      const card = tpl.content.firstElementChild.cloneNode(true);
      const img = $('.ep__thumb', card);
      img.src = thumb(ep.id);
      $('.ep__no', card).textContent = `EP ${pad(ep.number)}`;
      $('.ep__topic', card).textContent = ep.topic;
      const guest = $('.ep__guest', card);
      guest.textContent = ep.guest;
      guest.hidden = !ep.guest;
      const media = $('.ep__media', card);
      media.setAttribute('aria-label', `Play episode ${ep.number}: ${ep.title}`);
      media.addEventListener('click', () => openPlayer(ep));
      if (finePointer) attachTilt(card);
      frag.appendChild(card);
    });
    grid.replaceChildren(frag);
    grid.hidden = list.length === 0;
  }

  function renderMarquee(list) {
    const topics = [...new Set(list.map((ep) => ep.topic))];
    if (!topics.length) return;
    const row = $('.marquee__row');
    row.replaceChildren();
    topics.forEach((topic) => {
      const span = document.createElement('span');
      span.textContent = topic;
      row.append(span, document.createElement('i'));
    });
  }

  function renderMeta(list) {
    const avatars = $('#hero-avatars');
    list.filter((ep) => ep.guest).slice(-4).reverse().forEach((ep, i) => {
      const badge = document.createElement('span');
      badge.className = 'avatar';
      badge.style.setProperty('--i', i);
      badge.title = ep.guest;
      badge.textContent = ep.guest.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      avatars.appendChild(badge);
    });
    $('#hero-count').textContent = `${list.length} expert`;

    const guests = new Set(list.map((ep) => ep.guest.toLowerCase()).filter(Boolean));
    $('#stat-episodes').dataset.count = list.length;
    $('#stat-reasons').dataset.count = list.length * 12;
    $('#stat-guests').dataset.count = guests.size;
  }

  /* ---------- Marquee fill ---------- */

  // Clone the row until the track is at least twice the viewport so the loop never shows a gap.
  function fillMarquee() {
    const track = $('#marquee');
    const source = $('.marquee__row', track);
    $$('.marquee__row', track).slice(1).forEach((r) => r.remove());
    const rowWidth = source.getBoundingClientRect().width || 1;
    const copies = Math.max(2, Math.ceil((window.innerWidth * 2) / rowWidth));
    for (let i = 1; i < copies; i++) {
      const clone = source.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    }
  }

  /* ---------- Navigation ---------- */

  const nav = $('#nav');
  const progressBar = $('.progress span');
  const toggle = $('.nav__toggle');
  const menu = $('#mobile-menu');
  let menuOpen = false;
  let lastY = window.scrollY;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 20);
    nav.classList.toggle('is-hidden', y > lastY && y > 480 && !menuOpen);
    lastY = y;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  function setMenu(open) {
    menuOpen = open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      $('a', menu).focus({ preventScroll: true });
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (!menuOpen) menu.hidden = true; }, reduceMotion ? 0 : 700);
    }
  }
  toggle.addEventListener('click', () => setMenu(!menuOpen));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) setMenu(false); });
  window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches && menuOpen) setMenu(false); });

  const navLinks = $$('.nav__links a[href^="#"]:not(.btn)');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['format', 'episodes', 'host', 'guest'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* ---------- Hero waveform canvas ---------- */

  function initWaves() {
    const canvas = $('#waves');
    const hero = $('.hero');
    const ctx = canvas && canvas.getContext('2d');
    if (!ctx) return;

    const LINES = 14;
    let w = 0;
    let h = 0;
    let gradient = null;
    let t = 0;
    let raf = 0;
    let visible = true;
    const pointer = { x: 0.6, y: 0.5, tx: 0.6, ty: 0.5 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, 'rgba(62,224,255,0)');
      gradient.addColorStop(0.2, 'rgba(62,224,255,0.9)');
      gradient.addColorStop(0.45, 'rgba(47,128,255,0.9)');
      gradient.addColorStop(0.7, 'rgba(139,92,246,0.9)');
      gradient.addColorStop(0.9, 'rgba(255,51,102,0.9)');
      gradient.addColorStop(1, 'rgba(255,51,102,0)');
    }

    function draw() {
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.1;
      const baseY = h * (w < 900 ? 0.78 : 0.7);
      const step = w < 600 ? 8 : 6;

      for (let i = 0; i < LINES; i++) {
        const k = i / (LINES - 1);
        const amp = h * (0.045 + 0.07 * k) * (0.75 + 0.35 * Math.sin(t * 1.2 + i * 0.6));
        const freq = 1.6 + k * 1.4;
        const phase = t * (0.9 + k * 0.5) + i * 0.45;
        ctx.globalAlpha = 0.08 + 0.22 * Math.sin(Math.PI * k);
        ctx.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          const nx = x / w;
          const env = Math.pow(Math.sin(Math.PI * Math.min(Math.max(nx, 0), 1)), 1.4);
          const d = nx - pointer.x;
          const lift = Math.exp(-d * d * 14) * (pointer.y - 0.6) * h * 0.22;
          const y = baseY
            + Math.sin(nx * freq * Math.PI * 2 + phase) * amp * env
            + Math.sin(nx * 9 + phase * 1.8) * amp * 0.18 * env
            + lift * env * (0.4 + k);
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function loop() {
      t += 0.007;
      draw();
      raf = requestAnimationFrame(loop);
    }
    function start() { if (!raf && visible && !document.hidden && !reduceMotion) raf = requestAnimationFrame(loop); }
    function stop() { cancelAnimationFrame(raf); raf = 0; }

    resize();
    draw();
    window.addEventListener('resize', () => { resize(); draw(); });

    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      pointer.tx = (e.clientX - r.left) / r.width;
      pointer.ty = (e.clientY - r.top) / r.height;
    });
    hero.addEventListener('pointerleave', () => { pointer.tx = 0.6; pointer.ty = 0.5; });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start(); else stop();
      }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    start();
  }

  /* ---------- Hero stage parallax ---------- */

  function initParallax() {
    if (!motion || !finePointer) return;
    const hero = $('.hero');
    const layers = $$('#stage [data-depth]').map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 0 }));
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let active = true;

    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width - 0.5;
      target.y = (e.clientY - r.top) / r.height - 0.5;
    });
    hero.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });
    ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', onToggle: (self) => { active = self.isActive; } });

    gsap.ticker.add(() => {
      if (!active) return;
      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;
      layers.forEach(({ el, depth }) => {
        el.style.translate = `${(-current.x * depth * 44).toFixed(2)}px ${(-current.y * depth * 34).toFixed(2)}px`;
      });
    });
  }

  /* ---------- Text splitting ---------- */

  function splitChars(el) {
    const text = el.textContent;
    el.textContent = '';
    [...text].forEach((ch) => {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = ch;
      el.appendChild(span);
    });
  }

  // Wraps each word in a mask so it can slide up. Gradient spans stay whole so the
  // background-clip text effect is not broken by transformed children.
  function splitWords(el) {
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    const wrap = (node) => {
      const outer = document.createElement('span');
      outer.className = 'word';
      outer.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      if (node.nodeType === Node.TEXT_NODE) inner.textContent = node.textContent; else inner.appendChild(node);
      outer.appendChild(inner);
      return outer;
    };
    const frag = document.createDocumentFragment();
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          frag.appendChild(/^\s+$/.test(part) ? document.createTextNode(' ') : wrap(document.createTextNode(part)));
        });
      } else {
        frag.appendChild(wrap(node));
      }
    });
    el.replaceChildren(frag);
  }

  /* ---------- Loader + hero intro ---------- */

  function runLoader(done) {
    const loader = $('.loader');
    let seen = false;
    try {
      seen = sessionStorage.getItem('12rw-intro') === '1';
      sessionStorage.setItem('12rw-intro', '1');
    } catch (e) { /* storage unavailable - show the intro */ }

    if (!loader || !motion || seen) {
      doc.classList.add('is-loaded');
      done();
      return;
    }

    const count = $('.loader__count', loader);
    const bar = $('.loader__bar span', loader);
    const duration = 1100;
    const startTime = performance.now();
    const tick = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      count.textContent = pad(Math.round(eased * 12));
      bar.style.transform = `scaleX(${eased})`;
      if (p < 1) { requestAnimationFrame(tick); return; }
      setTimeout(() => {
        loader.classList.add('is-done');
        done();
        setTimeout(() => doc.classList.add('is-loaded'), 950);
      }, 160);
    };
    requestAnimationFrame(tick);
  }

  function heroIntro() {
    if (!motion) return;
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('.nav', { yPercent: -100, opacity: 0, duration: 1, clearProps: 'transform,opacity' }, 0.2)
      .from('.hero__title .num', { yPercent: 110, duration: 1.3 }, 0.1)
      .from('.hero__title .char', { yPercent: 115, rotate: 8, duration: 1.3, stagger: 0.035 }, 0.18)
      .from('[data-hero]', { y: 30, opacity: 0, duration: 1.1, stagger: 0.08 }, 0.5)
      .from('.stage__disc', { scale: 0.55, opacity: 0, duration: 1.7 }, 0.1)
      .from('.stage__twelve', { x: -80, opacity: 0, duration: 1.8 }, 0.25)
      .from('.stage__ring', { opacity: 0, duration: 1.5 }, 0.5)
      .from('.stage__host', { y: 90, opacity: 0, duration: 1.6 }, 0.3)
      .from('.chip', { opacity: 0, filter: 'blur(10px)', duration: 1, stagger: 0.14, clearProps: 'filter' }, 0.85)
      .from('.scroll-cue', { opacity: 0, duration: 1 }, 1.1);
  }

  /* ---------- Format counter ---------- */

  function initFormat() {
    const section = $('.format');
    const num = $('#format-num');
    const ticksHost = $('#ticks');
    const steps = $$('.step', section);
    for (let i = 0; i < 12; i++) {
      const tick = document.createElement('span');
      tick.style.setProperty('--p', `${(i / 11) * 100}%`);
      ticksHost.appendChild(tick);
    }
    const ticks = Array.from(ticksHost.children);

    let current = 0;
    const setReason = (n) => {
      if (n === current) return;
      current = n;
      num.textContent = pad(n);
      ticks.forEach((tk, i) => tk.classList.toggle('is-on', i < n));
      const active = n <= 4 ? 0 : n <= 8 ? 1 : 2;
      steps.forEach((s, i) => s.classList.toggle('is-active', i === active));
    };

    if (!motion) { setReason(12); return; }
    setReason(1);

    const mm = gsap.matchMedia();
    mm.add('(min-width: 901px) and (min-height: 740px)', () => {
      section.classList.add('js-pinned');
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: '+=170%',
        pin: true,
        onUpdate: (self) => setReason(1 + Math.round(self.progress * 11)),
      });
      return () => section.classList.remove('js-pinned');
    });
    mm.add('(max-width: 900px), (max-height: 739px)', () => {
      const counter = { v: 1 };
      gsap.to(counter, {
        v: 12, duration: 2.2, ease: 'power2.inOut',
        onUpdate: () => setReason(Math.round(counter.v)),
        scrollTrigger: { trigger: section, start: 'top 70%', once: true },
      });
    });
  }

  /* ---------- Scroll choreography ---------- */

  function initScrollMotion() {
    if (!motion) return;

    // Section headings: words slide up through a mask
    $$('[data-split]').forEach((el) => {
      splitWords(el);
      gsap.from($$('.word > span', el), {
        yPercent: 115, duration: 1.2, ease: 'expo.out', stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%' },
      });
    });

    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 44, opacity: 0, duration: 1.2, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%' },
      });
    });

    // Hero drifts away as you scroll
    gsap.to('.hero__copy', {
      y: -80, opacity: 0.15, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });
    gsap.to('.hero__visual', {
      yPercent: 14, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    // Marquee leans into scroll velocity
    const track = $('#marquee');
    const skewSet = gsap.quickSetter(track, 'skewX', 'deg');
    const clampSkew = gsap.utils.clamp(-14, 14);
    const proxy = { skew: 0 };
    ScrollTrigger.create({
      onUpdate: (self) => {
        const skew = clampSkew(self.getVelocity() / -260);
        if (Math.abs(skew) > Math.abs(proxy.skew)) {
          proxy.skew = skew;
          gsap.to(proxy, { skew: 0, duration: 0.9, ease: 'power3', overwrite: true, onUpdate: () => skewSet(proxy.skew) });
        }
      },
    });

    // Host portrait floats against the copy
    gsap.fromTo('.portrait', { yPercent: 8 }, {
      yPercent: -8, ease: 'none',
      scrollTrigger: { trigger: '.host', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    // Giant background type in the CTA
    gsap.fromTo('.cta__scroller', { xPercent: 4 }, {
      xPercent: -38, ease: 'none',
      scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true },
    });

    gsap.from('.footer__word', {
      yPercent: 60, opacity: 0, ease: 'none',
      scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
    });
  }

  function revealEpisodes() {
    const cards = $$('#episode-grid .ep');
    const live = () => cards.forEach((c) => c.classList.add('is-live'));
    if (!motion) { live(); return; }

    gsap.from('#feature', {
      y: 60, opacity: 0, duration: 1.3, ease: 'expo.out',
      scrollTrigger: { trigger: '#feature', start: 'top 88%' },
    });
    if (cards.length) {
      gsap.from(cards, {
        y: 70, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1, clearProps: 'transform,opacity',
        scrollTrigger: { trigger: '#episode-grid', start: 'top 90%' },
        onComplete: live,
      });
    }
  }

  function initStats() {
    const els = $$('[data-count]');
    if (!motion) {
      els.forEach((el) => { el.textContent = el.dataset.count; });
      return;
    }
    els.forEach((el) => {
      const target = parseInt(el.dataset.count, 10) || 0;
      const counter = { v: 0 };
      el.textContent = '0';
      gsap.to(counter, {
        v: target, duration: 2, ease: 'power3.out',
        onUpdate: () => { el.textContent = Math.round(counter.v); },
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      });
    });
  }

  /* ---------- Micro-interactions ---------- */

  function initMagnetic() {
    if (!motion || !finePointer) return;
    $$('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.28);
        yTo((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  function initReasonChip() {
    const el = $('#chip-reason');
    if (!el || reduceMotion) return;
    let n = 1;
    setInterval(() => {
      if (document.hidden) return;
      n = (n % 12) + 1;
      el.textContent = pad(n);
      if (motion) gsap.fromTo(el, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'expo.out' });
    }, 1500);
  }

  /* ---------- Boot ---------- */

  $('#year').textContent = new Date().getFullYear();

  if (motion) $$('.hero__title .split').forEach(splitChars);

  initWaves();
  initFormat();       // creates the pin first so later triggers measure the pinned layout
  initScrollMotion();
  initParallax();
  initMagnetic();
  initReasonChip();
  fillMarquee();
  runLoader(heroIntro);

  loadEpisodes()
    .then((episodes) => {
      if (!episodes.length) throw new Error('No episodes found in podcasts.csv');
      const newestFirst = [...episodes].reverse();
      latestEpisode = newestFirst[0];
      renderFeature(newestFirst[0]);
      renderGrid(newestFirst.slice(1));
      renderMarquee(episodes);
      renderMeta(episodes);
      fillMarquee();
    })
    .catch((err) => {
      console.warn(err);
      $('#episodes-fallback').hidden = false;
      $('#episode-grid').hidden = true;
      $('#hero-count').textContent = 'Expert';
    })
    .finally(() => {
      revealEpisodes();
      initStats();
      if (motion) ScrollTrigger.refresh();
    });

  if (motion && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { fillMarquee(); ScrollTrigger.refresh(); });
  }
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fillMarquee, 200);
  });
})();
