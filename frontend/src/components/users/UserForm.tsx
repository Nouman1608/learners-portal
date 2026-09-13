import React, { useState } from 'react';
import { User, Role } from '../../types';
import { CreateUserInput, UpdateUserInput } from '../../api/users.api';
import { useAuth } from '../../context/AuthContext';

interface UserFormProps {
  user?: User | null;
  onClose: () => void;
  onSubmit: (data: CreateUserInput | UpdateUserInput) => Promise<void>;
}

const UserForm: React.FC<UserFormProps> = ({ user, onClose, onSubmit }) => {
  const { user: currentUser } = useAuth();
  const isEditing = !!user;
  const isSudo = currentUser?.role === 'sudo';

  const [formData, setFormData] = useState({
    username: user?.username || '',
    password: '',
    role: user?.role || 'student',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    parentPhone: user?.parentPhone || '',
    studentCategory: (user as any)?.studentCategory || '',
    studentSubcategory: (user as any)?.studentSubcategory || '',
    whatsappGroupLink: (user as any)?.whatsappGroupLink || '',
    teamsUsername: (user as any)?.teamsUsername || '',
    isActive: user?.isActive ?? true,
    teacherPaymentType: (user as any)?.teacherPaymentType || 'percentage_based',
    localStudentFeePercentage: (user as any)?.localStudentFeePercentage || '',
    onlineStudentFixedAmountIg: (user as any)?.onlineStudentFixedAmountIg || '',
    onlineStudentFixedAmountAlevel: (user as any)?.onlineStudentFixedAmountAlevel || '',
    monthlySalary: (user as any)?.monthlySalary || '',
  });

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEditing) {
        // Cleared text fields are sent as '' (backend stores null); using
        // `|| undefined` would drop the key and make clearing a silent no-op
        const updateData: UpdateUserInput = {
          username: formData.username,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone ?? '',
          parentPhone: formData.parentPhone ?? '',
          isActive: formData.isActive,
        };
        // Only sudo users can update roles
        if (isSudo) {
          updateData.role = formData.role as 'admin' | 'teacher' | 'student';
        }
        // Include student category if role is student
        if (formData.role === 'student') {
          updateData.studentCategory = formData.studentCategory ?? '';
          updateData.studentSubcategory = formData.studentSubcategory ?? '';
          updateData.whatsappGroupLink = formData.whatsappGroupLink ?? '';
          updateData.teamsUsername = formData.teamsUsername ?? '';
        }
        // Include teacher fee fields if role is teacher.
        // The opposite payment type's fields are cleared with null (undefined
        // would be dropped from the JSON body and leave stale values behind).
        if (formData.role === 'teacher') {
          updateData.teamsUsername = formData.teamsUsername ?? '';
          updateData.teacherPaymentType = formData.teacherPaymentType as 'percentage_based' | 'salaried';
          if (formData.teacherPaymentType === 'salaried') {
            updateData.monthlySalary = formData.monthlySalary
              ? parseFloat(formData.monthlySalary as any)
              : undefined;
            updateData.localStudentFeePercentage = null;
            updateData.onlineStudentFixedAmountIg = null;
            updateData.onlineStudentFixedAmountAlevel = null;
          } else {
            updateData.localStudentFeePercentage = formData.localStudentFeePercentage
              ? parseFloat(formData.localStudentFeePercentage as any)
              : undefined;
            updateData.onlineStudentFixedAmountIg = formData.onlineStudentFixedAmountIg
              ? parseFloat(formData.onlineStudentFixedAmountIg as any)
              : undefined;
            updateData.onlineStudentFixedAmountAlevel = formData.onlineStudentFixedAmountAlevel
              ? parseFloat(formData.onlineStudentFixedAmountAlevel as any)
              : undefined;
            updateData.monthlySalary = null;
          }
        }
        await onSubmit(updateData);
      } else {
        // For creation, send all required fields
        const createData: CreateUserInput = {
          username: formData.username,
          password: formData.password,
          role: formData.role as 'admin' | 'teacher' | 'student',
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone || undefined,
          parentPhone: formData.parentPhone || undefined,
        };
        // Include student category if role is student
        if (formData.role === 'student') {
          createData.studentCategory = formData.studentCategory || undefined;
          createData.studentSubcategory = formData.studentSubcategory || undefined;
          createData.whatsappGroupLink = formData.whatsappGroupLink || undefined;
          createData.teamsUsername = formData.teamsUsername || undefined;
        }
        // Include teacher fee fields if role is teacher
        if (formData.role === 'teacher') {
          createData.teamsUsername = formData.teamsUsername || undefined;
          createData.teacherPaymentType = formData.teacherPaymentType as 'percentage_based' | 'salaried';
          if (formData.teacherPaymentType === 'salaried') {
            createData.monthlySalary = formData.monthlySalary
              ? parseFloat(formData.monthlySalary as any)
              : undefined;
          } else {
            createData.localStudentFeePercentage = formData.localStudentFeePercentage
              ? parseFloat(formData.localStudentFeePercentage as any)
              : undefined;
            createData.onlineStudentFixedAmountIg = formData.onlineStudentFixedAmountIg
              ? parseFloat(formData.onlineStudentFixedAmountIg as any)
              : undefined;
            createData.onlineStudentFixedAmountAlevel = formData.onlineStudentFixedAmountAlevel
              ? parseFloat(formData.onlineStudentFixedAmountAlevel as any)
              : undefined;
          }
        }
        await onSubmit(createData);
      }
    } catch (error) {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b flex-shrink-0 bg-white rounded-t-lg">
          <h3 className="text-xl font-semibold text-gray-900">
            {isEditing ? 'Edit User' : 'Create New User'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Username */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username *
              </label>
              <input
                type="text"
                required
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter username"
                disabled={loading}
              />
            </div>

            {/* Password (only for creation) */}
            {!isEditing && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!isEditing}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter password (min 8 characters)"
                    minLength={8}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    disabled={loading}
                  >
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Role - Show for creation, or for editing if sudo */}
            {(!isEditing || isSudo) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            )}

            {/* Status (only for editing) */}
            {isEditing && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status *
                </label>
                <select
                  required
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            )}

            {/* First Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name *
              </label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter first name"
                disabled={loading}
              />
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name *
              </label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter last name"
                disabled={loading}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter email"
                disabled={loading}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter phone number"
                disabled={loading}
              />
            </div>

            {/* Parent Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent/Guardian Phone
              </label>
              <input
                type="tel"
                value={formData.parentPhone}
                onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter parent/guardian phone"
                disabled={loading}
              />
            </div>

            {/* Student Category - Only show for students */}
            {formData.role === 'student' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Student Category
                  </label>
                  <select
                    value={formData.studentCategory}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        studentCategory: e.target.value,
                        studentSubcategory: '' // Reset subcategory when category changes
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={loading}
                  >
                    <option value="">Select category</option>
                    <option value="junior">Junior</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>

                {/* Student Subcategory - Show based on selected category */}
                {formData.studentCategory && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subcategory
                    </label>
                    <select
                      value={formData.studentSubcategory}
                      onChange={(e) => setFormData({ ...formData, studentSubcategory: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      disabled={loading}
                    >
                      <option value="">Select subcategory</option>
                      {formData.studentCategory === 'junior' && (
                        <>
                          <option value="aitchison">Aitchison</option>
                          <option value="preschool">Preschool</option>
                          <option value="summer_camp">Summer Camp</option>
                          <option value="academy">Academy</option>
                        </>
                      )}
                      {formData.studentCategory === 'senior' && (
                        <>
                          <option value="local">Local</option>
                          <option value="online">Online</option>
                        </>
                      )}
                    </select>
                  </div>
                )}

                {/* WhatsApp Group Link */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    WhatsApp Group Link
                  </label>
                  <input
                    type="url"
                    value={formData.whatsappGroupLink}
                    onChange={(e) => setFormData({ ...formData, whatsappGroupLink: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="https://chat.whatsapp.com/..."
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    WhatsApp group link for this student (optional)
                  </p>
                </div>

                {/* Teams Username */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teams Username
                  </label>
                  <input
                    type="text"
                    value={formData.teamsUsername}
                    onChange={(e) => setFormData({ ...formData, teamsUsername: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Student's Microsoft Teams display name"
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used for matching attendance from Teams meetings. Students can also set this themselves.
                  </p>
                </div>
              </>
            )}

            {/* Teacher Fee Configuration - Only show for teachers */}
            {formData.role === 'teacher' && (
              <>
                {/* Teams Username — used to match the teacher in Teams attendance reports */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teams Username
                  </label>
                  <input
                    type="text"
                    value={formData.teamsUsername}
                    onChange={(e) => setFormData({ ...formData, teamsUsername: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Teacher's Microsoft Teams display name"
                    disabled={loading}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used for matching attendance from Teams meetings. Teachers can also set this themselves.
                  </p>
                </div>

                <div className="md:col-span-2 mt-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 border-b pb-2">
                    Teacher Fee Configuration
                  </h4>
                </div>

                {/* Payment Type Toggle */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Type *
                  </label>
                  <div className="flex gap-4">
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-colors ${
                      formData.teacherPaymentType === 'percentage_based'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="teacherPaymentType"
                        value="percentage_based"
                        checked={formData.teacherPaymentType === 'percentage_based'}
                        onChange={(e) => setFormData({ ...formData, teacherPaymentType: e.target.value })}
                        className="text-indigo-600 focus:ring-indigo-500"
                        disabled={loading}
                      />
                      <span className="text-sm font-medium">Per-Student Based</span>
                    </label>
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-colors ${
                      formData.teacherPaymentType === 'salaried'
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="radio"
                        name="teacherPaymentType"
                        value="salaried"
                        checked={formData.teacherPaymentType === 'salaried'}
                        onChange={(e) => setFormData({ ...formData, teacherPaymentType: e.target.value })}
                        className="text-indigo-600 focus:ring-indigo-500"
                        disabled={loading}
                      />
                      <span className="text-sm font-medium">Fixed Salary</span>
                    </label>
                  </div>
                </div>

                {/* Per-Student Fields (only when percentage_based) */}
                {formData.teacherPaymentType === 'percentage_based' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Local Student Fee Percentage (%) *
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.localStudentFeePercentage}
                        onChange={(e) => setFormData({ ...formData, localStudentFeePercentage: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g., 75"
                        min="0"
                        max="100"
                        step="0.01"
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Percentage of fee that teacher receives from local students (0-100)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Online Student Fixed Amount (IG Courses) *
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.onlineStudentFixedAmountIg}
                        onChange={(e) => setFormData({ ...formData, onlineStudentFixedAmountIg: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g., 5000"
                        min="0"
                        step="0.01"
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Fixed amount teacher receives per online student for IG courses
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Online Student Fixed Amount (A Level Courses) *
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.onlineStudentFixedAmountAlevel}
                        onChange={(e) => setFormData({ ...formData, onlineStudentFixedAmountAlevel: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g., 7000"
                        min="0"
                        step="0.01"
                        disabled={loading}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Fixed amount teacher receives per online student for A Level courses
                      </p>
                    </div>
                  </>
                )}

                {/* Salary Field (only when salaried) */}
                {formData.teacherPaymentType === 'salaried' && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Monthly Salary (PKR) *
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.monthlySalary}
                      onChange={(e) => setFormData({ ...formData, monthlySalary: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="e.g., 50000"
                      min="0"
                      step="0.01"
                      disabled={loading}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Fixed monthly salary regardless of student count
                    </p>
                  </div>
                )}
              </>
            )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 px-6 py-4 border-t flex-shrink-0 bg-white rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                isEditing ? 'Update User' : 'Create User'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserForm;
