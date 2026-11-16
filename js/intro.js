/* Intro "loading" screen: plays the first time someone opens the site (per browser),
   explains what the site does while the Burrito Gang trailer music plays.
   Replay it from your profile. Browsers only allow sound after a click, hence "Press start". */
(async () => {
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem('bg:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem('bg:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const ready = await (window.BG_READY || Promise.resolve({ mode: 'mock' }));
  const signedIn = ready.mode !== 'gate';

  const SONG = 'assets/intro.mp3';
  const name = () => {
    const D = window.BG_DATA || {};
    const me = (D.CREW || []).find(c => c.id === D.ME);
    return me ? me.name : '';
  };
  // Each step: the fake "loading" line, then what that part of the site actually does
  const STEPS = [
    { load: 'Waking up the Burrito Gang…', say: 'One place for “so what do you wanna play?”' },
    { load: 'Reading everyone’s Steam libraries…', say: '<b>Tonight</b> shows what everyone on owns, and what you’re only one or two copies away from.' },
    { load: 'Rolling the dice…', say: '<b>Shuffle</b> picks a random game for the crew. Lock filters and keep rolling till something sticks.' },
    { load: 'Checking prices, keyshops and install sizes…', say: '<b>Discovery</b> has Steam’s charts with the cheapest key and how big it is. Yes, Lukas, it says the GB.' },
    { load: 'Pinging #game-night…', say: '<b>Pitch</b> a game to the lads, vote on it, and get a 🔔 when someone pitches you.' },
    { load: 'Counting your hours (sorry)…', say: '<b>Leaderboards</b> for hours, FiveM, CS2 and money you’ve wasted. Hide your stats on your profile if you’re ashamed.' },
    { load: 'Feeding the cats…', say: 'They wander around. Click them. They have opinions.' },
  ];

  let el, audio, timers = [], running = false;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };

  function close() {
    if (!el) return;
    clear(); running = false;
    store.set('intro-seen', true);
    if (audio) { const a = audio; let v = a.volume; const fade = setInterval(() => { v -= 0.08; if (v <= 0) { clearInterval(fade); a.pause(); } else a.volume = v; }, 40); }
    el.classList.add('out');
    const gone = el; el = null;
    setTimeout(() => gone.remove(), 600);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if ((e.key === 'Enter' || e.key === ' ') && el && !running) { e.preventDefault(); start(); }
  }

  function open() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'intro';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Welcome to Burrito Gang Game Night');
    el.innerHTML = `
      <div class="intro-grain"></div>
      <div class="intro-box">
        <div class="intro-logo"><span class="intro-burrito">🌯</span><span>BURRITO GANG</span><small>game night</small></div>
        <div class="intro-stage" data-stage="start">
          <p class="intro-hi">${name() ? `Alright ${esc(name())}.` : 'Alright.'} Welcome in.</p>
          <button class="intro-start" data-intro="start">▶ PRESS START</button>
          <p class="intro-small">Sound on 🔊 · takes 20 seconds</p>
        </div>
        <div class="intro-stage" data-stage="load" hidden>
          <div class="intro-load"><span class="intro-spin"></span><span class="intro-line"></span></div>
          <div class="intro-bar"><i></i><span class="intro-pct">0%</span></div>
          <p class="intro-say"></p>
          <ol class="intro-dots">${STEPS.map(() => '<li></li>').join('')}</ol>
        </div>
        <div class="intro-stage" data-stage="done" hidden>
          <p class="intro-hi">Loaded. No excuses now.</p>
          <button class="intro-start" data-intro="close">LET’S PLAY →</button>
        </div>
      </div>
      <div class="intro-ctrl">
        <button data-intro="mute" title="Mute">🔊</button>
        <button data-intro="close">Skip ✕</button>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-intro]'); if (!b) return;
      const a = b.dataset.intro;
      if (a === 'start') start();
      else if (a === 'close') close();
      else if (a === 'mute' && audio) { audio.muted = !audio.muted; b.textContent = audio.muted ? '🔇' : '🔊'; }
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => { const s = el && el.querySelector('.intro-start'); if (s) s.focus(); }, 300);
  }

  function start() {
    if (!el || running) return;
    running = true;
    const stage = n => el.querySelectorAll('.intro-stage').forEach(s => { s.hidden = s.dataset.stage !== n; });
    stage('load');
    audio = new Audio(SONG + '?v=1');
    audio.volume = 0.85;
    const total = 21000; // the track is ~22s; finish just before it ends
    audio.play().catch(() => { /* no sound allowed or file missing: the screen still runs */ });
    const bar = el.querySelector('.intro-bar i'), pct = el.querySelector('.intro-pct');
    const line = el.querySelector('.intro-line'), say = el.querySelector('.intro-say'), dots = el.querySelectorAll('.intro-dots li');
    const t0 = performance.now();
    const tick = () => {
      if (!el || !running) return;
      const p = Math.min(1, (performance.now() - t0) / total);
      // fake loading: fast, stall, fast again
      const shown = p < 0.5 ? p * 1.15 : p < 0.7 ? 0.575 + (p - 0.5) * 0.4 : 0.655 + (p - 0.7) * 1.15;
      bar.style.width = Math.min(100, shown * 100) + '%';
      pct.textContent = Math.min(100, Math.round(shown * 100)) + '%';
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const per = total / STEPS.length;
    STEPS.forEach((s, i) => timers.push(setTimeout(() => {
      if (!el) return;
      line.textContent = s.load; say.innerHTML = s.say;
      say.classList.remove('pop'); void say.offsetWidth; say.classList.add('pop');
      dots.forEach((d, j) => d.classList.toggle('on', j <= i));
    }, i * per)));
    timers.push(setTimeout(() => { if (el) { stage('done'); const b = el.querySelector('[data-stage=done] .intro-start'); if (b) b.focus(); } }, total));
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

  window.BG_INTRO = { play: () => { close(); setTimeout(open, el ? 650 : 0); } };
  // First visit (or "show every time" switched on in the profile)
  if (signedIn && (!store.get('intro-seen', false) || store.get('intro-always', false))) setTimeout(open, 400);
})();
