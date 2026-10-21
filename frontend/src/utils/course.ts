/**
 * Strip the category (S/J) and level (IG/A Level) from a course title.
 * Used for teacher-facing views.
 */
export function teacherCourseTitle(title: string): string {
  return title.replace(/^[SJ]\s+/, '').replace(/^(IG|A Level)\s+/, '');
}

/** Badge text for a course level: IG / A LEVEL, or the junior category (Preschool / Academy / ATP). */
export function courseLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    ig: 'IG', alevel: 'A LEVEL', preschool: 'Preschool', academy: 'Academy', aitchison: 'ATP',
  };
  return labels[level] ?? level.toUpperCase();
}

/**
 * Extract only the subject from a course title.
 * Used for student-facing views.
 * Title format: [S/J] [IG/A Level] [Subject] [Teacher] [Student]
 * Returns the subject part, or the full title as fallback.
 */
export function studentCourseTitle(title: string, subject?: string | null): string {
  return subject || title;
}
