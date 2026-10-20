// Shared by every report page: scale the 1080px-tall stage to the viewport,
// and move between [data-step] elements with the ← / → keys.
//
// <body data-paging="sections">  wheel and keys jump a whole step (one step = one screen)
// <body> (default)               wheel scrolls freely; keys line the next step up with the left edge
const DESIGN_HEIGHT = 1080;
const STEP_INSET = 40; // design px between the screen's left edge and a step, in the default mode

const pagedBySection = document.body.dataset.paging === 'sections';

function scale() {
  return window.innerHeight / DESIGN_HEIGHT;
}

function fit() {
  document.documentElement.style.setProperty('--scale', scale());
}
fit();

// ---------- Steps ----------
let pendingTarget = null; // where a smooth scroll is heading, so repeated presses keep going

function stepTargets() {
  const inset = pagedBySection ? 0 : STEP_INSET * scale();
  const max = document.documentElement.scrollWidth - window.innerWidth;
  return [...document.querySelectorAll('[data-step]')]
    .map((el) => Math.min(max, Math.max(0, Math.round(el.getBoundingClientRect().left + window.scrollX - inset))))
    .filter((x, i, all) => all.indexOf(x) === i);
}

function go(direction) {
  const from = pendingTarget ?? window.scrollX;
  const targets = stepTargets();
  const target = direction > 0
    ? targets.find((x) => x > from + 1)
    : targets.findLast((x) => x < from - 1);
  if (target === undefined) return;
  pendingTarget = target;
  // Forget the target once the scroll lands, is interrupted (scrollend), or after 1s as a fallback
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(arrive, 1000);
  window.scrollTo({ left: target, behavior: 'smooth' });
}

let pendingTimer;

function arrive() {
  clearTimeout(pendingTimer);
  pendingTarget = null;
}

window.addEventListener('scrollend', arrive);
window.addEventListener('scroll', () => {
  if (pendingTarget !== null && Math.abs(window.scrollX - pendingTarget) < 2) arrive();
}, { passive: true });

// While a dialog (or the start screen) is open, keys and the wheel belong to it
const dialogOpen = () => document.querySelector('dialog[open], .intro') !== null;

