/* =============================================================
   RDECANTS — TOAST
   Lightweight notification overlay.
   ============================================================= */

let _timeout = null;

export function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add('show');

  clearTimeout(_timeout);
  _timeout = setTimeout(() => toast.classList.remove('show'), 2200);
}
