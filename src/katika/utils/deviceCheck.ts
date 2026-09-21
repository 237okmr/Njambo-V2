/**
 * Strict Desktop / PC Detection for the Katika Control Panel
 * Requirements:
 * - Rejection of mobile / tablet user agents
 * - Minimum viewport width >= 1024px and height >= 600px
 * - Precise mouse/trackpad hardware pointer capability
 */

export function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || '';
  
  // Mobile / Tablet regex check
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|Silk|Kindle|Tablet/i;
  
  // Also check for iPadOS 13+ which presents as Macintosh but has maxTouchPoints > 1
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  
  return mobileRegex.test(ua) || isIPadOS;
}

export function isDesktopPC(): boolean {
  if (typeof window === 'undefined') return true;

  // 1. Strict rejection of genuine mobile / tablet hardware
  if (isMobileUserAgent()) {
    return false;
  }

  // 2. Viewport dimensions
  const hasMinDimensions = window.innerWidth >= 1024 && window.innerHeight >= 550;

  // 3. Pointer precision: PC mouse or trackpad present
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches || window.matchMedia('(any-pointer: fine)').matches;

  return hasMinDimensions && hasFinePointer;
}

export function enforceDesktopOnly(): boolean {
  if (!isDesktopPC()) {
    window.location.replace('/');
    return false;
  }
  return true;
}

