/**
 * Which school the mobile app is connected to.
 *
 * The website gets its school from the hostname (see brand.ts). The app has no hostname,
 * so the person picks one on the app's home screen; the choice is kept on the phone and
 * decides the look (brand) and which portal's server the app talks to.
 *
 * Read synchronously at start-up (brand.ts, api/client.ts, native.ts), so a change only
 * takes effect after reloading the app: use chooseAppCampus / forgetAppCampus.
 */
import { Capacitor } from '@capacitor/core';

export type AppCampusKey = 'la' | 'lp' | 'mb';

export interface AppCampus {
  key: AppCampusKey;
  /** What the home screen calls it. */
  label: string;
  school: string;
  logo: string;
  apiUrl: string;
}

export const APP_CAMPUSES: AppCampus[] = [
  {
    key: 'la',
    label: 'Senior Campus',
    school: 'Learners Academy',
    logo: '/logo.svg',
    apiUrl: 'https://portal.learnersacademy.com.pk/api',
  },
  {
    key: 'lp',
    label: 'Junior Campus',
    school: 'Learners Preschool',
    logo: '/brand/learners-preschool.png',
    apiUrl: 'https://junior.learnersacademy.com.pk/api',
  },
  {
    key: 'mb',
    label: 'Marlbridge',
    school: 'Marlbridge',
    logo: '/brand/marlbridge-emblem-cream.png',
    apiUrl: 'https://portal.marlbridge.com/api',
  },
];

const STORAGE_KEY = 'appCampus';
const isNative = Capacitor.isNativePlatform();

function read(): AppCampus | null {
  if (!isNative) return null;
  try {
    const key = localStorage.getItem(STORAGE_KEY);
    return APP_CAMPUSES.find((c) => c.key === key) ?? null;
  } catch {
    return null;
  }
}

/** The school chosen in the app, or null on the website / before the first choice. */
export const appCampus: AppCampus | null = read();

/** True in the app until a school has been picked: show the home screen instead. */
export const needsCampusChoice = isNative && appCampus === null;

/** Saves the choice and restarts the app's page so everything picks it up. */
export function chooseAppCampus(key: AppCampusKey): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Without storage the choice can't be kept; nothing else to do.
  }
  window.location.replace('/');
}

/** Back to the home screen (e.g. "Change school" on the login page). */
export function forgetAppCampus(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  window.location.replace('/');
}
