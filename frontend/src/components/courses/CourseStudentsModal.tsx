import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { enrollmentsApi, Enrollment } from '../../api/enrollments.api';
import DropEnrollmentModal from '../enrollments/DropEnrollmentModal';
import LoadingSpinner from '../common/LoadingSpinner';
import { terms } from '../../brand';

interface CourseStudentsModalProps {
  /** e.g. the teacher's name, or the course title */
  title: string;
  /** The courses whose students are listed (one, or all of a teacher's) */
  courseIds: string[];
  /** Admins can drop a student from here */
  canDrop: boolean;
  onClose: () => void;
  /** Called after a drop so the page can refresh its student counts */
  onChanged: () => void;
}

/** Who is enrolled (active) in the given courses: name, course, and a Drop button. */
export default function CourseStudentsModal({ title, courseIds, canDrop, onClose, onChanged }: CourseStudentsModalProps) {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDrop, setToDrop] = useState<Enrollment | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const wanted = new Set(courseIds);
      const all = await enrollmentsApi.getEnrollments({ status: 'active' });
      setRows(
        all
          .filter((e) => wanted.has(e.course.id))
          .sort((a, b) => `${a.student.firstName} ${a.student.lastName}`.localeCompare(`${b.student.firstName} ${b.student.lastName}`)),
      );
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const confirmDrop = async (willReturn: boolean, tentativeReturnDate?: string) => {
    if (!toDrop) return;
    try {
      await enrollmentsApi.updateEnrollment(toDrop.id, { status: 'dropped', willReturnAfterDrop: willReturn, tentativeReturnDate });
      toast.success('Student dropped');
      setToDrop(null);
      await load();
      onChanged();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to drop student');
    }
  };

  const multipleCourses = new Set(rows.map((r) => r.course.id)).size > 1 || courseIds.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Students</h2>
            <p className="text-sm text-gray-500">{title}{!loading && ` · ${rows.length} enrolled`}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <LoadingSpinner message="Loading students..." className="py-10" />
          ) : rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">No students enrolled.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{terms.course}</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enrolled</th>
                  {canDrop && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{e.student.firstName} {e.student.lastName}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{e.course.title}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(e.enrolledAt).toLocaleDateString()}</td>
                    {canDrop && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setToDrop(e)}
                          className="px-3 py-1 text-xs bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors"
                        >
                          Drop
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {multipleCourses && !loading && rows.length > 0 && (
            <p className="px-5 py-2 text-xs text-gray-400">A student in two of these {terms.coursesLc} is listed once for each.</p>
          )}
        </div>
      </div>

      {toDrop && (
        <DropEnrollmentModal
          isOpen={true}
          onClose={() => setToDrop(null)}
          onConfirm={confirmDrop}
          studentName={`${toDrop.student.firstName} ${toDrop.student.lastName}`}
          courseName={toDrop.course.title}
        />
      )}
    </div>
  );
}
