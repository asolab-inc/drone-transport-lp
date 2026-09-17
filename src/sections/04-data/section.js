const root = document.querySelector('.s-data');
if (root) {
  const isShot = window.ASO?.isShot;
  const reducedMotion = window.ASO?.reducedMotion;
  const skipAnim = isShot || reducedMotion;

  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = el.dataset.decimals ? Number(el.dataset.decimals) : 0;
    if (!Number.isFinite(target)) return;
    if (skipAnim) { el.textContent = target.toFixed(decimals); return; }
    const dur = 1100;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const run = (group) => {
    group.querySelectorAll('[data-bar]').forEach((bar) => bar.classList.add('is-in'));
    group.querySelectorAll('[data-count]').forEach(animateCount);
  };

  const groups = root.querySelectorAll('[data-chartgroup]');

  if (skipAnim || !('IntersectionObserver' in window)) {
    groups.forEach(run);
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.3 });
    groups.forEach((g) => io.observe(g));
  }
}
