import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalApi, StudentOverview } from '../api/student-portal.api';
import ParentDashboard from '../components/parent-portal/ParentDashboard';
import AcademicReport from '../components/parent-portal/AcademicReport';
import AttendanceReport from '../components/parent-portal/AttendanceReport';
import FeesStatement from '../components/parent-portal/FeesStatement';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

type TabType = 'overview' | 'academic' | 'attendance' | 'fees';

export default function ParentPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [overview, setOverview] = useState<StudentOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // For parent portal, we use the logged-in student's ID
  const studentId = user?.id || '';

  useEffect(() => {
    if (studentId) {
      fetchOverview();
    }
  }, [studentId]);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const data = await studentPortalApi.getStudentOverview(studentId);
      setOverview(data);
    } catch (error) {
      console.error('Failed to fetch student overview:', error);
      toast.error('Failed to load student information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <ArrowPathIcon className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading student portal...</p>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No student information available</p>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'academic', label: 'Academic Performance' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'fees', label: 'Fees & Payments' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Student Portal</h1>
          <p className="mt-2 text-sm text-gray-600">
            View your academic progress, attendance, and fee information
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
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
            {activeTab === 'overview' && <ParentDashboard overview={overview} />}
            {activeTab === 'academic' && <AcademicReport studentId={studentId} />}
            {activeTab === 'attendance' && <AttendanceReport studentId={studentId} />}
            {activeTab === 'fees' && <FeesStatement studentId={studentId} />}
          </div>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> This portal provides a comprehensive view of your academic journey.
            All data is updated in real-time. For questions about grades, attendance, or fees,
            please contact your teachers or the administration office.
          </p>
        </div>
      </div>
    </div>
  );
}
