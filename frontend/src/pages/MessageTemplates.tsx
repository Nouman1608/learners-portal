import React, { useState, useEffect } from 'react';
import { messagesApi, MessageTemplate, CreateMessageTemplateInput, UpdateMessageTemplateInput } from '../api/messages.api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { PlusIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const MessageTemplates: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  const isSudo = currentUser?.role === 'sudo';
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  useEffect(() => {
    if (isSudo) {
      fetchTemplates();
    }
  }, [isSudo]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await messagesApi.getMessageTemplates();
      setTemplates(data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch templates');
    } finally {
      setLoading(false);
    }
  };

  const getApprovalBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      re_engagement: 'bg-blue-100 text-blue-800',
      course_info: 'bg-purple-100 text-purple-800',
      follow_up: 'bg-indigo-100 text-indigo-800',
      reminder: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const handleToggleActive = async (template: MessageTemplate) => {
    try {
      await messagesApi.updateMessageTemplate(template.id, {
        isActive: !template.isActive,
      });
      toast.success(`Template ${template.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update template');
    }
  };

  const handleDeleteTemplate = async (template: MessageTemplate) => {
    const confirmed = await confirmDialog({
      title: 'Delete Template',
      message: `Are you sure you want to delete "${template.name}"?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await messagesApi.deleteMessageTemplate(template.id);
      toast.success('Template deleted successfully');
      fetchTemplates();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete template');
    }
  };

  if (!isSudo) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                You don't have permission to access this page. Only sudo users can manage message templates.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage WhatsApp message templates for marketing campaigns
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <PlusIcon className="w-5 h-5" />
          Create Template
        </button>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={ChatBubbleLeftRightIcon}
          title="No templates found"
          description="Create your first template to get started"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadge(
                        template.templateType
                      )}`}
                    >
                      {template.templateType.replace('_', ' ')}
                    </span>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getApprovalBadge(
                        template.approvalStatus
                      )}`}
                    >
                      {template.approvalStatus}
                    </span>
                    {template.isActive ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                        Inactive
                      </span>
                    )}
                  </div>
                  {template.whatsappTemplateName && (
                    <div className="text-sm text-gray-500">
                      WhatsApp Template: <span className="font-mono">{template.whatsappTemplateName}</span>{' '}
                      ({template.whatsappTemplateLanguage})
                    </div>
                  )}
                </div>
              </div>

              {/* Subject (if present) */}
              {template.subject && (
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-500 mb-1">Subject</div>
                  <div className="text-sm text-gray-900">{template.subject}</div>
                </div>
              )}

              {/* Body */}
              <div className="mb-4">
                <div className="text-xs font-medium text-gray-500 mb-1">Message Body</div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded border border-gray-200">
                  {template.body}
                </div>
              </div>

              {/* Metadata */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-4 pb-4 border-b border-gray-200">
                <div>
                  Created: {new Date(template.createdAt).toLocaleDateString()}
                </div>
                <div>
                  Updated: {new Date(template.updatedAt).toLocaleDateString()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingTemplate(template);
                    setShowModal(true);
                  }}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleToggleActive(template)}
                  className={`px-3 py-1.5 text-sm rounded ${
                    template.isActive
                      ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {template.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDeleteTemplate(template)}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Form Modal */}
      {showModal && (
        <TemplateFormModal
          template={editingTemplate}
          onClose={() => {
            setShowModal(false);
            setEditingTemplate(null);
          }}
          onSuccess={() => {
            setShowModal(false);
            setEditingTemplate(null);
            fetchTemplates();
          }}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

// Template Form Modal Component
interface TemplateFormModalProps {
  template: MessageTemplate | null;
  onClose: () => void;
  onSuccess: () => void;
}

function TemplateFormModal({ template, onClose, onSuccess }: TemplateFormModalProps) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    templateType: template?.templateType || 're_engagement',
    whatsappTemplateName: template?.whatsappTemplateName || '',
    whatsappTemplateLanguage: template?.whatsappTemplateLanguage || 'en',
    subject: template?.subject || '',
    body: template?.body || '',
    approvalStatus: template?.approvalStatus || 'pending',
    isActive: template?.isActive ?? true,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.body.trim()) {
      toast.error('Name and body are required');
      return;
    }

    try {
      setLoading(true);

      // On edit, cleared fields are sent as '' so the backend nulls them out
      const data: CreateMessageTemplateInput | UpdateMessageTemplateInput = {
        name: formData.name,
        templateType: formData.templateType as any,
        whatsappTemplateName: template ? formData.whatsappTemplateName ?? '' : formData.whatsappTemplateName || undefined,
        whatsappTemplateLanguage: formData.whatsappTemplateLanguage || 'en',
        subject: template ? formData.subject ?? '' : formData.subject || undefined,
        body: formData.body,
        approvalStatus: formData.approvalStatus as any,
        isActive: formData.isActive,
      };

      if (template) {
        await messagesApi.updateMessageTemplate(template.id, data);
        toast.success('Template updated successfully');
      } else {
        await messagesApi.createMessageTemplate(data as CreateMessageTemplateInput);
        toast.success('Template created successfully');
      }

      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Template Name *
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>

          {/* Type */}
          <div>
            <label htmlFor="templateType" className="block text-sm font-medium text-gray-700 mb-1">
              Template Type *
            </label>
            <select
              id="templateType"
              value={formData.templateType}
              onChange={(e) => setFormData({ ...formData, templateType: e.target.value as 're_engagement' | 'course_info' | 'follow_up' | 'reminder' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              <option value="re_engagement">Re-engagement</option>
              <option value="course_info">Course Information</option>
              <option value="follow_up">Follow-up</option>
              <option value="reminder">Reminder</option>
            </select>
          </div>

          {/* WhatsApp Template Name */}
          <div>
            <label htmlFor="whatsappTemplateName" className="block text-sm font-medium text-gray-700 mb-1">
              WhatsApp Template Name
            </label>
            <input
              type="text"
              id="whatsappTemplateName"
              value={formData.whatsappTemplateName}
              onChange={(e) => setFormData({ ...formData, whatsappTemplateName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="e.g., re_engagement_template_1"
            />
            <p className="mt-1 text-xs text-gray-500">
              The template name registered in Meta Business Manager
            </p>
          </div>

          {/* Language */}
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
              Template Language
            </label>
            <input
              type="text"
              id="language"
              value={formData.whatsappTemplateLanguage}
              onChange={(e) => setFormData({ ...formData, whatsappTemplateLanguage: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="en"
            />
          </div>

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject (Optional)
            </label>
            <input
              type="text"
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Body */}
          <div>
            <label htmlFor="body" className="block text-sm font-medium text-gray-700 mb-1">
              Message Body *
            </label>
            <textarea
              id="body"
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Use {{1}}, {{2}}, etc. for template parameters"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Use {"{{1}}"}, {"{{2}}"}, etc. for template parameters that will be filled in when sending
            </p>
          </div>

          {/* Approval Status */}
          <div>
            <label htmlFor="approvalStatus" className="block text-sm font-medium text-gray-700 mb-1">
              Approval Status
            </label>
            <select
              id="approvalStatus"
              value={formData.approvalStatus}
              onChange={(e) => setFormData({ ...formData, approvalStatus: e.target.value as 'pending' | 'approved' | 'rejected' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Only approved templates can be used for sending messages
            </p>
          </div>

          {/* Active Status */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Active (available for use)
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MessageTemplates;
