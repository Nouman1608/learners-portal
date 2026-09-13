import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, DashboardStats, CurrencyAmount } from '../api/dashboard.api';
import toast from 'react-hot-toast';
import { StatCardSkeleton } from '../components/common/Skeleton';
import {
  UserGroupIcon,
  AcademicCapIcon,
  UserPlusIcon,
  BanknotesIcon,
  CalendarIcon,
  ClipboardDocumentCheckIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ClockIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  CreditCardIcon,
  ReceiptPercentIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface QuickAccessItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  roles?: string[];
}

const quickAccessItems: QuickAccessItem[] = [
  { name: 'Users', path: '/users', icon: UserGroupIcon, description: 'Manage users & roles', color: 'blue', roles: ['sudo', 'admin'] },
  { name: 'Courses', path: '/courses', icon: AcademicCapIcon, description: 'Create & manage courses', color: 'purple', roles: ['sudo', 'admin'] },
  { name: 'My Teaching Courses', path: '/my-teaching-courses', icon: BookOpenIcon, description: 'View assigned courses', color: 'indigo', roles: ['teacher'] },
  { name: 'My Courses', path: '/my-courses', icon: BookOpenIcon, description: 'View enrolled courses', color: 'indigo', roles: ['student'] },
  { name: 'Enrollments', path: '/enrollments', icon: UserPlusIcon, description: 'Manage student enrollments', color: 'green', roles: ['sudo', 'admin', 'teacher'] },
  { name: 'Leads', path: '/leads', icon: UserGroupIcon, description: 'Track & manage leads', color: 'teal', roles: ['sudo', 'admin'] },
  { name: 'Message Templates', path: '/message-templates', icon: ChatBubbleLeftRightIcon, description: 'Manage WhatsApp templates', color: 'emerald', roles: ['sudo'] },
  { name: 'Calendar', path: '/calendar', icon: CalendarIcon, description: 'View class schedule', color: 'indigo', roles: ['sudo', 'admin', 'teacher', 'student'] },
  { name: 'Attendance', path: '/attendance', icon: ClipboardDocumentCheckIcon, description: 'Track class attendance', color: 'green', roles: ['sudo', 'admin', 'teacher'] },
  { name: 'Assessments', path: '/assessments', icon: DocumentTextIcon, description: 'Create & grade assessments', color: 'pink', roles: ['sudo', 'admin', 'teacher'] },
  { name: 'My Assessments', path: '/assessments', icon: DocumentTextIcon, description: 'View & take assessments', color: 'pink', roles: ['student'] },
  { name: 'My Results', path: '/my-results', icon: ChartBarIcon, description: 'View grades & scores', color: 'blue', roles: ['student'] },
  { name: 'Fees', path: '/fees', icon: BanknotesIcon, description: 'Track & manage fees', color: 'orange', roles: ['sudo', 'admin'] },
  { name: 'My Fees', path: '/my-fees', icon: CreditCardIcon, description: 'View fee status', color: 'orange', roles: ['student'] },
  { name: 'Invoices', path: '/invoices', icon: DocumentTextIcon, description: 'Generate & view invoices', color: 'yellow', roles: ['sudo', 'admin', 'teacher'] },
  { name: 'My Invoices', path: '/my-invoices', icon: ReceiptPercentIcon, description: 'Download invoices', color: 'teal', roles: ['student'] },
  { name: 'Analytics', path: '/analytics', icon: ChartBarIcon, description: 'View performance analytics', color: 'violet', roles: ['sudo', 'admin'] },
  { name: 'Logs', path: '/logs', icon: ClockIcon, description: 'System audit trail', color: 'red', roles: ['sudo', 'admin'] },
  { name: 'Account Settings', path: '/account-settings', icon: UserCircleIcon, description: 'Manage your account', color: 'gray', roles: ['student', 'teacher'] },
  { name: 'Teams Settings', path: '/settings/teams', icon: Cog6ToothIcon, description: 'Configure Microsoft Teams', color: 'blue', roles: ['sudo', 'admin', 'teacher'] },
];

