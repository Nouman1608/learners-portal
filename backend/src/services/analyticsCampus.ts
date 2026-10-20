import { Request } from 'express';
import { juniorDb } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { analyticsService } from './analytics.service';

/**
 * Campus selection for analytics. On the Senior Campus portal the sudo user can look at
 * the Junior Campus (read-only connection) or at both together. Results from the two
 * databases are merged here: lists are joined, money is added per currency, and every
 * rate is recomputed from its underlying counts rather than averaged.
 */

export type AnalyticsService = typeof analyticsService;
export type Campus = 'senior' | 'junior' | 'both';

export function campusServices(req: Request): AnalyticsService[] {
  const campus = (typeof req.query.campus === 'string' ? req.query.campus : 'senior') as Campus;
  if (campus !== 'junior' && campus !== 'both') return [analyticsService];
  if (req.user?.role !== 'sudo') throw new AppError(403, 'Only sudo can view other campuses');
  if (!juniorDb) throw new AppError(400, 'Junior Campus is not connected to this portal');
  const junior = analyticsService.withDatabase(juniorDb);
  return campus === 'junior' ? [junior] : [analyticsService, junior];
}

/** Runs a loader once per selected campus; with two campuses, merges the results. */
export async function forCampuses<T>(
  services: AnalyticsService[],
  load: (svc: AnalyticsService) => Promise<T>,
  merge: (senior: T, junior: T) => T
): Promise<T> {
  const results = await Promise.all(services.map(load));
  return results.length === 1 ? results[0] : merge(results[0], results[1]);
}

// ---------- generic helpers ----------

const JUNIOR = ' (Junior)';
export const tagJunior = (name: string | null | undefined) => (name ? `${name}${JUNIOR}` : name);

type Num = Record<string, any>;

/** Adds the listed numeric fields of b into a copy of a. */
function addFields<T extends Num>(a: T, b: T, fields: (keyof T)[]): T {
  const out: any = { ...a };
  for (const f of fields) out[f] = (Number(a[f]) || 0) + (Number(b[f]) || 0);
  return out;
}

/** Joins two lists, combining items that share a key. */
function mergeBy<T>(a: T[], b: T[], key: (t: T) => string, combine: (x: T, y: T) => T): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const k = key(item);
    const existing = map.get(k);
    map.set(k, existing ? combine(existing, item) : item);
  }
  return [...map.values()];
}

/** Per-currency rows: same currency -> add every numeric field. */
function mergeCurrencyRows<T extends Num>(a: T[], b: T[], fields: (keyof T)[]): T[] {
  return mergeBy(a, b, r => String(r.currency), (x, y) => addFields(x, y, fields));
}

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

// ---------- financial ----------

type Svc = AnalyticsService;
type Revenue = Awaited<ReturnType<Svc['getRevenueOverTime']>>;
type Methods = Awaited<ReturnType<Svc['getPaymentMethodBreakdown']>>;
type Outstanding = Awaited<ReturnType<Svc['getOutstandingFeesAnalysis']>>;
type CourseRevenue = Awaited<ReturnType<Svc['getCourseRevenueBreakdown']>>;
type Collection = Awaited<ReturnType<Svc['getCollectionRate']>>;
type Profitability = Awaited<ReturnType<Svc['getCourseProfitability']>>;

export function mergeRevenue(a: Revenue, b: Revenue): Revenue {
  return mergeBy(a, b, r => r.date, (x, y) => ({
    date: x.date,
    byCurrency: mergeCurrencyRows(x.byCurrency, y.byCurrency, ['revenue', 'revenuePKR', 'transactionCount']),
    revenuePKR: x.revenuePKR + y.revenuePKR,
    transactionCount: x.transactionCount + y.transactionCount,
  })).sort((x, y) => x.date.localeCompare(y.date));
}

export function mergeMethods(a: Methods, b: Methods): Methods {
  return mergeBy(a, b, m => m.method, (x, y) => ({
    method: x.method,
    byCurrency: mergeCurrencyRows(x.byCurrency, y.byCurrency, ['amount', 'amountPKR', 'count']),
    amountPKR: x.amountPKR + y.amountPKR,
    count: x.count + y.count,
  })).sort((x, y) => y.amountPKR - x.amountPKR);
}

