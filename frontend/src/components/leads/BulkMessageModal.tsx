import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { messagesApi, MessageTemplate } from '../../api/messages.api';
import { Lead } from '../../api/leads.api';
import toast from 'react-hot-toast';
import ConfirmDialog from '../common/ConfirmDialog';
import LoadingSpinner from '../common/LoadingSpinner';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

interface BulkMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedLeads: Lead[];
}

export default function BulkMessageModal({
  isOpen,
  onClose,
  onSuccess,
  selectedLeads,
}: BulkMessageModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [parameters, setParameters] = useState<string[]>([]);
  const [parameterCount, setParameterCount] = useState(0);
  const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [showLeadsList, setShowLeadsList] = useState(false);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedTemplateId) {
      const template = templates.find((t) => t.id === selectedTemplateId);
      setSelectedTemplate(template || null);

      if (template) {
        // Count parameters in template body ({{1}}, {{2}}, etc.)
        const matches = template.body.match(/\{\{\d+\}\}/g);
        const count = matches ? matches.length : 0;
        setParameterCount(count);
        setParameters(new Array(count).fill(''));
      } else {
        setParameterCount(0);
        setParameters([]);
      }
    } else {
      setSelectedTemplate(null);
      setParameterCount(0);
      setParameters([]);
    }
  }, [selectedTemplateId, templates]);

  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const data = await messagesApi.getMessageTemplates(true); // Only active templates
      setTemplates(data.filter((t) => t.approvalStatus === 'approved'));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch templates');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleParameterChange = (index: number, value: string) => {
    const newParameters = [...parameters];
    newParameters[index] = value;
    setParameters(newParameters);
  };

  const getPreviewMessage = () => {
    if (!selectedTemplate) return '';
    let preview = selectedTemplate.body;
    parameters.forEach((param, index) => {
      preview = preview.replace(`{{${index + 1}}}`, param || `[Parameter ${index + 1}]`);
    });
    return preview;
  };

  const handleSubmit = async () => {
    if (!selectedTemplate) {
      toast.error('Please select a message template');
      return;
    }

    if (parameterCount > 0 && parameters.some((p) => !p.trim())) {
      toast.error('Please fill in all template parameters');
      return;
    }

    if (scheduleType === 'later' && (!scheduledDate || !scheduledTime)) {
      toast.error('Please select a date and time for scheduled message');
      return;
    }

    const optedOutLeads = selectedLeads.filter((lead) => lead.optedOut);
    if (optedOutLeads.length > 0) {
      const proceed = await confirmDialog({
        title: 'Opted Out Leads',
        message: `${optedOutLeads.length} lead(s) have opted out and will be skipped. Continue?`,
        confirmLabel: 'Continue',
        variant: 'warning',
      });
      if (!proceed) return;
    }

    try {
      setLoading(true);

      const scheduledFor =
        scheduleType === 'later'
          ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
          : undefined;

      const result = await messagesApi.sendBulkMessages({
        leadIds: selectedLeads.map((lead) => lead.id),
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.whatsappTemplateName || selectedTemplate.name,
        templateLanguage: selectedTemplate.whatsappTemplateLanguage || 'en',
        templateParameters: parameters.length > 0 ? parameters : undefined,
        messageType: selectedTemplate.templateType as any,
        messageContent: getPreviewMessage(),
        scheduledFor,
      });

      if (result.failed > 0) {
        toast.success(
          `${result.success} message(s) sent successfully, ${result.failed} failed`
        );
      } else {
        toast.success(
          scheduleType === 'now'
            ? `${result.success} message(s) sent successfully`
            : `${result.success} message(s) scheduled successfully`
        );
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send bulk messages');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedTemplateId('');
    setSelectedTemplate(null);
    setParameters([]);
    setParameterCount(0);
    setScheduleType('now');
    setScheduledDate('');
    setScheduledTime('');
    setShowLeadsList(false);
    onClose();
  };

  if (!isOpen) return null;

  const optedOutCount = selectedLeads.filter((lead) => lead.optedOut).length;
  const eligibleCount = selectedLeads.length - optedOutCount;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Send Bulk WhatsApp Messages</h2>
            <p className="text-sm text-gray-500 mt-1">
              {selectedLeads.length} lead(s) selected
              {optedOutCount > 0 && (
                <span className="text-red-600 ml-1">
                  ({optedOutCount} opted out, {eligibleCount} eligible)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Selected Leads Preview */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Selected Leads</h3>
              <button
                onClick={() => setShowLeadsList(!showLeadsList)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showLeadsList ? 'Hide' : 'Show'} list
              </button>
            </div>
            {showLeadsList && (
              <div className="mt-3 max-h-40 overflow-y-auto">
                <ul className="space-y-1">
                  {selectedLeads.map((lead) => (
                    <li
                      key={lead.id}
                      className="text-sm text-gray-700 flex items-center justify-between"
                    >
                      <span>
                        {lead.name} ({lead.phone})
                      </span>
                      {lead.optedOut && (
                        <span className="text-xs text-red-600 font-medium">Opted Out</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Warning for opted-out leads */}
          {optedOutCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-sm text-yellow-800">
                  <p className="font-medium">Warning</p>
                  <p className="mt-1">
                    {optedOutCount} lead(s) have opted out of marketing messages and will be
                    automatically skipped.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Template Selection */}
          <div>
            <label htmlFor="template" className="block text-sm font-medium text-gray-700 mb-2">
              Message Template *
            </label>
            {loadingTemplates ? (
              <LoadingSpinner size="sm" message="Loading templates..." />
            ) : templates.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  No approved templates available. Please create and approve templates first.
                </p>
              </div>
            ) : (
              <select
                id="template"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">Select a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.templateType})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Template Preview */}
          {selectedTemplate && (
            <>
              {/* Parameters */}
              {parameterCount > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Template Parameters (shared for all leads)
                  </h3>
                  <div className="space-y-3">
                    {parameters.map((param, index) => (
                      <div key={index}>
                        <label
                          htmlFor={`param-${index}`}
                          className="block text-xs font-medium text-gray-600 mb-1"
                        >
                          Parameter {index + 1} *
                        </label>
                        <input
                          type="text"
                          id={`param-${index}`}
                          value={param}
                          onChange={(e) => handleParameterChange(index, e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          placeholder={`Enter value for {{${index + 1}}}`}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Note: The same parameter values will be used for all selected leads.
                  </p>
                </div>
              )}

              {/* Preview */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Message Preview</h3>
                <div className="text-sm text-blue-800 whitespace-pre-wrap">
                  {getPreviewMessage()}
                </div>
                <div className="mt-2 text-xs text-blue-600">
                  WhatsApp Template: {selectedTemplate.whatsappTemplateName || 'N/A'} (
                  {selectedTemplate.whatsappTemplateLanguage})
                </div>
              </div>
            </>
          )}

          {/* Schedule Options */}
          {selectedTemplate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                When to send? *
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="scheduleType"
                    value="now"
                    checked={scheduleType === 'now'}
                    onChange={() => setScheduleType('now')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Send now</div>
                    <div className="text-sm text-gray-500">
                      Messages will be sent immediately to all eligible leads
                    </div>
                  </div>
                </label>

                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="scheduleType"
                    value="later"
                    checked={scheduleType === 'later'}
                    onChange={() => setScheduleType('later')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Schedule for later</div>
                    <div className="text-sm text-gray-500">
                      Choose a specific date and time for all messages
                    </div>
                  </div>
                </label>
              </div>

              {/* Date/Time Picker */}
              {scheduleType === 'later' && (
                <div className="mt-4 flex gap-4">
                  <div className="flex-1">
                    <label
                      htmlFor="scheduledDate"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Date *
                    </label>
                    <input
                      type="date"
                      id="scheduledDate"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="scheduledTime"
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      Time *
                    </label>
                    <input
                      type="time"
                      id="scheduledTime"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              loading || !selectedTemplate || templates.length === 0 || eligibleCount === 0
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? 'Sending...'
              : scheduleType === 'now'
              ? `Send to ${eligibleCount} Lead(s)`
              : `Schedule for ${eligibleCount} Lead(s)`}
          </button>
        </div>
      </div>
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
