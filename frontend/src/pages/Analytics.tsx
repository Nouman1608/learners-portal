import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AnalyticsQueryParams } from '../api/analytics.api';
import FinancialDashboard from '../components/analytics/FinancialDashboard';
import PerformanceDashboard from '../components/analytics/PerformanceDashboard';
import AttendanceDashboard from '../components/analytics/AttendanceDashboard';
import CourseDashboard from '../components/analytics/CourseDashboard';
import TeacherDashboard from '../components/analytics/TeacherDashboard';

type TabType = 'financial' | 'performance' | 'attendance' | 'courses' | 'teachers';

export default function Analytics() {
  const { hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('performance');
  const [filters, setFilters] = useState<AnalyticsQueryParams>({
    groupBy: 'month',
  });

  // Determine available tabs based on role
  const isAdmin = hasRole(['admin', 'sudo']);
  const isTeacher = hasRole(['teacher', 'admin', 'sudo']);

  const tabs: { id: TabType; label: string; allowed: boolean }[] = [
    { id: 'financial', label: 'Financial', allowed: isAdmin },
    { id: 'performance', label: 'Performance', allowed: isTeacher },
    { id: 'attendance', label: 'Attendance', allowed: isTeacher },
    { id: 'courses', label: 'Courses', allowed: isTeacher },
    { id: 'teachers', label: 'Teachers', allowed: isAdmin },
  ];

  const availableTabs = tabs.filter(tab => tab.allowed);

  // Set default tab to first available
  if (!availableTabs.find(t => t.id === activeTab)) {
    if (availableTabs.length > 0 && activeTab !== availableTabs[0].id) {
      setActiveTab(availableTabs[0].id);
    }
  }

  const handleDateRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleGroupByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters(prev => ({ ...prev, groupBy: e.target.value as 'day' | 'week' | 'month' }));
  };

  const resetFilters = () => {
    setFilters({ groupBy: 'month' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Comprehensive insights and analytics across all system domains
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                name="startDate"
                value={filters.startDate || ''}
                onChange={handleDateRangeChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                name="endDate"
                value={filters.endDate || ''}
                onChange={handleDateRangeChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group By
              </label>
              <select
                value={filters.groupBy || 'month'}
                onChange={handleGroupByChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'financial' && isAdmin && (
              <FinancialDashboard filters={filters} />
            )}
            {activeTab === 'performance' && isTeacher && (
              <PerformanceDashboard filters={filters} />
            )}
            {activeTab === 'attendance' && isTeacher && (
              <AttendanceDashboard filters={filters} />
            )}
            {activeTab === 'courses' && isTeacher && (
              <CourseDashboard filters={filters} />
            )}
            {activeTab === 'teachers' && isAdmin && (
              <TeacherDashboard filters={filters} />
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Analytics are calculated in real-time based on your filtered date range.
            Use the filters above to customize the data you're viewing. Charts and tables update automatically
            when you change the filters.
          </p>
        </div>
      </div>
    </div>
  );
}
