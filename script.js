(() => {
  'use strict';
  const qs = (s) => document.querySelector(s);
  const toggle = qs('.nav-toggle');
  const nav = qs('.site-nav');
  if (toggle && nav) {
    const closeNav = () => { nav.classList.remove('open'); toggle.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','Открыть меню'); document.body.classList.remove('menu-open'); };
    toggle.addEventListener('click', () => {
      const open = !nav.classList.contains('open');
      nav.classList.toggle('open',open); toggle.classList.toggle('open',open);
      toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
      document.body.classList.toggle('menu-open',open);
    });
    nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeNav));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeNav();});
  }
  const header=qs('#header');
  const syncHeader=()=>header?.classList.toggle('scrolled',scrollY>20);
  addEventListener('scroll',syncHeader,{passive:true});syncHeader();
  if (window.IntersectionObserver && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const obs=new IntersectionObserver((entries)=>entries.forEach(entry=>{
      if(entry.isIntersecting){entry.target.classList.add('is-visible');obs.unobserve(entry.target);}
    }),{threshold:0.08,rootMargin:'0px 0px -30px 0px'});
    document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
  } else document.querySelectorAll('.reveal').forEach(el=>el.classList.add('is-visible'));
  const yr=qs('#year');if(yr)yr.textContent=new Date().getFullYear();
  const cfg=window.ALLIAM_CONFIG||{};
  const linkBox=qs('#contact-links');
  if(linkBox){
    const links=[];
    const telegram=String(cfg.telegram||'').replace(/^@/,'').trim();
    if(/^[a-zA-Z0-9_]{5,32}$/.test(telegram)) links.push(['Telegram',`https://t.me/${telegram}`]);
    const email=String(cfg.email||'').trim();
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) links.push(['E-mail',`mailto:${email}`]);
    const phone=String(cfg.phone||'').trim();
    if(/^\+?[\d\s()\-]{7,25}$/.test(phone)) links.push(['Телефон',`tel:${phone.replace(/[^+\d]/g,'')}`]);
    if(links.length){linkBox.hidden=false;links.forEach(([title,href])=>{
      const a=document.createElement('a'); a.href=href; a.textContent=title+' ↗';
      if(href.startsWith('https:')){a.target='_blank';a.rel='noopener noreferrer';}
      linkBox.appendChild(a);
    });}
  }
  const form = qs('#contact-form');
  const status = qs('#form-status');
  const submit = qs('#submit-button');
  const note = qs('#delivery-note');
  const manualTelegram = qs('#manual-telegram');
  const retryConnection = qs('#check-connection');
  let deliveryReady = false;
  let captchaToken = '';
  let turnstileWidgetId = null;
  let sending = false;
  function setStatus(message, type = '') {
    if (!status) return;
    status.textContent = message;
    status.className = 'form-status' + (type ? ' ' + type : '');
  }
  function getMessage() {
    if (!form) return '';
    const data = new FormData(form);
    return `Новая заявка с сайта ALLIAM\n\nИмя: ${data.get('name') || ''}\nКонтакт: ${data.get('contact') || ''}\nТема: ${data.get('topic') || ''}\n\nСитуация:\n${data.get('message') || ''}`;
  }
  async function copyText() {
    const msg = getMessage(); if (!msg) return;
    try {
      if (navigator.clipboard && isSecureContext) await navigator.clipboard.writeText(msg);
      else {
        const el = document.createElement('textarea'); el.value = msg;
        el.style.position = 'fixed'; el.style.left = '-9999px';
        document.body.append(el); el.select();
        if (!document.execCommand('copy')) throw Error('copy');
        el.remove();
      }
      setStatus('Текст заявки скопирован. Его можно отправить специалисту вручную.', 'success');
    } catch {
      setStatus('Не удалось скопировать текст автоматически. Выделите его вручную.', 'error');
    }
  }
  qs('#copy-request')?.addEventListener('click', copyText);

  function validateContact(value) {
    const s = String(value || '').trim();
    return (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 160)
      || /^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s)
      || /^(?:https?:\/\/)?t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/i.test(s)
      || (/^\+?[0-9\s()\-]{7,35}$/.test(s) && s.replace(/\D/g, '').length >= 7 && s.replace(/\D/g, '').length <= 15);
  }

  function resetCaptcha() {
    captchaToken = '';
    if (turnstileWidgetId != null && window.turnstile) {
      try { window.turnstile.reset(turnstileWidgetId); } catch { /* widget unloaded */ }
    }
  }

  function initializeCaptcha() {
    const key = String(cfg.turnstileSiteKey || '').trim();
    if (!key || !form) return;
    const container = qs('#turnstile-container');
    if (!container) return;
    container.hidden = false;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    script.onload = () => {
      if (!window.turnstile) return;
      turnstileWidgetId = window.turnstile.render('#turnstile-widget', {
        sitekey:key, theme:'dark',
        callback:token => { captchaToken = token; },
        'expired-callback':() => { captchaToken = ''; },
        'error-callback':() => { captchaToken = ''; setStatus('Не удалось загрузить проверку безопасности. Обновите страницу или попробуйте позднее.', 'error'); }
      });
    };
    script.onerror = () => setStatus('Проверка безопасности не загрузилась. Отключите блокировщик для этого сайта или попробуйте позднее.', 'error');
    document.head.append(script);
  }
  initializeCaptcha();

  const publicTelegramName = String(cfg.telegram || 'rolexgolda_shop').replace(/^@/, '').trim();
  const manualLink = /^[a-zA-Z0-9_]{5,32}$/.test(publicTelegramName)
    ? `https://t.me/${publicTelegramName}` : '';
  if (manualTelegram) {
    if (manualLink) manualTelegram.href = manualLink;
    else manualTelegram.remove();
  }
  function setDeliveryReady(ready, message) {
    deliveryReady = ready;
    if (submit && !sending) submit.disabled = !ready;
    if (note) {
      note.textContent = message;
      note.classList.toggle('unavailable', !ready);
    }
    if (manualTelegram && manualLink) manualTelegram.hidden = ready;
    if (retryConnection) retryConnection.hidden = ready;
  }
  function explainUnavailable() {
    if (location.protocol === 'file:') return 'Сайт открыт как файл на компьютере (file://). Автоматическая отправка доступна только на опубликованном сайте Vercel. Пока скопируйте заявку и отправьте её в Telegram.';
    if (['localhost', '127.0.0.1'].includes(location.hostname)) return 'Локальный сервер не запустил API. Для проверки откройте проект через vercel dev, а не через обычный просмотр HTML.';
    return 'Сервер /api/contact недоступен на этом адресе. Опубликуйте весь проект на Vercel вместе с папкой api/, затем повторите проверку.';
  }
  async function checkReadiness() {
    if (!form || !note) return false;
    if (location.protocol === 'file:') {
      setDeliveryReady(false, explainUnavailable());
      return false;
    }
    setDeliveryReady(false, 'Проверяем подключение автоматической отправки…');
    if (retryConnection) retryConnection.hidden = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/contact', {
        headers:{'Accept':'application/json'}, cache:'no-store', signal:controller.signal
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) throw Error('not-json');
      const data = await response.json();
      if (!response.ok) throw Error('status-' + response.status);
      if (data.ready !== true) {
        setDeliveryReady(false, 'Сервер найден, но TELEGRAM_BOT_TOKEN не задан в настройках Vercel. Пока используйте ручную отправку в Telegram.');
        return false;
      }
      if (data.captchaRequired && !cfg.turnstileSiteKey) {
        setDeliveryReady(false, 'Сервер требует Cloudflare Turnstile, но публичный ключ не настроен в config.js.');
        return false;
      }
      setDeliveryReady(true, '✓ Сервер заявок подключён. После подтверждения Telegram заявка будет отмечена как доставленная.');
      return true;
    } catch {
      setDeliveryReady(false, explainUnavailable());
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
  retryConnection?.addEventListener('click', checkReadiness);
  checkReadiness();

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    if (!deliveryReady) {
      setStatus('Автоматическая отправка не подключена. Скопируйте текст заявки и отправьте в Telegram, либо проверьте подключение сервера.', 'error');
      return;
    }
    if (!form.reportValidity()) {
      setStatus('Пожалуйста, заполните обязательные поля и подтвердите согласие.', 'error');
      return;
    }
    if (!validateContact(form.elements.contact.value)) {
      setStatus('Укажите действительный контакт: e-mail, номер телефона или @Telegram.', 'error');
      form.elements.contact.focus(); return;
    }
    if (form.elements.website?.value) {
      setStatus('Спасибо!', 'success'); return;
    }
    if (cfg.turnstileSiteKey && !captchaToken) {
      setStatus('Завершите проверку безопасности перед отправкой.', 'error'); return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    if (captchaToken) data.turnstileToken = captchaToken;
    sending = true;
    submit.disabled = true;
    submit.classList.add('loading');
    setStatus('Передаём заявку в Telegram…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch('/api/contact', {
        method:'POST', headers:{'Content-Type':'application/json', 'Accept':'application/json'},
        body:JSON.stringify(data), signal:controller.signal
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) throw Error('Сервер заявок не ответил корректно. Проверьте публикацию папки api/ на Vercel.');
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw Error(result.error || `Ошибка отправки (HTTP ${response.status}).`);
      form.reset();
      setStatus(`Заявка №${result.id || '—'} доставлена в Telegram! Спасибо, с вами свяжутся по указанному контакту.`, 'success');
    } catch (err) {
      const msg = err.name === 'AbortError'
        ? 'Сервер не ответил вовремя; доставка не подтверждена.'
        : err.name === 'TypeError'
          ? explainUnavailable()
          : (err.message || 'Не удалось подтвердить доставку.');
      setStatus(`${msg} Данные остались в форме. Можно повторить попытку или скопировать заявку.`, 'error');
      if (err.name === 'TypeError') setDeliveryReady(false, explainUnavailable());
    } finally {
      clearTimeout(timeout); resetCaptcha();
      sending = false; submit.disabled = false; submit.classList.remove('loading');
    }
  });
})();
