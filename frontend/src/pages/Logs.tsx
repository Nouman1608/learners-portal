import { useState, useEffect, useRef } from 'react';
import { logsApi, ActivityLog, LogStats } from '../api/logs.api';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
  UserIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { useSortableData } from '../hooks/useSortableData';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';

const ITEMS_PER_PAGE = 50;

export default function Logs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<LogStats | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedResource, setSelectedResource] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter options
  const [actions, setActions] = useState<string[]>([]);
  const [resources, setResources] = useState<string[]>([]);

  // View state
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // Sorting
  const { items: sortedLogs, requestSort, getSortIndicator } = useSortableData(logs);

  useEffect(() => {
    loadFilterOptions();
    loadStats();
  }, []);

  // Monotonic counter so out-of-order API responses can't overwrite newer results
  const requestSeq = useRef(0);

  useEffect(() => {
    // Debounce keystrokes while searching; other filter changes load immediately
    const delay = search ? 300 : 0;
    const handle = setTimeout(() => {
      loadLogs();
    }, delay);
    return () => clearTimeout(handle);
  }, [search, selectedAction, selectedResource, startDate, endDate, currentPage]);

  const loadLogs = async () => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      const filters: any = {
        limit: ITEMS_PER_PAGE,
        offset: (currentPage - 1) * ITEMS_PER_PAGE,
      };

      if (search) filters.search = search;
      if (selectedAction) filters.action = selectedAction;
      if (selectedResource) filters.resource = selectedResource;
      if (startDate) filters.startDate = new Date(startDate).toISOString();
      if (endDate) filters.endDate = new Date(endDate).toISOString();

      const data = await logsApi.getLogs(filters);
      if (seq !== requestSeq.current) return; // stale response — a newer request is in flight
      setLogs(data.logs);
      setTotal(data.total);
    } catch (error: any) {
      if (seq === requestSeq.current) {
        toast.error(error.response?.data?.message || 'Failed to load activity logs');
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  };

  const loadFilterOptions = async () => {
    try {
      const [actionsData, resourcesData] = await Promise.all([
        logsApi.getUniqueActions(),
        logsApi.getUniqueResources(),
      ]);
      setActions(actionsData);
      setResources(resourcesData);
    } catch (error: any) {
      console.error('Failed to load filter options:', error);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await logsApi.getStats(7);
      setStats(statsData);
    } catch (error: any) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedAction('');
    setSelectedResource('');
    setStartDate('');
    setEndDate('');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDetails = (details: string | null) => {
    if (!details) return 'N/A';
    try {
      const parsed = JSON.parse(details);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return details;
    }
  };

  const getActionColor = (action: string) => {
    if (action.includes('create')) return 'bg-green-100 text-green-800';
    if (action.includes('update') || action.includes('edit')) return 'bg-blue-100 text-blue-800';
    if (action.includes('delete')) return 'bg-red-100 text-red-800';
    if (action.includes('login')) return 'bg-purple-100 text-purple-800';
    if (action.includes('generate')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Activity Logs</h1>
        <p className="mt-2 text-gray-600">Monitor system activity and user actions</p>
      </div>

      {/* Stats Cards */}
      {showStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-indigo-100 rounded-md p-3">
                <ChartBarIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Actions (7d)</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalActions}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                <UserIcon className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active Users (7d)</p>
                <p className="text-2xl font-bold text-gray-900">{stats.uniqueUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <p className="text-sm font-medium text-gray-500 mb-3">Top Actions (7d)</p>
            <div className="space-y-2">
              {stats.actionsByType.slice(0, 3).map((item) => (
                <div key={item.action} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{item.action}</span>
                  <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search logs (action, resource, details)..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 inline-flex items-center"
          >
            <FunnelIcon className="h-5 w-5 mr-2" />
            Filters
          </button>

          {/* Stats Toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 inline-flex items-center"
          >
            <ChartBarIcon className="h-5 w-5 mr-2" />
            Stats
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
              <select
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Actions</option>
                {actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Resource</label>
              <select
                value={selectedResource}
                onChange={(e) => {
                  setSelectedResource(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">All Resources</option>
                {resources.map((resource) => (
                  <option key={resource} value={resource}>
                    {resource}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Logs Table */}
      {loading ? (
        <LoadingSpinner message="Loading logs..." className="py-12" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={DocumentTextIcon}
          title="No logs found"
          description="Try adjusting your filters"
        />
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-card overflow-hidden mb-4">
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th
                    onClick={() => requestSort('timestamp')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    Timestamp {getSortIndicator('timestamp')}
                  </th>
                  <th
                    onClick={() => requestSort('user.username')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    User {getSortIndicator('user.username')}
                  </th>
                  <th
                    onClick={() => requestSort('action')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    Action {getSortIndicator('action')}
                  </th>
                  <th
                    onClick={() => requestSort('resource')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    Resource {getSortIndicator('resource')}
                  </th>
                  <th
                    onClick={() => requestSort('ipAddress')}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    IP Address {getSortIndicator('ipAddress')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                {sortedLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(log.timestamp)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.user ? (
                        <div>
                          <p className="font-medium">{log.user.username}</p>
                          <p className="text-xs text-gray-500">
                            {log.user.firstName} {log.user.lastName}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400">Unknown</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getActionColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.resource}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.ipAddress || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="bg-white rounded-lg shadow px-6 py-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
              {Math.min(currentPage * ITEMS_PER_PAGE, total)} of {total} results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <div className="flex items-center px-4 py-2 bg-indigo-100 text-indigo-700 rounded-md">
                Page {currentPage} of {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Log Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">Log Details</h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Timestamp</p>
                <p className="mt-1 text-sm text-gray-900">{formatDate(selectedLog.timestamp)}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">User</p>
                <p className="mt-1 text-sm text-gray-900">
                  {selectedLog.user
                    ? `${selectedLog.user.username} (${selectedLog.user.firstName} ${selectedLog.user.lastName})`
                    : 'Unknown'}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">Action</p>
                <p className="mt-1 text-sm text-gray-900">{selectedLog.action}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">Resource</p>
                <p className="mt-1 text-sm text-gray-900">{selectedLog.resource}</p>
              </div>

              {selectedLog.resourceId && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Resource ID</p>
                  <p className="mt-1 text-sm text-gray-900 font-mono">{selectedLog.resourceId}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-500">IP Address</p>
                <p className="mt-1 text-sm text-gray-900">{selectedLog.ipAddress || 'N/A'}</p>
              </div>

              {selectedLog.userAgent && (
                <div>
                  <p className="text-sm font-medium text-gray-500">User Agent</p>
                  <p className="mt-1 text-sm text-gray-900 break-all">{selectedLog.userAgent}</p>
                </div>
              )}

              {selectedLog.details && (
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-2">Details</p>
                  <pre className="mt-1 text-xs text-gray-900 bg-gray-50 p-4 rounded-md overflow-auto max-h-64">
                    {formatDetails(selectedLog.details)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
