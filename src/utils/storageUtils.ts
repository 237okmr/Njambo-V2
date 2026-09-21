/**
 * Multi-layer persistent storage helper (LocalStorage + Cookie fallback)
 * Guarantees cross-context persistence between in-app WebViews (e.g. WhatsApp, Facebook, Telegram)
 * and external mobile browsers (Safari, Chrome).
 */

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, days = 365): void {
  if (typeof document === 'undefined') return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = '; expires=' + date.toUTCString();
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/; SameSite=Lax${secure}`;
}

export function getPersistentItem(key: string): string | null {
  let val: string | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      val = localStorage.getItem(key);
    } catch (e) {
      // localStorage may be disabled or restricted in private browsing/webviews
    }
  }
  if (!val) {
    val = getCookie(key);
    if (val && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, val);
      } catch (e) {
        // ignore
      }
    }
  }
  return val;
}

export function setPersistentItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // ignore
    }
  }
  setCookie(key, value);
}
