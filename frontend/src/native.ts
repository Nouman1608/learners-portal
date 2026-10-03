/**
 * Glue for running the portal inside the mobile app (Capacitor).
 *
 * In a browser none of this is used: login rides on the httpOnly cookie. In the
 * app there is no cookie to rely on, so the server hands back a token which we
 * keep in the phone's secure storage (Android Keystore / iOS Keychain) and send
 * as a Bearer header. The token is cached in memory so request headers can be
 * added synchronously.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export const isNativeApp = Capacitor.isNativePlatform();

// Stored files come back from the API as paths like "/uploads/...". On the
// website they stay relative to the portal host; the app has no host of its
// own, so it points them at the live portal.
const FILE_HOST = isNativeApp
  ? new URL(import.meta.env.VITE_NATIVE_API_URL).origin
  : (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '');

/** Full address of a stored file ("/uploads/..."). */
export const fileUrl = (path: string): string =>
  /^https?:\/\//.test(path) ? path : FILE_HOST + path;

/**
 * What to hand pdf.js for a file address. On the website, the address itself.
 * In the app, the file's bytes: nginx serves /uploads without CORS headers, so
 * the web view may not fetch it, but a native request may.
 */
export async function pdfSource(url: string): Promise<string | { data: Uint8Array }> {
  if (!isNativeApp) return url;
  const response = await CapacitorHttp.get({ url, responseType: 'arraybuffer' });
  if (response.status >= 400) throw new Error(`Could not load file (HTTP ${response.status})`);
  // Native platforms return binary bodies base64-encoded.
  const body = response.data;
  if (typeof body === 'string') {
    return { data: Uint8Array.from(atob(body), (c) => c.charCodeAt(0)) };
  }
  return { data: new Uint8Array(body) };
}

/**
 * Opens a file or outside page: a new tab on the website, the in-app browser
 * in the app (the web view can neither show PDFs nor save downloads).
 */
export async function openExternal(url: string): Promise<void> {
  if (isNativeApp) await Browser.open({ url });
  else window.open(url, '_blank');
}

/**
 * App display size. Pinching can't shrink a page below the width it was laid
 * out for, so "Smaller" lays the page out wider than the screen and scales it
 * down to fit, the way a laptop shows more. Needs setUseWideViewPort(true) in
 * MainActivity, or Android ignores the viewport width.
 */
export const DISPLAY_SIZES = [
  { label: 'Normal', scale: 1 },
  { label: 'Smaller', scale: 0.85 },
  { label: 'Smallest', scale: 0.7 },
] as const;

const DISPLAY_KEY = 'displayScale';

export function getDisplayScale(): number {
  try {
    const saved = Number(localStorage.getItem(DISPLAY_KEY));
    return DISPLAY_SIZES.some((s) => s.scale === saved) ? saved : 1;
  } catch {
    return 1;
  }
}

function applyViewport(scale: number): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  meta.content =
    scale === 1
      ? 'width=device-width, initial-scale=1.0'
      : `width=${Math.round(window.screen.width / scale)}, initial-scale=${scale}`;
}

export function setDisplayScale(scale: number): void {
  try {
    localStorage.setItem(DISPLAY_KEY, String(scale));
  } catch {
    // Not saved; it still applies until the app closes.
  }
  applyViewport(scale);
}

/** Applies the saved display size, and again whenever the phone is rotated. */
export function initDisplayScale(): void {
  if (!isNativeApp) return;
  applyViewport(getDisplayScale());
  // screen.width only reflects the new orientation once the rotation settles.
  window.screen.orientation?.addEventListener('change', () => {
    setTimeout(() => applyViewport(getDisplayScale()), 300);
  });
}

/** Sent on every app request; the backend checks for this exact value. */
export const MOBILE_CLIENT_HEADER = 'learners-mobile';

const TOKEN_KEY = 'authToken';
let authToken: string | null = null;

export const getAuthToken = (): string | null => authToken;

/** Reads the saved token into memory. Call once before the app renders. */
export async function loadAuthToken(): Promise<void> {
  if (!isNativeApp) return;
  try {
    authToken = await SecureStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('[App] Could not read saved login:', error);
    authToken = null;
  }
}

/** Saves (or with null, forgets) the login token. */
export async function setAuthToken(token: string | null): Promise<void> {
  authToken = token;
  if (!isNativeApp) return;
  try {
    if (token) await SecureStorage.setItem(TOKEN_KEY, token);
    else await SecureStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.error('[App] Could not save login:', error);
  }
}
