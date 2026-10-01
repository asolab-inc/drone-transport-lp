/* ============================================================
   01-hero — 背景動画（実写の飛行映像）の再生制御
   現場で撮影した飛行映像（video/transport-flight.mp4）から切り出したもの。
   作り直しは node tools/encode-hero.mjs
   ============================================================ */
const stage = document.querySelector('[data-hero-stage]');
const video = stage && stage.querySelector('[data-hero-video]');

if (stage && video) {
  const narrow = window.matchMedia('(max-width: 767px)').matches;
  const saveData = navigator.connection?.saveData === true;
  // 省データ設定・視差を減らす設定・撮影モードでは静止画のままにする
  const may = !saveData && !window.ASO?.reducedMotion && !window.ASO?.isShot;

  if (may) {
    let playing = false;
    const play = () => {
      if (playing) return;
      playing = true;
      video.play().catch(() => { playing = false; });
    };
    const pause = () => {
      if (!playing) return;
      playing = false;
      video.pause();
    };

    video.addEventListener('loadeddata', () => stage.classList.add('is-video'), { once: true });
    video.preload = 'auto';
    video.src = narrow ? 'video/hero-flight-sp.mp4' : 'video/hero-flight.mp4';

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { es[0].isIntersecting ? play() : pause(); }, { rootMargin: '120px' }).observe(stage);
    } else {
      play();
    }
    document.addEventListener('visibilitychange', () => { document.hidden ? pause() : play(); });
  }
}