window.addEventListener('keydown', (e) => {
  if (dialogOpen() || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const direction = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (!direction) return;
  e.preventDefault();
  go(direction);
});

// ---------- Wheel ----------
let lastWheel = 0;

window.addEventListener('wheel', (e) => {
  if (dialogOpen()) return;
  const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (!pagedBySection) {
    if (delta === e.deltaY) {
      window.scrollBy({ left: e.deltaY });
      e.preventDefault();
    }
    return;
  }

  // One gesture = one step. A trackpad fires a continuous stream (including momentum),
  // so only the first event after a 200ms pause counts, and only once the last move has landed.
  e.preventDefault();
  const now = performance.now();
  const startsGesture = now - lastWheel > 200;
  lastWheel = now;
  if (startsGesture && pendingTarget === null && delta !== 0) go(Math.sign(delta));
}, { passive: false });

// ---------- Resize ----------
window.addEventListener('resize', () => {
  fit();
  if (pagedBySection) {
    // Screens change width with the viewport: stay on the screen that was showing
    const targets = stepTargets();
    const nearest = targets.reduce((a, b) => (Math.abs(b - window.scrollX) < Math.abs(a - window.scrollX) ? b : a), 0);
    pendingTarget = null;
    window.scrollTo({ left: nearest });
  }
});

// ---------- Start screen ----------
// Shown on the first visit of a tab and on every reload; moving between report pages skips it.
// The page underneath only becomes reachable after pressing Start.
const INTRO_KEY = 'jco-started';
const INTRO_PRESS_MS = 160; // how long the button stays visibly pressed before the screen fades

function shouldShowIntro() {
  if (performance.getEntriesByType('navigation')[0]?.type === 'reload') return true;
  try {
    return !sessionStorage.getItem(INTRO_KEY);
  } catch {
    return true;
  }
}

if (shouldShowIntro()) {
  const intro = document.createElement('div');
  intro.className = 'intro';
  intro.innerHTML = `
    <div class="intro__scene">
      <div class="ground" aria-hidden="true"></div>
      <img class="intro__joy" src="team/joy.gif" alt="">
      <span class="nametag intro__joy-tag">Joy</span>
      <div class="team intro__team" aria-hidden="true">
        <img class="team__sprite team__sprite--bamboo" src="team/bamboo.gif" alt="">
        <img class="team__sprite team__sprite--dao" src="team/dao.gif" alt="">
        <img class="team__sprite team__sprite--devin" src="team/devin.gif" alt="">
        <img class="team__sprite team__sprite--dong" src="team/dong.gif" alt="">
        <img class="team__sprite team__sprite--milk" src="team/milk.gif" alt="">
        <span class="nametag nametag--dao">小刀</span>
        <span class="nametag nametag--bamboo">竹碳</span>
        <span class="nametag nametag--devin">Devin</span>
        <span class="nametag nametag--dong">東輝</span>
        <span class="nametag nametag--milk">Milk</span>
      </div>
      <button class="intro__start" type="button">Start</button>
    </div>`;
  document.body.appendChild(intro);
  document.documentElement.classList.add('has-intro');

  const start = intro.querySelector('.intro__start');
  start.addEventListener('click', () => {
    try {
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch {}
    start.disabled = true;
    start.classList.add('is-pressed');
    setTimeout(() => {
      intro.classList.add('is-leaving');
      document.documentElement.classList.remove('has-intro');
      document.dispatchEvent(new Event('introend')); // pages can start their entrances now
    }, INTRO_PRESS_MS);
    intro.addEventListener('transitionend', (e) => {
      if (e.target === intro) intro.remove();
    });
  });
}

// ---------- Cursor ----------
// MapleStory cursors: styles.css sets the static ones; over something clickable the
// animated "click" cursor plays here, since browsers can't animate a native cursor.
const CLICKABLE = 'a, button, .is-openable';
const CURSOR_FRAME_MS = 500; // the .ani's 30 jiffies per frame
const cursorFrames = [
  { src: 'assets/cursors/point-click-0.png', x: 3, y: 6 }, // x / y: hotspot
  { src: 'assets/cursors/point-click-1.png', x: 4, y: 4 },
];

if (matchMedia('(pointer: fine)').matches) {
  cursorFrames.forEach((f) => { new Image().src = f.src; });
  const cursorEl = new Image();
  cursorEl.className = 'maple-cursor';
  cursorEl.alt = '';
  document.body.appendChild(cursorEl);

  let pointer = null; // last pointer position in the viewport
  let frame = 0;
  let timer = null;

  function drawCursor() {
    const f = cursorFrames[frame];
    cursorEl.src = f.src;
    cursorEl.style.translate = `${pointer.x - f.x}px ${pointer.y - f.y}px`;
  }

  // The overlay can't sit above an open dialog (top layer), so dialogs keep the static cursor
  function refreshCursor() {
    const under = pointer && document.elementFromPoint(pointer.x, pointer.y);
    const active = !!under?.closest(CLICKABLE) && !under.closest('dialog');
    document.documentElement.classList.toggle('is-cursor-clicking', active);
    if (!active) {
      clearInterval(timer);
      timer = null;
      return;
    }
    if (!timer) {
      frame = 0;
      timer = setInterval(() => {
        frame = (frame + 1) % cursorFrames.length;
        drawCursor();
      }, CURSOR_FRAME_MS);
    }
    drawCursor();
  }

  document.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    refreshCursor();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer = null;
    refreshCursor();
  });
  // Content slides under a still pointer when scrolling, opening or closing a dialog
  window.addEventListener('scroll', refreshCursor, { passive: true });
  document.addEventListener('click', () => requestAnimationFrame(refreshCursor));
  document.addEventListener('close', () => requestAnimationFrame(refreshCursor), true);
}
