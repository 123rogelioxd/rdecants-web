/* =============================================================
   RDECANTS — TOAST
   Lightweight notification overlay.

   showToast(msg)                      → plain text toast
   showToast(msg, { actionLabel, onAction })
                                       → text + inline action button
   ============================================================= */

let _timeout = null;

export function showToast(msg, options = {}) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  const { actionLabel, onAction } = options;

  if (actionLabel && typeof onAction === 'function') {
    toast.classList.add('toast--action');
    toast.innerHTML = '';

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = msg;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      toast.classList.remove('show');
      onAction();
    });

    toast.append(text, btn);
  } else {
    toast.classList.remove('toast--action');
    toast.textContent = msg;
  }

  toast.classList.add('show');

  clearTimeout(_timeout);
  _timeout = setTimeout(() => toast.classList.remove('show'), 2600);
}
