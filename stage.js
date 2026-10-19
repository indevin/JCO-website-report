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

window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const direction = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
  if (!direction) return;
  e.preventDefault();
  go(direction);
});

// ---------- Wheel ----------
let lastWheel = 0;

window.addEventListener('wheel', (e) => {
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
