import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { calendarApi, Event } from '../api/calendar.api';
import { attendanceApi, StudentAttendanceRecord } from '../api/attendance.api';
import { CheckCircleIcon, XCircleIcon, ClockIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useSortableData } from '../hooks/useSortableData';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import SearchableSelect from '../components/common/SearchableSelect';

export default function Attendance() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // For teachers/admins: recent events
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);

  // For students: own attendance history
  const [studentAttendance, setStudentAttendance] = useState<StudentAttendanceRecord[]>([]);
  const [courseFilter, setCourseFilter] = useState<string>('');

  const isTeacherOrAdmin = hasRole(['teacher', 'admin', 'sudo']);

  useEffect(() => {
    if (isTeacherOrAdmin) {
      fetchRecentEvents();
    } else {
      fetchStudentAttendance();
    }
  }, [courseFilter]);

  const fetchRecentEvents = async () => {
    try {
      setLoading(true);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      const events = await calendarApi.getEvents({
        startDate: thirtyDaysAgo,
        endDate: today,
        status: 'scheduled',
      });

      // Sort by date descending (most recent first)
      events.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());

      setRecentEvents(events);
    } catch (error) {
      console.error('Failed to fetch recent events:', error);
      toast.error('Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentAttendance = async () => {
    try {
      setLoading(true);
      if (!user?.id) return;

      const attendance = await attendanceApi.getStudentAttendance(user.id, {
        courseId: courseFilter || undefined,
      });
      setStudentAttendance(attendance);
    } catch (error) {
      console.error('Failed to fetch student attendance:', error);
      toast.error('Failed to load attendance history');
    } finally {
      setLoading(false);
    }
  };

  // Get unique courses from attendance records
  const uniqueCourses = Array.from(
    new Map(studentAttendance.map(record => [record.course.id, record.course])).values()
  );

  // Calculate overall stats
  const totalClasses = studentAttendance.length;
  const presentCount = studentAttendance.filter(a => a.status === 'present').length;
  const lateCount = studentAttendance.filter(a => a.status === 'late').length;
  const absentCount = studentAttendance.filter(a => a.status === 'absent').length;
  const attendanceRate = totalClasses > 0 ? ((presentCount + lateCount) / totalClasses * 100).toFixed(1) : 0;

  const handleViewAttendance = (eventId: string) => {
    navigate(`/calendar?eventId=${eventId}`);
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

  // Sorting for teacher/admin view
  const { items: sortedRecentEvents, requestSort: requestSortEvents, getSortIndicator: getSortIndicatorEvents } = useSortableData(recentEvents);

  // Sorting for student view
  const { items: sortedStudentAttendance, requestSort: requestSortAttendance, getSortIndicator: getSortIndicatorAttendance } = useSortableData(studentAttendance);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" message="Loading attendance..." />
      </div>
    );
  }

  // Teacher/Admin View
  if (isTeacherOrAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Attendance Management</h1>
              <p className="mt-2 text-sm text-gray-600">
                View and manage attendance for recent classes (last 30 days)
              </p>
            </div>
            <button
              onClick={() => navigate('/settings/teams')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Teams Settings
            </button>
          </div>

          {/* Recent Events Table */}
          {recentEvents.length > 0 ? (
            <div className="bg-white shadow-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th onClick={() => requestSortEvents('eventDate')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Date {getSortIndicatorEvents('eventDate')}
                    </th>
                    <th onClick={() => requestSortEvents('course.title')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Course {getSortIndicatorEvents('course.title')}
                    </th>
                    <th onClick={() => requestSortEvents('startTime')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Time {getSortIndicatorEvents('startTime')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Teams Meeting
                    </th>
                    <th onClick={() => requestSortEvents('attendanceSynced')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Attendance Status {getSortIndicatorEvents('attendanceSynced')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                  {sortedRecentEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(event.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {event.course.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {event.startTime} - {event.endTime}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {event.teamsMeetingId || event.teamsMeetingUrl ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="text-xs">Linked</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <XCircleIcon className="h-4 w-4" />
                            <span className="text-xs">Not linked</span>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {event.attendanceSynced ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <CheckCircleIcon className="h-4 w-4" />
                            Synced
                          </span>
                        ) : event.teamsMeetingId || event.teamsMeetingUrl ? (
                          <span className="text-xs text-yellow-600">Pending sync</span>
                        ) : (
                          <span className="text-xs text-gray-400">No Teams meeting</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleViewAttendance(event.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Attendance
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
                Showing {sortedRecentEvents.length} result{sortedRecentEvents.length !== 1 ? 's' : ''}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={CalendarDaysIcon}
              title="No events found in the last 30 days"
            />
          )}
        </div>
      </div>
    );
  }

  // Student View
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Attendance</h1>
          <p className="mt-2 text-sm text-gray-600">
            View your attendance history across all courses
          </p>
        </div>

        {/* Overall Stats Cards */}
        {studentAttendance.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Total Classes</div>
              <div className="mt-1 text-3xl font-semibold text-gray-900">{totalClasses}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Attendance Rate</div>
              <div className="mt-1 text-3xl font-semibold text-blue-600">{attendanceRate}%</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Present</div>
              <div className="mt-1 text-3xl font-semibold text-green-600">{presentCount}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Absent</div>
              <div className="mt-1 text-3xl font-semibold text-red-600">{absentCount}</div>
            </div>
          </div>
        )}

        {/* Course Filter */}
        {uniqueCourses.length > 1 && (
          <div className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Course
            </label>
            <div className="w-full md:w-64">
              <SearchableSelect
                options={[
                  { value: '', label: 'All Courses' },
                  ...uniqueCourses.map((course) => ({
                    value: course.id,
                    label: `${course.code} - ${course.title}`,
                  })),
                ]}
                value={courseFilter}
                onChange={(v) => setCourseFilter(v)}
                placeholder="All Courses"
                size="sm"
              />
            </div>
          </div>
        )}

        {/* Attendance History */}
        {studentAttendance.length > 0 ? (
          <div className="bg-white shadow-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th onClick={() => requestSortAttendance('event.eventDate')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Date {getSortIndicatorAttendance('event.eventDate')}
                    </th>
                    <th onClick={() => requestSortAttendance('course.title')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Course {getSortIndicatorAttendance('course.title')}
                    </th>
                    <th onClick={() => requestSortAttendance('event.startTime')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Time {getSortIndicatorAttendance('event.startTime')}
                    </th>
                    <th onClick={() => requestSortAttendance('status')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Status {getSortIndicatorAttendance('status')}
                    </th>
                    <th onClick={() => requestSortAttendance('joinedAt')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Joined At {getSortIndicatorAttendance('joinedAt')}
                    </th>
                    <th onClick={() => requestSortAttendance('durationMinutes')} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Duration {getSortIndicatorAttendance('durationMinutes')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                  {sortedStudentAttendance.map((record) => (
                    <tr key={record.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {new Date(record.event.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{record.course.title}</div>
                        <div className="text-xs text-gray-500">{record.course.code}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.event.startTime} - {record.event.endTime}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(record.status)}
                          {getStatusBadge(record.status)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.joinedAt
                          ? new Date(record.joinedAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {record.durationMinutes
                          ? `${Math.floor(record.durationMinutes / 60)}h ${record.durationMinutes % 60}m`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
              Showing {sortedStudentAttendance.length} result{sortedStudentAttendance.length !== 1 ? 's' : ''}
            </div>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <p className="text-gray-500">
              {courseFilter ? 'No attendance records found for the selected course.' : 'No attendance records found.'}
            </p>
            {courseFilter && (
              <button
                onClick={() => setCourseFilter('')}
                className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear filter to see all courses
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
