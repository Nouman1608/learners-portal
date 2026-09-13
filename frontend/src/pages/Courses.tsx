import { useState, useEffect } from 'react';
import { coursesApi, Course } from '../api/courses.api';
import { teacherCourseTitle } from '../utils/course';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { PlusIcon, PencilIcon, ClockIcon, MagnifyingGlassIcon, XMarkIcon, EllipsisVerticalIcon, XCircleIcon, SignalIcon, AcademicCapIcon } from '@heroicons/react/24/outline';
import CourseForm from '../components/courses/CourseForm';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import TimeslotManager from '../components/courses/TimeslotManager';
import CourseActionsModal from '../components/courses/CourseActionsModal';
import { useSortableData } from '../hooks/useSortableData';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function Courses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterClassType, setFilterClassType] = useState<string>('all');
  const [filterTeacher, setFilterTeacher] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [showTimeslotManager, setShowTimeslotManager] = useState(false);
  const [timeslotCourseId, setTimeslotCourseId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [actionsCourse, setActionsCourse] = useState<Course | null>(null);

  const isSudo = user?.role === 'sudo';
  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const isTeacher = user?.role === 'teacher';
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  const canManageCourses = isAdmin || isTeacher;
  const displayTitle = (title: string) => isTeacher ? teacherCourseTitle(title) : title;

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const data = await coursesApi.getCourses(false);
      setCourses(data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenActionsModal = (course: Course) => {
    setActionsCourse(course);
    setShowActionsModal(true);
  };

  const handleToggleStatus = async (course: Course) => {
    const newStatus = !course.isActive;
    const action = newStatus ? 'activate' : 'deactivate';

    const confirmed = await confirmDialog({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} Course`,
      message: `Are you sure you want to ${action} "${displayTitle(course.title)}"?`,
      confirmLabel: action.charAt(0).toUpperCase() + action.slice(1),
      variant: action === 'deactivate' ? 'danger' : 'info',
    });
    if (!confirmed) return;

    try {
      await coursesApi.toggleCourseStatus(course.id, newStatus);
      toast.success(`Course ${action}d successfully`);
      loadCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${action} course`);
    }
  };

  const handleHardDelete = async (course: Course) => {
    const confirmed = await confirmDialog({
      title: 'Permanent Delete',
      message: `This will PERMANENTLY delete "${displayTitle(course.title)}" and:\n• All ${course.studentCount || 0} student enrollments\n• All associated fees and payments\n• All timeslots and calendar events\n• All invoice records\n\nThis action CANNOT be undone!`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const result = await coursesApi.hardDeleteCourse(course.id);
      toast.success(result.message);
      loadCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to permanently delete course');
    }
  };

  const handleDownloadCSV = async (course: Course, resetPasswords: boolean) => {
    try {
      await coursesApi.downloadEnrolledStudentsCSV(course.id, resetPasswords);
      if (resetPasswords) {
        toast.success('CSV downloaded with new passwords! Share credentials securely with students.');
      } else {
        toast.success('Student list CSV downloaded successfully');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to download CSV');
    }
  };

  const handleEndCourse = async (course: Course, endDate: string) => {
    try {
      const result = await coursesApi.endCourse(course.id, endDate);
      toast.success(`Course ended. ${result.affectedEnrollments} enrollment(s) completed.`);
      loadCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to end course');
    }
  };

  const handleFetchMeetingState = async (course: Course) => {
    try {
      toast.loading('Fetching Teams meeting state...', { id: 'meeting-state' });
      const result = await coursesApi.getTeamsMeetingState(course.id);
      toast.dismiss('meeting-state');

      // Display result in console and alert for debugging
      console.log('Teams Meeting State:', result);
      await confirmDialog({
        title: `Teams Meeting State`,
        message: `Course: ${displayTitle(course.title)}\nMeeting ID: ${result.timeslot?.teamsMeetingId || 'N/A'}\nSubject: ${result.meetingState?.subject || 'N/A'}\nStart: ${result.meetingState?.startDateTime || 'N/A'}\nEnd: ${result.meetingState?.endDateTime || 'N/A'}\nJoin URL: ${result.meetingState?.joinUrl || 'N/A'}\n\nFull response logged to console.`,
        confirmLabel: 'OK',
        variant: 'info',
        hideCancel: true,
      });
    } catch (error: any) {
      toast.dismiss('meeting-state');
      toast.error(error.response?.data?.error || 'Failed to fetch meeting state');
      console.error('Meeting state error:', error.response?.data);
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

  const handleBulkDeactivate = async () => {
    if (selectedIds.size === 0) {
      toast.error('No courses selected');
      return;
    }

    const confirmed2 = await confirmDialog({
      title: 'Bulk Deactivate',
      message: `Are you sure you want to deactivate ${selectedIds.size} course(s)?`,
      confirmLabel: 'Deactivate All',
      variant: 'danger',
    });
    if (!confirmed2) return;

    try {
      const promises = Array.from(selectedIds).map(id => {
        const course = courses.find(c => c.id === id);
        if (course?.isActive) {
          return coursesApi.toggleCourseStatus(id, false);
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
      toast.success(`${selectedIds.size} course(s) deactivated successfully`);
      setSelectedIds(new Set());
      loadCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deactivate courses');
    }
  };

  // Get unique teachers across all courses
  const uniqueTeachers = Array.from(
    new Map(
      courses.flatMap(c => c.teachers?.map(t => [t.teacherId, `${t.teacher.firstName} ${t.teacher.lastName}`]) || [])
    )
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Get unique subjects
  const uniqueSubjects = Array.from(
    new Set(courses.map(c => c.subject).filter(Boolean))
  ).sort() as string[];

  const filteredCourses = courses.filter((course) => {
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterActive === 'all' ||
      (filterActive === 'active' && course.isActive) ||
      (filterActive === 'inactive' && !course.isActive);

    const matchesCategory = filterCategory === 'all' || course.courseCategory === filterCategory;

    const matchesLevel = filterLevel === 'all' || course.courseLevel === filterLevel;

    const matchesClassType = filterClassType === 'all' || course.subject === filterClassType;

    const matchesTeacher = filterTeacher === 'all' ||
      (course.teachers && course.teachers.some(t => t.teacherId === filterTeacher));

    // For teachers, only show courses they're assigned to
    const matchesRole = isAdmin ||
      user?.role !== 'teacher' ||
      (course.teachers && course.teachers.some((t: any) => t.teacher.id === user?.id));

    return matchesSearch && matchesFilter && matchesCategory && matchesLevel && matchesClassType && matchesTeacher && matchesRole;
  });

  const { items: sortedCourses, requestSort, getSortIndicator } = useSortableData(filteredCourses);

  if (loading) {
    return <LoadingSpinner message="Loading courses..." className="py-12" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''} {selectedIds.size > 0 && `(${selectedIds.size} selected)`}
          </p>
        </div>
        {canManageCourses && (
          <button
            onClick={handleAdd}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Course
          </button>
        )}
      </div>

      {/* Search and Bulk Actions */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        {/* Search Bar */}
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search courses by title or description..."
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Bulk Actions */}
        {isAdmin && selectedIds.size > 0 && (
          <button
            onClick={handleBulkDeactivate}
            className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm"
          >
            <XCircleIcon className="h-4 w-4 mr-2" />
            Deactivate Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">All Categories</option>
          <option value="senior">Senior</option>
          <option value="junior">Junior</option>
        </select>

        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">All Levels</option>
          <option value="ig">IG</option>
          <option value="alevel">A-Level</option>
        </select>

        {uniqueSubjects.length > 0 && (
          <select
            value={filterClassType}
            onChange={(e) => setFilterClassType(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="all">All Subjects</option>
            {uniqueSubjects.map(subj => (
              <option key={subj} value={subj}>
                {subj.charAt(0).toUpperCase() + subj.slice(1)}
              </option>
            ))}
          </select>
        )}

        {isAdmin && uniqueTeachers.length > 0 && (
          <select
            value={filterTeacher}
            onChange={(e) => setFilterTeacher(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="all">All Teachers</option>
            {uniqueTeachers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        {(searchTerm || filterActive !== 'all' || filterCategory !== 'all' || filterLevel !== 'all' || filterClassType !== 'all' || filterTeacher !== 'all') && (
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterActive('all');
              setFilterCategory('all');
              setFilterLevel('all');
              setFilterClassType('all');
              setFilterTeacher('all');
            }}
            className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Courses Table */}
      {filteredCourses.length === 0 ? (
        <EmptyState
          icon={AcademicCapIcon}
          title={searchTerm || filterActive !== 'all' || filterCategory !== 'all' || filterLevel !== 'all' || filterClassType !== 'all' || filterTeacher !== 'all' ? 'No courses match your filters' : 'No courses found'}
        />
      ) : (
        <div className="bg-white shadow-card rounded-xl overflow-hidden border border-gray-200">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-2 w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredCourses.length && filteredCourses.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th onClick={() => requestSort('title')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Course {getSortIndicator('title')}
                  </th>
                  <th onClick={() => requestSort('duration')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Duration {getSortIndicator('duration')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WhatsApp Group
                  </th>
                  <th onClick={() => requestSort('studentCount')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Students {getSortIndicator('studentCount')}
                  </th>
                  <th onClick={() => requestSort('teacherCount')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Teachers {getSortIndicator('teacherCount')}
                  </th>
                  <th onClick={() => requestSort('isActive')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Status {getSortIndicator('isActive')}
                  </th>
                  {canManageCourses && (
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                {sortedCourses.map((course) => (
                  <tr key={course.id} className={`hover:bg-indigo-50/30 transition-colors ${selectedIds.has(course.id) ? 'bg-indigo-50/50' : ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(course.id)}
                          onChange={() => handleSelectOne(course.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">
                        {displayTitle(course.title)}
                      </div>
                      {course.description && (
                        <div className="text-xs text-gray-500 truncate max-w-md">
                          {course.description}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                      {course.duration} months
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {course.whatsappGroupLink ? (
                        course.teamsLink ? (
                          <button
                            onClick={async () => {
                              const message = `Join the ${displayTitle(course.title)} class on Teams:\n${course.teamsLink}`;
                              await navigator.clipboard.writeText(message);
                              toast.success('Teams link copied! Paste it in the WhatsApp group.');
                              window.open(course.whatsappGroupLink, '_blank');
                            }}
                            className="text-green-600 hover:text-green-800 hover:underline"
                          >
                            Send Teams Link
                          </button>
                        ) : (
                          <a
                            href={course.whatsappGroupLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800 hover:underline"
                          >
                            Join Group
                          </a>
                        )
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                      {course.studentCount || 0}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                      {course.teacherCount || 0}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`text-xs px-2 py-0.5 inline-flex rounded-full ${
                          course.isActive
                            ? 'bg-green-100 text-green-800'
                            : course.endDate
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {course.isActive ? 'Active' : course.endDate ? 'Ended' : 'Inactive'}
                      </span>
                    </td>
                    {canManageCourses && (
                      <td className="px-3 py-2 whitespace-nowrap text-right relative">
                        <div className="flex items-center justify-end gap-1">
                          {isSudo && (
                            <button
                              onClick={() => handleFetchMeetingState(course)}
                              className="p-1.5 text-cyan-600 hover:text-cyan-900 hover:bg-cyan-50 rounded-lg transition-colors"
                              title="Fetch Teams Meeting State"
                            >
                              <SignalIcon className="h-4 w-4" />
                            </button>
                          )}
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
                              onClick={() => handleOpenActionsModal(course)}
                              className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                              title="More actions"
                            >
                              <EllipsisVerticalIcon className="h-5 w-5" />
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

          {/* Mobile Cards */}
          <div className="md:hidden">
            {sortedCourses.map((course) => (
              <div key={course.id} className="p-4 border-b border-gray-200">
                <div className="flex gap-3 items-start mb-2">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(course.id)}
                      onChange={() => handleSelectOne(course.id)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-indigo-500"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-medium text-gray-900">
                        {displayTitle(course.title)}
                      </h3>
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                          course.isActive
                            ? 'bg-green-100 text-green-800'
                            : course.endDate
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {course.isActive ? 'Active' : course.endDate ? 'Ended' : 'Inactive'}
                      </span>
                    </div>
                    {course.description && (
                      <p className="text-sm text-gray-500 mt-1">
                        {course.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm mt-3">
                  <div>
                    <span className="text-gray-500">Duration:</span>
                    <span className="ml-1 text-gray-900">
                      {course.duration} months
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Students:</span>
                    <span className="ml-1 text-gray-900">
                      {course.studentCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Teachers:</span>
                    <span className="ml-1 text-gray-900">
                      {course.teacherCount || 0}
                    </span>
                  </div>
                </div>
                {course.whatsappGroupLink && (
                  <div className="mt-3">
                    {course.teamsLink ? (
                      <button
                        onClick={async () => {
                          const message = `Join the ${displayTitle(course.title)} class on Teams:\n${course.teamsLink}`;
                          await navigator.clipboard.writeText(message);
                          toast.success('Teams link copied! Paste it in the WhatsApp group.');
                          window.open(course.whatsappGroupLink, '_blank');
                        }}
                        className="inline-flex items-center text-sm text-green-600 hover:text-green-800 hover:underline"
                      >
                        Send Teams Link
                      </button>
                    ) : (
                      <a
                        href={course.whatsappGroupLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-green-600 hover:text-green-800 hover:underline"
                      >
                        WhatsApp Group
                      </a>
                    )}
                  </div>
                )}
                {canManageCourses && (
                  <div className="space-y-2 mt-4">
                    {isSudo && (
                      <button
                        onClick={() => handleFetchMeetingState(course)}
                        className="w-full inline-flex items-center justify-center px-3 py-2 bg-cyan-50 text-cyan-700 rounded-lg hover:bg-cyan-100 transition-colors"
                      >
                        <SignalIcon className="h-4 w-4 mr-2" />
                        Fetch Meeting State
                      </button>
                    )}
                    <button
                      onClick={() => handleManageTimeslots(course.id)}
                      className="w-full inline-flex items-center justify-center px-3 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                      <ClockIcon className="h-4 w-4 mr-2" />
                      Manage Timeslots
                    </button>
                    <button
                      onClick={() => handleEdit(course)}
                      className="w-full inline-flex items-center justify-center px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <PencilIcon className="h-4 w-4 mr-2" />
                      Edit Course
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleOpenActionsModal(course)}
                        className="w-full inline-flex items-center justify-center px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <EllipsisVerticalIcon className="h-4 w-4 mr-2" />
                        More Actions
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
            Showing {sortedCourses.length} result{sortedCourses.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

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

      {/* Course Actions Modal */}
      {showActionsModal && actionsCourse && (
        <CourseActionsModal
          course={actionsCourse}
          isOpen={showActionsModal}
          onClose={() => {
            setShowActionsModal(false);
            setActionsCourse(null);
          }}
          onToggleStatus={handleToggleStatus}
          onHardDelete={handleHardDelete}
          onDownloadCSV={handleDownloadCSV}
          onEndCourse={handleEndCourse}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
