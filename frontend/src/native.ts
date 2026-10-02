/**
 * Glue for running the portal inside the mobile app (Capacitor).
 *
 * In a browser none of this is used: login rides on the httpOnly cookie. In the
 * app there is no cookie to rely on, so the server hands back a token which we
 * keep in the phone's secure storage (Android Keystore / iOS Keychain) and send
 * as a Bearer header. The token is cached in memory so request headers can be
 * added synchronously.
 */
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export const isNativeApp = Capacitor.isNativePlatform();

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
