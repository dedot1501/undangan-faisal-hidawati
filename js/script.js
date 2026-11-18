/* =====================================================
   KONFIGURASI
===================================================== */
const CONFIG = {
  // 🔴 TANGGAL SUDAH DISINKRONKAN: 20 November 2026, 12:00 WIB
  eventDate:     new Date('2026-11-20T12:00:00+07:00'), 
  apiUrl:        'https://script.google.com/macros/s/AKfycbwUK04WEX-OxUmXKX_Hamj_j9yxWZ7fOHVqsIAYnrTHv3xXJW9kvoZl9DbHsctakUwt/exec',
  defaultGuest:  'Tamu Undangan',
  localCacheKey: 'wishes_local_v1',
};

/* =====================================================
   UTIL
===================================================== */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

/* =====================================================
   GUEST NAME DARI URL  (?to=Nama%20Tamu)
===================================================== */
(function setGuestName() {
  const params = new URLSearchParams(window.location.search);
  const to = params.get('to');
  if (to) {
    const name = decodeURIComponent(to.replace(/\+/g, ' '));
    $('#guestName').textContent = name;
  }
})();

/* =====================================================
   BUKA UNDANGAN
===================================================== */
const cover    = $('#cover');
const app      = $('#app');
const openBtn  = $('#openBtn');
const musicBtn = $('#musicBtn');
const bgMusic  = $('#bgMusic');

openBtn.addEventListener('click', () => {
  cover.classList.add('is-hidden');
  app.classList.add('is-visible');
  app.setAttribute('aria-hidden', 'false');
  document.body.classList.remove('is-locked');
  musicBtn.classList.add('is-active');
  playMusic();
  window.scrollTo({ top: 0 });
  requestAnimationFrame(() => observeReveals());
});

/* =====================================================
   MUSIC
===================================================== */
function playMusic() {
  bgMusic.volume = 0.45;
  bgMusic.play()
    .then(() => musicBtn.classList.add('is-playing'))
    .catch(() => musicBtn.classList.remove('is-playing'));
}

function toggleMusic() {
  if (bgMusic.paused) {
    playMusic();
    musicBtn.setAttribute('aria-label', 'Jeda musik');
  } else {
    bgMusic.pause();
    musicBtn.classList.remove('is-playing');
    musicBtn.setAttribute('aria-label', 'Putar musik');
  }
}
musicBtn.addEventListener('click', toggleMusic);

/* =====================================================
   COUNTDOWN
===================================================== */
const cd = {
  days:  $('#cd-days'),
  hours: $('#cd-hours'),
  mins:  $('#cd-mins'),
  secs:  $('#cd-secs'),
};

function updateCountdown() {
  const diff = CONFIG.eventDate - new Date();
  if (diff <= 0) {
    Object.values(cd).forEach((el) => (el.textContent = '00'));
    const box = $('#countdown');
    if (box && !box.dataset.done) {
      box.dataset.done = '1';
      box.insertAdjacentHTML(
        'afterend',
        '<p class="section__sub" style="margin-top:1.2rem">Alhamdulillah, acara telah berlangsung. Terima kasih atas doanya 🤍</p>'
      );
    }
    return;
  }
  const s = Math.floor(diff / 1000);
  cd.days.textContent  = pad(Math.floor(s / 86400));
  cd.hours.textContent = pad(Math.floor((s % 86400) / 3600));
  cd.mins.textContent  = pad(Math.floor((s % 3600) / 60));
  cd.secs.textContent  = pad(s % 60);
}

updateCountdown();
setInterval(updateCountdown, 1000);

