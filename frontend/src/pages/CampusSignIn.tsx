import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth.api';
import { brand } from '../brand';

/**
 * Landing page for one-click sign-in from the other campus portal (sudo only).
 * The one-time pass arrives in the URL fragment (#t=...), which is never sent to a
 * server; it is removed from the address bar before it is used.
 */
export default function CampusSignIn() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice; the pass is single-use
    started.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
    window.history.replaceState(null, '', window.location.pathname);

    if (!token) {
      setError('This sign-in link is incomplete.');
      return;
    }
    authApi
      .acceptCampusHandoff(token)
      .then(() => window.location.replace('/'))
      .catch((e: any) => setError(e.response?.data?.error || 'This sign-in link is invalid or has expired.'));
  }, []);

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 ${brand.loginBgClass}`}>
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
        <img src={brand.logo} alt={brand.name} className="mx-auto h-24 w-auto mb-4" />
        {error ? (
          <>
            <p className="text-gray-900 font-medium mb-2">Could not sign you in</p>
            <p className="text-sm text-gray-600 mb-6">{error}</p>
            <Link to="/login" className={`inline-block px-4 py-2 rounded-md text-white ${brand.buttonClass}`}>
              Go to login
            </Link>
          </>
        ) : (
          <p className="text-gray-600">Signing you in to {brand.name}…</p>
        )}
      </div>
    </div>
  );
}
