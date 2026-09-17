const root = document.querySelector('.s-diagnosis');
if (root) {
  const isShot = window.ASO?.isShot;
  const reducedMotion = window.ASO?.reducedMotion;

  const names = ['d1', 'd2', 'd3', 'd4'];
  const bar = root.querySelector('.s-diagnosis__progress-bar');
  const fill = root.querySelector('[data-progress-fill]');
  const count = root.querySelector('[data-progress-count]');
  const button = root.querySelector('[data-diag-button]');
  const resultEl = root.querySelector('[data-result]');
  const titleEl = root.querySelector('[data-result-title]');
  const bodyEl = root.querySelector('[data-result-body]');
  const ctaWrap = root.querySelector('[data-result-cta]');
  const ctaLink = root.querySelector('[data-diag-cta]');

  let message = '';

  function getSelected() {
    return names.map((n) => root.querySelector(`input[name="${n}"]:checked`));
  }

  function updateProgress(selected) {
    const n = selected.filter(Boolean).length;
    count.textContent = String(n);
    fill.style.width = `${(n / names.length) * 100}%`;
    bar.setAttribute('aria-valuenow', String(n));
    return n;
  }

  function judge(selected) {
    const score = selected.reduce((total, input) => total + Number(input.value), 0);
    const unknown = selected.filter((input) => input.dataset.unknown === '1').length;
    if (unknown >= 3) {
      return {
        tone: 'neutral',
        title: '条件が分かれば、もう少し絞れます。',
        body: '場所と荷物のおおよその条件が分かれば、ドローン輸送が候補になるか確認できます。',
      };
    }
    if (score >= 5) {
      return {
        tone: 'positive',
        title: 'ドローン輸送を検討しやすい条件です。',
        body: '進入条件や荷物の分割可否から、ドローンと相性のよい可能性があります。重量・距離・飛行経路を確認して最終判断します。',
      };
    }
    if (score >= 2) {
      return {
        tone: 'neutral',
        title: 'ドローン輸送の候補に入ります。',
        body: '現場条件によって判断が分かれます。荷物の重量・総量・距離・高低差を確認すると、より具体的に判断できます。',
      };
    }
    return {
      tone: 'other',
      title: 'ヘリ・車両など他の方法も含めて比較がおすすめです。',
      body: '大量・大重量の一括輸送などは、ドローン以外の方法が合う場合があります。条件を確認して輸送方法を選びます。',
    };
  }

  function buildMessage(selected, title) {
    const lines = selected.map((input) => {
      const qtext = input.closest('fieldset')?.dataset.qtext ?? '';
      return `・${qtext}：${input.dataset.label}`;
    });
    return `【簡易診断の結果】\n${lines.join('\n')}\n判定：${title}`;
  }

  function reveal() {
    resultEl.hidden = false;
    if (isShot || reducedMotion) {
      resultEl.classList.add('is-in');
      return;
    }
    resultEl.classList.remove('is-in');
    requestAnimationFrame(() => requestAnimationFrame(() => resultEl.classList.add('is-in')));
  }

  function showGuide() {
    resultEl.className = 's-diagnosis__result s-diagnosis__result--neutral';
    titleEl.textContent = '4項目すべて選んでください。';
    bodyEl.textContent = '分からない項目は「まだ未定」「わからない」を選べます。';
    ctaWrap.hidden = true;
    if (button) button.hidden = false;
    message = '';
    reveal();
  }

  function showJudgement(selected) {
    const { tone, title, body } = judge(selected);
    resultEl.className = `s-diagnosis__result s-diagnosis__result--${tone}`;
    titleEl.textContent = title;
    bodyEl.textContent = body;
    ctaWrap.hidden = false;
    if (button) button.hidden = true;
    message = buildMessage(selected, title);
    reveal();
  }

  function hideResult() {
    if (button) button.hidden = false;
    resultEl.hidden = true;
    resultEl.classList.remove('is-in');
    message = '';
  }

  names.forEach((n) => {
    root.querySelectorAll(`input[name="${n}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        const selected = getSelected();
        updateProgress(selected);
        if (selected.every(Boolean)) {
          showJudgement(selected);
        } else if (!resultEl.hidden) {
          hideResult();
        }
      });
    });
  });

  button?.addEventListener('click', () => {
    const selected = getSelected();
    updateProgress(selected);
    if (selected.every(Boolean)) {
      showJudgement(selected);
    } else {
      showGuide();
    }
  });

  ctaLink?.addEventListener('click', () => {
    if (!message) return;
    window.dispatchEvent(new CustomEvent('aso:prefill', { detail: { message } }));
  });

  if (isShot) {
    const picks = { d1: '入れない', d2: '分けられる', d3: '大きい', d4: '小〜中量' };
    names.forEach((n) => {
      const input = root.querySelector(`input[name="${n}"][data-label="${picks[n]}"]`);
      if (input) input.checked = true;
    });
    const selected = getSelected();
    updateProgress(selected);
    showJudgement(selected);
  }
}
