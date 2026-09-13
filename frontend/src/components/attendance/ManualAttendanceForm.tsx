import { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { attendanceApi } from '../../api/attendance.api';
import toast from 'react-hot-toast';
import LoadingSpinner from '../common/LoadingSpinner';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface StudentsByMode {
  local: Student[];
  online: Student[];
}

interface ManualAttendanceFormProps {
  eventId: string;
  eventTitle: string;
  classType: 'local' | 'online' | 'hybrid' | '1-to-1';
  onClose: () => void;
  onSuccess: () => void;
}

type AttendanceStatus = 'present' | 'absent' | 'late';

interface AttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
}

export default function ManualAttendanceForm({
  eventId,
  eventTitle,
  classType,
  onClose,
  onSuccess,
}: ManualAttendanceFormProps) {
  const [students, setStudents] = useState<StudentsByMode>({ local: [], online: [] });
  const [attendance, setAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadStudents();
  }, [eventId]);

  const loadStudents = async () => {
    try {
      setLoading(true);
      const data = await attendanceApi.getStudentsByMode(eventId);
      setStudents(data);

      // Initialize all local students as present by default
      const initialAttendance = new Map<string, AttendanceStatus>();
      data.local.forEach(student => {
        initialAttendance.set(student.id, 'present');
      });
      setAttendance(initialAttendance);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendance(prev => {
      const newMap = new Map(prev);
      newMap.set(studentId, status);
      return newMap;
    });
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);

      // Convert map to array of records
      const records: AttendanceRecord[] = Array.from(attendance.entries()).map(
        ([studentId, status]) => ({
          studentId,
          status,
        })
      );

      if (records.length === 0) {
        toast.error('No local students to mark attendance for');
        return;
      }

      await attendanceApi.markManualAttendance(eventId, records);
      toast.success('Attendance marked successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to mark attendance');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusButtonClass = (studentId: string, status: AttendanceStatus) => {
    const isSelected = attendance.get(studentId) === status;
    const baseClass = 'px-3 py-1 rounded-md text-sm font-medium transition-all';

    switch (status) {
      case 'present':
        return `${baseClass} ${
          isSelected
            ? 'bg-green-600 text-white shadow-md'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        }`;
      case 'late':
        return `${baseClass} ${
          isSelected
            ? 'bg-yellow-600 text-white shadow-md'
            : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
        }`;
      case 'absent':
        return `${baseClass} ${
          isSelected
            ? 'bg-red-600 text-white shadow-md'
            : 'bg-red-100 text-red-700 hover:bg-red-200'
        }`;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mark Attendance</h2>
            <p className="text-sm text-gray-500 mt-1">{eventTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <LoadingSpinner message="Loading students..." className="py-8" />
          ) : (
            <div className="space-y-6">
              {/* Hybrid Class Warning */}
              {classType === 'hybrid' && (
                <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
                  <p className="text-sm text-purple-800">
                    <strong>Hybrid Class:</strong> Local students are marked manually below. Online students' attendance is auto-synced from Microsoft Teams.
                  </p>
                </div>
              )}

              {/* Local Students Section */}
              {students.local.length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Local Students ({students.local.length})
                  </h3>
                  <div className="space-y-3">
                    {students.local.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {student.firstName} {student.lastName}
                          </div>
                          <div className="text-xs text-gray-500">{student.email}</div>
                        </div>

                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => setStudentStatus(student.id, 'present')}
                            className={getStatusButtonClass(student.id, 'present')}
                          >
                            <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                            Present
                          </button>
                          <button
                            onClick={() => setStudentStatus(student.id, 'late')}
                            className={getStatusButtonClass(student.id, 'late')}
                          >
                            <ClockIcon className="h-4 w-4 inline mr-1" />
                            Late
                          </button>
                          <button
                            onClick={() => setStudentStatus(student.id, 'absent')}
                            className={getStatusButtonClass(student.id, 'absent')}
                          >
                            <XCircleIcon className="h-4 w-4 inline mr-1" />
                            Absent
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No local students enrolled in this class
                </div>
              )}

              {/* Online Students Section (Read-only for hybrid classes) */}
              {classType === 'hybrid' && students.online.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Online Students ({students.online.length})
                  </h3>
                  <div className="space-y-2">
                    {students.online.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {student.firstName} {student.lastName}
                          </div>
                          <div className="text-xs text-gray-500">{student.email}</div>
                        </div>

                        <div className="text-sm text-blue-700 font-medium">
                          Auto-synced from Teams
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              {students.local.length > 0 && (
                <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {Array.from(attendance.values()).filter(s => s === 'present').length}
                      </div>
                      <div className="text-xs text-gray-600">Present</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-yellow-600">
                        {Array.from(attendance.values()).filter(s => s === 'late').length}
                      </div>
                      <div className="text-xs text-gray-600">Late</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">
                        {Array.from(attendance.values()).filter(s => s === 'absent').length}
                      </div>
                      <div className="text-xs text-gray-600">Absent</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || loading || students.local.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Mark Attendance'}
          </button>
        </div>
      </div>
    </div>
  );
}
