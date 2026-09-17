const player = document.querySelector('[data-player]');
if (player) {
  const video = player.querySelector('[data-video]');
  const button = player.querySelector('[data-play]');
  const saveData = navigator.connection?.saveData === true;
  const smallScreen = window.matchMedia('(max-width: 899px)').matches;
  let started = false;

  const start = () => {
    if (started) return;
    started = true;
    player.classList.add('is-playing');
    video.play().catch(() => {
      player.classList.remove('is-playing');
      started = false;
    });
  };

  button.addEventListener('click', () => {
    if (started) { video.pause(); player.classList.remove('is-playing'); started = false; return; }
    start();
  });
  video.addEventListener('click', () => {
    if (!started) return;
    video.pause();
    player.classList.remove('is-playing');
    started = false;
  });

  // 自動再生はPCのみ。省データ設定・モーション低減時は再生ボタン待ち。
  const mayAutoplay = !smallScreen && !saveData && !window.ASO?.reducedMotion && !window.ASO?.isShot;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (mayAutoplay) start();
        } else if (started) {
          video.pause();
          player.classList.remove('is-playing');
          started = false;
        }
      });
    }, { threshold: 0.45 });
    io.observe(player);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && started) { video.pause(); player.classList.remove('is-playing'); started = false; }
  });
}
