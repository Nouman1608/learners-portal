/**
 * Which school this portal instance presents itself as.
 *
 * The hostname decides the brand:
 * - junior.learnersacademy.com.pk shows Learners Preschool. It is the Junior Campus:
 *   a separate backend and database, so its users and data are its own.
 * - portal.marlbridge.com shows Marlbridge (Senior Campus data, shared login).
 * - every other host (learnerspreschool.cloud, portal.learnersacademy.com.pk,
 *   localhost) shows Learners Academy, the Senior Campus.
 *
 * Tailwind classes live here as whole strings so the build keeps them.
 * VITE_BRAND=mb or VITE_BRAND=lp previews those looks on localhost.
 */
import { appCampus } from './appCampus';

export type BrandKey = 'la' | 'mb' | 'lp';

export interface Brand {
  key: BrandKey;
  name: string;
  /** Which campus's data this host serves; forms only offer that campus's options. */
  campus: 'senior' | 'junior';
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
    campus: 'senior',
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
    campus: 'senior',
    // Marlbridge's own tokens: navy #0B1F3A, rule #24395A, gold #C9A227.
    logo: '/brand/marlbridge-emblem-cream.png',
    logoClass: 'mx-auto h-28 w-auto mb-5',
    logoOnDark: '/brand/marlbridge-horizontal-light.png',
    logoOnDarkClass: 'h-8 w-auto my-3',
    favicon: '/brand/marlbridge-emblem-disc.svg',
    loginBgClass: 'bg-[#0B1F3A]',
    buttonClass: 'bg-[#0B1F3A] hover:bg-[#24395A] focus:ring-[#C9A227]',
    focusRingClass: 'focus:ring-[#C9A227] focus:border-[#C9A227]',
  },
  lp: {
    key: 'lp',
    name: 'Learners Preschool',
    campus: 'junior',
    // Logo blue #3F548D.
    logo: '/brand/learners-preschool.png',
    logoClass: 'mx-auto h-36 w-auto mb-4',
    logoOnDark: '/brand/learners-preschool-reverse.png',
    logoOnDarkClass: 'h-24 w-auto',
    favicon: '/brand/learners-preschool-mark.png',
    loginBgClass: 'bg-gradient-to-br from-slate-50 to-[#dfe5f3]',
    buttonClass: 'bg-[#3F548D] hover:bg-[#33467a] focus:ring-[#3F548D]',
    focusRingClass: 'focus:ring-[#3F548D] focus:border-[#3F548D]',
  },
};

function detectBrand(): BrandKey {
  // In the mobile app the school picked on the home screen decides.
  if (appCampus) return appCampus.key;
  const override = import.meta.env.VITE_BRAND as string | undefined;
  if (override === 'mb' || override === 'la' || override === 'lp') return override;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.startsWith('junior.')) return 'lp';
    if (host.includes('marlbridge')) return 'mb';
  }
  return 'la';
}

export const brand: Brand = BRANDS[detectBrand()];

/** What the UI calls a course: "Grade" on the Junior Campus, "Course" everywhere else. */
export const terms = brand.campus === 'junior'
  ? { course: 'Grade', courses: 'Grades', courseLc: 'grade', coursesLc: 'grades' }
  : { course: 'Course', courses: 'Courses', courseLc: 'course', coursesLc: 'courses' };

/** Sets the tab title and favicon to match the brand. Call once at startup. */
export function applyBrand(): void {
  document.title = brand.name;
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (link) link.href = brand.favicon;
}
