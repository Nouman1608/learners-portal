import React, { useState, useEffect, useRef } from 'react';
import { usersApi, CreateUserInput, UpdateUserInput } from '../api/users.api';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { PlusIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon, PencilIcon, KeyIcon, UserGroupIcon, NoSymbolIcon } from '@heroicons/react/24/outline';
import UserForm from '../components/users/UserForm';
import LoadingSpinner from '../components/common/LoadingSpinner';
import EmptyState from '../components/common/EmptyState';
import { useSortableData } from '../hooks/useSortableData';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [isActiveFilter, setIsActiveFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'sudo';
  const { confirm, dialogProps } = useConfirmDialog();

  // Sorting
  const { items: sortedUsers, requestSort, getSortIndicator } = useSortableData(users);

  // Helper function to format phone number for WhatsApp
  const formatWhatsAppNumber = (phone: string) => {
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
  };

  // Monotonic counter so out-of-order API responses can't overwrite newer results
  const requestSeq = useRef(0);

  const fetchUsers = async () => {
    const seq = ++requestSeq.current;
    try {
      setLoading(true);
      const data = await usersApi.getUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        isActive: isActiveFilter ? isActiveFilter === 'true' : undefined,
        studentCategory: categoryFilter || undefined,
        studentSubcategory: subcategoryFilter || undefined,
        limit: 10000, // Fetch all users
      });
      if (seq !== requestSeq.current) return; // stale response — a newer request is in flight
      setUsers(data);
      setSelectedIds(new Set()); // Clear selection on reload
    } catch (error: any) {
      if (seq === requestSeq.current) {
        toast.error(error.response?.data?.error || 'Failed to fetch users');
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Debounce keystrokes while searching; other filter changes load immediately
    const delay = search ? 300 : 0;
    const handle = setTimeout(() => {
      fetchUsers();
    }, delay);
    return () => clearTimeout(handle);
  }, [search, roleFilter, isActiveFilter, categoryFilter, subcategoryFilter]);

  const handleCreateUser = async (data: CreateUserInput) => {
    try {
      await usersApi.createUser(data);
      toast.success('User created successfully');
      setShowModal(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create user');
      throw error;
    }
  };

  const handleUpdateUser = async (id: string, data: UpdateUserInput) => {
    try {
      await usersApi.updateUser(id, data);
      toast.success('User updated successfully');
      setShowModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update user');
      throw error;
    }
  };

  const handleDeleteUser = async (user: User) => {
    const confirmed = await confirm({
      title: 'Delete User Permanently',
      message: `Are you sure you want to permanently delete ${user.username}? This will remove all their data including enrollments, fees, invoices, and assessments. This action cannot be undone.`,
      confirmLabel: 'Delete Permanently',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await usersApi.deleteUser(user.id);
      toast.success('User deleted permanently');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleDeactivateUser = async (user: User) => {
    const confirmed = await confirm({
      title: 'Deactivate User',
      message: `Are you sure you want to deactivate ${user.username}? They will no longer be able to log in but their data will be preserved.`,
      confirmLabel: 'Deactivate',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      await usersApi.updateUser(user.id, { isActive: false });
      toast.success('User deactivated successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to deactivate user');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map(u => u.id)));
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
      toast.error('No users selected');
      return;
    }

    const confirmed = await confirm({
      title: 'Bulk Delete',
      message: `Are you sure you want to permanently delete ${selectedIds.size} user(s)? All their data will be removed. This action cannot be undone.`,
      confirmLabel: 'Delete All',
      variant: 'danger',
    });
    if (!confirmed) return;

    try {
      const promises = Array.from(selectedIds).map(id => usersApi.deleteUser(id));
      await Promise.all(promises);
      toast.success(`${selectedIds.size} user(s) deleted permanently`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete users');
    }
  };

  const handleResetPassword = async (user: User) => {
    const customPassword = await confirm({
      title: 'Reset Password',
      message: `Reset password for ${user.firstName} ${user.lastName} (${user.username})? Enter a custom password or leave empty to auto-generate one.`,
      confirmLabel: 'Reset Password',
      variant: 'warning',
      showInput: true,
      inputLabel: 'New Password (optional)',
      inputPlaceholder: 'Leave empty to auto-generate',
      inputType: 'password',
    });

    if (customPassword === false) return;

    const password = typeof customPassword === 'string' && customPassword.length > 0 ? customPassword : undefined;

    if (password && password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      const result = await usersApi.resetPassword(user.id, password);

      await confirm({
        title: 'Password Reset Successful',
        message: `User: ${user.username}\nNew Password: ${result.temporaryPassword}\n\nPlease share this password securely with the user. They should change it after logging in.`,
        confirmLabel: 'OK',
        variant: 'info',
        hideCancel: true,
      });

      toast.success('Password reset successfully');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reset password');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.length} user{users.length !== 1 ? 's' : ''} {selectedIds.size > 0 && `(${selectedIds.size} selected)`}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setShowModal(true);
          }}
          className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add User
        </button>
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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, username, or email..."
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkDeactivate}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
          >
            <TrashIcon className="h-4 w-4 mr-2" />
            Delete Selected ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="">All Roles</option>
          <option value="sudo">Sudo</option>
          <option value="admin">Admin</option>
          <option value="teacher">Teacher</option>
          <option value="student">Student</option>
        </select>
        <select
          value={isActiveFilter}
          onChange={(e) => setIsActiveFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setSubcategoryFilter(''); // Reset subcategory when category changes
          }}
          className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
        >
          <option value="">All Categories</option>
          <option value="junior">Junior</option>
          <option value="senior">Senior</option>
        </select>
        {categoryFilter && (
          <select
            value={subcategoryFilter}
            onChange={(e) => setSubcategoryFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm"
          >
            <option value="">All Subcategories</option>
            {categoryFilter === 'junior' && (
              <>
                <option value="aitchison">Aitchison</option>
                <option value="preschool">Preschool</option>
                <option value="summer_camp">Summer Camp</option>
                <option value="academy">Academy</option>
              </>
            )}
            {categoryFilter === 'senior' && (
              <>
                <option value="local">Local</option>
                <option value="online">Online</option>
              </>
            )}
          </select>
        )}
        {(search || roleFilter || isActiveFilter || categoryFilter || subcategoryFilter) && (
          <button
            onClick={() => {
              setSearch('');
              setRoleFilter('');
              setIsActiveFilter('');
              setCategoryFilter('');
              setSubcategoryFilter('');
            }}
            className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Users Table */}
      {loading ? (
        <LoadingSpinner message="Loading users..." className="py-12" />
      ) : users.length === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title={search || roleFilter || isActiveFilter || categoryFilter || subcategoryFilter ? 'No users match your filters' : 'No users found'}
          description={!(search || roleFilter || isActiveFilter || categoryFilter || subcategoryFilter) ? 'Create a new user to get started' : undefined}
        />
      ) : (
        <div className="bg-white shadow-card rounded-xl overflow-hidden border border-gray-200">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === users.length && users.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th
                    onClick={() => requestSort('firstName')}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    User {getSortIndicator('firstName')}
                  </th>
                  <th
                    onClick={() => requestSort('role')}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    Role {getSortIndicator('role')}
                  </th>
                  <th
                    onClick={() => requestSort('email')}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    Contact {getSortIndicator('email')}
                  </th>
                  <th
                    onClick={() => requestSort('isActive')}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  >
                    Status {getSortIndicator('isActive')}
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
                {sortedUsers.map((user) => (
                  <tr key={user.id} className={`hover:bg-indigo-50/30 transition-colors ${selectedIds.has(user.id) ? 'bg-indigo-50/50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => handleSelectOne(user.id)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-xs text-gray-500">@{user.username}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        user.role === 'sudo' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                        user.role === 'teacher' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm text-gray-900">{user.email}</div>
                      <div className="text-xs text-gray-500">
                        {user.phone ? (
                          isAdmin ? (
                            <a
                              href={`https://wa.me/${formatWhatsAppNumber(user.phone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 hover:underline"
                              title="Open in WhatsApp"
                            >
                              {user.phone}
                            </a>
                          ) : (
                            user.phone
                          )
                        ) : (
                          '-'
                        )}
                      </div>
                      {user.parentPhone && (
                        <div className="text-xs text-gray-500">
                          Parent:{' '}
                          {isAdmin ? (
                            <a
                              href={`https://wa.me/${formatWhatsAppNumber(user.parentPhone)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 hover:underline"
                              title="Open in WhatsApp"
                            >
                              {user.parentPhone}
                            </a>
                          ) : (
                            user.parentPhone
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {user.isActive ? (
                        <span className="text-xs px-2 py-0.5 inline-flex rounded-full bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 inline-flex rounded-full bg-red-100 text-red-800">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setShowModal(true);
                          }}
                          className="p-1.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit User"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {user.role === 'student' && (user as any).whatsappGroupLink && (
                          <a
                            href={(user as any).whatsappGroupLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-colors"
                            title="WhatsApp Group"
                          >
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                            </svg>
                          </a>
                        )}
                        <button
                          onClick={() => handleResetPassword(user)}
                          className="p-1.5 text-yellow-600 hover:text-yellow-900 hover:bg-yellow-50 rounded-lg transition-colors"
                          title="Reset Password"
                        >
                          <KeyIcon className="h-4 w-4" />
                        </button>
                        {user.isActive && (
                          <button
                            onClick={() => handleDeactivateUser(user)}
                            className="p-1.5 text-orange-600 hover:text-orange-900 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Deactivate User"
                          >
                            <NoSymbolIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete User Permanently"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
            Showing {sortedUsers.length} result{sortedUsers.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <UserForm
          user={editingUser}
          onClose={() => {
            setShowModal(false);
            setEditingUser(null);
          }}
          onSubmit={editingUser ? (data) => handleUpdateUser(editingUser.id, data as UpdateUserInput) : (data) => handleCreateUser(data as CreateUserInput)}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default Users;