export function mergeOutstanding(a: Outstanding, b: Outstanding): Outstanding {
  return mergeBy(a, b, r => r.range, (x, y) => ({
    range: x.range,
    byCurrency: mergeCurrencyRows(x.byCurrency, y.byCurrency, ['amount', 'amountPKR', 'count']),
    amountPKR: x.amountPKR + y.amountPKR,
    count: x.count + y.count,
  }));
}

export function mergeCourseRevenue(a: CourseRevenue, b: CourseRevenue): CourseRevenue {
  return [...a, ...b.map(c => ({ ...c, courseTitle: tagJunior(c.courseTitle) as string }))]
    .sort((x, y) => y.revenuePKR - x.revenuePKR);
}

export function mergeCollection(a: Collection, b: Collection): Collection {
  const byCurrency = mergeCurrencyRows(a.byCurrency, b.byCurrency, [
    'billed', 'collected', 'outstanding', 'billedPKR', 'collectedPKR', 'feeCount', 'paidCount',
  ]).map(r => ({ ...r, collectionRate: pct(r.collected, r.billed) }));
  const billedPKR = a.billedPKR + b.billedPKR;
  const collectedPKR = a.collectedPKR + b.collectedPKR;
  return {
    byCurrency,
    billedPKR,
    collectedPKR,
    outstandingPKR: billedPKR - collectedPKR,
    collectionRate: pct(collectedPKR, billedPKR),
    feeCount: a.feeCount + b.feeCount,
    paidCount: a.paidCount + b.paidCount,
  };
}

export function mergeProfitability(a: Profitability, b: Profitability): Profitability {
  return [...a, ...b.map(c => ({ ...c, courseTitle: tagJunior(c.courseTitle) as string }))]
    .sort((x, y) => y.profitPKR - x.profitPKR);
}

// ---------- performance ----------

type Distributions = Awaited<ReturnType<Svc['getAssessmentDistributions']>>;
type CoursePerformance = Awaited<ReturnType<Svc['getCoursePerformanceComparison']>>;
type TopPerformers = Awaited<ReturnType<Svc['getTopPerformers']>>;
type PassFail = Awaited<ReturnType<Svc['getPassFailRates']>>;
type AtRisk = Awaited<ReturnType<Svc['getAtRiskStudents']>>;
type StudentTrends = Awaited<ReturnType<Svc['getStudentPerformanceTrends']>>;

export function mergeDistributions(a: Distributions, b: Distributions): Distributions {
  return mergeBy(a, b, r => r.scoreRange, (x, y) => {
    const count = x.count + y.count;
    return {
      scoreRange: x.scoreRange,
      count,
      avgScore: count > 0 ? ((x.avgScore || 0) * x.count + (y.avgScore || 0) * y.count) / count : 0,
    };
  }).sort((x, y) => (y.avgScore || 0) - (x.avgScore || 0));
}

export function mergeCoursePerformance(a: CoursePerformance, b: CoursePerformance): CoursePerformance {
  // Same order as the SQL (avgScore DESC puts courses without scores first).
  const rank = (v: number | null) => (v === null || v === undefined ? Infinity : v);
  return [...a, ...b.map(c => ({ ...c, courseTitle: tagJunior(c.courseTitle) as string }))]
    .sort((x, y) => rank(y.avgScore) - rank(x.avgScore));
}

export function mergeTopPerformers(a: TopPerformers, b: TopPerformers, limit: number): TopPerformers {
  return [...a, ...b.map(s => ({ ...s, lastName: tagJunior(s.lastName) as string }))]
    .sort((x, y) => (y.avgScore || 0) - (x.avgScore || 0))
    .slice(0, limit);
}

export function mergePassFail(a: PassFail, b: PassFail): PassFail {
  const totalAssessments = (a.totalAssessments || 0) + (b.totalAssessments || 0);
  const passedCount = (a.passedCount || 0) + (b.passedCount || 0);
  return {
    totalAssessments,
    passedCount,
    failedCount: (a.failedCount || 0) + (b.failedCount || 0),
    passRate: pct(passedCount, totalAssessments),
  };
}

export function mergeAtRisk(a: AtRisk, b: AtRisk, limit: number): AtRisk {
  return [...a, ...b.map(s => ({ ...s, studentName: tagJunior(s.studentName) as string }))]
    .sort((x, y) => y.riskScore - x.riskScore)
    .slice(0, limit);
}

export function mergeStudentTrends(a: StudentTrends | null, b: StudentTrends | null): StudentTrends | null {
  if (!a || !b) return a || b;
  return [...a, ...b];
}

