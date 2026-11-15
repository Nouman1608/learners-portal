import crypto from 'crypto';
import path from 'path';
import env from '../config/env';
import logger from './logger';

/*
 * Stored files (invoices, pay slips, assessment papers, payment proofs) are only served
 * with a signature for their exact path: "/uploads/invoices/X.pdf?sig=...". The API signs
 * every file link it hands out, so the portal, the app and links pasted into WhatsApp keep
 * working without a login, but file names can no longer be guessed. Links do not expire.
 *
 * FILE_LINK_SECRET must be the same on both campus portals (.env and .env.junior): the
 * Senior portal shows Junior files to sudo, and those links are opened on the Junior portal.
 * The campus is part of what is signed: both campuses name their files the same way
 * (INV-2026-11-STU-001.pdf exists on each), so a Senior link must not open the Junior file.
 */
export type FileCampus = 'senior' | 'junior';
const ownCampus: FileCampus = /preschool|junior/i.test(env.SCHOOL_NAME) ? 'junior' : 'senior';
const otherCampus: FileCampus = ownCampus === 'junior' ? 'senior' : 'junior';
// The other portal's address (HANDOFF_TARGET_URL, set on the Senior instance only)
const otherOrigin = (() => { try { return new URL(env.HANDOFF_TARGET_URL || '').origin; } catch { return ''; } })();
let warned = false;
const secret = (): string => {
  if (env.FILE_LINK_SECRET) return env.FILE_LINK_SECRET;
  if (!warned) {
    warned = true;
    logger.warn('[FILE LINKS] FILE_LINK_SECRET is not set; signing file links with JWT_SECRET');
  }
  return env.JWT_SECRET;
};

/** "/uploads/a b.pdf" and "/uploads/a%20b.pdf" are the same file, so they share one signature */
const normalise = (pathname: string): string => {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Not valid percent-encoding: sign it as it is
  }
  return path.posix.normalize(decoded);
};

const signature = (pathname: string, campus: FileCampus = ownCampus): string =>
  crypto.createHmac('sha256', secret()).update(`${campus}:${normalise(pathname)}`).digest('base64url').slice(0, 32);

const hasSig = (link: string): boolean => /[?&]sig=/.test(link);

/** "/uploads/x.pdf" (or "/uploads/x.pdf?v=1") with its signature added */
export const signFilePath = (link: string, campus: FileCampus = ownCampus): string => {
  if (hasSig(link)) return link;
  const [pathname] = link.split('?');
  return `${link}${link.includes('?') ? '&' : '?'}sig=${signature(pathname, campus)}`;
};

/** True when sig is the signature for this path on this campus */
export const verifyFilePath = (pathname: string, sig: unknown): boolean => {
  if (typeof sig !== 'string') return false;
  const expected = Buffer.from(signature(pathname));
  const given = Buffer.from(sig);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

// Hosts whose absolute "/uploads/..." links are ours (this portal and the other campus)
const ownHosts = new Set(
  [...env.FRONTEND_URL.split(','), env.HANDOFF_TARGET_URL || '']
    .map((u) => { try { return new URL(u.trim()).host; } catch { return ''; } })
    .filter(Boolean)
);

/**
 * A file link of ours (relative, or absolute on our hosts) signed; anything else unchanged.
 * campus = the campus whose file it is: the other campus's (sudo's read-only Junior tab on
 * the Senior portal) is signed for that portal and pointed at it.
 */
export const signFileLink = (value: string, campus: FileCampus = ownCampus): string => {
  if (value.startsWith('/uploads/')) {
    return campus === ownCampus ? signFilePath(value) : `${otherOrigin}${signFilePath(value, campus)}`;
  }
  if (!/^https?:\/\/[^/]+\/uploads\//.test(value) || hasSig(value)) return value;
  try {
    const url = new URL(value);
    if (!ownHosts.has(url.host)) return value;
    // An absolute link says which portal holds the file
    const onOther = !!otherOrigin && url.origin === otherOrigin;
    url.searchParams.set('sig', signature(url.pathname, onOther ? otherCampus : ownCampus));
    return url.toString();
  } catch {
    return value;
  }
};

/** A file link sent back by the portal: valid only if we signed it; returned without the signature */
export const acceptFileLink = (value: string): string | null => {
  let url: URL;
  try {
    url = new URL(value, 'http://portal.invalid');
  } catch {
    return null;
  }
  const relative = value.startsWith('/');
  if (!url.pathname.startsWith('/uploads/') || (!relative && !ownHosts.has(url.host))) return null;
  if (!verifyFilePath(url.pathname, url.searchParams.get('sig'))) return null;
  if (!relative) {
    url.searchParams.delete('sig');
    return url.toString();
  }
  // Keep the path exactly as it was stored ("/uploads/a b.pdf", not "a%20b")
  const [pathname, query = ''] = value.split('?');
  const rest = new URLSearchParams(query);
  rest.delete('sig');
  return rest.toString() ? `${pathname}?${rest}` : pathname;
};

// Only fields that hold file links are signed, so text a user typed (a name, a note, a
// teacher's annotations) can never be turned into a signed link to someone else's file.
const LINK_KEYS = new Set(['url', 'fileUrl', 'pdfUrl', 'simplifiedPdfUrl', 'proofUrl', 'pdfPath']);
const FREE_FORM_KEYS = new Set(['annotationData', 'metadata']);

const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * The payload with its file links signed; untouched parts are shared, not copied. campus =
 * whose files these are (the other campus's for sudo's read-only Junior tab on Senior).
 * An object that appears twice gets the same signed copy both times (a cycle is left as is).
 */
export const signFileLinks = (
  value: unknown,
  campus: FileCampus = ownCampus,
  done = new WeakMap<object, unknown>()
): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (done.has(value)) return done.get(value);
  done.set(value, value);
  let result: unknown = value;
  if (Array.isArray(value)) {
    let out: unknown[] | undefined;
    value.forEach((item, i) => {
      const signed = signFileLinks(item, campus, done);
      if (signed !== item) (out ??= value.slice())[i] = signed;
    });
    result = out ?? value;
  } else if (isPlain(value)) { // not Dates, Buffers and the like
    let out: Record<string, unknown> | undefined;
    for (const [key, item] of Object.entries(value)) {
      if (FREE_FORM_KEYS.has(key)) continue;
      const signed = typeof item === 'string'
        ? (LINK_KEYS.has(key) ? signFileLink(item, campus) : item)
        : signFileLinks(item, campus, done);
      if (signed !== item) (out ??= { ...value })[key] = signed;
    }
    result = out ?? value;
  }
  done.set(value, result);
  return result;
};
