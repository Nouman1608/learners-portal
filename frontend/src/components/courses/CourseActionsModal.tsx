import React, { useState } from 'react';
import { Course } from '../../api/courses.api';
import { XMarkIcon, CheckCircleIcon, XCircleIcon, TrashIcon, ArrowDownTrayIcon, KeyIcon, FlagIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../common/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface CourseActionsModalProps {
  course: Course;
  isOpen: boolean;
  onClose: () => void;
  onToggleStatus: (course: Course) => void;
  onHardDelete: (course: Course) => void;
  onDownloadCSV: (course: Course, resetPasswords: boolean) => void;
  onEndCourse: (course: Course, endDate: string) => void;
}

const CourseActionsModal: React.FC<CourseActionsModalProps> = ({
  course,
  isOpen,
  onClose,
  onToggleStatus,
  onHardDelete,
  onDownloadCSV,
  onEndCourse,
}) => {
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [endDateInput, setEndDateInput] = useState('');

  if (!isOpen) return null;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full animate-scale-in">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Course Actions: {course.title}
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Toggle Status Button */}
              <button
                onClick={() => {
                  onToggleStatus(course);
                  onClose();
                }}
                className={`w-full flex items-center justify-start px-4 py-3 rounded-lg transition-colors ${
                  course.isActive
                    ? 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                {course.isActive ? (
                  <>
                    <XCircleIcon className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">Deactivate Course</div>
                      <div className="text-sm opacity-75">
                        Hide from active course lists
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">Activate Course</div>
                      <div className="text-sm opacity-75">
                        Make course visible again
                      </div>
                    </div>
                  </>
                )}
              </button>

              {/* End Course Button — only shown when course is active and not yet ended */}
              {course.isActive && !course.endDate && !showEndDatePicker && (
                <button
                  onClick={() => setShowEndDatePicker(true)}
                  className="w-full flex items-center justify-start px-4 py-3 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
                >
                  <FlagIcon className="h-5 w-5 mr-3" />
                  <div className="text-left">
                    <div className="font-medium">End Course</div>
                    <div className="text-sm opacity-75">
                      Complete all enrollments and pro-rate the final month's fees
                    </div>
                  </div>
                </button>
              )}

              {/* End Date Picker Panel */}
              {showEndDatePicker && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 space-y-3">
                  <p className="text-sm font-medium text-amber-800">Select the course end date:</p>
                  <input
                    type="date"
                    value={endDateInput}
                    max={today}
                    onChange={(e) => setEndDateInput(e.target.value)}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                  <p className="text-xs text-amber-700">
                    All active enrollments will be marked completed. The final month's fee will be
                    pro-rated based on the selected date.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowEndDatePicker(false); setEndDateInput(''); }}
                      className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!endDateInput}
                      onClick={async () => {
                        const confirmed = await confirmDialog({
                          title: 'End Course',
                          message: `This will end "${course.title}" on ${endDateInput}, mark all active enrollments as completed, and pro-rate the final month's fees. This cannot be undone.`,
                          confirmLabel: 'End Course',
                          variant: 'warning',
                        });
                        if (confirmed) {
                          onEndCourse(course, endDateInput);
                          onClose();
                        }
                      }}
                      className="flex-1 px-3 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Confirm End Date
                    </button>
                  </div>
                </div>
              )}

              {/* Download Student Credentials CSV */}
              <button
                onClick={() => {
                  onDownloadCSV(course, false);
                  onClose();
                }}
                className="w-full flex items-center justify-start px-4 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <ArrowDownTrayIcon className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Download Student List CSV</div>
                  <div className="text-sm opacity-75">
                    Download enrolled students without resetting passwords
                  </div>
                </div>
              </button>

              {/* Download with Password Reset */}
              <button
                onClick={async () => {
                  const confirmed = await confirmDialog({
                    title: 'Reset Passwords',
                    message: 'This will reset ALL enrolled students\' passwords. Continue?',
                    confirmLabel: 'Reset & Download',
                    variant: 'warning',
                  });
                  if (confirmed) {
                    onDownloadCSV(course, true);
                    onClose();
                  }
                }}
                className="w-full flex items-center justify-start px-4 py-3 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors"
              >
                <KeyIcon className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Download CSV & Reset Passwords</div>
                  <div className="text-sm opacity-75">
                    Generate new passwords for all enrolled students
                  </div>
                </div>
              </button>

              {/* Hard Delete Button */}
              <button
                onClick={() => {
                  onHardDelete(course);
                  onClose();
                }}
                className="w-full flex items-center justify-start px-4 py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors"
              >
                <TrashIcon className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Permanent Delete</div>
                  <div className="text-sm opacity-75">
                    Permanently remove course and all data
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default CourseActionsModal;
