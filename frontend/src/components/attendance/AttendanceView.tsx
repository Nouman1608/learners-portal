import { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, ClockIcon, ArrowPathIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { attendanceApi, AttendanceRecord } from '../../api/attendance.api';
import { Event } from '../../api/calendar.api';
import toast from 'react-hot-toast';
import ManualAttendanceForm from './ManualAttendanceForm';
import LoadingSpinner from '../common/LoadingSpinner';

interface AttendanceViewProps {
  event: Event;
  canSync?: boolean; // Teachers can manually trigger sync
}

export default function AttendanceView({ event, canSync = false }: AttendanceViewProps) {
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    fetchAttendance();
  }, [event.id]);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const data = await attendanceApi.getEventAttendance(event.id);
      setAttendance(data);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const result = await attendanceApi.syncEventAttendance(event.id);

      if (result.success) {
        toast.success(result.message);
        await fetchAttendance(); // Refresh data after sync
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      console.error('Failed to sync attendance:', error);
      toast.error(error.response?.data?.message || 'Failed to sync attendance from Teams');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'present':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'late':
        return <ClockIcon className="h-5 w-5 text-yellow-600" />;
      case 'absent':
        return <XCircleIcon className="h-5 w-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'present':
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>Present</span>;
      case 'late':
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Late</span>;
      case 'absent':
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>Absent</span>;
      default:
        return null;
    }
  };

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatTime = (dateString?: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <LoadingSpinner message="Loading attendance..." className="py-8" />
    );
  }

  const hasTeamsMeeting = !!event.teamsMeetingId || !!event.teamsMeetingUrl;
  const isSynced = event.attendanceSynced;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Attendance</h3>
          {isSynced && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <CheckCircleIcon className="h-4 w-4" />
              Synced from Teams
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {/* Mark Manual Attendance for local/hybrid classes */}
          {canSync && ((event as any).classType === 'local' || (event as any).classType === 'hybrid') && (
            <button
              onClick={() => setShowManualForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <PencilSquareIcon className="h-5 w-5" />
              Mark Attendance
            </button>
          )}

          {canSync && hasTeamsMeeting && !isSynced && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <ArrowPathIcon className="h-5 w-5" />
                Sync Attendance
              </>
            )}
          </button>
        )}

        {canSync && hasTeamsMeeting && isSynced && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Re-syncing...
              </>
            ) : (
              <>
                <ArrowPathIcon className="h-5 w-5" />
                Re-sync
              </>
            )}
          </button>
        )}
        </div>
      </div>

      {/* No Teams Meeting Warning */}
      {!hasTeamsMeeting && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-sm text-yellow-800">
            This event does not have a Microsoft Teams meeting linked. Attendance cannot be automatically synced.
          </p>
        </div>
      )}

      {/* Attendance Table */}
      {attendance.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Participant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Left At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attendance.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {getStatusIcon(record.status)}
                      <div className="ml-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {record.student?.firstName} {record.student?.lastName}
                          </span>
                          {record.role === 'teacher' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                              Teacher
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{record.student?.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(record.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(record.joinedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatTime(record.leftAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDuration(record.durationMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary Stats — students only */}
          {(() => {
            const studentRecords = attendance.filter(a => a.role !== 'teacher');
            const absentCount = studentRecords.filter(a => a.status === 'absent').length;
            const lateCount = studentRecords.filter(a => a.status === 'late').length;
            const presentCount = studentRecords.filter(a => a.status === 'present').length;
            return (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{presentCount}</div>
                  <div className="text-sm text-gray-600">Present</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{lateCount}</div>
                  <div className="text-sm text-gray-600">Late</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{absentCount}</div>
                  <div className="text-sm text-gray-600">Absent</div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-500">
            {hasTeamsMeeting
              ? 'No attendance records yet. Click "Sync Attendance" to fetch from Teams.'
              : 'No attendance records available.'}
          </p>
        </div>
      )}

      {/* Manual Attendance Form Modal */}
      {showManualForm && (
        <ManualAttendanceForm
          eventId={event.id}
          eventTitle={event.title || `Event on ${event.eventDate}`}
          classType={(event as any).classType || 'local'}
          onClose={() => setShowManualForm(false)}
          onSuccess={() => {
            fetchAttendance(); // Refresh attendance after marking
          }}
        />
      )}
    </div>
  );
}
