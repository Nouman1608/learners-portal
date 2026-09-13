import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { enrollmentsApi, Enrollment, CurrencyCode } from '../api/enrollments.api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon, PencilIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import EnrollmentForm from '../components/enrollments/EnrollmentForm';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import DropEnrollmentModal from '../components/enrollments/DropEnrollmentModal';
import EditEnrollmentFeeModal from '../components/enrollments/EditEnrollmentFeeModal';
import { useSortableData } from '../hooks/useSortableData';
import ConfirmDialog from '../components/common/ConfirmDialog';
import SearchableSelect from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function Enrollments() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [filteredEnrollments, setFilteredEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed' | 'dropped'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCourse, setFilterCourse] = useState<string>(searchParams.get('courseId') || '');
  const [filterTeacher, setFilterTeacher] = useState<string>('');
  const [filterStudent, setFilterStudent] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [enrollmentToDrop, setEnrollmentToDrop] = useState<Enrollment | null>(null);
  const [enrollmentToEditFee, setEnrollmentToEditFee] = useState<Enrollment | null>(null);
  const [editingEnrolledAt, setEditingEnrolledAt] = useState<string | null>(null); // enrollment ID being edited
  const [editingDroppedAt, setEditingDroppedAt] = useState<string | null>(null); // enrollment ID whose drop date is being edited

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  const isSudo = user?.role === 'sudo';
  const isTeacher = user?.role === 'teacher';
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  // Helper function to format phone number for WhatsApp
  const formatWhatsAppNumber = (phone: string) => {
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
  };

  // Helper function to get currency symbol
  const getCurrencySymbol = (currency: CurrencyCode): string => {
    const symbols: Record<CurrencyCode, string> = {
      PKR: 'Rs',
      USD: '$',
      GBP: '£',
      SAR: 'SR',
    };
    return symbols[currency] || 'Rs';
  };

  // Helper function to format amount with currency
  const formatAmount = (amount: string, currency: CurrencyCode): string => {
    const symbol = getCurrencySymbol(currency);
    const numAmount = parseFloat(amount);
    return `${symbol} ${numAmount.toLocaleString()}`;
  };

  useEffect(() => {
    loadEnrollments();
  }, [filterStatus]);

  useEffect(() => {
    // Filter enrollments based on search query and filters
    let filtered = enrollments;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((enrollment) => {
        const studentName = `${enrollment.student.firstName} ${enrollment.student.lastName}`.toLowerCase();
        const studentEmail = enrollment.student.email.toLowerCase();
        const courseName = enrollment.course.title.toLowerCase();
        return studentName.includes(query) || studentEmail.includes(query) || courseName.includes(query);
      });
    }

    // Apply course filter
    if (filterCourse) {
      filtered = filtered.filter((enrollment) => enrollment.course.id === filterCourse);
    }

    // Apply teacher filter
    if (filterTeacher) {
      filtered = filtered.filter((enrollment) =>
        enrollment.course.teachers?.some(t => t.id === filterTeacher)
      );
    }

    // Apply student filter
    if (filterStudent) {
      filtered = filtered.filter((enrollment) => enrollment.student.id === filterStudent);
    }

    setFilteredEnrollments(filtered);
  }, [searchQuery, filterCourse, filterTeacher, filterStudent, enrollments]);

  const loadEnrollments = async () => {
    try {
      setLoading(true);
      const filters = filterStatus === 'all' ? {} : { status: filterStatus };
      const data = await enrollmentsApi.getEnrollments(filters);
      setEnrollments(data);
      setSelectedIds(new Set()); // Clear selection on reload
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load enrollments');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEnrolledAt = async (enrollmentId: string, newDate: string) => {
    try {
      await enrollmentsApi.updateEnrollment(enrollmentId, { enrolledAt: newDate });
      toast.success('Enrollment date updated');
      setEditingEnrolledAt(null);
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update enrollment date');
    }
  };

  const handleUpdateDroppedAt = async (enrollmentId: string, newDate: string) => {
    try {
      await enrollmentsApi.updateEnrollment(enrollmentId, { droppedAt: newDate });
      toast.success('Drop date updated');
      setEditingDroppedAt(null);
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update drop date');
    }
  };

  const handleDelete = async (id: string) => {
    // Show the modal to collect return information before dropping
    const enrollment = enrollments.find(e => e.id === id);
    if (enrollment) {
      setEnrollmentToDrop(enrollment);
    }
  };

  const handleHardDelete = async (id: string) => {
    const enrollment = enrollments.find(e => e.id === id);
    if (!enrollment) return;

    const studentName = `${enrollment.student.firstName} ${enrollment.student.lastName}`;
    const courseName = enrollment.course.title;

    const confirmed = await confirmDialog({
      title: 'Permanent Delete',
      message: `This will PERMANENTLY delete the enrollment for:\nStudent: ${studentName}\nCourse: ${courseName}\n\n• Delete all associated fees\n• Delete all payments\n• Regenerate invoices for affected periods\n• CANNOT BE UNDONE`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const result = await enrollmentsApi.hardDeleteEnrollment(id);
      toast.success(
        `Enrollment permanently deleted. ` +
        `${result.details.feesDeleted} fees removed, ` +
        `${result.details.feesRegenerated} fees regenerated.`
      );
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete enrollment');
    }
  };

  const handleStatusChange = async (id: string, status: 'active' | 'completed' | 'dropped') => {
    // If changing to dropped, show the modal to collect return information
    if (status === 'dropped') {
      const enrollment = enrollments.find(e => e.id === id);
      if (enrollment) {
        setEnrollmentToDrop(enrollment);
        return; // Don't update yet, wait for modal confirmation
      }
    }

    // For other status changes, update directly
    try {
      await enrollmentsApi.updateEnrollment(id, { status });
      toast.success('Enrollment status updated');
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update status');
    }
  };

  const handleConfirmDrop = async (willReturn: boolean, tentativeReturnDate?: string) => {
    if (!enrollmentToDrop) return;

    try {
      await enrollmentsApi.updateEnrollment(enrollmentToDrop.id, {
        status: 'dropped',
        willReturnAfterDrop: willReturn,
        tentativeReturnDate: tentativeReturnDate || undefined,
      });
      toast.success('Student enrollment dropped successfully');
      setEnrollmentToDrop(null);
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to drop enrollment');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEnrollments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEnrollments.map(e => e.id)));
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
      toast.error('No enrollments selected');
      return;
    }

    const confirmedBulk = await confirmDialog({
      title: 'Bulk Drop Enrollments',
      message: `Are you sure you want to drop ${selectedIds.size} enrollment(s)? Return tracking will not be collected for bulk operations.`,
      confirmLabel: 'Drop All',
      variant: 'danger',
    });
    if (!confirmedBulk) return;

    try {
      const promises = Array.from(selectedIds).map(id =>
        enrollmentsApi.updateEnrollment(id, { status: 'dropped' })
      );
      await Promise.all(promises);
      toast.success(`${selectedIds.size} enrollment(s) dropped successfully`);
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to drop enrollments');
    }
  };

  const handleBulkHardDelete = async () => {
    if (selectedIds.size === 0) {
      toast.error('No enrollments selected');
      return;
    }

    const confirmedHardBulk = await confirmDialog({
      title: 'Permanent Bulk Delete',
      message: `This will PERMANENTLY delete ${selectedIds.size} enrollment(s).\n\n• Delete all associated fees\n• Delete all payments\n• Regenerate invoices for all affected periods\n• CANNOT BE UNDONE`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
      requireInput: 'DELETE',
    });
    if (!confirmedHardBulk) return;

    try {
      const promises = Array.from(selectedIds).map(id =>
        enrollmentsApi.hardDeleteEnrollment(id)
      );
      const results = await Promise.all(promises);

      const totalFeesDeleted = results.reduce((sum, r) => sum + r.details.feesDeleted, 0);
      const totalFeesRegenerated = results.reduce((sum, r) => sum + r.details.feesRegenerated, 0);

      toast.success(
        `${selectedIds.size} enrollment(s) permanently deleted. ` +
        `${totalFeesDeleted} fees removed, ${totalFeesRegenerated} fees regenerated.`
      );
      loadEnrollments();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete enrollments');
    }
  };

  const { items: sortedEnrollments, requestSort, getSortIndicator } = useSortableData(filteredEnrollments);

  if (loading) {
    return <LoadingSpinner message="Loading enrollments..." className="py-12" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Enrollments</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredEnrollments.length} enrollment{filteredEnrollments.length !== 1 ? 's' : ''} {selectedIds.size > 0 && `(${selectedIds.size} selected)`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Enroll Student
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, email, or course..."
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
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

        {/* Bulk Actions */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Drop Selected ({selectedIds.size})
            </button>
            {isSudo && (
              <button
                onClick={handleBulkHardDelete}
                className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Delete Selected ({selectedIds.size})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter Dropdowns */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        {/* Course Filter */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Filter by Course
          </label>
          <div className="w-full">
            <SearchableSelect
              options={[
                { value: '', label: 'All Courses' },
                ...Array.from(new Set(enrollments.map(e => e.course.id)))
                  .map(courseId => {
                    const course = enrollments.find(e => e.course.id === courseId)?.course;
                    return course ? { value: course.id, label: course.title } : null;
                  })
                  .filter((opt): opt is { value: string; label: string } => opt !== null),
              ]}
              value={filterCourse}
              onChange={(v) => setFilterCourse(v)}
              placeholder="All Courses"
              size="sm"
            />
          </div>
        </div>

        {/* Teacher Filter */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Filter by Teacher
          </label>
          <div className="w-full">
            <SearchableSelect
              options={[
                { value: '', label: 'All Teachers' },
                ...Array.from(
                  new Map(
                    enrollments
                      .flatMap(e => e.course.teachers || [])
                      .map(t => [t.id, { value: t.id, label: `${t.firstName} ${t.lastName}` }])
                  ).values()
                ),
              ]}
              value={filterTeacher}
              onChange={(v) => setFilterTeacher(v)}
              placeholder="All Teachers"
              size="sm"
            />
          </div>
        </div>

        {/* Student Filter */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Filter by Student
          </label>
          <div className="w-full">
            <SearchableSelect
              options={[
                { value: '', label: 'All Students' },
                ...Array.from(new Set(enrollments.map(e => e.student.id)))
                  .map(studentId => {
                    const student = enrollments.find(e => e.student.id === studentId)?.student;
                    return student ? { value: student.id, label: `${student.firstName} ${student.lastName}` } : null;
                  })
                  .filter((opt): opt is { value: string; label: string } => opt !== null),
              ]}
              value={filterStudent}
              onChange={(v) => setFilterStudent(v)}
              placeholder="All Students"
              size="sm"
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        {(filterCourse || filterTeacher || filterStudent) && (
          <div className="flex items-end">
            <button
              onClick={() => {
                setFilterCourse('');
                setFilterTeacher('');
                setFilterStudent('');
              }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Status Filters */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap text-sm ${
            filterStatus === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilterStatus('active')}
          className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap text-sm ${
            filterStatus === 'active'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilterStatus('completed')}
          className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap text-sm ${
            filterStatus === 'completed'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Completed
        </button>
        <button
          onClick={() => setFilterStatus('dropped')}
          className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap text-sm ${
            filterStatus === 'dropped'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Dropped
        </button>
      </div>

      {/* Enrollments List */}
      {filteredEnrollments.length === 0 ? (
        <EmptyState
          icon={ClipboardDocumentListIcon}
          title={searchQuery ? 'No enrollments match your search' : 'No enrollments found'}
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
                        checked={selectedIds.size === filteredEnrollments.length && filteredEnrollments.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th onClick={() => requestSort('student.firstName')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Student {getSortIndicator('student.firstName')}
                  </th>
                  <th onClick={() => requestSort('course.title')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Course {getSortIndicator('course.title')}
                  </th>
                  {!isTeacher && (
                    <th onClick={() => requestSort('customFeePerMonth')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Fee/Month {getSortIndicator('customFeePerMonth')}
                    </th>
                  )}
                  <th onClick={() => requestSort('attendanceMode')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Mode {getSortIndicator('attendanceMode')}
                  </th>
                  <th onClick={() => requestSort('status')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Status {getSortIndicator('status')}
                  </th>
                  {isAdmin && (
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                {sortedEnrollments.map((enrollment) => {
                  const isOneToOne = enrollment.classType === '1-to-1';
                  const displayFee = isOneToOne ? enrollment.perSessionFee : enrollment.customFeePerMonth;
                  const isCustomFee = !!(enrollment.customFeePerMonth || enrollment.perSessionFee);

                  return (
                  <tr key={enrollment.id} className={`hover:bg-indigo-50/30 transition-colors ${selectedIds.has(enrollment.id) ? 'bg-indigo-50/50' : ''}`}>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(enrollment.id)}
                          onChange={() => handleSelectOne(enrollment.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">
                        {enrollment.student.firstName} {enrollment.student.lastName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {enrollment.student.email}
                      </div>
                      {enrollment.student.phone && (
                        <div className="text-xs text-gray-500">
                          {isAdmin ? (
                            <a
                              href={`https://wa.me/${formatWhatsAppNumber(enrollment.student.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 hover:underline"
                              title="Open in WhatsApp"
                            >
                              {enrollment.student.phone}
                            </a>
                          ) : (
                            enrollment.student.phone
                          )}
                        </div>
                      )}
                      {enrollment.student.parentPhone && isAdmin && (
                        <div className="text-xs text-gray-500">
                          Parent:{' '}
                          <a
                            href={`https://wa.me/${formatWhatsAppNumber(enrollment.student.parentPhone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-800 hover:underline"
                            title="Open in WhatsApp"
                          >
                            {enrollment.student.parentPhone}
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm text-gray-900">
                        {enrollment.course.title}
                      </div>
                      {isAdmin && editingEnrolledAt === enrollment.id ? (
                        <input
                          type="date"
                          defaultValue={new Date(enrollment.enrolledAt).toISOString().split('T')[0]}
                          onBlur={(e) => {
                            if (e.target.value && e.target.value !== new Date(enrollment.enrolledAt).toISOString().split('T')[0]) {
                              handleUpdateEnrolledAt(enrollment.id, e.target.value);
                            } else {
                              setEditingEnrolledAt(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditingEnrolledAt(null);
                          }}
                          autoFocus
                          className="text-xs border border-indigo-300 rounded px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                      ) : (
                        <div
                          className={`text-xs text-gray-500 inline-flex items-center gap-1 ${isAdmin ? 'cursor-pointer hover:text-indigo-600 group' : ''}`}
                          onClick={() => isAdmin && setEditingEnrolledAt(enrollment.id)}
                          title={isAdmin ? 'Click to edit enrollment date' : undefined}
                        >
                          {new Date(enrollment.enrolledAt).toLocaleDateString()}
                          {isAdmin && <PencilIcon className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                        </div>
                      )}
                    </td>
                    {!isTeacher && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm text-gray-900">
                              {displayFee ? formatAmount(displayFee, enrollment.currency) : 'Not set'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {isOneToOne ? 'per session' : 'per month'}
                            </div>
                            {isCustomFee && (
                              <div className="text-xs text-blue-600" title={enrollment.feeNotes || 'Custom fee'}>
                                {enrollment.feeType === 'scholarship' ? 'Scholarship' : 'Custom'}
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => setEnrollmentToEditFee(enrollment)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Edit Fee"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        enrollment.attendanceMode === 'online' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {enrollment.attendanceMode === 'online' ? 'Online' : 'Local'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {isAdmin ? (
                        <select
                          value={enrollment.status}
                          onChange={(e) => handleStatusChange(enrollment.id, e.target.value as any)}
                          className={`text-xs px-2 py-0.5 rounded-full border-none cursor-pointer ${
                            enrollment.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : enrollment.status === 'completed'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="dropped">Dropped</option>
                        </select>
                      ) : (
                        <span
                          className={`text-xs px-2 py-0.5 inline-flex rounded-full ${
                            enrollment.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : enrollment.status === 'completed'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {enrollment.status}
                        </span>
                      )}
                      {enrollment.status === 'dropped' && (
                        isAdmin && editingDroppedAt === enrollment.id ? (
                          <input
                            type="date"
                            defaultValue={enrollment.droppedAt ? new Date(enrollment.droppedAt).toISOString().split('T')[0] : ''}
                            onBlur={(e) => {
                              const current = enrollment.droppedAt ? new Date(enrollment.droppedAt).toISOString().split('T')[0] : '';
                              if (e.target.value && e.target.value !== current) {
                                handleUpdateDroppedAt(enrollment.id, e.target.value);
                              } else {
                                setEditingDroppedAt(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') setEditingDroppedAt(null);
                            }}
                            autoFocus
                            className="mt-1 block text-xs border border-indigo-300 rounded px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        ) : (
                          <div
                            className={`mt-1 text-xs text-gray-500 inline-flex items-center gap-1 ${isAdmin ? 'cursor-pointer hover:text-indigo-600 group' : ''}`}
                            onClick={() => isAdmin && setEditingDroppedAt(enrollment.id)}
                            title={isAdmin ? 'Click to edit drop date' : undefined}
                          >
                            {enrollment.droppedAt ? new Date(enrollment.droppedAt).toLocaleDateString() : 'No drop date'}
                            {isAdmin && <PencilIcon className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                          </div>
                        )
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDelete(enrollment.id)}
                            className="p-1.5 text-yellow-600 hover:text-yellow-900 hover:bg-yellow-50 rounded-lg transition-colors"
                            title="Drop Enrollment (Soft Delete)"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                          {isSudo && (
                            <button
                              onClick={() => handleHardDelete(enrollment.id)}
                              className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                              title="Permanent Delete (Hard Delete)"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden">
            {filteredEnrollments.map((enrollment) => {
              const isOneToOne = enrollment.classType === '1-to-1';
              const displayFee = isOneToOne ? enrollment.perSessionFee : enrollment.customFeePerMonth;
              const isCustomFee = !!(enrollment.customFeePerMonth || enrollment.perSessionFee);

              return (
              <div key={enrollment.id} className="p-3 border-b border-gray-200">
                <div className="flex items-start gap-3">
                  {isAdmin && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(enrollment.id)}
                      onChange={() => handleSelectOne(enrollment.id)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-indigo-500"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          {enrollment.student.firstName} {enrollment.student.lastName}
                        </h3>
                        <p className="text-xs text-gray-500">{enrollment.student.email}</p>
                        {enrollment.student.phone && (
                          <p className="text-xs text-gray-500">
                            {isAdmin ? (
                              <a
                                href={`https://wa.me/${formatWhatsAppNumber(enrollment.student.phone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-800 hover:underline"
                                title="Open in WhatsApp"
                              >
                                {enrollment.student.phone}
                              </a>
                            ) : (
                              enrollment.student.phone
                            )}
                          </p>
                        )}
                        {enrollment.student.parentPhone && isAdmin && (
                          <p className="text-xs text-gray-500">
                            Parent:{' '}
                            <a
                              href={`https://wa.me/${formatWhatsAppNumber(enrollment.student.parentPhone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 hover:underline"
                              title="Open in WhatsApp"
                            >
                              {enrollment.student.parentPhone}
                            </a>
                          </p>
                        )}
                      </div>
                      <span
                        className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                          enrollment.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : enrollment.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {enrollment.status}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div>
                        <span className="text-gray-500 text-xs">Course:</span>
                        <span className="ml-1 text-gray-900">
                          {enrollment.course.title}
                        </span>
                      </div>
                      {!isTeacher && (
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="text-gray-500 text-xs">{isOneToOne ? 'Fee/Session:' : 'Fee/Month:'}</span>
                            <span className="ml-1 text-gray-900">
                              {displayFee ? formatAmount(displayFee, enrollment.currency) : 'Not set'}
                            </span>
                            {isCustomFee && (
                              <span className="ml-1 text-xs text-blue-600">
                                ({enrollment.feeType === 'scholarship' ? 'Scholarship' : 'Custom'})
                              </span>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => setEnrollmentToEditFee(enrollment)}
                              className="text-blue-600 hover:text-blue-800 transition-colors"
                              title="Edit Fee"
                            >
                              <PencilIcon className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 items-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          enrollment.attendanceMode === 'online' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {enrollment.attendanceMode === 'online' ? 'Online' : 'Local'}
                        </span>
                        {isAdmin && editingEnrolledAt === enrollment.id ? (
                          <input
                            type="date"
                            defaultValue={new Date(enrollment.enrolledAt).toISOString().split('T')[0]}
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== new Date(enrollment.enrolledAt).toISOString().split('T')[0]) {
                                handleUpdateEnrolledAt(enrollment.id, e.target.value);
                              } else {
                                setEditingEnrolledAt(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              if (e.key === 'Escape') setEditingEnrolledAt(null);
                            }}
                            autoFocus
                            className="text-xs border border-indigo-300 rounded px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        ) : (
                          <span
                            className={`text-xs text-gray-500 inline-flex items-center gap-1 ${isAdmin ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                            onClick={() => isAdmin && setEditingEnrolledAt(enrollment.id)}
                            title={isAdmin ? 'Tap to edit enrollment date' : undefined}
                          >
                            {new Date(enrollment.enrolledAt).toLocaleDateString()}
                            {isAdmin && <PencilIcon className="h-3 w-3 text-indigo-400" />}
                          </span>
                        )}
                        {enrollment.status === 'dropped' && (
                          isAdmin && editingDroppedAt === enrollment.id ? (
                            <input
                              type="date"
                              defaultValue={enrollment.droppedAt ? new Date(enrollment.droppedAt).toISOString().split('T')[0] : ''}
                              onBlur={(e) => {
                                const current = enrollment.droppedAt ? new Date(enrollment.droppedAt).toISOString().split('T')[0] : '';
                                if (e.target.value && e.target.value !== current) {
                                  handleUpdateDroppedAt(enrollment.id, e.target.value);
                                } else {
                                  setEditingDroppedAt(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') setEditingDroppedAt(null);
                              }}
                              autoFocus
                              className="text-xs border border-indigo-300 rounded px-1 py-0.5 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                            />
                          ) : (
                            <span
                              className={`text-xs text-red-500 inline-flex items-center gap-1 ${isAdmin ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                              onClick={() => isAdmin && setEditingDroppedAt(enrollment.id)}
                              title={isAdmin ? 'Tap to edit drop date' : undefined}
                            >
                              Dropped: {enrollment.droppedAt ? new Date(enrollment.droppedAt).toLocaleDateString() : 'no date'}
                              {isAdmin && <PencilIcon className="h-3 w-3 text-indigo-400" />}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleDelete(enrollment.id)}
                          className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-sm bg-yellow-50 text-yellow-700 rounded-lg hover:bg-yellow-100 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4 mr-2" />
                          Drop
                        </button>
                        {isSudo && (
                          <button
                            onClick={() => handleHardDelete(enrollment.id)}
                            className="flex-1 inline-flex items-center justify-center px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <XMarkIcon className="h-4 w-4 mr-2" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
            Showing {sortedEnrollments.length} result{sortedEnrollments.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Enrollment Form Modal */}
      {showForm && (
        <EnrollmentForm
          onClose={() => setShowForm(false)}
          onSuccess={loadEnrollments}
        />
      )}

      {/* Drop Enrollment Modal */}
      {enrollmentToDrop && (
        <DropEnrollmentModal
          isOpen={true}
          onClose={() => setEnrollmentToDrop(null)}
          onConfirm={handleConfirmDrop}
          studentName={`${enrollmentToDrop.student.firstName} ${enrollmentToDrop.student.lastName}`}
          courseName={enrollmentToDrop.course.title}
        />
      )}

      {/* Edit Enrollment Fee Modal */}
      {enrollmentToEditFee && (
        <EditEnrollmentFeeModal
          isOpen={true}
          onClose={() => setEnrollmentToEditFee(null)}
          onSuccess={loadEnrollments}
          enrollment={enrollmentToEditFee}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
