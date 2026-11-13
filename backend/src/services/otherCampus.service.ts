import axios from 'axios';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/*
 * Private channel between the two campus portals (Senior <-> Junior), for siblings who study
 * in different campuses. Each portal only ever changes its own database; to read or change
 * the other campus's students it asks that portal's backend at /api/internal/campus.
 *
 * Every request carries a 60-second pass signed with CAMPUS_HANDOFF_SECRET (shared by the two
 * portals). Its audience is fixed to this channel, so a one-click sign-in pass, which travels
 * through a browser, can never be replayed here, and these passes can never sign anyone in.
 */
const AUDIENCE = 'campus-internal';

export interface OtherCampusStudent {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  parentPhone: string | null;
  isActive: boolean;
  familyId: string | null;
}

export const otherCampus = {
  /** Both the shared secret and the other portal's address are set on this portal */
  get enabled(): boolean {
    return !!(env.CAMPUS_HANDOFF_SECRET && env.OTHER_CAMPUS_API_URL);
  },

  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!this.enabled) throw new AppError(400, 'The other campus is not connected to this portal');
    const pass = jwt.sign({}, env.CAMPUS_HANDOFF_SECRET!, { audience: AUDIENCE, expiresIn: '60s' });
    try {
      const response = await axios.request<T>({
        method,
        url: `${env.OTHER_CAMPUS_API_URL!.replace(/\/$/, '')}/internal/campus${path}`,
        data: body,
        headers: { 'x-campus-pass': pass },
        timeout: 8000,
      });
      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.error || error.response?.data?.message;
      logger.warn(`[OTHER CAMPUS] ${method} ${path} failed: ${status || error.code} ${message || ''}`);
      // A clear refusal from the other portal (e.g. student not found) is passed on as it is
      if (status && status < 500 && status !== 401 && message) throw new AppError(status, message);
      throw new AppError(502, 'The other campus portal could not be reached. Please try again in a minute.');
    }
  },

  /** True when the pass on an incoming request was signed by the other portal */
  accepts(pass: unknown): boolean {
    if (!env.CAMPUS_HANDOFF_SECRET || typeof pass !== 'string') return false;
    try {
      jwt.verify(pass, env.CAMPUS_HANDOFF_SECRET, { audience: AUDIENCE });
      return true;
    } catch {
      return false;
    }
  },

  students: (phoneKeys?: string[]) => otherCampus.request<{ students: OtherCampusStudent[] }>(
    'GET', `/students${phoneKeys?.length ? `?phoneKeys=${phoneKeys.join(',')}` : ''}`).then((r) => r.students),

  student: (id: string) => otherCampus.request<{ student: OtherCampusStudent }>('GET', `/students/${id}`).then((r) => r.student),

  familyMembers: (familyId: string) => otherCampus.request<{ students: OtherCampusStudent[] }>(
    'GET', `/families/${familyId}/members`).then((r) => r.students),

  /** Put a student of the other campus into a family (null takes them out) */
  setFamily: (id: string, familyId: string | null) => otherCampus.request<{ previousFamilyId: string | null }>(
    'POST', `/students/${id}/family`, { familyId }),
};

export default otherCampus;