// ---------- attendance ----------

type AttendanceTrends = Awaited<ReturnType<Svc['getAttendanceTrends']>>;
type AttendanceByStatus = Awaited<ReturnType<Svc['getAttendanceByStatus']>>;

export function mergeAttendanceTrends(a: AttendanceTrends, b: AttendanceTrends): AttendanceTrends {
  return mergeBy(a, b, r => String(r.eventDate), (x, y) => {
    const merged = addFields(x, y, ['totalStudents', 'presentCount', 'lateCount', 'absentCount', 'recordCount']);
    return { ...merged, attendanceRate: pct(merged.presentCount + merged.lateCount, merged.recordCount) };
  }).sort((x, y) => String(x.eventDate).localeCompare(String(y.eventDate)));
}

export function mergeAttendanceByStatus(a: AttendanceByStatus, b: AttendanceByStatus): AttendanceByStatus {
  const merged = mergeBy(a, b, r => String(r.status), (x, y) => ({ ...x, count: x.count + y.count }));
  const total = merged.reduce((s, r) => s + r.count, 0);
  return merged.map(r => ({ ...r, percentage: pct(r.count, total) }));
}

// ---------- courses and growth ----------

type Popularity = Awaited<ReturnType<Svc['getCoursePopularity']>>;
type EnrollmentTrends = Awaited<ReturnType<Svc['getEnrollmentTrends']>>;
type Retention = Awaited<ReturnType<Svc['getRetentionMetrics']>>;
type Leads = Awaited<ReturnType<Svc['getLeadConversion']>>;
type Workload = Awaited<ReturnType<Svc['getTeacherWorkload']>>;

export function mergePopularity(a: Popularity, b: Popularity): Popularity {
  return [...a, ...b.map(c => ({ ...c, courseTitle: tagJunior(c.courseTitle) as string }))]
    .sort((x, y) => y.activeEnrollments - x.activeEnrollments);
}

export function mergeEnrollmentTrends(a: EnrollmentTrends, b: EnrollmentTrends): EnrollmentTrends {
  return mergeBy(a, b, r => r.month, (x, y) => ({ ...x, enrollmentCount: x.enrollmentCount + y.enrollmentCount }))
    .sort((x, y) => x.month.localeCompare(y.month));
}

export function mergeRetention(a: Retention, b: Retention): Retention {
  const active = a.active + b.active;
  const completed = a.completed + b.completed;
  const dropped = a.dropped + b.dropped;
  const settled = completed + dropped;
  return {
    active,
    completed,
    dropped,
    total: a.total + b.total,
    churnRate: pct(dropped, settled),
    retentionRate: pct(completed, settled),
    dropTrend: mergeBy(a.dropTrend, b.dropTrend, r => r.month, (x, y) => addFields(x, y, ['dropped', 'enrolled']))
      .sort((x, y) => x.month.localeCompare(y.month)),
    dropByCourse: [...a.dropByCourse, ...b.dropByCourse.map(c => ({ ...c, courseTitle: tagJunior(c.courseTitle) as string }))]
      .sort((x, y) => y.dropped - x.dropped)
      .slice(0, 10),
  };
}

export function mergeLeads(a: Leads, b: Leads): Leads {
  const totalLeads = a.totalLeads + b.totalLeads;
  const totalConverted = a.totalConverted + b.totalConverted;
  return {
    totalLeads,
    totalConverted,
    conversionRate: pct(totalConverted, totalLeads),
    byStatus: mergeBy(a.byStatus, b.byStatus, r => String(r.status), (x, y) => ({ ...x, count: x.count + y.count }))
      .sort((x, y) => y.count - x.count),
    bySource: mergeBy(a.bySource, b.bySource, r => String(r.source), (x, y) => {
      const m = addFields(x, y, ['total', 'converted']);
      return { ...m, conversionRate: pct(m.converted, m.total) };
    }).sort((x, y) => y.total - x.total),
    trend: mergeBy(a.trend, b.trend, r => r.month, (x, y) => addFields(x, y, ['total', 'converted']))
      .sort((x, y) => x.month.localeCompare(y.month)),
  };
}

export function mergeWorkload(a: Workload, b: Workload): Workload {
  return [...a, ...b.map(t => ({ ...t, teacherName: tagJunior(t.teacherName) as string }))]
    .sort((x, y) => y.totalClasses - x.totalClasses);
}