const colorClasses: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
  green: { bg: 'bg-green-100', text: 'text-green-600' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-600' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600' },
  red: { bg: 'bg-red-100', text: 'text-red-600' },
  gray: { bg: 'bg-gray-100', text: 'text-gray-600' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
};

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch (error: any) {
      toast.error('Failed to load dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getCurrencySymbol = (currency: string): string => {
    const symbols: Record<string, string> = {
      'PKR': 'PKR',
      'USD': '$',
      'GBP': '£',
      'SAR': 'SR',
    };
    return symbols[currency] || currency;
  };

  const formatCurrency = (amount: string | undefined, currency: string = 'PKR') => {
    if (!amount) return `${getCurrencySymbol(currency)} 0.00`;
    const symbol = getCurrencySymbol(currency);
    return `${symbol} ${parseFloat(amount).toFixed(2)}`;
  };

  const formatMultiCurrency = (amounts: CurrencyAmount[] | undefined): React.ReactNode => {
    if (!amounts || amounts.length === 0) {
      return <span className="text-gray-400">No fees</span>;
    }

    // Filter out zero amounts
    const nonZeroAmounts = amounts.filter(a => parseFloat(a.amount) > 0);

    if (nonZeroAmounts.length === 0) {
      return <span className="text-gray-400">PKR 0.00</span>;
    }

    return (
      <div className="flex flex-col gap-1">
        {nonZeroAmounts.map((item, index) => (
          <div key={index} className={nonZeroAmounts.length > 1 ? 'text-2xl' : 'text-3xl'}>
            {formatCurrency(item.amount, item.currency)}
          </div>
        ))}
      </div>
    );
  };

  const canAccessRoute = (roles?: string[]) => {
    if (!roles) return true;
    return user?.role && roles.includes(user.role);
  };

  const getUserQuickAccessItems = () => {
    return quickAccessItems.filter(item => canAccessRoute(item.roles));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Learners Academy Dashboard
          </h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Card */}
        <div className="bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl shadow-soft p-6 mb-6 text-white animate-fade-in">
          <h2 className="text-xl font-semibold mb-2">
            Welcome, {user?.firstName} {user?.lastName}!
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-indigo-200">Username</p>
              <p className="font-medium">{user?.username}</p>
            </div>
            <div>
              <p className="text-sm text-indigo-200">Role</p>
              <p className="font-medium capitalize">{user?.role}</p>
            </div>
            <div>
              <p className="text-sm text-indigo-200">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm text-indigo-200">Status</p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Quick Access */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
            {getUserQuickAccessItems().map((item) => {
              const colors = colorClasses[item.color] || colorClasses.blue;
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="bg-white rounded-xl shadow-card p-6 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300 text-left group"
                >
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 ${colors.bg} rounded-lg p-3 group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className={`h-6 w-6 ${colors.text}`} />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
        {loading ? (
          <div className="mb-8">
            <div className="h-6 w-24 skeleton-shimmer rounded mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)}
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
              {/* Admin/Sudo Stats */}
              {(user?.role === 'sudo' || user?.role === 'admin') && (
                <>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-blue-500">
                    <h3 className="text-sm font-medium text-gray-500">Total Users</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.totalUsers || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-purple-500">
                    <h3 className="text-sm font-medium text-gray-500">Total Courses</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.totalCourses || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-green-500">
                    <h3 className="text-sm font-medium text-gray-500">Active Students</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.activeStudents || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-indigo-500">
                    <h3 className="text-sm font-medium text-gray-500">Teachers</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.totalTeachers || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-teal-500">
                    <h3 className="text-sm font-medium text-gray-500">Active Enrollments</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.activeEnrollments || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-orange-500">
                    <h3 className="text-sm font-medium text-gray-500">Pending Fees</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats?.pendingFees || 0}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-red-500">
                    <h3 className="text-sm font-medium text-gray-500">Total Due</h3>
                    <div className="font-bold text-gray-900 mt-2">
                      {formatMultiCurrency(stats?.totalFeesByCurrency)}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-emerald-500">
                    <h3 className="text-sm font-medium text-gray-500">Paid This Month</h3>
                    <div className="font-bold text-gray-900 mt-2">
                      {formatMultiCurrency(stats?.paidFeesAmountThisMonth)}
                    </div>
                    {(stats?.paidFeesThisMonth ?? 0) > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{stats?.paidFeesThisMonth} fee(s) received</p>
                    )}
                  </div>
                </>
              )}

              {/* Student Stats */}
              {user?.role === 'student' && stats?.student && (
                <>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-indigo-500">
                    <h3 className="text-sm font-medium text-gray-500">My Enrollments</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.student.myEnrollments}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-orange-500">
                    <h3 className="text-sm font-medium text-gray-500">Pending Fees</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.student.myPendingFees}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-red-500">
                    <h3 className="text-sm font-medium text-gray-500">Total Due</h3>
                    <div className="font-bold text-gray-900 mt-2">
                      {formatMultiCurrency(stats.student.myTotalDueByCurrency)}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-cyan-500">
                    <h3 className="text-sm font-medium text-gray-500">Upcoming Classes</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.student.upcomingClasses}
                    </p>
                  </div>
                  {stats.student.projected1to1Fees && stats.student.projected1to1Fees.length > 0 && (
                    <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-violet-500">
                      <h3 className="text-sm font-medium text-gray-500">Projected 1-to-1 / Month</h3>
                      <div className="font-bold text-gray-900 mt-2">
                        {formatMultiCurrency(stats.student.projected1to1Fees)}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Based on expected sessions</p>
                    </div>
                  )}
                </>
              )}

              {/* Teacher Stats */}
              {user?.role === 'teacher' && stats?.teacher && (
                <>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-purple-500">
                    <h3 className="text-sm font-medium text-gray-500">My Courses</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.teacher.myCourses}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-green-500">
                    <h3 className="text-sm font-medium text-gray-500">My Students</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.teacher.myStudents}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl shadow-card hover:shadow-card-hover transition-all duration-300 p-6 border-l-4 border-cyan-500">
                    <h3 className="text-sm font-medium text-gray-500">Upcoming Classes</h3>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.teacher.upcomingClasses}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
