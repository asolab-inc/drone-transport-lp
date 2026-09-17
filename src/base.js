const root = document.documentElement;
const isShot = root.classList.contains('is-shot');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
window.ASO = { isShot, reducedMotion };

const header = document.querySelector('[data-header]');
const mcta = document.querySelector('[data-mcta]');
const contact = document.getElementById('contact');
const themed = () => [...document.querySelectorAll('[data-theme]')];

let ticking = false;
function update() {
  ticking = false;
  const y = window.scrollY;
  if (header) {
    header.classList.toggle('is-scrolled', y > 8);
    const probeY = header.offsetHeight + 1;
    const under = themed().find((el) => { const r = el.getBoundingClientRect(); return r.top <= probeY && r.bottom > probeY; });
    header.classList.toggle('is-dark', under?.dataset.theme === 'dark');
  }
  if (mcta) {
    const first = document.querySelector('[data-section]');
    const past = first ? y > first.offsetHeight * 0.7 : y > 600;
    const r = contact?.getBoundingClientRect();
    const atContact = r ? r.top < window.innerHeight * 0.85 : false;
    mcta.classList.toggle('is-visible', past && !atContact);
  }
}
const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
update();

const toggle = document.querySelector('[data-menu-toggle]');
const drawer = document.querySelector('[data-drawer]');
function setMenu(open) {
  if (!toggle || !drawer) return;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.querySelector('.sr-only').textContent = open ? 'メニューを閉じる' : 'メニューを開く';
  drawer.hidden = !open;
  root.classList.toggle('menu-open', open);
}
toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
drawer?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

const revealEls = document.querySelectorAll('[data-reveal]');
if (isShot || reducedMotion || !('IntersectionObserver' in window)) {
  revealEls.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  revealEls.forEach((el) => io.observe(el));
}
