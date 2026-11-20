import type { User } from '../types';
import { isSessionExpired } from '../api/client';

interface StartupSessionOptions {
  getUser: (signal: AbortSignal) => Promise<User>;
  clearSession: () => Promise<void>;
  onAuthenticated: (user: User) => void;
  onSignedOut: () => void;
  onChecking: () => void;
  onUnavailable: () => void;
}

/** Resolve saved authentication without treating connectivity errors as logout. */
export function startStartupSession(options: StartupSessionOptions) {
  let stopped = false;
  let checking = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const dispose = () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    window.removeEventListener('online', retry);
    document.removeEventListener('visibilitychange', onVisibility);
  };

  async function retry() {
    if (stopped || checking) return;
    clearTimeout(timer);
    checking = true;
    controller = new AbortController();
    options.onChecking();
    try {
      const user = await options.getUser(controller.signal);
      if (stopped) return;
      dispose();
      options.onAuthenticated(user);
    } catch (error) {
      if (stopped) return;
      if (isSessionExpired(error)) {
        await options.clearSession();
        if (stopped) return;
        dispose();
        options.onSignedOut();
      } else {
        options.onUnavailable();
        timer = setTimeout(() => void retry(), Math.min(5000 * 2 ** failures++, 30000));
      }
    } finally {
      checking = false;
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') void retry();
  }

  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', onVisibility);
  void retry();
  return { retry, dispose };
}
