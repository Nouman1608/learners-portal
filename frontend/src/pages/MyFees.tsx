import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalApi, FeeRecord } from '../api/student-portal.api';
import { studentCourseTitle } from '../utils/course';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { BanknotesIcon, CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useSortableData } from '../hooks/useSortableData';

const MyFees: React.FC = () => {
  const { user } = useAuth();
  const [fees, setFees] = useState<FeeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFees();
  }, []);

  const loadFees = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await studentPortalApi.getFeesHistory(user.id);
      setFees(data);
    } catch (error: any) {
      console.error('Error loading fees:', error);
      toast.error(error.response?.data?.message || 'Failed to load fees');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
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

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'received':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'overdue':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />;
      default:
        return <ClockIcon className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getMonthName = (month: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
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

  const formatAmount = (amount: string, currency: 'PKR' | 'USD' | 'GBP' | 'SAR'): string => {
    const symbol = getCurrencySymbol(currency);
    const numAmount = parseFloat(amount);
    return `${symbol} ${numAmount.toLocaleString()}`;
  };

  const calculateTotals = () => {
    // Get primary currency from the first fee (most students will have all fees in one currency)
    const primaryCurrency = (fees[0]?.currency || 'PKR') as 'PKR' | 'USD' | 'GBP' | 'SAR';

    const totalAmount = fees.reduce((sum, fee) => sum + parseFloat(fee.amount), 0);
    const totalPaid = fees
      .filter(f => f.status === 'received')
      .reduce((sum, fee) => sum + parseFloat(fee.amount), 0);
    const totalOutstanding = totalAmount - totalPaid;

    return { totalAmount, totalPaid, totalOutstanding, primaryCurrency };
  };

  const { totalAmount, totalPaid, totalOutstanding, primaryCurrency } = calculateTotals();

  const { items: sortedFees, requestSort, getSortIndicator } = useSortableData(fees);

  if (loading && fees.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your fees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Fees</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Fees</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {formatAmount(totalAmount.toString(), primaryCurrency)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Paid</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {formatAmount(totalPaid.toString(), primaryCurrency)}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Outstanding</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {formatAmount(totalOutstanding.toString(), primaryCurrency)}
            </p>
          </div>
        </div>

        {/* Fees List */}
        {fees.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <BanknotesIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No fee records found</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th onClick={() => requestSort('courseTitle')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Course {getSortIndicator('courseTitle')}
                    </th>
                    <th onClick={() => requestSort('month')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Period {getSortIndicator('month')}
                    </th>
                    <th onClick={() => requestSort('amount')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Amount {getSortIndicator('amount')}
                    </th>
                    <th onClick={() => requestSort('dueDate')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Due Date {getSortIndicator('dueDate')}
                    </th>
                    <th onClick={() => requestSort('status')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100">
                      Status {getSortIndicator('status')}
                    </th>

                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedFees.map((fee) => (
                    <tr key={fee.feeId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{studentCourseTitle(fee.courseTitle, fee.courseSubject)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getMonthName(fee.month)} {fee.year}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatAmount(fee.amount, fee.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(fee.dueDate), 'MMM dd, yyyy')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(fee.status)}
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(fee.status)}`}>
                            {fee.status}
                          </span>
                        </div>
                      </td>
                     
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-200">
              {sortedFees.map((fee) => (
                <div key={fee.feeId} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{studentCourseTitle(fee.courseTitle, fee.courseSubject)}</h3>
                    </div>
                    <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(fee.status)}`}>
                      {fee.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Period:</span>
                      <span className="text-gray-900">{getMonthName(fee.month)} {fee.year}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amount:</span>
                      <span className="text-gray-900 font-medium">{formatAmount(fee.amount, fee.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Due Date:</span>
                      <span className="text-gray-900">{format(new Date(fee.dueDate), 'MMM dd, yyyy')}</span>
                    </div>
                    
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyFees;
