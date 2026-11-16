// Cat cameos 🐈 — drawn caricatures of the crew's cats.
// They peek up from the bottom edge, stroll across, or do their signature move every few minutes.
// Click one for a remark. Toggle in the footer. Type "meow" anywhere to summon one.
(() => {
  const root = document.getElementById('cats');
  if (!root) return;
  const cfg = window.BG_CONFIG || {};
  const names = cfg.CAT_NAMES || [];
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled = get('bg:cats') !== 'off';
  let busy = false, timer = null;

  const INK = '#2A2420';

  /* ---------- the white & tabby one (sleepy, unimpressed) ---------- */
  const G = { fur: '#F6F3EE', tab: '#8E7F6E', stripe: '#5F5347', eye: '#C4D08F', nose: '#F1AEB3', ear: '#E9B7B2' };
  const grumpyFace = (dx = 0, dy = 0) => `
    <g transform="translate(${dx},${dy})">
      <polygon points="30,42 25,6 60,28" fill="${G.tab}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="110,42 115,6 80,28" fill="${G.tab}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="35,35 31,15 51,28" fill="${G.ear}"/><polygon points="105,35 109,15 89,28" fill="${G.ear}"/>
      <ellipse cx="70" cy="62" rx="45" ry="38" fill="${G.fur}" stroke="${INK}" stroke-width="2.5"/>
      <path d="M27,55 C28,30 50,24 70,25 C90,24 112,30 113,55 C104,44 92,41 82,47 C79,38 74,34 70,34 C66,34 61,38 58,47 C48,41 36,44 27,55 Z" fill="${G.tab}"/>
      <path d="M27,58 C30,50 40,48 48,55 C44,66 34,70 28,68 Z" fill="${G.tab}"/>
      <path d="M52,32 q4,6 2,11 M88,32 q-4,6 -2,11 M40,40 q5,3 6,8 M100,40 q-5,3 -6,8" stroke="${G.stripe}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <ellipse cx="52" cy="63" rx="9" ry="6.5" fill="${G.eye}"/><ellipse cx="88" cy="63" rx="9" ry="6.5" fill="${G.eye}"/>
      <ellipse cx="52" cy="64.5" rx="2.3" ry="4" fill="${INK}"/><ellipse cx="88" cy="64.5" rx="2.3" ry="4" fill="${INK}"/>
      <path d="M41,56 h22 v6 q-11,-3 -22,0 Z" fill="${G.tab}"/><path d="M77,56 h22 v6 q-11,-3 -22,0 Z" fill="${G.fur}"/>
      <path d="M42,62 q10,-3 21,0 M77,62 q11,-3 21,0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <path d="M66,73 h8 l-4,5 Z" fill="${G.nose}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M70,78 v3 M70,81 q-4,3 -8,1 M70,81 q4,3 8,1" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M44,76 l-26,-3 M44,80 l-25,3 M96,76 l26,-3 M96,80 l25,3" stroke="#BDB3A8" stroke-width="1.4" stroke-linecap="round"/>
    </g>`;

  /* ---------- the fluffy tuxedo (big eyes, chaos) ---------- */
  const T = { fur: '#1E1A1C', hi: '#3A302C', white: '#F8F5F0', eye: '#C9D44E', nose: '#F3A3AE', ear: '#C98A92' };
  const tuxFace = (dx = 0, dy = 0) => `
    <g transform="translate(${dx},${dy})">
      <polygon points="28,44 22,4 60,26" fill="${T.fur}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="112,44 118,4 80,26" fill="${T.fur}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="33,36 29,14 50,28" fill="${T.ear}"/><polygon points="107,36 111,14 90,28" fill="${T.ear}"/>
      <path d="M26,22 l4,8 M114,22 l-4,8" stroke="${T.white}" stroke-width="1.5"/>
      <path d="M24,60 L10,64 L24,70 L12,80 L28,80 L22,92 L40,88 C50,100 90,100 100,88 L118,92 L112,80 L128,80 L116,70 L130,64 L116,60 C116,36 96,24 70,24 C44,24 24,36 24,60 Z" fill="${T.fur}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M70,40 C66,50 60,62 52,78 C58,94 82,94 88,78 C80,62 74,50 70,40 Z" fill="${T.white}"/>
      <path d="M48,90 l6,8 l6,-6 l6,8 l4,-6 l4,6 l6,-8 l6,6 l6,-8 C82,98 58,98 48,90 Z" fill="${T.white}"/>
      <circle cx="50" cy="60" r="10" fill="${T.eye}" stroke="${INK}" stroke-width="1.5"/><circle cx="90" cy="60" r="10" fill="${T.eye}" stroke="${INK}" stroke-width="1.5"/>
      <ellipse cx="50" cy="61" rx="4" ry="6.5" fill="${INK}"/><ellipse cx="90" cy="61" rx="4" ry="6.5" fill="${INK}"/>
      <circle cx="47" cy="56" r="2.4" fill="#fff"/><circle cx="87" cy="56" r="2.4" fill="#fff"/>
      <path d="M66,74 h8 l-4,5 Z" fill="${T.nose}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M70,79 v2 M70,81 q-4,3 -7,1 M70,81 q4,3 7,1" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M50,77 l-30,-4 M50,81 l-29,4 M90,77 l30,-4 M90,81 l29,4" stroke="#F2EEE8" stroke-width="1.3" stroke-linecap="round"/>
    </g>`;

  /* ---------- Lukas's black cat (a void with opinions) ---------- */
  const V = { fur: '#17141A', hi: '#2C2630', eye: '#F2C230', nose: '#3A2F3C', ear: '#5B3E52' };
  const voidFace = (dx = 0, dy = 0) => `
    <g transform="translate(${dx},${dy})">
      <polygon points="28,44 20,4 60,26" fill="${V.fur}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="112,44 120,4 80,26" fill="${V.fur}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="33,36 28,15 50,28" fill="${V.ear}"/><polygon points="107,36 112,15 90,28" fill="${V.ear}"/>
      <ellipse cx="70" cy="62" rx="46" ry="38" fill="${V.fur}" stroke="${INK}" stroke-width="2.2"/>
      <path d="M44,40 q26,-12 52,0" stroke="${V.hi}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="50" cy="60" rx="12" ry="11" fill="${V.eye}"/><ellipse cx="90" cy="60" rx="12" ry="11" fill="${V.eye}"/>
      <ellipse cx="50" cy="61" rx="3" ry="8" fill="${INK}"/><ellipse cx="90" cy="61" rx="3" ry="8" fill="${INK}"/>
      <circle cx="46" cy="55" r="2.6" fill="#fff"/><circle cx="86" cy="55" r="2.6" fill="#fff"/>
      <path d="M38,47 l18,5 M102,47 l-18,5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
      <path d="M66,75 h8 l-4,4 Z" fill="${V.nose}"/>
      <path d="M70,79 v2 M70,81 q-4,3 -7,1 M70,81 q4,3 7,1" stroke="#6E6372" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M64,83 l2,4 l2,-4" fill="#fff"/>
      <path d="M48,76 l-30,-4 M48,80 l-29,4 M92,76 l30,-4 M92,80 l29,4" stroke="#8B8090" stroke-width="1.3" stroke-linecap="round"/>
    </g>`;

  const peekSVG = id => `<svg viewBox="0 0 140 118" xmlns="http://www.w3.org/2000/svg">
      ${id === 'grumpy' ? grumpyFace() : id === 'void' ? voidFace() : tuxFace()}
      <ellipse cx="46" cy="106" rx="14" ry="9" fill="${id === 'grumpy' ? G.fur : id === 'void' ? V.fur : T.white}" stroke="${INK}" stroke-width="2.2"/>
      <ellipse cx="94" cy="106" rx="14" ry="9" fill="${id === 'grumpy' ? G.fur : id === 'void' ? V.fur : T.white}" stroke="${INK}" stroke-width="2.2"/>
      <path d="M40,104 v5 M46,103 v6 M52,104 v5 M88,104 v5 M94,103 v6 M100,104 v5" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
    </svg>`;

  // Side view, facing right. Legs/tail are animated with CSS.
  const walkSVG = id => {
    const g = id === 'grumpy', v = id === 'void';
    const body = g ? G.fur : v ? V.fur : T.fur, leg = body, paw = g ? G.fur : v ? V.fur : T.white, tail = g ? G.tab : v ? V.fur : T.fur;
    const legs = [[50, 'b'], [62, 'a'], [104, 'a'], [116, 'b']].map(([x, c]) =>
      `<g class="leg leg-${c}"><rect x="${x}" y="60" width="10" height="32" rx="5" fill="${leg}" stroke="${INK}" stroke-width="2"/><ellipse cx="${x + 5}" cy="91" rx="7" ry="4" fill="${paw}" stroke="${INK}" stroke-width="1.8"/></g>`).join('');
    return `<svg viewBox="0 0 172 104" xmlns="http://www.w3.org/2000/svg">
      <path class="tail" d="M42,56 C22,50 16,26 30,14" stroke="${INK}" stroke-width="${g ? 10 : 15}" fill="none" stroke-linecap="round"/>
      <path class="tail" d="M42,56 C22,50 16,26 30,14" stroke="${tail}" stroke-width="${g ? 6.5 : 11}" fill="none" stroke-linecap="round" ${g ? `stroke-dasharray="6 5"` : ''}/>
      ${g ? `<path class="tail" d="M42,56 C22,50 16,26 30,14" stroke="${G.stripe}" stroke-width="6.5" fill="none" stroke-linecap="round" stroke-dasharray="3 8" stroke-dashoffset="-6"/>` : ''}
      ${legs}
      <ellipse cx="83" cy="56" rx="47" ry="21" fill="${body}" stroke="${INK}" stroke-width="2.4"/>
      ${g ? `<ellipse cx="72" cy="44" rx="24" ry="10" fill="${G.tab}"/><path d="M60,38 q3,5 1,10 M72,36 q3,5 1,11 M84,38 q3,5 1,10" stroke="${G.stripe}" stroke-width="2.2" fill="none"/>`
          : v ? `<path d="M60,40 q22,-8 44,0" stroke="${V.hi}" stroke-width="5" fill="none" stroke-linecap="round"/>`
          : `<ellipse cx="112" cy="62" rx="14" ry="13" fill="${T.white}"/><path d="M56,72 q26,8 48,0" stroke="${T.white}" stroke-width="6" fill="none" stroke-linecap="round"/>
             <path d="M38,50 l-6,-4 l7,-1 M40,62 l-7,2 l6,3" stroke="${T.fur}" stroke-width="3" fill="none"/>`}
      <g class="head">
        <polygon points="116,30 116,10 130,22" fill="${g ? G.tab : v ? V.fur : T.fur}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
        <polygon points="134,22 146,8 148,30" fill="${g ? G.tab : v ? V.fur : T.fur}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="132" cy="40" r="19" fill="${g ? G.fur : v ? V.fur : T.fur}" stroke="${INK}" stroke-width="2.4"/>
        ${g ? `<path d="M114,36 C116,24 128,20 140,22 C147,25 151,31 151,37 C144,32 136,32 130,36 C126,32 120,32 114,36 Z" fill="${G.tab}"/>
               <ellipse cx="140" cy="40" rx="5" ry="3.6" fill="${G.eye}"/><path d="M134,38 h12 v2 q-6,-1.5 -12,0 Z" fill="${G.fur}"/><path d="M134,40 q6,-1.5 12,0" stroke="${INK}" stroke-width="2" fill="none"/>`
            : v ? `<circle cx="141" cy="38" r="6" fill="${V.eye}"/><ellipse cx="142" cy="38.5" rx="1.6" ry="4.2" fill="${INK}"/><circle cx="139.5" cy="36" r="1.3" fill="#fff"/>`
            : `<path d="M140,30 C138,38 136,44 134,52 C140,58 150,56 151,46 C148,40 144,34 140,30 Z" fill="${T.white}"/>
               <circle cx="141" cy="38" r="5.5" fill="${T.eye}" stroke="${INK}" stroke-width="1.2"/><ellipse cx="142" cy="38.5" rx="2" ry="3.5" fill="${INK}"/><circle cx="140" cy="36" r="1.3" fill="#fff"/>`}
        <path d="M148,46 l4,0 l-2,3 Z" fill="${g ? G.nose : v ? V.nose : T.nose}"/>
        <path d="M146,49 l20,-2 M146,51 l19,3" stroke="${g ? '#BDB3A8' : v ? '#8B8090' : '#F2EEE8'}" stroke-width="1.2" stroke-linecap="round"/>
      </g>
    </svg>`;
  };

  // Signature move 1: the white & tabby one sitting, wearing the cable necklace
  const sitSVG = () => `<svg viewBox="0 0 140 176" xmlns="http://www.w3.org/2000/svg">
      <path class="tail" d="M104,160 C130,158 132,128 118,118" stroke="${INK}" stroke-width="11" fill="none" stroke-linecap="round"/>
      <path class="tail" d="M104,160 C130,158 132,128 118,118" stroke="${G.tab}" stroke-width="7.5" fill="none" stroke-linecap="round"/>
      <path d="M30,165 C24,120 40,92 70,92 C100,92 116,120 110,165 Z" fill="${G.fur}" stroke="${INK}" stroke-width="2.5"/>
      <path d="M92,104 C106,112 112,134 110,160 C102,150 96,128 92,104 Z" fill="${G.tab}"/>
      <rect x="50" y="118" width="14" height="46" rx="7" fill="${G.fur}" stroke="${INK}" stroke-width="2.2"/>
      <rect x="76" y="118" width="14" height="46" rx="7" fill="${G.fur}" stroke="${INK}" stroke-width="2.2"/>
      <ellipse cx="57" cy="165" rx="10" ry="6" fill="${G.fur}" stroke="${INK}" stroke-width="2"/>
      <ellipse cx="83" cy="165" rx="10" ry="6" fill="${G.fur}" stroke="${INK}" stroke-width="2"/>
      ${grumpyFace(0, 2)}
      <g fill="none" stroke="#141414" stroke-width="3.2">
        <ellipse cx="70" cy="99" rx="34" ry="8" transform="rotate(-4 70 99)"/>
        <ellipse cx="70" cy="103" rx="32" ry="7.5" transform="rotate(3 70 103)"/>
        <ellipse cx="70" cy="107" rx="30" ry="7" transform="rotate(-2 70 107)"/>
      </g>
      <path d="M100,104 q8,6 4,14" stroke="#141414" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`;

  // Signature move 2: the tuxedo flopped on its back, paws up
  const flopSVG = () => `<svg viewBox="0 0 190 112" xmlns="http://www.w3.org/2000/svg">
      <path class="tail" d="M36,74 C14,82 8,66 16,52" stroke="${INK}" stroke-width="17" fill="none" stroke-linecap="round"/>
      <path class="tail" d="M36,74 C14,82 8,66 16,52" stroke="${T.fur}" stroke-width="13" fill="none" stroke-linecap="round"/>
      <g class="paws-up">
        <path d="M62,58 l-6,-30 M80,54 l-2,-32 M106,54 l4,-32 M124,58 l8,-28" stroke="${T.fur}" stroke-width="11" stroke-linecap="round"/>
        <ellipse cx="55" cy="26" rx="7" ry="6" fill="${T.white}" stroke="${INK}" stroke-width="1.8"/>
        <ellipse cx="78" cy="21" rx="7" ry="6" fill="${T.white}" stroke="${INK}" stroke-width="1.8"/>
        <ellipse cx="110" cy="21" rx="7" ry="6" fill="${T.white}" stroke="${INK}" stroke-width="1.8"/>
        <ellipse cx="133" cy="29" rx="7" ry="6" fill="${T.white}" stroke="${INK}" stroke-width="1.8"/>
      </g>
      <path d="M30,74 L24,66 L34,64 L30,54 L42,56 C60,44 120,42 140,54 L150,50 L150,62 L160,64 L152,72 L158,82 L146,84 C120,100 60,100 42,90 L30,94 L34,84 L24,82 Z" fill="${T.fur}" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
      <ellipse cx="92" cy="66" rx="36" ry="14" fill="${T.white}"/>
      <path d="M62,64 l6,-5 l5,6 l6,-6 l5,6 l6,-6 l5,6 l6,-6 l5,6 l6,-5" stroke="${T.white}" stroke-width="4" fill="none"/>
      <g transform="translate(158,66) rotate(78)">
        <polygon points="-18,6 -30,-16 -6,-8" fill="${T.fur}" stroke="${INK}" stroke-width="2"/>
        <polygon points="18,6 30,-16 6,-8" fill="${T.fur}" stroke="${INK}" stroke-width="2"/>
        <circle r="22" fill="${T.fur}" stroke="${INK}" stroke-width="2.2"/>
        <path d="M0,-8 C-4,0 -8,8 -10,14 C-4,22 4,22 10,14 C8,8 4,0 0,-8 Z" fill="${T.white}"/>
        <circle cx="-9" cy="-2" r="6" fill="${T.eye}" stroke="${INK}" stroke-width="1.2"/><circle cx="9" cy="-2" r="6" fill="${T.eye}" stroke="${INK}" stroke-width="1.2"/>
        <ellipse cx="-9" cy="-1" rx="2.6" ry="4" fill="${INK}"/><ellipse cx="9" cy="-1" rx="2.6" ry="4" fill="${INK}"/>
        <circle cx="-11" cy="-4" r="1.4" fill="#fff"/><circle cx="7" cy="-4" r="1.4" fill="#fff"/>
        <path d="M-3,9 h6 l-3,4 Z" fill="${T.nose}"/>
      </g>
    </svg>`;

  const CATS = [
    { id: 'grumpy', name: names[0] || '', special: 'sit',
      lines: ['…what.', 'no.', "I've been judging you for 20 minutes", 'pick a game already', 'this cable is fashion', '*slow disappointed blink*', 'mrrp (derogatory)', 'you call that a pitch?'] },
    { id: 'tux', name: names[1] || '', special: 'flop',
      lines: ['mrrp!', 'belly rub? (it’s a trap)', 'FEED ME', 'I vote Stardew', 'pspspsps yourself', '*knocks controller off desk*', 'play with ME instead', 'is it dinner yet'] },
    { id: 'void', name: names[2] || '', special: 'peek',
      lines: ['lukas shut up about csgo', 'still downloading? lol', 'your internet is slower than me getting off the bed', '40 GB? see you next week',
        '*sits on keyboard* gg', 'skill issue', 'I am not a cat. I am a void with opinions', 'you queued for THAT?', 'imagine not owning the game',
        '*stares into your soul*', 'ping: 999', 'I could carry you in csgo and I have no thumbs'] },
  ];
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function remove(el, delay = 0) {
    setTimeout(() => { el.remove(); busy = false; }, delay);
  }

  function say(el, cat) {
    if (el.dataset.said) return;
    el.dataset.said = '1';
    const b = document.createElement('div');
    b.className = 'cat-bubble';
    b.textContent = (cat.name ? cat.name + ': ' : '') + pick(cat.lines);
    el.appendChild(b);
  }

  function spawn(force) {
    if (!enabled || busy || (document.hidden && !force)) return;
    busy = true;
    const cat = pick(CATS);
    const mode = reduced ? 'peek' : pick(['peek', 'walk', 'special', 'peek', 'walk']);
    const el = document.createElement('div');
    const leftSide = Math.random() < 0.5;

    if (mode === 'walk') {
      el.className = `cat walk ${leftSide ? 'to-right' : 'to-left'}`;
      el.innerHTML = `<div class="flip">${walkSVG(cat.id)}</div>`;
      el.addEventListener('animationend', e => { if (e.target === el) remove(el); });
      // Stop and talk (so you can read it), then carry on walking
      el.addEventListener('click', () => {
        if (el.dataset.said) return;
        say(el, cat); el.classList.add('paused');
        setTimeout(() => { el.classList.remove('paused'); const b = el.querySelector('.cat-bubble'); if (b) setTimeout(() => b.classList.add('fade'), 2500); }, 4500);
      });
      root.appendChild(el);
      return;
    }

    const special = mode === 'special';
    el.className = `cat ${special ? cat.special : 'peek'}`;
    el.innerHTML = special && cat.special !== 'peek' ? (cat.special === 'sit' ? sitSVG() : flopSVG()) : peekSVG(cat.id);
    el.style[leftSide ? 'left' : 'right'] = `${4 + Math.random() * 14}vw`;
    root.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    const stay = special ? 11000 : 7000;
    let leaving = false;
    const leave = (d = 0) => { if (leaving) return; leaving = true; setTimeout(() => { el.classList.remove('in'); remove(el, 800); }, d); };
    el.addEventListener('click', () => { say(el, cat); leave(2400); });
    setTimeout(() => leave(), stay);
  }

  function schedule(first) {
    clearTimeout(timer);
    const wait = first ? 20000 + Math.random() * 25000 : 150000 + Math.random() * 180000;
    timer = setTimeout(() => { spawn(); schedule(false); }, wait);
  }

  function renderToggle() {
    const t = document.getElementById('catToggle');
    if (t) t.textContent = `🐈 cats: ${enabled ? 'on' : 'off'}`;
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#catToggle')) {
      enabled = !enabled; set('bg:cats', enabled ? 'on' : 'off'); renderToggle();
      if (enabled) { setTimeout(() => spawn(true), 600); schedule(false); }
      else { clearTimeout(timer); root.innerHTML = ''; busy = false; }
    }
  });

  // Easter egg: type "meow" to summon a cat
  let typed = '';
  document.addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === 'meow' && enabled) { busy = false; root.innerHTML = ''; spawn(true); }
  });

  window.BG_CATS = { spawn: () => { busy = false; spawn(true); }, svgs: { peekSVG, walkSVG, sitSVG, flopSVG } };
  renderToggle();
  if (enabled) schedule(true);
})();
