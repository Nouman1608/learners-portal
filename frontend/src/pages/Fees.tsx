import { useState, useEffect } from 'react';
import { feesApi, Fee, CurrencyCode } from '../api/enrollments.api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { CheckCircleIcon, MagnifyingGlassIcon, XMarkIcon, BanknotesIcon, ArrowPathIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import MarkAsReceivedModal from '../components/fees/MarkAsReceivedModal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { useSortableData } from '../hooks/useSortableData';
import SearchableSelect from '../components/common/SearchableSelect';
import { terms, JUNIOR_CATEGORIES, isJuniorPortal } from '../brand';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

export default function Fees() {
  const { user } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'overdue' | 'received' | 'dropped' | 'leave'>('all');
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [filterCourse, setFilterCourse] = useState<string>('all');
  const [filterStudent, setFilterStudent] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  // Junior: local / online, taken from how the child attends that class (the enrolment)
  const [filterMode, setFilterMode] = useState<string>('all');
  const [filterInvoice, setFilterInvoice] = useState<'all' | 'sent' | 'not_sent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMarkReceivedModal, setShowMarkReceivedModal] = useState(false);
  const [feesToMark, setFeesToMark] = useState<Fee[]>([]);
  const [isBulkOperation, setIsBulkOperation] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);
  const [regenerateMonth, setRegenerateMonth] = useState(new Date().getMonth() + 1);
  const [regenerateYear, setRegenerateYear] = useState(new Date().getFullYear());
  const [regenerating, setRegenerating] = useState(false);
  const [sessionEditFee, setSessionEditFee] = useState<Fee | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);
  const [noteFee, setNoteFee] = useState<Fee | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [dateFee, setDateFee] = useState<Fee | null>(null);
  const [dateInput, setDateInput] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [sessionInput, setSessionInput] = useState('');
  const [savingSessions, setSavingSessions] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';
  // Sudo on the Senior portal: Senior / Junior campus tabs (Junior is a read-only view)
  const canPickCampus = user?.role === 'sudo' && !isJuniorPortal;
  const [campusTab, setCampusTab] = useState<'senior' | 'junior'>('senior');
  const juniorTab = canPickCampus && campusTab === 'junior';
  const juniorView = isJuniorPortal || juniorTab;
  const canAct = isAdmin && !juniorTab;

  useEffect(() => {
    loadFees();
  }, [filterStatus, juniorTab]);

  const loadFees = async () => {
    try {
      setLoading(true);
      const filters = { ...(filterStatus === 'all' ? {} : { status: filterStatus }), ...(juniorTab ? { campus: 'junior' as const } : {}) };
      const data = await feesApi.getFees(filters);
      setFees(data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load fees');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsReceived = (fee: Fee) => {
    setFeesToMark([fee]);
    setIsBulkOperation(false);
    setShowMarkReceivedModal(true);
  };

  // Tick / untick "invoice sent". Updates the row straight away and puts it back if saving fails.
  const handleToggleInvoiceSent = async (fee: Fee) => {
    const sent = !fee.invoiceSentAt;
    const previous = fee.invoiceSentAt ?? null;
    setFees((all) => all.map((f) => (f.id === fee.id ? { ...f, invoiceSentAt: sent ? new Date().toISOString() : null } : f)));
    try {
      const result = await feesApi.setInvoiceSent(fee.id, sent);
      setFees((all) => all.map((f) => (f.id === fee.id ? { ...f, invoiceSentAt: result.invoiceSentAt } : f)));
    } catch (error: any) {
      setFees((all) => all.map((f) => (f.id === fee.id ? { ...f, invoiceSentAt: previous } : f)));
      toast.error(error.response?.data?.error || 'Failed to update invoice sent');
    }
  };

  const handleEditNote = (fee: Fee) => {
    setNoteInput(fee.adminNote ?? '');
    setNoteFee(fee);
  };

  // Save the admin note; an empty note removes it
  const handleSaveNote = async () => {
    if (!noteFee) return;
    setSavingNote(true);
    try {
      const result = await feesApi.setFeeNote(noteFee.id, noteInput);
      setFees((all) => all.map((f) => (f.id === noteFee.id ? { ...f, adminNote: result.adminNote } : f)));
      toast.success(result.adminNote ? 'Note saved' : 'Note removed');
      setNoteFee(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to save note');
    } finally {
      setSavingNote(false);
    }
  };

  // Received date in Pakistan time (YYYY-MM-DD), for the date picker
  const pkDate = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date(d));

  const handleEditReceivedDate = (fee: Fee) => {
    if (!fee.receivedAt) return;
    setDateInput(pkDate(fee.receivedAt));
    setDateFee(fee);
  };

  const handleSaveReceivedDate = async () => {
    if (!dateFee || !dateInput) return;
    setSavingDate(true);
    try {
      const result = await feesApi.setReceivedDate(dateFee.id, dateInput);
      setFees((all) => all.map((f) => (f.id === dateFee.id ? { ...f, receivedAt: result.receivedAt } : f)));
      toast.success('Received date updated');
      setDateFee(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to update the date');
    } finally {
      setSavingDate(false);
    }
  };

  // Tick / untick "On leave" (Junior portal): the month's fee is not owed, the enrollment stays active.
  const handleToggleLeave = async (fee: Fee) => {
    const onLeave = fee.status !== 'leave';
    const name = `${fee.student.firstName} ${fee.student.lastName}`;
    const period = `${getMonthName(fee.month)} ${fee.year}`;
    const confirmed = await confirmDialog(onLeave ? {
      title: 'Mark as on leave',
      message: `${name} is on leave for ${period}?\n\nThe ${fee.course.title} fee for ${period} will not be owed and is taken off the student and teacher invoices. ${name} stays enrolled, so next month is billed as normal.`,
      confirmLabel: 'On leave',
      variant: 'info',
    } : {
      title: 'Undo on leave',
      message: `Make the ${period} ${fee.course.title} fee for ${name} owed again?`,
      confirmLabel: 'Undo',
      variant: 'info',
    });
    if (!confirmed) return;
    setDroppingId(fee.id);
    try {
      const result = await feesApi.setFeeOnLeave(fee.id, onLeave);
      setFees((all) => all.map((f) => (f.id === fee.id ? { ...f, status: result.status } : f)));
      toast.success(onLeave ? 'Marked as on leave' : 'Fee is owed again');
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to update fee');
    } finally {
      setDroppingId(null);
    }
  };

  // Tick / untick "dropped – not paying". Ticking also drops the enrollment, so confirm first.
  const handleToggleDropped = async (fee: Fee) => {
    const dropped = fee.status !== 'dropped';
    const name = `${fee.student.firstName} ${fee.student.lastName}`;
    const confirmed = await confirmDialog(dropped ? {
      title: 'Mark as dropped – not paying',
      message: `${name} has dropped ${fee.course.title}?\n\nThe ${getMonthName(fee.month)} ${fee.year} fee will no longer be owed and is taken off the student and teacher invoices. The enrollment is marked as dropped, and unpaid fees for later months are removed.`,
      confirmLabel: 'Mark dropped',
      variant: 'warning',
    } : {
      title: 'Undo dropped',
      message: `Make the ${getMonthName(fee.month)} ${fee.year} ${fee.course.title} fee for ${name} owed again?\n\nThe enrollment stays dropped — reactivate it on the Enrollments page if the student is back.`,
      confirmLabel: 'Undo',
      variant: 'info',
    });
    if (!confirmed) return;
    setDroppingId(fee.id);
    try {
      const result = await feesApi.setFeeDropped(fee.id, dropped);
      setFees((all) => all.map((f) => (f.id === fee.id ? { ...f, status: result.status } : f)));
      toast.success(dropped ? 'Marked as dropped – not paying' : 'Fee is owed again');
      if (dropped) loadFees(); // later months' unpaid fees may have been removed
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to update fee');
    } finally {
      setDroppingId(null);
    }
  };

  const handleEditSessions = (fee: Fee) => {
    setSessionInput(fee.sessionCount != null ? String(fee.sessionCount) : '');
    setSessionEditFee(fee);
  };

  const handleSaveSessions = async () => {
    if (!sessionEditFee) return;
    const count = parseInt(sessionInput);
    if (Number.isNaN(count) || count < 0 || count > 31) {
      toast.error('Enter a session count between 0 and 31');
      return;
    }
    setSavingSessions(true);
    try {
      const result = await feesApi.updateFeeSessions(sessionEditFee.id, count);
      toast.success(result.message);
      setSessionEditFee(null);
      loadFees();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update sessions');
    } finally {
      setSavingSessions(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredFees.length && filteredFees.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredFees.map(f => f.id)));
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

  const handleBulkMarkReceived = () => {
    if (selectedIds.size === 0) {
      toast.error('No fees selected');
      return;
    }

    // Only allow marking as received for pending/overdue fees (not already received)
    const selectedFees = fees.filter(f => selectedIds.has(f.id));
    const unpaidFees = selectedFees.filter(f => f.status !== 'received' && f.status !== 'dropped' && f.status !== 'leave');

    if (unpaidFees.length === 0) {
      toast.error('No unpaid fees selected. Selected fees are already marked as received.');
      return;
    }

    setFeesToMark(unpaidFees);
    setIsBulkOperation(true);
    setShowMarkReceivedModal(true);
  };

  const handleRegenerateFees = async () => {
    try {
      setRegenerating(true);
      const result = await feesApi.generateFeesManually(regenerateMonth, regenerateYear);
      toast.success(result.message || 'Fees regenerated successfully');
      setShowRegenerateModal(false);
      loadFees();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to regenerate fees');
    } finally {
      setRegenerating(false);
    }
  };

  const filteredFees = fees.filter((fee) => {
    // Period filter
    if (filterPeriod !== 'all') {
      const feePeriod = `${fee.month}-${fee.year}`;
      if (feePeriod !== filterPeriod) return false;
    }

    // Course filter
    if (filterCourse !== 'all' && fee.courseId !== filterCourse) {
      return false;
    }

    // Student filter
    if (filterStudent !== 'all' && fee.studentId !== filterStudent) {
      return false;
    }

    // Category filter (senior/junior)
    if (filterCategory !== 'all' && fee.student.studentCategory !== filterCategory) {
      return false;
    }

    // Local / online filter (Junior): the class's attendance mode
    if (juniorView && filterMode !== 'all' && fee.attendanceMode !== filterMode) {
      return false;
    }

    // Subcategory filter (local/online/etc)
    if (filterSubcategory !== 'all' && fee.student.studentSubcategory !== filterSubcategory) {
      return false;
    }

    // Invoice sent filter
    if (filterInvoice === 'sent' && !fee.invoiceSentAt) return false;
    if (filterInvoice === 'not_sent' && fee.invoiceSentAt) return false;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const studentName = `${fee.student.firstName} ${fee.student.lastName}`.toLowerCase();
      const studentEmail = fee.student.email.toLowerCase();
      const courseName = fee.course.title.toLowerCase();

      const note = (fee.adminNote || '').toLowerCase();

      return studentName.includes(query) || studentEmail.includes(query) || courseName.includes(query) || note.includes(query);
    }

    return true;
  });

  const getStatusBadge = (status: string) => {
    const classes = {
      pending: 'bg-yellow-100 text-yellow-800',
      overdue: 'bg-red-100 text-red-800',
      received: 'bg-green-100 text-green-800',
      dropped: 'bg-gray-200 text-gray-700',
      leave: 'bg-sky-100 text-sky-800',
    };
    return classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800';
  };

  const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  };

  const getCurrencySymbol = (currency: CurrencyCode): string => {
    const symbols: Record<CurrencyCode, string> = {
      PKR: 'Rs',
      USD: '$',
      GBP: '£',
      SAR: 'SR',
    };
    return symbols[currency] || 'Rs';
  };

  const formatAmount = (amount: string, currency: CurrencyCode): string => {
    const symbol = getCurrencySymbol(currency);
    const numAmount = parseFloat(amount);
    return `${symbol} ${numAmount.toLocaleString()}`;
  };

  // Get unique periods (sorted by year and month, most recent first)
  const uniquePeriods = Array.from(
    new Set(fees.map(fee => `${fee.month}-${fee.year}`))
  ).sort((a, b) => {
    const [monthA, yearA] = a.split('-').map(Number);
    const [monthB, yearB] = b.split('-').map(Number);
    if (yearB !== yearA) return yearB - yearA;
    return monthB - monthA;
  });

  // Get unique courses (sorted alphabetically)
  const uniqueCourses = Array.from(
    new Map(fees.map(fee => [fee.courseId, fee.course.title]))
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Get unique students (sorted alphabetically)
  const uniqueStudents = Array.from(
    new Map(fees.map(fee => [
      fee.studentId,
      `${fee.student.firstName} ${fee.student.lastName}`
    ]))
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const { items: sortedFees, requestSort, getSortIndicator } = useSortableData(filteredFees);

  if (loading) {
    return <LoadingSpinner message="Loading fees..." className="py-12" />;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fee Management</h1>
        {canPickCampus && (
          <div className="mt-3 inline-flex rounded-lg bg-white p-1 shadow" role="tablist" aria-label="Campus">
            {([['senior', 'Senior Campus Students'], ['junior', 'Junior Campus Students']] as const).map(([value, label]) => (
              <button key={value} role="tab" aria-selected={campusTab === value}
                onClick={() => { setCampusTab(value); setSelectedIds(new Set()); setFilterCategory('all'); setFilterSubcategory('all'); setFilterMode('all'); }}
                className={`rounded-md px-3 py-2 text-sm font-medium ${campusTab === value ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {juniorTab && (
          <p className="mt-3 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">Junior Campus (view only). To mark fees received or change them, use the Junior portal.</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          {filteredFees.length} fee{filteredFees.length !== 1 ? 's' : ''} {selectedIds.size > 0 && `(${selectedIds.size} selected)`}
        </p>
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
            placeholder={`Search by student name, email, or ${terms.courseLc}...`}
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
        {canAct && selectedIds.size > 0 && (
          <button
            onClick={handleBulkMarkReceived}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
          >
            <CheckCircleIcon className="h-4 w-4 mr-2" />
            Mark Received ({selectedIds.size})
          </button>
        )}

        {/* Regenerate Fees - Admin only */}
        {canAct && (
          <button
            onClick={() => setShowRegenerateModal(true)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm whitespace-nowrap"
          >
            <ArrowPathIcon className="h-4 w-4 mr-2" />
            Generate Fees
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="received">Received</option>
          <option value="dropped">Dropped – not paying</option>
          {juniorView && <option value="leave">On leave</option>}
        </select>

        <select
          value={filterInvoice}
          onChange={(e) => setFilterInvoice(e.target.value as any)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">Invoice: All</option>
          <option value="sent">Invoice sent</option>
          <option value="not_sent">Invoice not sent</option>
        </select>

        <select
          value={filterPeriod}
          onChange={(e) => setFilterPeriod(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">All Periods</option>
          {uniquePeriods.map(period => {
            const [month, year] = period.split('-').map(Number);
            return (
              <option key={period} value={period}>
                {getMonthName(month)} {year}
              </option>
            );
          })}
        </select>

        <div className="w-48">
          <SearchableSelect
            size="sm"
            value={filterCourse}
            onChange={(v) => setFilterCourse(v || 'all')}
            placeholder={`All ${terms.courses}`}
            options={[
              { value: 'all', label: `All ${terms.courses}` },
              ...uniqueCourses.map(([courseId, courseTitle]) => ({
                value: courseId,
                label: courseTitle,
              })),
            ]}
          />
        </div>

        <div className="w-48">
          <SearchableSelect
            size="sm"
            value={filterStudent}
            onChange={(v) => setFilterStudent(v || 'all')}
            placeholder="All Students"
            options={[
              { value: 'all', label: 'All Students' },
              ...uniqueStudents.map(([studentId, studentName]) => ({
                value: studentId,
                label: studentName,
              })),
            ]}
          />
        </div>

        {!juniorView && (
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="all">All Categories</option>
          <option value="senior">Senior</option>
          <option value="junior">Junior</option>
        </select>
        )}

        <select
          value={filterSubcategory}
          onChange={(e) => setFilterSubcategory(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          {juniorView ? (
            <>
              <option value="all">All Categories</option>
              {JUNIOR_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </>
          ) : (
            <>
              <option value="all">All Types</option>
              <option value="local">Local</option>
              <option value="online">Online</option>
              <option value="aitchison">Aitchison</option>
              <option value="preschool">Preschool</option>
              <option value="summer_camp">Summer Camp</option>
              <option value="academy">Academy</option>
            </>
          )}
        </select>

        {juniorView && (
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value)}
            aria-label="Local or online"
            className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="all">Local &amp; Online</option>
            <option value="local">Local</option>
            <option value="online">Online</option>
          </select>
        )}

        {(searchQuery || filterStatus !== 'all' || filterPeriod !== 'all' || filterCourse !== 'all' || filterStudent !== 'all' || filterCategory !== 'all' || filterSubcategory !== 'all' || filterInvoice !== 'all' || filterMode !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterMode('all');
              setFilterStatus('all');
              setFilterPeriod('all');
              setFilterCourse('all');
              setFilterStudent('all');
              setFilterCategory('all');
              setFilterSubcategory('all');
              setFilterInvoice('all');
            }}
            className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Fees List */}
      {filteredFees.length === 0 ? (
        <EmptyState
          icon={BanknotesIcon}
          title={searchQuery || filterStatus !== 'all' || filterPeriod !== 'all' || filterCourse !== 'all' || filterStudent !== 'all' || filterCategory !== 'all' || filterSubcategory !== 'all' || filterInvoice !== 'all'
            ? 'No fees match your filters'
            : 'No fees found'}
        />
      ) : (
        <div className="bg-white shadow-card rounded-xl overflow-hidden border border-gray-200">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {canAct && (
                    <th className="px-3 py-2 w-12">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filteredFees.length && filteredFees.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                  )}
                  <th onClick={() => requestSort('student.firstName')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Student {getSortIndicator('student.firstName')}
                  </th>
                  <th onClick={() => requestSort('course.title')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    {terms.course} {getSortIndicator('course.title')}
                  </th>
                  <th onClick={() => requestSort('month')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Period {getSortIndicator('month')}
                  </th>
                  <th onClick={() => requestSort('amount')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Amount {getSortIndicator('amount')}
                  </th>
                  <th onClick={() => requestSort('dueDate')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Due Date {getSortIndicator('dueDate')}
                  </th>
                  <th onClick={() => requestSort('status')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Status {getSortIndicator('status')}
                  </th>
                  <th onClick={() => requestSort('invoiceSentAt')} className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Invoice Sent {getSortIndicator('invoiceSentAt')}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Not paying because the student dropped this subject">
                    Dropped
                  </th>
                  {juniorView && (
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="On leave this month: fee not owed, student stays enrolled">
                      On leave
                    </th>
                  )}
                  {canAct && (
                    <th onClick={() => requestSort('adminNote')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Notes {getSortIndicator('adminNote')}
                    </th>
                  )}
                  <th onClick={() => requestSort('receivedAt')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Received At {getSortIndicator('receivedAt')}
                  </th>
                  <th onClick={() => requestSort('serialNumber')} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Serial Number {getSortIndicator('serialNumber')}
                  </th>
                  {canAct && (
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50/95 backdrop-blur-sm shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                {sortedFees.map((fee) => (
                  <tr key={fee.id} className={`hover:bg-indigo-50/30 transition-colors ${selectedIds.has(fee.id) ? 'bg-indigo-50/50' : ''}`}>
                    {canAct && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(fee.id)}
                          onChange={() => handleSelectOne(fee.id)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">
                        {fee.student.firstName} {fee.student.lastName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {fee.student.email}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                      {fee.course.title}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                      {getMonthName(fee.month)} {fee.year}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatAmount(fee.amount, fee.currency)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {new Date(fee.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(fee.status)}`}>
                          {fee.status === 'leave' ? 'on leave' : fee.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <input
                        type="checkbox"
                        checked={!!fee.invoiceSentAt}
                        disabled={!canAct}
                        onChange={() => handleToggleInvoiceSent(fee)}
                        title={fee.invoiceSentAt ? `Invoice sent on ${new Date(fee.invoiceSentAt).toLocaleDateString()}` : 'Tick when the invoice has been sent'}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-default"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <input
                        type="checkbox"
                        checked={fee.status === 'dropped'}
                        disabled={!canAct || fee.status === 'received' || fee.status === 'leave' || droppingId === fee.id}
                        onChange={() => handleToggleDropped(fee)}
                        title={fee.status === 'received' ? 'Already paid' : fee.status === 'leave' ? 'On leave – untick On leave first' : 'Tick if not paying because the student dropped this subject'}
                        className="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500 cursor-pointer disabled:cursor-default disabled:opacity-40"
                      />
                    </td>
                    {juniorView && (
                      <td className="px-3 py-2 whitespace-nowrap text-center">
                        <input
                          type="checkbox"
                          checked={fee.status === 'leave'}
                          disabled={!canAct || fee.status === 'received' || fee.status === 'dropped' || droppingId === fee.id}
                          onChange={() => handleToggleLeave(fee)}
                          aria-label="On leave"
                          title={fee.status === 'received' ? 'Already paid' : fee.status === 'dropped' ? 'Dropped – untick Dropped first' : 'Tick if the student is on leave this month (stays enrolled)'}
                          className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer disabled:cursor-default disabled:opacity-40"
                        />
                      </td>
                    )}
                    {canAct && (
                      <td className="px-3 py-2 text-sm">
                        <div className="flex items-center gap-2 max-w-[14rem]">
                          <span className={`truncate ${fee.adminNote ? 'text-gray-700' : 'text-gray-400'}`} title={fee.adminNote || undefined}>
                            {fee.adminNote || '—'}
                          </span>
                          <button
                            onClick={() => handleEditNote(fee)}
                            title={fee.adminNote ? 'Edit note' : 'Add a note'}
                            aria-label={fee.adminNote ? 'Edit note' : 'Add a note'}
                            className="shrink-0 p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {fee.receivedAt ? (
                        <span className="inline-flex items-center gap-1">
                          {new Date(fee.receivedAt).toLocaleDateString()}
                          {canAct && (
                            <button
                              onClick={() => handleEditReceivedDate(fee)}
                              title="Change received date"
                              aria-label="Change received date"
                              className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {fee.serialNumber || '-'}
                    </td>
                    {canAct && (
                      <td className="px-3 py-2 whitespace-nowrap text-right sticky right-0 bg-white shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                        {fee.billingType === 'usage' && fee.status !== 'received' && (
                          <button
                            onClick={() => handleEditSessions(fee)}
                            className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                            title={`Edit Sessions (currently ${fee.sessionCount ?? 0})`}
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                        )}
                        {fee.status !== 'received' && fee.status !== 'dropped' && fee.status !== 'leave' && (
                          <button
                            onClick={() => handleMarkAsReceived(fee)}
                            className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-colors"
                            title="Mark as Received"
                          >
                            <CheckCircleIcon className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden">
            {filteredFees.map((fee) => (
              <div key={fee.id} className="p-4 border-b border-gray-200">
                <div className="flex gap-3 items-start mb-3">
                  {canAct && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(fee.id)}
                      onChange={() => handleSelectOne(fee.id)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-indigo-500"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {fee.student.firstName} {fee.student.lastName}
                        </h3>
                        <p className="text-sm text-gray-500">{fee.course.title}</p>
                      </div>
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusBadge(fee.status)}`}>
                        {fee.status === 'leave' ? 'on leave' : fee.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-500">Period:</span>
                    <span className="ml-1 text-gray-900">
                      {getMonthName(fee.month)} {fee.year}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Amount:</span>
                    <span className="ml-1 text-gray-900 font-medium">
                      {formatAmount(fee.amount, fee.currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Due Date:</span>
                    <span className="ml-1 text-gray-900">
                      {new Date(fee.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!fee.invoiceSentAt}
                      disabled={!canAct}
                      onChange={() => handleToggleInvoiceSent(fee)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-gray-500">Invoice sent</span>
                    {fee.invoiceSentAt && (
                      <span className="text-gray-900">{new Date(fee.invoiceSentAt).toLocaleDateString()}</span>
                    )}
                  </label>
                  {fee.status !== 'received' && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={fee.status === 'dropped'}
                        disabled={!canAct || fee.status === 'leave' || droppingId === fee.id}
                        onChange={() => handleToggleDropped(fee)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                      />
                      <span className="text-gray-500">Dropped – not paying</span>
                    </label>
                  )}
                  {juniorView && fee.status !== 'received' && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={fee.status === 'leave'}
                        disabled={!canAct || fee.status === 'dropped' || droppingId === fee.id}
                        onChange={() => handleToggleLeave(fee)}
                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-gray-500">On leave this month</span>
                    </label>
                  )}
                  {canAct && (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <span className="text-gray-500">Notes:</span>
                        <span className={`ml-1 whitespace-pre-wrap ${fee.adminNote ? 'text-gray-900' : 'text-gray-400'}`}>
                          {fee.adminNote || '—'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleEditNote(fee)}
                        aria-label={fee.adminNote ? 'Edit note' : 'Add a note'}
                        className="shrink-0 p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {fee.receivedAt && (
                    <div>
                      <span className="text-gray-500">Received At:</span>
                      <span className="ml-1 text-gray-900">
                        {new Date(fee.receivedAt).toLocaleDateString()}
                      </span>
                      {canAct && (
                        <button
                          onClick={() => handleEditReceivedDate(fee)}
                          aria-label="Change received date"
                          className="ml-1 p-1 align-middle text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                  {fee.serialNumber && (
                    <div>
                      <span className="text-gray-500">Serial Number:</span>
                      <span className="ml-1 text-gray-900">
                        {fee.serialNumber}
                      </span>
                    </div>
                  )}
                </div>
                {canAct && fee.status !== 'received' && fee.status !== 'dropped' && fee.status !== 'leave' && (
                  <div className="mt-4">
                    <button
                      onClick={() => handleMarkAsReceived(fee)}
                      className="w-full inline-flex items-center justify-center px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                    >
                      <CheckCircleIcon className="h-4 w-4 mr-2" />
                      Mark as Received
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
            Showing {sortedFees.length} result{sortedFees.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Received Date Modal */}
      {dateFee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Received Date</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {dateFee.student.firstName} {dateFee.student.lastName} — {dateFee.course.title}, {getMonthName(dateFee.month)} {dateFee.year}
                </p>
              </div>
              <button onClick={() => setDateFee(null)} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="receivedDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Day the fee was paid
                </label>
                <input
                  id="receivedDate"
                  type="date"
                  value={dateInput}
                  max={pkDate(new Date())}
                  onChange={(e) => setDateInput(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">The payment record moves to this day too.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDateFee(null)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveReceivedDate}
                  disabled={savingDate || !dateInput}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingDate ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fee Note Modal */}
      {noteFee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Fee Note</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {noteFee.student.firstName} {noteFee.student.lastName} — {noteFee.course.title}, {getMonthName(noteFee.month)} {noteFee.year}
                </p>
              </div>
              <button onClick={() => setNoteFee(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="feeNote" className="block text-sm font-medium text-gray-700 mb-1">
                  Note (seen by admins only)
                </label>
                <textarea
                  id="feeNote"
                  rows={4}
                  maxLength={1000}
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  autoFocus
                  placeholder="e.g. Paid half on 5 Nov, permission to pay the rest by 10 Dec"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Leave empty and save to remove the note.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setNoteFee(null)}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNote}
                  disabled={savingNote}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingNote ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit 1-to-1 Sessions Modal */}
      {sessionEditFee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Edit Sessions</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {sessionEditFee.student.firstName} {sessionEditFee.student.lastName} — {sessionEditFee.course.title}
                </p>
              </div>
              <button
                onClick={() => setSessionEditFee(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="sessionCount" className="block text-sm font-medium text-gray-700 mb-1">
                  Sessions taken this month
                </label>
                <input
                  type="number"
                  id="sessionCount"
                  min={0}
                  max={31}
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  The fee amount is recalculated as sessions × per-session fee, and any
                  already-generated invoices for this month are updated. Setting 0 removes the fee.
                  The nightly session sync will not overwrite this manual count.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setSessionEditFee(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSessions}
                disabled={savingSessions}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm"
              >
                {savingSessions ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate Fees Modal */}
      {showRegenerateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Generate Fees</h2>
              <button
                onClick={() => setShowRegenerateModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Generate monthly fees for all active enrollments for the selected period.
              </p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <select
                    value={regenerateMonth}
                    onChange={(e) => setRegenerateMonth(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {getMonthName(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                  <select
                    value={regenerateYear}
                    onChange={(e) => setRegenerateYear(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  This will generate fees for enrollments that don't already have a fee for this period. Existing fees will not be affected.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowRegenerateModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateFees}
                disabled={regenerating}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm inline-flex items-center"
              >
                {regenerating ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="h-4 w-4 mr-2" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Received Modal */}
      {showMarkReceivedModal && (
        <MarkAsReceivedModal
          isOpen={showMarkReceivedModal}
          onClose={() => {
            setShowMarkReceivedModal(false);
            setFeesToMark([]);
          }}
          onSuccess={() => {
            loadFees();
            setSelectedIds(new Set());
          }}
          fees={feesToMark}
          isBulk={isBulkOperation}
        />
      )}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
