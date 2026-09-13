import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface DropEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (willReturn: boolean, tentativeReturnDate?: string) => void;
  studentName: string;
  courseName: string;
}

export default function DropEnrollmentModal({
  isOpen,
  onClose,
  onConfirm,
  studentName,
  courseName,
}: DropEnrollmentModalProps) {
  const [willReturn, setWillReturn] = useState<boolean | null>(null);
  const [tentativeReturnDate, setTentativeReturnDate] = useState('');

  const handleSubmit = () => {
    if (willReturn === null) {
      return; // Require selection
    }
    onConfirm(willReturn, willReturn && tentativeReturnDate ? tentativeReturnDate : undefined);
    handleClose();
  };

  const handleClose = () => {
    setWillReturn(null);
    setTentativeReturnDate('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Drop Student Enrollment</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              You are about to drop <strong>{studentName}</strong> from{' '}
              <strong>{courseName}</strong>.
            </p>
          </div>

          {/* Will student return? */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Will the student return later? *
            </label>
            <div className="space-y-2">
              <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="willReturn"
                  value="yes"
                  checked={willReturn === true}
                  onChange={() => setWillReturn(true)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900">Yes, student will return</div>
                  <div className="text-sm text-gray-500">Student plans to come back later</div>
                </div>
              </label>

              <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  name="willReturn"
                  value="no"
                  checked={willReturn === false}
                  onChange={() => setWillReturn(false)}
                  className="mr-3"
                />
                <div>
                  <div className="font-medium text-gray-900">No, student won't return</div>
                  <div className="text-sm text-gray-500">Student is permanently leaving</div>
                </div>
              </label>
            </div>
          </div>

          {/* Tentative return date - only show if will return */}
          {willReturn === true && (
            <>
              <div>
                <label htmlFor="tentativeReturnDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Tentative Return Date (Optional)
                </label>
                <input
                  type="date"
                  id="tentativeReturnDate"
                  value={tentativeReturnDate}
                  onChange={(e) => setTentativeReturnDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="When might they return?"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Approximate month or date when the student might return
                </p>
              </div>

              {/* Auto-lead creation notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Lead will be created automatically</p>
                    <p className="mt-1">This student will be added to your leads list for re-engagement marketing when they plan to return.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={willReturn === null}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Drop Student
          </button>
        </div>
      </div>
    </div>
  );
}
