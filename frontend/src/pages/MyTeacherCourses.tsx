import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { coursesApi, Course } from '../api/courses.api';
import { teacherCourseTitle } from '../utils/course';
import toast from 'react-hot-toast';
import {
  AcademicCapIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  Squares2X2Icon,
  TableCellsIcon,
  XMarkIcon,
  ClipboardIcon
} from '@heroicons/react/24/outline';
import CourseForm from '../components/courses/CourseForm';
import TimeslotManager from '../components/courses/TimeslotManager';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

type ViewMode = 'cards' | 'table';

const MyTeacherCourses: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [showForm, setShowForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showTimeslotManager, setShowTimeslotManager] = useState(false);
  const [timeslotCourseId, setTimeslotCourseId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const canManageCourses = isAdmin || user?.role === 'teacher';

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [searchQuery, courses, filterActive]);

  const loadCourses = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      // Fetch all courses (pass false to get all courses, not just active ones)
      const allCourses = await coursesApi.getCourses(false);

      // For teachers, filter to only show courses they teach
      // For admins, show all courses
      const teacherCourses = isAdmin
        ? allCourses
        : allCourses.filter(course =>
            course.teachers?.some(t => t.teacher.id === user.id)
          );

      setCourses(teacherCourses);
      setFilteredCourses(teacherCourses);
    } catch (error: any) {
      console.error('Error loading courses:', error);
      toast.error(error.response?.data?.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = [...courses];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(course =>
        course.title.toLowerCase().includes(query) ||
        course.description?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filterActive !== 'all') {
      filtered = filtered.filter(course =>
        filterActive === 'active' ? course.isActive : !course.isActive
      );
    }

    setFilteredCourses(filtered);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete Course',
      message: 'Are you sure you want to delete this course?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await coursesApi.deleteCourse(id);
      toast.success('Course deleted successfully');
      loadCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete course');
    }
  };

  const handleEdit = (course: Course) => {
    setSelectedCourse(course);
    setShowForm(true);
  };

  const handleAdd = () => {
    setSelectedCourse(null);
    setShowForm(true);
  };

  const handleManageTimeslots = (courseId: string) => {
    setTimeslotCourseId(courseId);
    setShowTimeslotManager(true);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredCourses.length && filteredCourses.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCourses.map(c => c.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error('No courses selected');
      return;
    }

    const confirmedBulk = await confirmDialog({
      title: 'Bulk Delete Courses',
      message: `Are you sure you want to delete ${selectedIds.size} course(s)?`,
      confirmLabel: 'Delete All',
      variant: 'danger',
    });
    if (!confirmedBulk) return;

    try {
      const promises = Array.from(selectedIds).map(id => coursesApi.deleteCourse(id));
      await Promise.all(promises);
      toast.success(`${selectedIds.size} course(s) deleted successfully`);
      setSelectedIds(new Set());
      loadCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete courses');
    }
  };

  const getCourseStatusColor = (isActive: boolean) => {
    return isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
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
      case 'local':
        return 'bg-green-100 text-green-800';
      case 'hybrid':
        return 'bg-purple-100 text-purple-800';
      case '1-to-1':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCourseClick = (courseId: string) => {
    navigate(`/enrollments?courseId=${courseId}`);
  };

  if (loading) {
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isAdmin ? 'All Courses' : 'My Teaching Courses'}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
                {selectedIds.size > 0 && ` (${selectedIds.size} selected)`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded ${
                    viewMode === 'cards'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Card View"
                >
                  <Squares2X2Icon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded ${
                    viewMode === 'table'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Table View"
                >
                  <TableCellsIcon className="h-5 w-5" />
                </button>
              </div>

              {canManageCourses && (
                <button
                  onClick={handleAdd}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="h-5 w-5 mr-2" />
                  Add Course
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Courses</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{courses.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Active</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {courses.filter((c) => c.isActive).length}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Students</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {courses.reduce((sum, c) => sum + (c.studentCount || 0), 0)}
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses by name or description..."
              className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>

          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          {/* Bulk Delete Button */}
          {isAdmin && selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete ({selectedIds.size})
            </button>
          )}
        </div>

        {/* Clear Filters */}
        {(searchQuery || filterActive !== 'all') && (
          <div className="mb-4">
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterActive('all');
              }}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear all filters
            </button>
          </div>
        )}

        {/* Courses List - Card View */}
        {viewMode === 'cards' ? (
          filteredCourses.length === 0 ? (
            <EmptyState
              icon={AcademicCapIcon}
              title={searchQuery || filterActive !== 'all'
                ? 'No courses found matching your search'
                : isAdmin
                ? 'No courses created yet'
                : 'You are not assigned to any courses yet'}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => (
                <div
                  key={course.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-all relative"
                >
                  {/* Selection checkbox for admins */}
                  {isAdmin && (
                    <div className="absolute top-4 left-4 z-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(course.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectOne(course.id);
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </div>
                  )}

                  <div className={`p-6 ${isAdmin ? 'pl-12' : ''}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => handleCourseClick(course.id)}
                      >
                        <h3 className="text-lg font-semibold text-gray-900 mb-1 hover:text-blue-600">
                          {teacherCourseTitle(course.title)}
                        </h3>
                        {course.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{course.description}</p>
                        )}
                      </div>
                      <div className="ml-3">
                        <AcademicCapIcon className="h-5 w-5 text-blue-600" />
                      </div>
                    </div>

                    <div className="mb-4 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCourseStatusColor(course.isActive)}`}>
                        {course.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {course.courseLevel && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {course.courseLevel.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="pt-4 border-t border-gray-200 space-y-3">
                      {/* Course Info */}
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-500">
                          <ClockIcon className="h-4 w-4 mr-2" />
                          <span>{course.duration} months duration</span>
                        </div>
                        <div className="text-sm text-gray-500">
                          <span className="font-medium">Students:</span> {course.studentCount || 0}
                        </div>
                        {course.teachers && course.teachers.length > 0 && (
                          <div className="text-sm text-gray-500">
                            <span className="font-medium">Teachers:</span> {course.teachers.length}
                          </div>
                        )}
                      </div>

                      {/* Timeslots */}
                      {course.timeslots && course.timeslots.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-700 uppercase">Class Schedule</p>
                          {course.timeslots.slice(0, 3).map((timeslot, index) => (
                            <div key={index} className="flex items-center justify-between text-xs bg-gray-50 rounded p-2">
                              <div className="flex-1">
                                <span className="font-medium text-gray-900">
                                  {timeslot.daysOfWeek?.map(day => getDayName(day)).join(', ') || 'N/A'}
                                </span>
                                <span className="text-gray-600 ml-2">
                                  {formatTime(timeslot.startTime)} - {formatTime(timeslot.endTime)}
                                </span>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getClassTypeColor(timeslot.classType)}`}>
                                {timeslot.classType}
                              </span>
                            </div>
                          ))}
                          {course.timeslots.length > 3 && (
                            <p className="text-xs text-gray-500 text-center">
                              +{course.timeslots.length - 3} more timeslot{course.timeslots.length - 3 > 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Teams Link - Copy to Clipboard */}
                      {course.teamsLink && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (course.teamsLink) {
                              navigator.clipboard.writeText(course.teamsLink);
                              toast.success('Teams meeting link copied to clipboard');
                            }
                          }}
                          className="flex items-center text-sm text-blue-600 hover:text-blue-800"
                        >
                          <ClipboardIcon className="h-4 w-4 mr-2" />
                          Copy Teams Link
                        </button>
                      )}

                      {/* WhatsApp Link - Copy Teams link when clicking */}
                      {course.whatsappGroupLink && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            // Copy Teams link if available
                            if (course.teamsLink) {
                              const message = `Join the ${course.title} class on Teams:\n${course.teamsLink}`;
                              await navigator.clipboard.writeText(message);
                              toast.success('Teams link copied! Paste it in the WhatsApp group.');
                            }
                            window.open(course.whatsappGroupLink, '_blank');
                          }}
                          className="flex items-center text-sm text-green-600 hover:text-green-800 hover:underline"
                        >
                          <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                          </svg>
                          {course.teamsLink ? 'Send Teams Link' : 'Join WhatsApp Group'}
                        </button>
                      )}

                      {/* Action Buttons */}
                      {canManageCourses && (
                        <div className="pt-3 border-t border-gray-200 flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleManageTimeslots(course.id);
                            }}
                            className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm text-purple-700 bg-purple-50 rounded hover:bg-purple-100"
                            title="Manage Timeslots"
                          >
                            <ClockIcon className="h-4 w-4 mr-1" />
                            Timeslots
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(course);
                            }}
                            className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                            title="Edit Course"
                          >
                            <PencilIcon className="h-4 w-4 mr-1" />
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(course.id);
                              }}
                              className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm text-red-700 bg-red-50 rounded hover:bg-red-100"
                              title="Delete Course"
                            >
                              <TrashIcon className="h-4 w-4 mr-1" />
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Table View */
          filteredCourses.length === 0 ? (
            <EmptyState
              icon={AcademicCapIcon}
              title={searchQuery || filterActive !== 'all'
                ? 'No courses found matching your search'
                : isAdmin
                ? 'No courses created yet'
                : 'You are not assigned to any courses yet'}
            />
          ) : (
            <div className="bg-white shadow-card rounded-xl overflow-hidden border border-gray-200">
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                    <tr>
                      {isAdmin && (
                        <th className="px-3 py-3 w-12">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === filteredCourses.length && filteredCourses.length > 0}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </th>
                      )}
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Course
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Students
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Teachers
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      {canManageCourses && (
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                    {filteredCourses.map((course) => (
                      <tr
                        key={course.id}
                        className={`hover:bg-indigo-50/30 cursor-pointer transition-colors ${selectedIds.has(course.id) ? 'bg-indigo-50/50' : ''}`}
                        onClick={() => handleCourseClick(course.id)}
                      >
                        {isAdmin && (
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(course.id)}
                              onChange={() => handleSelectOne(course.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {teacherCourseTitle(course.title)}
                          </div>
                          {course.description && (
                            <div className="text-xs text-gray-500 truncate max-w-md">
                              {course.description}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {course.duration} months
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {course.studentCount || 0}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-900">
                          {course.teacherCount || 0}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`text-xs px-2 py-0.5 inline-flex rounded-full ${
                              course.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {course.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {canManageCourses && (
                          <td className="px-3 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleManageTimeslots(course.id)}
                                className="p-1.5 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors"
                                title="Manage Timeslots"
                              >
                                <ClockIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleEdit(course)}
                                className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit Course"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDelete(course.id)}
                                  className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete Course"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
                Showing {filteredCourses.length} result{filteredCourses.length !== 1 ? 's' : ''}
              </div>
            </div>
          )
        )}
      </main>

      {/* Course Form Modal */}
      {showForm && (
        <CourseForm
          course={selectedCourse}
          onClose={() => {
            setShowForm(false);
            setSelectedCourse(null);
          }}
          onSuccess={loadCourses}
        />
      )}

      {/* Timeslot Manager Modal */}
      {showTimeslotManager && timeslotCourseId && (
        <TimeslotManager
          courseId={timeslotCourseId}
          onClose={() => {
            setShowTimeslotManager(false);
            setTimeslotCourseId(null);
          }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default MyTeacherCourses;
