import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { isStandalone, requestInstall } from '../../pwa';

export default function InstallPortal({ dark = false }: { dark?: boolean }) {
  const [installed, setInstalled] = useState(isStandalone);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const update = () => setInstalled(isStandalone());
    const mode = window.matchMedia('(display-mode: standalone)');
    window.addEventListener('portal-install-change', update);
    mode.addEventListener('change', update);
    return () => {
      window.removeEventListener('portal-install-change', update);
      mode.removeEventListener('change', update);
    };
  }, []);
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  if (Capacitor.isNativePlatform() || installed) return null;
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const install = async () => {
    try { if (await requestInstall()) return; } catch { /* Show browser-specific instructions. */ }
    setOpen(true);
  };
  return (
    <>
      <button type="button" onClick={() => void install()}
        className={`min-h-11 w-full rounded-md border px-4 py-2 text-sm font-medium ${dark ? 'border-gray-600 text-gray-200 hover:bg-gray-800' : 'border-indigo-200 text-indigo-700 hover:bg-indigo-50'}`}>
        Install app
      </button>
      {open && (
        <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="install-title"
          className="m-auto w-[calc(100%_-_2rem)] max-w-sm rounded-xl bg-white p-6 text-left text-gray-900 shadow-xl backdrop:bg-black/50">
          <h2 id="install-title" className="text-xl font-semibold">Install this portal</h2>
          <p className="mt-3 text-base text-gray-600">
            {apple ? 'In Safari, open Share, choose Add to Home Screen, then tap Add.'
              : 'In Chrome or Edge, open the browser menu and choose Install app or Add to Home screen. On a computer, you can also use the install icon in the address bar.'}
          </p>
          <p className="mt-3 text-sm text-gray-500">The app opens this portal from your home screen. An internet connection is needed for account data.</p>
          <button type="button" onClick={() => dialog.current?.close()} className="mt-5 min-h-11 w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white">Got it</button>
        </dialog>
      )}
    </>
  );
}
