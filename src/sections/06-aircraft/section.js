const root = document.querySelector('.s-aircraft');
if (root) {
  const isShot = window.ASO?.isShot;
  const reducedMotion = window.ASO?.reducedMotion;
  const skipAnim = isShot || reducedMotion;

  const format = (val) => Math.round(val).toLocaleString('en-US');

  const animate = (el) => {
    const target = parseFloat(el.dataset.count);
    if (!Number.isFinite(target)) return;
    if (skipAnim) { el.textContent = format(target); return; }
    const dur = 1000;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const grid = root.querySelector('.s-aircraft__spec-grid');
  const nums = grid ? [...grid.querySelectorAll('[data-count]')] : [];

  if (nums.length) {
    if (skipAnim || !('IntersectionObserver' in window)) {
      nums.forEach(animate);
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          nums.forEach(animate);
          io.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.3 });
      io.observe(grid);
    }
  }
}
