import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalApi, StudentOverview, CourseTimeslot } from '../api/student-portal.api';
import { studentCourseTitle } from '../utils/course';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { AcademicCapIcon, CheckCircleIcon, ClockIcon, VideoCameraIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

const MyCourses: React.FC = () => {
  const { user } = useAuth();
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [filteredCourses, setFilteredCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [searchQuery, overview]);

  const loadCourses = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await studentPortalApi.getStudentOverview(user.id);
      setOverview(data);
      setFilteredCourses(data.courses);
    } catch (error: any) {
      console.error('Error loading courses:', error);
      toast.error(error.response?.data?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const filterCourses = () => {
    if (!overview) return;

    if (!searchQuery.trim()) {
      setFilteredCourses(overview.courses);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = overview.courses.filter(course =>
      course.courseTitle.toLowerCase().includes(query)
    );
    setFilteredCourses(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'dropped':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'completed':
        return <AcademicCapIcon className="h-5 w-5 text-blue-600" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || 'Unknown';
  };

  const formatTime = (time: string) => {
    try {
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return time;
    }
  };

  const getClassTypeColor = (classType: string) => {
    switch (classType.toLowerCase()) {
      case 'online':
        return 'bg-blue-100 text-blue-800';
      case 'physical':
        return 'bg-green-100 text-green-800';
      case 'hybrid':
        return 'bg-purple-100 text-purple-800';
      case '1-to-1':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading your courses..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Courses</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Courses</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{overview?.courses.length || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Active</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {overview?.courses.filter((c) => c.status === 'active').length || 0}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Completed</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {overview?.courses.filter((c) => c.status === 'completed').length || 0}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses by name..."
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm"
            />
          </div>
        </div>

        {/* Courses List */}
        {filteredCourses.length === 0 ? (
          <EmptyState
            icon={AcademicCapIcon}
            title={searchQuery ? 'No courses found matching your search' : 'You are not enrolled in any courses yet'}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <div key={course.courseId} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{studentCourseTitle(course.courseTitle, course.courseSubject)}</h3>
                    </div>
                    <div className="ml-3">
                      {getStatusIcon(course.status)}
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(course.status)}`}>
                      {course.status}
                    </span>
                  </div>

                  <div className="pt-4 border-t border-gray-200 space-y-3">
                    <div className="flex items-center text-sm text-gray-500">
                      <ClockIcon className="h-4 w-4 mr-2" />
                      <span>Enrolled {format(new Date(course.enrolledAt), 'MMM dd, yyyy')}</span>
                    </div>

                    {/* Timeslots */}
                    {course.timeslots && course.timeslots.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-700 uppercase">Class Schedule</p>
                        {course.timeslots.map((timeslot: CourseTimeslot) => (
                          <div key={timeslot.id} className="flex items-center justify-between text-xs bg-gray-50 rounded p-2">
                            <div className="flex-1">
                              <span className="font-medium text-gray-900">{getDayName(timeslot.dayOfWeek)}</span>
                              <span className="text-gray-600 ml-2">
                                {formatTime(timeslot.startTime)} - {formatTime(timeslot.endTime)}
                              </span>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getClassTypeColor(timeslot.classType)}`}>
                              {timeslot.classType}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Teams Link */}
                    {course.teamsLink && (
                      <a
                        href={course.teamsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <VideoCameraIcon className="h-4 w-4 mr-2" />
                        Join Teams Meeting
                      </a>
                    )}

                    {/* WhatsApp Link */}
                    {course.whatsappGroupLink && (
                      <a
                        href={course.whatsappGroupLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-sm text-green-600 hover:text-green-800 hover:underline"
                      >
                        <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        Join WhatsApp Group
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyCourses;
