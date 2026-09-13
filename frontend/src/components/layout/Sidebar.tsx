import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import authApi from '../../api/auth.api';
import toast from 'react-hot-toast';
import {
  HomeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  UserPlusIcon,
  BanknotesIcon,
  CalendarIcon,
  ClipboardDocumentCheckIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ClockIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  XMarkIcon,
  BookOpenIcon,
  CreditCardIcon,
  ReceiptPercentIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigationItems: NavItem[] = [
  { name: 'Dashboard', path: '/dashboard', icon: HomeIcon },
  { name: 'Users', path: '/users', icon: UserGroupIcon, roles: ['sudo', 'admin'] },
  { name: 'Courses', path: '/courses', icon: AcademicCapIcon, roles: ['sudo', 'admin'] },
  { name: 'My Teaching Courses', path: '/my-teaching-courses', icon: BookOpenIcon, roles: ['teacher'] },
  { name: 'My Courses', path: '/my-courses', icon: BookOpenIcon, roles: ['student'] },
  { name: 'Enrollments', path: '/enrollments', icon: UserPlusIcon, roles: ['sudo', 'admin', 'teacher'] },
  { name: 'Leads', path: '/leads', icon: UserGroupIcon, roles: ['sudo', 'admin'] },
  { name: 'Message Templates', path: '/message-templates', icon: ChatBubbleLeftRightIcon, roles: ['sudo'] },
  { name: 'Calendar', path: '/calendar', icon: CalendarIcon },
  { name: 'Attendance', path: '/attendance', icon: ClipboardDocumentCheckIcon, roles: ['sudo', 'admin', 'teacher'] },
  { name: 'Assessments', path: '/assessments', icon: DocumentTextIcon, roles: ['sudo', 'admin', 'teacher', 'student'] },
  { name: 'My Results', path: '/my-results', icon: ChartBarIcon, roles: ['student'] },
  { name: 'Fees', path: '/fees', icon: BanknotesIcon, roles: ['sudo', 'admin'] },
  { name: 'My Fees', path: '/my-fees', icon: CreditCardIcon, roles: ['student'] },
  { name: 'Invoices', path: '/invoices', icon: DocumentTextIcon, roles: ['sudo', 'admin', 'teacher'] },
  { name: 'My Invoices', path: '/my-invoices', icon: ReceiptPercentIcon, roles: ['student'] },
  { name: 'Analytics', path: '/analytics', icon: ChartBarIcon, roles: ['sudo', 'admin'] },
  { name: 'Logs', path: '/logs', icon: ClockIcon, roles: ['sudo', 'admin'] },
  { name: 'Account Settings', path: '/account-settings', icon: UserCircleIcon, roles: ['student', 'teacher'] },
  { name: 'Teams Settings', path: '/settings/teams', icon: Cog6ToothIcon, roles: ['sudo', 'admin', 'teacher'] },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [editingTeams, setEditingTeams] = useState(false);
  const [teamsValue, setTeamsValue] = useState('');
  const [savingTeams, setSavingTeams] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditTeams = () => {
    setTeamsValue(user?.teamsUsername || '');
    setEditingTeams(true);
  };

  useEffect(() => {
    if (editingTeams) inputRef.current?.focus();
  }, [editingTeams]);

  const saveTeams = async () => {
    const trimmed = teamsValue.trim();
    if (trimmed === (user?.teamsUsername || '')) {
      setEditingTeams(false);
      return;
    }
    setSavingTeams(true);
    try {
      await authApi.updateProfile({ teamsUsername: trimmed });
      await refreshUser();
      toast.success('Teams username updated');
    } catch {
      toast.error('Failed to update Teams username');
    } finally {
      setSavingTeams(false);
      setEditingTeams(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveTeams();
    if (e.key === 'Escape') setEditingTeams(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canAccessRoute = (roles?: string[]) => {
    if (!roles) return true;
    return user?.role && roles.includes(user.role);
  };

  const handleNavClick = () => {
    // Close sidebar on mobile when navigating
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50
        transform ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 transition-transform duration-300 ease-in-out
        flex flex-col w-64 bg-gray-900 h-screen
      `}>
      {/* Logo/Brand */}
      <div className="flex items-center justify-between py-4 px-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex flex-col items-center flex-1">
          <img src="/logo.svg" alt="Learners Academy" className="h-12 w-auto mb-2" />
          <h1 className="text-lg font-bold text-white">Learners Academy</h1>
        </div>
        {/* Close button for mobile */}
        <button
          onClick={onClose}
          className="md:hidden text-gray-400 hover:text-white"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      {/* User Info */}
      <div className="flex items-center gap-3 p-4 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <UserCircleIcon className="h-10 w-10 text-gray-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {user?.firstName} {user?.lastName}
          </p>
          {editingTeams ? (
            <input
              ref={inputRef}
              value={teamsValue}
              onChange={(e) => setTeamsValue(e.target.value)}
              onBlur={saveTeams}
              onKeyDown={handleKeyDown}
              disabled={savingTeams}
              placeholder="Teams username"
              className="w-full text-xs bg-gray-700 text-indigo-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-indigo-400 placeholder-gray-500"
            />
          ) : (
            <button
              onClick={startEditTeams}
              className="group flex items-center gap-1 max-w-full text-left"
              title="Click to edit Teams username"
            >
              <span className={`text-xs truncate ${user?.teamsUsername ? 'text-indigo-400' : 'text-gray-500 italic'}`}>
                {user?.teamsUsername || 'Set Teams username'}
              </span>
              <PencilIcon className="h-3 w-3 text-gray-500 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
            </button>
          )}
          <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 min-h-0">
        <div className="space-y-1 px-3">
          {navigationItems.map((item) => {
            if (!canAccessRoute(item.roles)) return null;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center gap-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-indigo-600/20 text-white border-l-[3px] border-indigo-400 pl-2.5 pr-3'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white px-3'
                  }`
                }
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Logout - Sticky at bottom */}
      <div className="p-4 border-t border-gray-700 bg-gray-900 flex-shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </div>
      </div>
    </>
  );
}