/* =====================================================
   REVEAL ON SCROLL
===================================================== */
let revealObserver;
function observeReveals() {
  if (!('IntersectionObserver' in window)) {
    $$('.reveal').forEach((el) => el.classList.add('is-visible'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
  }
  $$('.reveal:not(.is-visible)').forEach((el) => revealObserver.observe(el));
}
observeReveals();

/* =====================================================
   API CLIENT (Google Apps Script)
===================================================== */
async function fetchWishes() {
  try {
    const res = await fetch(`${CONFIG.apiUrl}?action=list&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.data;
  } catch (err) {
    console.warn('Fetch gagal, pakai cache lokal:', err);
    try {
      return JSON.parse(localStorage.getItem(CONFIG.localCacheKey) || '[]');
    } catch { return []; }
  }
}

/* 🔴 FUNGSI INI SUDAH DIPERBAIKI MENGGUNAKAN NO-CORS */
async function submitRSVP(payload) {
  const body = JSON.stringify(payload);

  try {
    await fetch(CONFIG.apiUrl, {
      method: 'POST',
      mode: 'no-cors', 
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    
    // Beri jeda 1.5 detik agar Google Sheets selesai memproses data
    await new Promise(r => setTimeout(r, 1500)); 
    return { ok: true };
  } catch (err) {
    console.error('Error kirim:', err);
    return { ok: false, error: 'Gagal terhubung ke server. Cek internet.' };
  }
}

/* =====================================================
   RENDER WISHES
===================================================== */
function badgeClass(attendance) {
  if (attendance === 'Hadir') return 'wish__badge--hadir';
  if (attendance === 'Tidak Hadir') return 'wish__badge--tidak';
  return 'wish__badge--ragu';
}

async function renderWishes() {
  const listEl  = $('#wishesList');
  const countEl = $('#wishesCount');

  listEl.innerHTML = '<p class="wishes__empty">Memuat ucapan...</p>';

  const data = await fetchWishes();
  try { localStorage.setItem(CONFIG.localCacheKey, JSON.stringify(data)); } catch {}

  countEl.textContent = `${data.length} ucapan`;

  if (!data.length) {
    listEl.innerHTML = '<p class="wishes__empty">Belum ada ucapan. Jadilah yang pertama! 🤍</p>';
    return;
  }

  listEl.innerHTML = data.map((item) => {
    const msg = item.message
      ? `<p class="wish__msg">${escapeHtml(item.message)}</p>`
      : '';
    return `
      <article class="wish">
        <div class="wish__head">
          <span class="wish__name">${escapeHtml(item.name)}</span>
          <span class="wish__badge ${badgeClass(item.attendance)}">${escapeHtml(item.attendance)}</span>
        </div>
        ${msg}
        <p class="wish__time">${formatDate(item.timestamp)}</p>
      </article>`;
  }).join('');
}

/* =====================================================
   FORM SUBMIT
===================================================== */
const form     = $('#rsvpForm');
const formNote = $('#formNote');

function setError(fieldId, message) {
  const el = $(`[data-error-for="${fieldId}"]`);
  if (el) el.textContent = message;
}
function clearErrors() {
  $$('.field__error').forEach((el) => (el.textContent = ''));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();
  formNote.textContent = '';
  formNote.style.color = '';

  const hpEl = $('#hp');
  if (hpEl && hpEl.value) return;

  const nameEl       = $('#rsvpName');
  const name         = nameEl.value.trim();
  const attendanceEl = form.querySelector('input[name="attendance"]:checked');
  const guests       = $('#rsvpGuests').value;
  const message      = $('#rsvpMessage').value.trim();

  let valid = true;
  if (name.length < 2) {
    setError('rsvpName', 'Nama minimal 2 karakter.');
    valid = false;
  }
  if (!attendanceEl) {
    setError('attendance', 'Mohon pilih konfirmasi kehadiran.');
    valid = false;
  }
  if (!valid) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Mengirim...';

  const result = await submitRSVP({
    name,
    attendance: attendanceEl.value,
    guests:     Number(guests),
    message,
    hp: '',
    ua: navigator.userAgent.substring(0, 150),
  });

  submitBtn.disabled = false;
  submitBtn.textContent = originalText;

  if (result.ok) {
    form.reset();
    formNote.textContent = 'Terima kasih! Konfirmasi Anda telah kami terima 🤍';
    formNote.style.color = '#2e7d32';

    // Refresh daftar ucapan setelah jeda sinkronisasi
    setTimeout(() => renderWishes(), 2000);
    
    $('#wishesList').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    formNote.textContent = result.error || 'Gagal mengirim. Coba lagi.';
    formNote.style.color = '#c0392b';
  }
});

/* =====================================================
   INIT
===================================================== */
renderWishes();

// Auto-refresh guest book tiap 60 detik kalau tab aktif
setInterval(() => {
  if (!document.hidden) renderWishes();
}, 60 * 1000);

// Pause musik saat tab tidak aktif
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !bgMusic.paused) {
    bgMusic.pause();
    musicBtn.classList.remove('is-playing');
  }
});