import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { assessmentsApi, Assessment } from '../api/assessments.api';
import { coursesApi, Course } from '../api/courses.api';
import { usersApi, User } from '../api/users.api';
import AssessmentForm from '../components/assessments/AssessmentForm';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { FunnelIcon, XMarkIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import SearchableSelect from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const Assessments: React.FC = () => {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [allAssessments, setAllAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);

  // Filter states
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');
  const [selectedTeacher, setSelectedTeacher] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  useEffect(() => {
    loadAssessments();
    loadCourses();
    if (isAdmin) {
      loadTeachers();
    }
  }, []);

  useEffect(() => {
    applyFilters();
  }, [allAssessments, selectedCourse, selectedTeacher, selectedStatus, showInactive]);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      const fetchedAssessments = await assessmentsApi.getAssessments();
      setAllAssessments(fetchedAssessments);
    } catch (error: any) {
      console.error('Error loading assessments:', error);
      toast.error(error.response?.data?.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const loadCourses = async () => {
    try {
      const fetchedCourses = await coursesApi.getCourses(true);
      setCourses(fetchedCourses);
    } catch (error: any) {
      console.error('Error loading courses:', error);
    }
  };

  const loadTeachers = async () => {
    try {
      const fetchedTeachers = await usersApi.getUsersByRole('teacher');
      setTeachers(fetchedTeachers);
    } catch (error: any) {
      console.error('Error loading teachers:', error);
    }
  };

  const getAssessmentStatus = (assessment: Assessment) => {
    const now = new Date();
    const start = new Date(assessment.startTime);
    const end = new Date(assessment.endTime);

    if (now < start) {
      return { label: 'Upcoming', color: 'bg-yellow-100 text-yellow-800', value: 'upcoming' };
    } else if (now >= start && now <= end) {
      return { label: 'Active', color: 'bg-green-100 text-green-800', value: 'active' };
    } else {
      return { label: 'Ended', color: 'bg-gray-100 text-gray-800', value: 'ended' };
    }
  };

  const applyFilters = () => {
    let filtered = [...allAssessments];

    // Filter by active status
    if (!showInactive) {
      filtered = filtered.filter(a => a.isActive);
    }

    // Filter by course
    if (selectedCourse !== 'all') {
      filtered = filtered.filter(a => a.courseId === selectedCourse);
    }

    // Filter by teacher
    if (selectedTeacher !== 'all') {
      filtered = filtered.filter(a => a.teacherId === selectedTeacher);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(a => {
        const status = getAssessmentStatus(a);
        return status.value === selectedStatus;
      });
    }

    setAssessments(filtered);
  };

  const clearFilters = () => {
    setSelectedCourse('all');
    setSelectedTeacher('all');
    setSelectedStatus('all');
    setShowInactive(false);
  };

  const hasActiveFilters =
    selectedCourse !== 'all' ||
    selectedTeacher !== 'all' ||
    selectedStatus !== 'all' ||
    showInactive;

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: 'Delete Assessment',
      message: 'Are you sure you want to delete this assessment?',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await assessmentsApi.deleteAssessment(id);
      toast.success('Assessment deleted successfully');
      loadAssessments();
    } catch (error: any) {
      console.error('Error deleting assessment:', error);
      toast.error(error.response?.data?.message || 'Failed to delete assessment');
    }
  };

  if (loading && allAssessments.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading assessments..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Assessments</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 rounded-md transition inline-flex items-center gap-2 ${
                  hasActiveFilters
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                <FunnelIcon className="h-5 w-5" />
                Filters
                {hasActiveFilters && (
                  <span className="bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {[selectedCourse !== 'all', selectedTeacher !== 'all', selectedStatus !== 'all', showInactive].filter(Boolean).length}
                  </span>
                )}
              </button>
              {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'sudo') && (
                <button
                  onClick={() => {
                    setEditingAssessment(null);
                    setShowForm(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                  Create Assessment
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Clear All
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Course Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Course
                </label>
                <div className="w-full">
                  <SearchableSelect
                    options={[
                      { value: 'all', label: 'All Courses' },
                      ...courses.map((course) => ({
                        value: course.id,
                        label: course.title,
                      })),
                    ]}
                    value={selectedCourse}
                    onChange={(v) => setSelectedCourse(v || 'all')}
                    placeholder="All Courses"
                    size="sm"
                  />
                </div>
              </div>

              {/* Teacher Filter (Admin only) */}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Teacher
                  </label>
                  <div className="w-full">
                    <SearchableSelect
                      options={[
                        { value: 'all', label: 'All Teachers' },
                        ...teachers.map((teacher) => ({
                          value: teacher.id,
                          label: `${teacher.firstName} ${teacher.lastName}`,
                        })),
                      ]}
                      value={selectedTeacher}
                      onChange={(v) => setSelectedTeacher(v || 'all')}
                      placeholder="All Teachers"
                      size="sm"
                    />
                  </div>
                </div>
              )}

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="ended">Ended</option>
                </select>
              </div>

              {/* Show Inactive Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Show Inactive
                </label>
                <div className="flex items-center h-10">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm text-gray-600">
                    Include inactive assessments
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        {hasActiveFilters && (
          <div className="mb-4 text-sm text-gray-600">
            Showing {assessments.length} of {allAssessments.length} assessments
          </div>
        )}

        {/* Assessments List */}
        {assessments.length === 0 ? (
          <EmptyState
            icon={ClipboardDocumentCheckIcon}
            title={allAssessments.length === 0 ? 'No assessments found' : 'No assessments match your filters'}
            action={
              allAssessments.length === 0 && (user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'sudo')
                ? { label: 'Create Your First Assessment', onClick: () => { setEditingAssessment(null); setShowForm(true); } }
                : allAssessments.length > 0 && hasActiveFilters
                ? { label: 'Clear Filters', onClick: clearFilters }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assessments.map((assessment) => {
              const status = getAssessmentStatus(assessment);
              return (
                <div key={assessment.id} className="bg-white rounded-lg shadow hover:shadow-md transition">
                  <div className="p-6">
                    {/* Status Badge */}
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                      {!assessment.isActive && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{assessment.title}</h3>

                    {/* Description */}
                    {assessment.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{assessment.description}</p>
                    )}

                    {/* Course */}
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Course:</span> {assessment.course.title}
                    </p>

                    {/* Teacher */}
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Teacher:</span> {assessment.teacher.firstName}{' '}
                      {assessment.teacher.lastName}
                    </p>

                    {/* Max Score */}
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Max Score:</span> {assessment.maxScore}
                    </p>

                    {/* Start Time */}
                    <p className="text-sm text-gray-600 mb-1">
                      <span className="font-medium">Start:</span>{' '}
                      {format(new Date(assessment.startTime), 'PPp')}
                    </p>

                    {/* End Time */}
                    <p className="text-sm text-gray-600 mb-4">
                      <span className="font-medium">End:</span>{' '}
                      {format(new Date(assessment.endTime), 'PPp')}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-2 border-t pt-4">
                      {(user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'sudo') ? (
                        <>
                          <a
                            href={`/assessments/${assessment.id}/grade`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition text-sm text-center"
                          >
                            Grade
                          </a>
                          <button
                            onClick={() => {
                              setEditingAssessment(assessment);
                              setShowForm(true);
                            }}
                            className="px-3 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(assessment.id)}
                            className="px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition text-sm"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <a
                          href={`/assessments/${assessment.id}/take`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm text-center"
                        >
                          Take Assessment
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Assessment Form Modal */}
      {showForm && (
        <AssessmentForm
          assessment={editingAssessment || undefined}
          onClose={() => {
            setShowForm(false);
            setEditingAssessment(null);
          }}
          onSuccess={() => {
            loadAssessments();
          }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default Assessments;
