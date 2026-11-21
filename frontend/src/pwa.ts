import { Capacitor } from '@capacitor/core';
import { brand } from './brand';
import { isWebChooser } from './appCampus';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
declare const __PWA_BUILD_ID__: string;
let installPrompt: InstallPrompt | null = null;
let installed = false;
export const isStandalone = () => installed || window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function initPwa(): void {
  if (Capacitor.isNativePlatform()) return;
  const key = isWebChooser ? 'portal' : brand.key;
  document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href = `/pwa/${key}/manifest.json`;
  document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href = `/pwa/${key === 'portal' ? 'la' : key}/apple-180.png?v=${__PWA_BUILD_ID__}`;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')!.content = key === 'mb' ? '#0B1F3A' : '#3F548D';
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    window.dispatchEvent(new Event('portal-install-change'));
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    window.dispatchEvent(new Event('portal-install-change'));
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register(`/sw-${__PWA_BUILD_ID__}.js`, { scope: '/', updateViaCache: 'none' }).catch(() => {
      // The portal remains usable if the browser disallows service workers.
    });
  }
}

export async function requestInstall(): Promise<boolean> {
  if (!installPrompt) return false;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  return true;
}
