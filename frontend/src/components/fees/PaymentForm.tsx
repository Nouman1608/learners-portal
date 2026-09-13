import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { XMarkIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { paymentsApi, CreatePaymentInput, Fee } from '../../api/enrollments.api';
import apiClient from '../../api/client';
import toast from 'react-hot-toast';

const paymentSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount format'),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'payfast', 'other']),
  transactionId: z.string().max(255).optional(),
  paymentDate: z.string().min(1, 'Payment date is required'),
  notes: z.string().max(1000).optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
  fee: Fee;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentForm({ fee, onClose, onSuccess }: PaymentFormProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: fee.amount,
      paymentMethod: 'cash',
      paymentDate: new Date().toISOString().split('T')[0],
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file);

      const response = await apiClient.post<{
        file: {
          url: string;
          filename: string;
          originalname: string;
        };
      }>('/uploads/single', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploadedFileUrl(response.data.file.url);
      setUploadedFileName(response.data.file.originalname);
      toast.success('File uploaded successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: PaymentFormData) => {
    try {
      const input: CreatePaymentInput = {
        feeId: fee.id,
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        transactionId: data.transactionId,
        paymentDate: new Date(data.paymentDate).toISOString(),
        proofUrl: uploadedFileUrl || undefined,
        notes: data.notes,
      };

      await paymentsApi.createPayment(input);
      toast.success('Payment submitted successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to submit payment');
    }
  };

  const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Submit Payment</h2>
            <p className="text-sm text-gray-500 mt-1">
              {fee.course.title} - {getMonthName(fee.month)} {fee.year}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 p-6">
            <div className="space-y-6">
            {/* Fee Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Amount Due:</span>
                  <span className="ml-1 font-medium text-gray-900">
                    Rs. {parseFloat(fee.amount).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Due Date:</span>
                  <span className="ml-1 text-gray-900">
                    {new Date(fee.dueDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
                Payment Amount (Rs.) *
              </label>
              <input
                {...register('amount')}
                type="text"
                id="amount"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="e.g., 5000.00"
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label htmlFor="paymentMethod" className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method *
              </label>
              <select
                {...register('paymentMethod')}
                id="paymentMethod"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">EasyPaisa</option>
                <option value="payfast">PayFast</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Transaction ID */}
              <div>
                <label htmlFor="transactionId" className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction ID (Optional)
                </label>
                <input
                  {...register('transactionId')}
                  type="text"
                  id="transactionId"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="e.g., TXN123456"
                />
              </div>

              {/* Payment Date */}
              <div>
                <label htmlFor="paymentDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Date *
                </label>
                <input
                  {...register('paymentDate')}
                  type="date"
                  id="paymentDate"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                {errors.paymentDate && (
                  <p className="mt-1 text-sm text-red-600">{errors.paymentDate.message}</p>
                )}
              </div>
            </div>

            {/* Payment Proof Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Proof (Optional)
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:border-blue-400 transition-colors">
                <div className="space-y-1 text-center">
                  <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                    >
                      <span>Upload a file</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept="image/*,.pdf"
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, PDF up to 5MB</p>
                  {uploading && (
                    <p className="text-sm text-blue-600">Uploading...</p>
                  )}
                  {uploadedFileName && (
                    <p className="text-sm text-green-600">✓ {uploadedFileName}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                {...register('notes')}
                id="notes"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Any additional information..."
              />
            </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 flex-shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || uploading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
