import { useState } from 'react';
import toast from 'react-hot-toast';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { feesApi, Fee } from '../../api/enrollments.api';

interface MarkAsReceivedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fees: Fee[];
  isBulk: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MarkAsReceivedModal = ({ isOpen, onClose, onSuccess, fees, isBulk }: MarkAsReceivedModalProps) => {
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  const [serialNumbers, setSerialNumbers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const formatAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    const symbols: Record<string, string> = { PKR: 'Rs', USD: '$', GBP: '£', SAR: 'SR' };
    return `${symbols[currency] || currency} ${num.toFixed(2)}`;
  };

  const handleSubmit = async () => {
    // Validation: cash requires serial numbers
    if (paymentMethod === 'cash') {
      const missingSerials = fees.filter(f => !serialNumbers[f.id]?.trim());
      if (missingSerials.length > 0) {
        toast.error('Serial number required for all cash payments');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isBulk) {
        // Bulk operation: parallel API calls with Promise.allSettled
        const promises = fees.map(fee =>
          feesApi.markFeeAsReceived(fee.id, {
            paymentMethod,
            serialNumber: paymentMethod === 'cash' ? serialNumbers[fee.id] : undefined,
          })
        );
        const results = await Promise.allSettled(promises);

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        if (failed === 0) {
          toast.success(`${succeeded} fee(s) marked as received`);
          onSuccess();
          onClose();
        } else if (succeeded > 0) {
          toast.error(`${succeeded} succeeded, ${failed} failed. Please retry failed fees.`);
          onSuccess(); // Refresh list to show partial success
          // Keep modal open for retry
        } else {
          toast.error('All operations failed. Please try again.');
        }
      } else {
        // Single fee operation
        await feesApi.markFeeAsReceived(fees[0].id, {
          paymentMethod,
          serialNumber: paymentMethod === 'cash' ? serialNumbers[fees[0].id] : undefined,
        });
        toast.success('Fee marked as received');
        onSuccess();
        onClose();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to mark fee(s) as received';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Mark {isBulk ? `${fees.length} Fees` : 'Fee'} as Received
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {isBulk ? 'Select payment method and enter details' : 'Select payment method'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Fee Details (for single fee) */}
            {!isBulk && fees.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Student:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {fees[0].student.firstName} {fees[0].student.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Course:</span>
                    <span className="text-sm font-medium text-gray-900">{fees[0].course.title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Period:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {MONTH_NAMES[fees[0].month - 1]} {fees[0].year}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Amount:</span>
                    <span className="text-sm font-medium text-gray-900">
                      {formatAmount(fees[0].amount, fees[0].currency)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Method Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="online"
                    checked={paymentMethod === 'online'}
                    onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'cash')}
                    className="h-4 w-4 text-blue-600 focus:ring-indigo-500 border-gray-300"
                    disabled={isSubmitting}
                  />
                  <span className="ml-2 text-sm text-gray-700">Online</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    checked={paymentMethod === 'cash'}
                    onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'cash')}
                    className="h-4 w-4 text-blue-600 focus:ring-indigo-500 border-gray-300"
                    disabled={isSubmitting}
                  />
                  <span className="ml-2 text-sm text-gray-700">Cash</span>
                </label>
              </div>
            </div>

            {/* Serial Number for Single Fee (Cash) */}
            {!isBulk && paymentMethod === 'cash' && fees.length > 0 && (
              <div>
                <label htmlFor="serialNumber" className="block text-sm font-medium text-gray-700 mb-2">
                  Serial Number <span className="text-red-500">*</span>
                </label>
                <input
                  id="serialNumber"
                  type="text"
                  value={serialNumbers[fees[0].id] || ''}
                  onChange={(e) => setSerialNumbers({ ...serialNumbers, [fees[0].id]: e.target.value })}
                  placeholder="Enter serial number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>
            )}

            {/* Serial Numbers for Bulk Fees (Cash) */}
            {isBulk && paymentMethod === 'cash' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Serial Numbers <span className="text-red-500">*</span>
                  <span className="text-xs text-gray-500 font-normal ml-1">(Required for Each Fee)</span>
                </label>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {fees.map((fee) => (
                    <div key={fee.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="flex justify-between items-start mb-2">
                        <div className="text-sm flex-1">
                          <p className="font-medium text-gray-900">
                            {fee.student.firstName} {fee.student.lastName}
                          </p>
                          <p className="text-gray-600">
                            {fee.course.title} - {MONTH_NAMES[fee.month - 1]} {fee.year}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {formatAmount(fee.amount, fee.currency)}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={serialNumbers[fee.id] || ''}
                        onChange={(e) => setSerialNumbers({ ...serialNumbers, [fee.id]: e.target.value })}
                        placeholder="Enter serial number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={isSubmitting}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (isBulk ? 'Marking...' : 'Marking...') : (isBulk ? 'Mark All as Received' : 'Mark as Received')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarkAsReceivedModal;
