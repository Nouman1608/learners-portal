import { sql } from 'drizzle-orm';
import { db, Database } from '../config/database';

/**
 * Data for the printable monthly attendance sheets (one sheet per class): the class days of the
 * month and the students enrolled now. The teacher marks the sheet by hand, so only names and
 * dates are needed.
 */

export interface SheetClass {
  courseId: string;
  title: string;
  teachers: string[];
  oneToOne: boolean;
  /** The class days of the month, from the calendar; empty when the class has no fixed days */
  dates: { date: string; time: string | null }[];
  students: { id: string; name: string }[];
  campus?: 'senior' | 'junior';
}

export interface AttendanceSheetData {
  month: number;
  year: number;
  /** Everyone who teaches a class with students, for the teacher drop-down */
  teachers: { id: string; name: string; campus?: 'senior' | 'junior' }[];
  classes: SheetClass[];
}

const pad = (n: number) => String(n).padStart(2, '0');

export const attendanceSheetService = {
  async getSheets(month: number, year: number, teacherId?: string, database: Database = db): Promise<AttendanceSheetData> {
    const firstDay = `${year}-${pad(month)}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${pad(month)}-${pad(daysInMonth)}`;

    const classRows = (await database.execute(sql`
      SELECT c.id AS "courseId", c.title,
             COALESCE(array_agg(DISTINCT ct.teacher_id) FILTER (WHERE ct.teacher_id IS NOT NULL), '{}') AS "teacherIds",
             COALESCE(array_agg(DISTINCT trim(t.first_name || ' ' || t.last_name)) FILTER (WHERE t.id IS NOT NULL), '{}') AS "teacherNames",
             bool_or(e.class_type = '1-to-1') AS "oneToOne"
      FROM courses c
      INNER JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
      LEFT JOIN course_teachers ct ON ct.course_id = c.id
      LEFT JOIN users t ON t.id = ct.teacher_id AND t.is_active = true
      WHERE c.is_active = true
      GROUP BY c.id, c.title
      ORDER BY c.title`)).rows as any[];

    const teacherMap = new Map<string, string>();
    const people = (await database.execute(sql`
      SELECT DISTINCT t.id, trim(t.first_name || ' ' || t.last_name) AS name
      FROM course_teachers ct
      INNER JOIN users t ON t.id = ct.teacher_id AND t.is_active = true
      INNER JOIN enrollments e ON e.course_id = ct.course_id AND e.status = 'active'
      ORDER BY name`)).rows as any[];
    for (const person of people) teacherMap.set(person.id, person.name);

    const chosen = teacherId
      ? classRows.filter((row) => (row.teacherIds as string[]).includes(teacherId))
      : classRows;
    const ids = chosen.map((row) => row.courseId as string);
    if (ids.length === 0) {
      return { month, year, teachers: [...teacherMap].map(([id, name]) => ({ id, name })), classes: [] };
    }
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);

    const studentRows = (await database.execute(sql`
      SELECT e.course_id AS "courseId", u.id, trim(u.first_name || ' ' || u.last_name) AS name
      FROM enrollments e
      INNER JOIN users u ON u.id = e.student_id
      WHERE e.status = 'active' AND e.course_id IN (${idList})
      ORDER BY u.first_name, u.last_name`)).rows as any[];

    // Class days: the calendar's events for the month, else worked out from the weekly timeslots
    const eventRows = (await database.execute(sql`
      SELECT course_id AS "courseId", to_char(event_date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS time
      FROM course_events
      WHERE course_id IN (${idList}) AND status <> 'cancelled'
        AND event_date BETWEEN ${firstDay}::date AND ${lastDay}::date
      ORDER BY event_date, start_time`)).rows as any[];
    const slotRows = (await database.execute(sql`
      SELECT course_id AS "courseId", days_of_week AS days, to_char(start_time, 'HH24:MI') AS time,
             to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate"
      FROM course_timeslots
      WHERE course_id IN (${idList}) AND is_active = true`)).rows as any[];

    const datesOf = (courseId: string) => {
      const found = new Map<string, string | null>();
      for (const row of eventRows) if (row.courseId === courseId && !found.has(row.date)) found.set(row.date, row.time);
      if (found.size === 0) {
        for (const slot of slotRows.filter((s) => s.courseId === courseId)) {
          for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${pad(month)}-${pad(day)}`;
            if (date < slot.startDate || (slot.endDate && date > slot.endDate)) continue;
            if ((slot.days as number[]).includes(new Date(year, month - 1, day).getDay()) && !found.has(date)) found.set(date, slot.time);
          }
        }
      }
      return [...found].map(([date, time]) => ({ date, time })).sort((a, b) => a.date.localeCompare(b.date));
    };

    return {
      month,
      year,
      teachers: [...teacherMap].map(([id, name]) => ({ id, name })),
      classes: chosen.map((row) => ({
        courseId: row.courseId,
        title: row.title,
        teachers: row.teacherNames as string[],
        oneToOne: !!row.oneToOne,
        dates: datesOf(row.courseId),
        students: studentRows.filter((s) => s.courseId === row.courseId).map((s) => ({ id: s.id, name: s.name })),
      })),
    };
  },
};

export default attendanceSheetService;
