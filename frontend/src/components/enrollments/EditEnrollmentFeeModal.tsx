import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { CurrencyCode } from '../../api/enrollments.api';

interface EditEnrollmentFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  enrollment: {
    id: string;
    classType?: string;
    customFeePerMonth?: string;
    perSessionFee?: string;
    expectedClassesPerMonth?: number;
    feeType: 'custom' | 'scholarship';
    prorateFirstMonth?: boolean;
    feeNotes?: string;
    currency: CurrencyCode;
    student: {
      firstName: string;
      lastName: string;
    };
    course: {
      title: string;
    };
  };
}

export default function EditEnrollmentFeeModal({
  isOpen,
  onClose,
  onSuccess,
  enrollment,
}: EditEnrollmentFeeModalProps) {
  const isOneToOne = enrollment.classType === '1-to-1';

  const [feeAmount, setFeeAmount] = useState(enrollment.customFeePerMonth || '');
  const [perSessionFee, setPerSessionFee] = useState(enrollment.perSessionFee || '');
  const [expectedClasses, setExpectedClasses] = useState(
    enrollment.expectedClassesPerMonth != null ? String(enrollment.expectedClassesPerMonth) : ''
  );
  const [feeType, setFeeType] = useState<'custom' | 'scholarship'>(enrollment.feeType || 'custom');
  const [prorateFirstMonth, setProrateFirstMonth] = useState(enrollment.prorateFirstMonth || false);
  const [feeNotes, setFeeNotes] = useState(enrollment.feeNotes || '');
  const [currency, setCurrency] = useState<CurrencyCode>(enrollment.currency);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currencySymbols: Record<CurrencyCode, string> = {
    PKR: 'Rs',
    USD: '$',
    GBP: '£',
    SAR: 'SR',
  };

  const symbol = currencySymbols[currency];

  const projectedFee =
    isOneToOne && perSessionFee && expectedClasses
      ? (parseFloat(perSessionFee) * parseInt(expectedClasses)).toFixed(2)
      : null;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isOneToOne) {
      if (!perSessionFee || !/^\d+(\.\d{1,2})?$/.test(perSessionFee)) {
        toast.error('Please enter a valid per-session fee');
        return;
      }
    } else {
      if (!feeAmount || !/^\d+(\.\d{1,2})?$/.test(feeAmount)) {
        toast.error('Please enter a valid fee amount');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { enrollmentsApi } = await import('../../api/enrollments.api');
      // Cleared fields are sent explicitly (null / '') so the backend can
      // clear them — omitting the key would make clearing a silent no-op
      if (isOneToOne) {
        await enrollmentsApi.updateEnrollmentFee(enrollment.id, {
          perSessionFee,
          expectedClassesPerMonth: expectedClasses ? parseInt(expectedClasses) : null,
          currency,
          feeType,
          feeNotes: feeNotes ?? '',
        });
      } else {
        await enrollmentsApi.updateEnrollmentFee(enrollment.id, {
          customFeePerMonth: feeAmount,
          currency,
          feeType,
          prorateFirstMonth,
          feeNotes: feeNotes ?? '',
        });
      }
      toast.success('Fee updated successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update fee');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit Enrollment Fee</h2>
            <p className="text-sm text-gray-500 mt-1">
              {enrollment.student.firstName} {enrollment.student.lastName} — {enrollment.course.title}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Fee Type */}
          <div>
            <label htmlFor="feeType" className="block text-sm font-medium text-gray-700 mb-1">
              Fee Type
            </label>
            <select
              id="feeType"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value as 'custom' | 'scholarship')}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="custom">Custom Fee</option>
              <option value="scholarship">Scholarship</option>
            </select>
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="PKR">PKR - Pakistani Rupee (Rs)</option>
              <option value="USD">USD - US Dollar ($)</option>
              <option value="GBP">GBP - British Pound (£)</option>
              <option value="SAR">SAR - Saudi Riyal (SR)</option>
            </select>
          </div>

          {isOneToOne ? (
            <>
              {/* Per Session Fee */}
              <div>
                <label htmlFor="perSessionFee" className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Per Session *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">{symbol}</span>
                  <input
                    type="text"
                    id="perSessionFee"
                    value={perSessionFee}
                    onChange={(e) => setPerSessionFee(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Expected Classes Per Month */}
              <div>
                <label htmlFor="expectedClasses" className="block text-sm font-medium text-gray-700 mb-1">
                  Expected Classes Per Month
                </label>
                <input
                  type="number"
                  id="expectedClasses"
                  value={expectedClasses}
                  onChange={(e) => setExpectedClasses(e.target.value)}
                  min={1}
                  max={31}
                  placeholder="e.g. 8"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {projectedFee && (
                  <p className="mt-1 text-sm text-indigo-600 font-medium">
                    Projected monthly fee: {symbol} {projectedFee}
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Regular monthly fee */
            <div>
              <label htmlFor="feeAmount" className="block text-sm font-medium text-gray-700 mb-1">
                {feeType === 'scholarship' ? 'Scholarship Amount Per Month *' : 'Fee Per Month *'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">{symbol}</span>
                <input
                  type="text"
                  id="feeAmount"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {/* Pro-rate First Month — not applicable to 1-to-1 (usage-based) */}
          {!isOneToOne && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={prorateFirstMonth}
                onChange={(e) => setProrateFirstMonth(e.target.checked)}
                className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-700">
                  Pro-rate first month
                </span>
                <span className="block text-xs text-gray-500">
                  First month is charged from the enrollment date to the end of that month, then full months
                  from the 1st. Adjusts the enrollment month's fee immediately (unless already received).
                </span>
              </span>
            </label>
          )}

          {/* Fee Notes */}
          <div>
            <label htmlFor="feeNotes" className="block text-sm font-medium text-gray-700 mb-1">
              Fee Notes (Optional)
            </label>
            <textarea
              id="feeNotes"
              value={feeNotes}
              onChange={(e) => setFeeNotes(e.target.value)}
              rows={3}
              placeholder="Reason for fee amount (e.g., 50% scholarship for academic excellence)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Warning:</strong> Changing the fee will affect future fee generation.
              Existing fees will not be modified.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Updating...' : 'Update Fee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
