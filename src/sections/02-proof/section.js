const root = document.querySelector('[data-section="02-proof"]');
if (root) {
  const isShot = window.ASO?.isShot;
  const reducedMotion = window.ASO?.reducedMotion;
  const nums = [...root.querySelectorAll('[data-count]')];

  const finish = (el) => { el.textContent = el.dataset.count; };

  function animate(el) {
    const target = parseInt(el.dataset.count, 10);
    const duration = 1100;
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
      else finish(el);
    }
    requestAnimationFrame(tick);
  }

  if (isShot || reducedMotion || !('IntersectionObserver' in window)) {
    nums.forEach(finish);
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            animate(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    nums.forEach((el) => io.observe(el));
  }
}
