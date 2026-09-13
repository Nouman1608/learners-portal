import React, { useState, useEffect } from 'react';
import { studentPortalApi, FeeRecord } from '../../api/student-portal.api';
import { ArrowPathIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface FeesStatementProps {
  studentId: string;
}

export default function FeesStatement({ studentId }: FeesStatementProps) {
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedFee, setExpandedFee] = useState<string | null>(null);

  useEffect(() => {
    fetchFees();
  }, [studentId]);

  const fetchFees = async () => {
    try {
      setLoading(true);
      const data = await studentPortalApi.getFeesHistory(studentId);
      setFees(data);
    } catch (error) {
      console.error('Failed to fetch fees:', error);
      toast.error('Failed to load fees history');
    } finally {
      setLoading(false);
    }
  };

  const getCurrencySymbol = (currency: 'PKR' | 'USD' | 'GBP' | 'SAR'): string => {
    const symbols = {
      PKR: 'Rs',
      USD: '$',
      GBP: '£',
      SAR: 'SR',
    };
    return symbols[currency] || 'Rs';
  };

  const formatAmount = (amount: string | number, currency: 'PKR' | 'USD' | 'GBP' | 'SAR'): string => {
    const symbol = getCurrencySymbol(currency);
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `${symbol} ${numAmount.toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ArrowPathIcon className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading fees statement...</span>
      </div>
    );
  }

  if (fees.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <p className="text-gray-500">No fee records available</p>
      </div>
    );
  }

  // Calculate summary
  const primaryCurrency = (fees[0]?.currency || 'PKR') as 'PKR' | 'USD' | 'GBP' | 'SAR';
  const totalFees = fees.reduce((sum, f) => sum + parseFloat(f.amount), 0);
  const totalPaid = fees.reduce(
    (sum, f) =>
      sum +
      f.payments.reduce((pSum, p) => pSum + parseFloat(p.amount), 0),
    0
  );
  const totalOutstanding = totalFees - totalPaid;
  const pendingCount = fees.filter((f) =>
    ['pending', 'overdue'].includes(f.status)
  ).length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const toggleExpanded = (feeId: string) => {
    setExpandedFee(expandedFee === feeId ? null : feeId);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Fees</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatAmount(totalFees, primaryCurrency)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Paid</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {formatAmount(totalPaid, primaryCurrency)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Outstanding</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {formatAmount(totalOutstanding, primaryCurrency)}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Pending</p>
          <p className="mt-2 text-3xl font-bold text-yellow-600">
            {pendingCount}
          </p>
        </div>
      </div>

      {/* Fees Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Fee Records
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Course
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Due Date
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Payments
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {fees.map((fee) => {
                const feePaid = fee.payments.reduce(
                  (sum, p) => sum + parseFloat(p.amount),
                  0
                );
                const isExpanded = expandedFee === fee.feeId;

                return (
                  <React.Fragment key={fee.feeId}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(fee.year, fee.month - 1).toLocaleDateString(
                          'en-US',
                          { month: 'long', year: 'numeric' }
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{fee.courseTitle}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {formatAmount(fee.amount, fee.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(fee.dueDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full capitalize ${getStatusBadge(
                            fee.status
                          )}`}
                        >
                          {fee.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {fee.payments.length > 0 ? (
                          <button
                            onClick={() => toggleExpanded(fee.feeId)}
                            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                          >
                            {formatAmount(feePaid, fee.currency)} ({fee.payments.length})
                            {isExpanded ? (
                              <ChevronUpIcon className="ml-1 h-4 w-4" />
                            ) : (
                              <ChevronDownIcon className="ml-1 h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">No payments</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && fee.payments.length > 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-900">
                              Payment History
                            </h4>
                            <table className="min-w-full">
                              <thead>
                                <tr className="text-xs text-gray-500">
                                  <th className="text-left py-2">Date</th>
                                  <th className="text-left py-2">Method</th>
                                  <th className="text-left py-2">Transaction ID</th>
                                  <th className="text-right py-2">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="text-sm">
                                {fee.payments.map((payment) => (
                                  <tr key={payment.id} className="border-t border-gray-200">
                                    <td className="py-2">
                                      {new Date(payment.paymentDate).toLocaleDateString()}
                                    </td>
                                    <td className="py-2 capitalize">
                                      {payment.paymentMethod.replace('_', ' ')}
                                    </td>
                                    <td className="py-2 text-gray-500">
                                      {payment.transactionId || '—'}
                                    </td>
                                    <td className="py-2 text-right font-medium">
                                      {formatAmount(payment.amount, fee.currency)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
