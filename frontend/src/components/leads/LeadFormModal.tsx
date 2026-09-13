import React, { useState } from 'react';
import { Lead, CreateLeadInput, UpdateLeadInput } from '../../api/leads.api';

interface LeadFormModalProps {
  lead?: Lead | null;
  onClose: () => void;
  onSubmit: (data: CreateLeadInput | UpdateLeadInput) => Promise<void>;
}

const LeadFormModal: React.FC<LeadFormModalProps> = ({ lead, onClose, onSubmit }) => {
  const isEditing = !!lead;

  const [formData, setFormData] = useState({
    name: lead?.name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    notes: lead?.notes || '',
    status: lead?.status || 'new',
    source: lead?.source || 'manual',
    potentialJoinDate: lead?.potentialJoinDate || '',
    nextMessageDate: lead?.nextMessageDate || '',
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // On edit, cleared fields are sent as '' so the backend nulls them out
      // (|| undefined would drop the key and make clearing a silent no-op)
      const submitData: CreateLeadInput | UpdateLeadInput = {
        name: formData.name,
        phone: formData.phone,
        email: isEditing ? formData.email ?? '' : formData.email || undefined,
        notes: isEditing ? formData.notes ?? '' : formData.notes || undefined,
        status: formData.status as any,
        potentialJoinDate: isEditing ? formData.potentialJoinDate ?? '' : formData.potentialJoinDate || undefined,
        nextMessageDate: isEditing ? formData.nextMessageDate ?? '' : formData.nextMessageDate || undefined,
      };

      if (!isEditing) {
        (submitData as CreateLeadInput).source = formData.source;
      }

      await onSubmit(submitData);
    } catch (error) {
      // Error handled by parent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b flex-shrink-0 bg-white rounded-t-lg">
          <h3 className="text-xl font-semibold text-gray-900">
            {isEditing ? 'Edit Lead' : 'Create New Lead'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Name */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Enter full name"
                  disabled={loading}
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number * (WhatsApp)
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+923001234567"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  International format with country code (e.g., +923001234567, +447911123456)
                </p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="email@example.com"
                  disabled={loading}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status *
                </label>
                <select
                  required
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="interested">Interested</option>
                  <option value="enrolled">Enrolled</option>
                  <option value="lost">Lost</option>
                </select>
              </div>

              {/* Source */}
              {!isEditing && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source
                  </label>
                  <select
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={loading}
                  >
                    <option value="manual">Manual</option>
                    <option value="referral">Referral</option>
                    <option value="website">Website</option>
                  </select>
                </div>
              )}

              {/* Potential Join Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Potential Join Date
                </label>
                <input
                  type="date"
                  value={formData.potentialJoinDate}
                  onChange={(e) => setFormData({ ...formData, potentialJoinDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>

              {/* Next Message Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Message Date
                </label>
                <input
                  type="date"
                  value={formData.nextMessageDate}
                  onChange={(e) => setFormData({ ...formData, nextMessageDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>

              {/* Notes */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Additional notes about this lead..."
                  rows={4}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 px-6 py-4 border-t flex-shrink-0 bg-white rounded-b-lg">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                isEditing ? 'Update Lead' : 'Create Lead'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeadFormModal;
