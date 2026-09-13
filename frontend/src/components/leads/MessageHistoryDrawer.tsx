import { useState, useEffect } from 'react';
import { XMarkIcon, ClockIcon, CheckIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { messagesApi, LeadMessage } from '../../api/messages.api';
import toast from 'react-hot-toast';

interface MessageHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
}

export default function MessageHistoryDrawer({
  isOpen,
  onClose,
  leadId,
  leadName,
}: MessageHistoryDrawerProps) {
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && leadId) {
      fetchMessageHistory();
    }
  }, [isOpen, leadId]);

  const fetchMessageHistory = async () => {
    try {
      setLoading(true);
      const data = await messagesApi.getMessageHistory(leadId);
      setMessages(data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch message history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<
      string,
      { bg: string; text: string; icon: JSX.Element; label: string }
    > = {
      pending: {
        bg: 'bg-gray-100',
        text: 'text-gray-800',
        icon: <ClockIcon className="w-4 h-4" />,
        label: 'Pending',
      },
      sent: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        icon: <CheckIcon className="w-4 h-4" />,
        label: 'Sent',
      },
      delivered: {
        bg: 'bg-green-100',
        text: 'text-green-800',
        icon: <CheckIcon className="w-4 h-4" />,
        label: 'Delivered',
      },
      read: {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        icon: <CheckIcon className="w-4 h-4" />,
        label: 'Read',
      },
      failed: {
        bg: 'bg-red-100',
        text: 'text-red-800',
        icon: <ExclamationCircleIcon className="w-4 h-4" />,
        label: 'Failed',
      },
    };

    const config = configs[status] || configs.pending;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
      >
        {config.icon}
        {config.label}
      </span>
    );
  };

  const formatDateTime = (date: string | Date | null) => {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };


  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      ></div>

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Message History</h2>
            <p className="text-sm text-gray-500 mt-1">For: {leadName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-2">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No messages sent yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Message history will appear here once you send messages to this lead
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Timeline */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                {/* Messages */}
                {messages.map((message, _index) => (
                  <div key={message.id} className="relative pb-8 last:pb-0">
                    {/* Timeline dot */}
                    <div className="absolute left-6 top-2 -ml-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white"></div>

                    {/* Message card */}
                    <div className="ml-16">
                      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(message.deliveryStatus)}
                              <span className="text-xs text-gray-500">
                                {message.messageType.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Sent: {formatDateTime(message.sentAt || message.createdAt)}
                            </div>
                          </div>
                        </div>

                        {/* Message content */}
                        <div className="mb-3">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {message.messageContent}
                          </p>
                        </div>

                        {/* Metadata */}
                        <div className="border-t border-gray-100 pt-3 space-y-2">
                          {message.whatsappMessageId && (
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">WhatsApp ID:</span>{' '}
                              {message.whatsappMessageId}
                            </div>
                          )}

                          {/* Timestamps */}
                          {message.scheduledFor && (
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">Scheduled for:</span>{' '}
                              {formatDateTime(message.scheduledFor)}
                            </div>
                          )}

                          {message.deliveredAt && (
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">Delivered:</span>{' '}
                              {formatDateTime(message.deliveredAt)}
                            </div>
                          )}

                          {message.readAt && (
                            <div className="text-xs text-gray-500">
                              <span className="font-medium">Read:</span>{' '}
                              {formatDateTime(message.readAt)}
                            </div>
                          )}

                          {/* Error message */}
                          {message.errorMessage && (
                            <div className="bg-red-50 border border-red-200 rounded p-2">
                              <div className="flex items-start gap-2">
                                <ExclamationCircleIcon className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="text-xs font-medium text-red-800">
                                    Error Message
                                  </div>
                                  <div className="text-xs text-red-700 mt-1">
                                    {message.errorMessage}
                                  </div>
                                  {message.retryCount > 0 && (
                                    <div className="text-xs text-red-600 mt-1">
                                      Retry attempts: {message.retryCount}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-sm font-medium text-gray-700 mb-2">Summary</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Total Messages</div>
                    <div className="text-lg font-bold text-gray-900">{messages.length}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Successfully Delivered</div>
                    <div className="text-lg font-bold text-green-600">
                      {messages.filter((m) => m.deliveryStatus === 'delivered' || m.deliveryStatus === 'read').length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Read</div>
                    <div className="text-lg font-bold text-purple-600">
                      {messages.filter((m) => m.deliveryStatus === 'read').length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Failed</div>
                    <div className="text-lg font-bold text-red-600">
                      {messages.filter((m) => m.deliveryStatus === 'failed').length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
