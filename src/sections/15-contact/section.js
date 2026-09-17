const form = document.getElementById('contactForm');
if (form) {
  const status = document.getElementById('contactStatus');
  const done = document.getElementById('contactDone');
  const message = document.getElementById('contactMessage');
  const submit = form.querySelector('[data-submit]');

  window.addEventListener('aso:prefill', (e) => {
    const text = e.detail?.message;
    if (!text || !message) return;
    message.value = message.value ? `${text}\n\n${message.value}` : text;
    message.classList.add('is-prefilled');
    setTimeout(() => message.classList.remove('is-prefilled'), 1800);
  });

  const setError = (field, on) => field.setAttribute('aria-invalid', String(on));
  form.querySelectorAll('input, textarea').forEach((f) => {
    f.addEventListener('blur', () => { if (f.required) setError(f, !f.checkValidity()); });
    f.addEventListener('input', () => { if (f.getAttribute('aria-invalid') === 'true') setError(f, !f.checkValidity()); });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = [...form.elements].filter((f) => f.willValidate && !f.checkValidity());
    if (invalid.length) {
      invalid.forEach((f) => setError(f, true));
      status.textContent = '未入力の必須項目があります。ご確認ください。';
      status.classList.add('is-error');
      invalid[0].focus();
      return;
    }
    status.classList.remove('is-error');
    status.textContent = '送信しています…';
    form.classList.add('is-sending');
    submit.disabled = true;
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
      const data = await res.json().catch(() => ({ ok: res.ok }));
      if (!res.ok || !data.ok) throw new Error(data.error || '送信に失敗しました');
      form.hidden = true;
      done.hidden = false;
      done.scrollIntoView({ behavior: window.ASO?.reducedMotion ? 'auto' : 'smooth', block: 'center' });
    } catch (err) {
      status.innerHTML = '送信できませんでした。お手数ですが <a href="tel:0263886968">0263-88-6968</a> または <a href="mailto:mail@asolab.co.jp">mail@asolab.co.jp</a> までご連絡ください。';
      status.classList.add('is-error');
    } finally {
      form.classList.remove('is-sending');
      submit.disabled = false;
    }
  });
}
