/**
 * Which school this portal instance presents itself as.
 *
 * One deployment serves two public sites. The hostname decides the brand:
 * portal.marlbridge.com shows Marlbridge; every other host (learnerspreschool.cloud,
 * portal.learnersacademy.com.pk, localhost) shows Learners Academy. Only the
 * presentation changes: users, data and login are shared.
 *
 * Tailwind classes live here as whole strings so the build keeps them.
 * VITE_BRAND=mb previews the Marlbridge look on localhost.
 */
export type BrandKey = 'la' | 'mb';

export interface Brand {
  key: BrandKey;
  name: string;
  /** Logo for light backgrounds (login card). */
  logo: string;
  logoClass: string;
  /** Logo for the dark sidebar. */
  logoOnDark: string;
  logoOnDarkClass: string;
  favicon: string;
  /** Full-page background behind the login card. */
  loginBgClass: string;
  /** Primary button on the login page. */
  buttonClass: string;
  focusRingClass: string;
}

const BRANDS: Record<BrandKey, Brand> = {
  la: {
    key: 'la',
    name: 'Learners Academy',
    logo: '/logo.svg',
    logoClass: 'mx-auto h-32 w-auto mb-4',
    logoOnDark: '/logo.svg',
    logoOnDarkClass: 'h-20 w-auto',
    favicon: '/favicon.svg',
    loginBgClass: 'bg-gradient-to-br from-blue-50 to-indigo-100',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
    focusRingClass: 'focus:ring-indigo-500 focus:border-indigo-500',
  },
  mb: {
    key: 'mb',
    name: 'Marlbridge',
    // Marlbridge's own tokens: navy #0B1F3A, rule #24395A, gold #C9A227.
    logo: '/brand/marlbridge-stacked.svg',
    logoClass: 'mx-auto h-28 w-auto mb-5',
    logoOnDark: '/brand/marlbridge-horizontal-reverse.svg',
    logoOnDarkClass: 'h-9 w-auto my-3',
    favicon: '/brand/marlbridge-mark.svg',
    loginBgClass: 'bg-[#0B1F3A]',
    buttonClass: 'bg-[#0B1F3A] hover:bg-[#24395A] focus:ring-[#C9A227]',
    focusRingClass: 'focus:ring-[#C9A227] focus:border-[#C9A227]',
  },
};

function detectBrand(): BrandKey {
  const override = import.meta.env.VITE_BRAND as string | undefined;
  if (override === 'mb' || override === 'la') return override;
  if (typeof window !== 'undefined' && window.location.hostname.includes('marlbridge')) return 'mb';
  return 'la';
}

export const brand: Brand = BRANDS[detectBrand()];

/** Sets the tab title and favicon to match the brand. Call once at startup. */
export function applyBrand(): void {
  document.title = brand.name;
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (link) link.href = brand.favicon;
}
