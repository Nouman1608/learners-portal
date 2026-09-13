import { useState, useEffect, useRef } from 'react';
import { invoicesApi, Invoice, OneToOneSession, SessionOverride } from '../api/invoices.api';
import { useAuth } from '../context/AuthContext';
import OneToOneSessionModal from '../components/invoices/OneToOneSessionModal';
import toast from 'react-hot-toast';
import {
  DocumentTextIcon,
  EnvelopeIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  EyeIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useSortableData } from '../hooks/useSortableData';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function Invoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedType, setSelectedType] = useState<'all' | 'student' | 'teacher'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [viewingPdfUrl, setViewingPdfUrl] = useState<string | null>(null);
  const [emailingId, setEmailingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [sessionModal, setSessionModal] = useState<{
    studentId: string;
    studentName: string;
    month: number;
    year: number;
    sessions: OneToOneSession[];
    invoiceId?: string; // set when regenerating an existing invoice
  } | null>(null);
  const [sessionModalLoading, setSessionModalLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';

  // Monotonic counter so out-of-order API responses can't overwrite newer results
  const requestSeq = useRef(0);
  const isSearching = searchTerm.trim().length > 0;

  useEffect(() => {
    // Debounce keystrokes while searching; period/type changes load immediately
    const delay = isSearching ? 300 : 0;
    const handle = setTimeout(() => {
      loadInvoices();
    }, delay);
    return () => clearTimeout(handle);
  }, [selectedMonth, selectedYear, selectedType, searchTerm]);

  const loadInvoices = async () => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      const filters: any = {};
      const search = searchTerm.trim();
      if (search) {
        // Search acts as a global lookup across all periods
        filters.search = search;
      } else {
        filters.month = selectedMonth;
        filters.year = selectedYear;
      }
      if (selectedType !== 'all') {
        filters.type = selectedType;
      }
      const data = await invoicesApi.getInvoices(filters);
      if (seq !== requestSeq.current) return; // stale response — a newer request is in flight
      setInvoices(data);
    } catch (error: any) {
      if (seq === requestSeq.current) {
        toast.error(error.response?.data?.message || 'Failed to load invoices');
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  };

  const handleGenerateMonthly = async () => {
    const confirmed = await confirmDialog({
      title: 'Generate Student Invoices',
      message: `Generate invoices for all students for ${MONTHS[selectedMonth - 1]} ${selectedYear}?\n\nNote: Teacher invoices are generated automatically by cronjob at month end.`,
      confirmLabel: 'Generate',
      variant: 'info',
    });
    if (!confirmed) return;

    try {
      const result = await invoicesApi.generateMonthlyStudentInvoices({
        month: selectedMonth,
        year: selectedYear,
      });
      toast.success(result.message || `Generated ${result.studentCount} student invoices`);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate invoices');
    }
  };

  const handleGenerateTeacherInvoices = async () => {
    const confirmed = await confirmDialog({
      title: 'Generate Teacher Invoices',
      message: `Generate teacher invoices for ${MONTHS[selectedMonth - 1]} ${selectedYear}?`,
      confirmLabel: 'Generate',
      variant: 'info',
    });
    if (!confirmed) return;

    try {
      const result = await invoicesApi.generateMonthlyTeacherInvoices({
        month: selectedMonth,
        year: selectedYear,
      });
      toast.success(result.message || `Generated ${result.teacherCount} teacher invoices`);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate teacher invoices');
    }
  };

  const handleRegenerateInvoice = async (invoice: Invoice) => {
    setRegeneratingId(invoice.id);
    try {
      const sessions = await invoicesApi.get1to1Sessions(
        invoice.recipientId, invoice.month, invoice.year
      );
      if (sessions.length > 0) {
        setSessionModal({
          studentId: invoice.recipientId,
          studentName: `${invoice.recipient.firstName} ${invoice.recipient.lastName}`,
          month: invoice.month,
          year: invoice.year,
          sessions,
          invoiceId: invoice.id,
        });
        setRegeneratingId(null);
        return;
      }
    } catch {
      // No 1-to-1 sessions or error — proceed with standard flow
    }

    // No 1-to-1 classes — confirm and regenerate directly
    const confirmed = await confirmDialog({
      title: 'Regenerate Invoice',
      message: `Regenerate invoice for ${invoice.recipient.firstName} ${invoice.recipient.lastName} — ${MONTHS[invoice.month - 1]} ${invoice.year}?\n\nThis will create a new version based on current fee data.`,
      confirmLabel: 'Regenerate',
      variant: 'warning',
    });
    if (!confirmed) { setRegeneratingId(null); return; }

    try {
      await invoicesApi.generateStudentInvoice({ studentId: invoice.recipientId, month: invoice.month, year: invoice.year });
      toast.success('Invoice regenerated successfully');
      loadInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to regenerate invoice');
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleSessionModalConfirm = async (overrides: SessionOverride[]) => {
    if (!sessionModal) return;
    setSessionModalLoading(true);
    try {
      await invoicesApi.generateStudentInvoice({
        studentId: sessionModal.studentId,
        month: sessionModal.month,
        year: sessionModal.year,
        sessionOverrides: overrides,
      });
      toast.success('Invoice generated successfully');
      setSessionModal(null);
      loadInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to generate invoice');
    } finally {
      setSessionModalLoading(false);
    }
  };

  const handleEmailInvoice = async (invoiceId: string) => {
    try {
      setEmailingId(invoiceId);
      await invoicesApi.emailInvoice(invoiceId);
      toast.success('Invoice emailed successfully');
      loadInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to email invoice');
    } finally {
      setEmailingId(null);
    }
  };

  const handleViewPDF = async (invoice: Invoice) => {
    try {
      // Get the appropriate PDF URL based on user role
      const { pdfUrl } = await invoicesApi.downloadInvoice(invoice.id);
      setViewingPdfUrl(pdfUrl);
      setViewingInvoice(invoice);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to load invoice PDF');
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    try {
      // Use the download API to get the appropriate PDF based on user role
      const { pdfUrl, invoiceNumber } = await invoicesApi.downloadInvoice(invoice.id);
      const link = document.createElement('a');
      link.href = import.meta.env.VITE_API_URL.replace('/api', '') + pdfUrl;
      link.download = `${invoiceNumber}.pdf`;
      link.click();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to download invoice');
    }
  };

  const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 5; i--) {
      years.push(i);
    }
    return years;
  };

  const formatAmount = (amount: string, currency: string = 'PKR') => {
    const currencySymbols: Record<string, string> = {
      PKR: 'PKR',
      USD: '$',
      GBP: '£',
      SAR: 'SR',
    };
    const symbol = currencySymbols[currency] || currency;
    return `${symbol} ${parseFloat(amount).toFixed(2)}`;
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Not sent';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (filterCategory !== 'all' && inv.recipient.studentCategory !== filterCategory) return false;
    if (filterSubcategory !== 'all' && inv.recipient.studentSubcategory !== filterSubcategory) return false;
    return true;
  });

  const { items: sortedInvoices, requestSort, getSortIndicator } = useSortableData(filteredInvoices);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
        <p className="mt-2 text-gray-600">View and manage invoices</p>
      </div>

      {/* Filters and Actions */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'md:grid-cols-4 lg:grid-cols-7' : 'md:grid-cols-3'}`}>
          {/* Month Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              {getYearOptions().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Search Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Invoice #, name, email..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            {isSearching && (
              <p className="mt-1 text-xs text-indigo-600">
                Searching across all months and years
              </p>
            )}
          </div>

          {/* Type Filter (Admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All</option>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
              </select>
            </div>
          )}

          {/* Category Filter (Admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Categories</option>
                <option value="senior">Senior</option>
                <option value="junior">Junior</option>
              </select>
            </div>
          )}

          {/* Subcategory Filter (Admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subcategory
              </label>
              <select
                value={filterSubcategory}
                onChange={(e) => setFilterSubcategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="local">Local</option>
                <option value="online">Online</option>
                <option value="aitchison">Aitchison</option>
                <option value="preschool">Preschool</option>
                <option value="summer_camp">Summer Camp</option>
                <option value="academy">Academy</option>
              </select>
            </div>
          )}

          {/* Generate Buttons (Admin only) */}
          {isAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Actions
              </label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleGenerateMonthly}
                  className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Generate Monthly
                </button>
                {isAdmin && (
                  <button
                    onClick={handleGenerateTeacherInvoices}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Generate Teacher Invoices
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invoices List */}
      {loading ? (
        <LoadingSpinner message="Loading invoices..." className="py-12" />
      ) : sortedInvoices.length === 0 ? (
        <EmptyState
          icon={DocumentTextIcon}
          title={
            isSearching
              ? `No invoices matching "${searchTerm.trim()}"`
              : `No invoices found for ${MONTHS[selectedMonth - 1]} ${selectedYear}`
          }
        />
      ) : (
        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th onClick={() => requestSort('invoiceNumber')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  Invoice Number {getSortIndicator('invoiceNumber')}
                </th>
                <th onClick={() => requestSort('type')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  Type {getSortIndicator('type')}
                </th>
                {isAdmin && (
                  <th onClick={() => requestSort('recipient.firstName')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                    Recipient {getSortIndicator('recipient.firstName')}
                  </th>
                )}
                <th onClick={() => requestSort('month')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  Period {getSortIndicator('month')}
                </th>
                <th onClick={() => requestSort('totalAmount')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  Amount {getSortIndicator('totalAmount')}
                </th>
                <th onClick={() => requestSort('emailedAt')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                  Emailed {getSortIndicator('emailedAt')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
              {sortedInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        invoice.type === 'student'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {invoice.type}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.recipient.firstName} {invoice.recipient.lastName}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {MONTHS[invoice.month - 1]} {invoice.year}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatAmount(invoice.totalAmount, invoice.currency)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(invoice.emailedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-1">
                    {invoice.pdfUrl && (
                      <>
                        <button
                          onClick={() => handleViewPDF(invoice)}
                          className="p-1.5 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="View PDF"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleDownloadPDF(invoice)}
                          className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Download PDF"
                        >
                          <ArrowDownTrayIcon className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    {isAdmin && invoice.pdfUrl && (
                      <button
                        onClick={() => handleEmailInvoice(invoice.id)}
                        disabled={emailingId === invoice.id}
                        className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Email Invoice"
                      >
                        <EnvelopeIcon className="h-5 w-5" />
                      </button>
                    )}
                    {isAdmin && invoice.type === 'student' && (
                      <button
                        onClick={() => handleRegenerateInvoice(invoice)}
                        disabled={regeneratingId === invoice.id}
                        className="p-1.5 text-orange-500 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Regenerate Invoice"
                      >
                        <ArrowPathIcon className={`h-5 w-5 ${regeneratingId === invoice.id ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                    {invoice.type === 'student' && invoice.recipient.whatsappGroupLink && invoice.pdfUrl && (
                      <button
                        onClick={async () => {
                          try {
                            const { pdfUrl, invoiceNumber } = await invoicesApi.downloadInvoice(invoice.id);
                            const baseUrl = (import.meta.env.VITE_API_URL || '').replace('/api', '');
                            const downloadUrl = `${window.location.origin}${baseUrl}${pdfUrl}`;
                            const message = `Here is your invoice ${invoiceNumber}:\n${downloadUrl}`;
                            await navigator.clipboard.writeText(message);
                            toast.success('Invoice link copied! Paste it in the WhatsApp group.');
                            window.open(invoice.recipient.whatsappGroupLink, '_blank');
                          } catch {
                            toast.error('Failed to get invoice download link');
                          }
                        }}
                        className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                        title="Send Invoice via WhatsApp"
                      >
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
            Showing {sortedInvoices.length} result{sortedInvoices.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {viewingInvoice && viewingPdfUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {viewingInvoice.invoiceNumber} - {MONTHS[viewingInvoice.month - 1]} {viewingInvoice.year}
              </h3>
              <button
                onClick={() => {
                  setViewingInvoice(null);
                  setViewingPdfUrl(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {/* PDF Viewer */}
            <div className="flex-1 overflow-auto">
              <iframe
                src={import.meta.env.VITE_API_URL.replace('/api', '') + viewingPdfUrl}
                className="w-full h-full"
                title="Invoice PDF"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t flex justify-end space-x-2">
              <button
                onClick={() => handleDownloadPDF(viewingInvoice)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center"
              >
                <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
                Download
              </button>
              <button
                onClick={() => {
                  setViewingInvoice(null);
                  setViewingPdfUrl(null);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog {...dialogProps} />

      {sessionModal && (
        <OneToOneSessionModal
          studentName={sessionModal.studentName}
          month={sessionModal.month}
          year={sessionModal.year}
          sessions={sessionModal.sessions}
          onConfirm={handleSessionModalConfirm}
          onCancel={() => setSessionModal(null)}
          loading={sessionModalLoading}
        />
      )}
    </div>
  );
}
