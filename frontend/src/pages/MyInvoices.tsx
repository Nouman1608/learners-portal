import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { invoicesApi, Invoice } from '../api/invoices.api';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { DocumentTextIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import EmptyState from '../components/common/EmptyState';

const MyInvoices: React.FC = () => {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const data = await invoicesApi.getInvoices({ recipientId: user.id });
      setInvoices(data);
    } catch (error: any) {
      console.error('Error loading invoices:', error);
      toast.error(error.response?.data?.message || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  const getMonthName = (month: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1];
  };

  const handleDownload = (invoice: Invoice) => {
    if (invoice.pdfUrl) {
      window.open(invoice.pdfUrl, '_blank');
    } else {
      toast.error('Invoice PDF not available');
    }
  };

  const totalAmount = invoices.reduce((sum, invoice) => sum + parseFloat(invoice.totalAmount), 0);

  if (loading && invoices.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">My Invoices</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Invoices</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">{invoices.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500">Total Amount</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              Rs. {totalAmount.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Invoices List */}
        {invoices.length === 0 ? (
          <EmptyState
            icon={DocumentTextIcon}
            title="No invoices found"
          />
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.map((invoice) => (
                    <React.Fragment key={invoice.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {getMonthName(invoice.month)} {invoice.year}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          Rs. {parseFloat(invoice.totalAmount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(invoice.createdAt), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {expandedInvoice === invoice.id ? 'Hide' : 'View'} Details
                            </button>
                            {invoice.pdfUrl && (
                              <button
                                onClick={() => handleDownload(invoice)}
                                className="text-green-600 hover:text-green-800 flex items-center gap-1"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                                Download
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedInvoice === invoice.id && (
                        <tr>
                          <td colSpan={5} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-900 mb-3">Line Items</h4>
                              {invoice.lineItems.map((item, _index) => (
                                <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-200">
                                  <span className="text-gray-700">{item.description}</span>
                                  <div className="text-right">
                                    <span className="text-gray-500">{item.quantity} × Rs. {parseFloat(item.unitPrice).toLocaleString()}</span>
                                    <span className="ml-4 font-medium text-gray-900">Rs. {parseFloat(item.amount).toLocaleString()}</span>
                                  </div>
                                </div>
                              ))}
                              <div className="flex justify-between text-sm font-bold pt-3 border-t-2 border-gray-300">
                                <span>Total</span>
                                <span>Rs. {parseFloat(invoice.totalAmount).toLocaleString()}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">{invoice.invoiceNumber}</h3>
                      <p className="text-xs text-gray-500 mt-1">{getMonthName(invoice.month)} {invoice.year}</p>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      Rs. {parseFloat(invoice.totalAmount).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date:</span>
                      <span className="text-gray-900">{format(new Date(invoice.createdAt), 'MMM dd, yyyy')}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => setExpandedInvoice(expandedInvoice === invoice.id ? null : invoice.id)}
                      className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                    >
                      {expandedInvoice === invoice.id ? 'Hide' : 'View'} Details
                    </button>
                    {invoice.pdfUrl && (
                      <button
                        onClick={() => handleDownload(invoice)}
                        className="flex-1 px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm flex items-center justify-center gap-1"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Download
                      </button>
                    )}
                  </div>

                  {expandedInvoice === invoice.id && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="font-medium text-gray-900 mb-3 text-sm">Line Items</h4>
                      {invoice.lineItems.map((item) => (
                        <div key={item.id} className="mb-3 pb-3 border-b border-gray-200 last:border-0">
                          <div className="text-sm text-gray-700 mb-1">{item.description}</div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">{item.quantity} × Rs. {parseFloat(item.unitPrice).toLocaleString()}</span>
                            <span className="font-medium text-gray-900">Rs. {parseFloat(item.amount).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold pt-3 border-t-2 border-gray-300">
                        <span>Total</span>
                        <span>Rs. {parseFloat(invoice.totalAmount).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyInvoices;
