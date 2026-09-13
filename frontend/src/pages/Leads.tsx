import React, { useState, useEffect } from 'react';
import { leadsApi, Lead, CreateLeadInput, UpdateLeadInput, LeadFilters } from '../api/leads.api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { PlusIcon, MagnifyingGlassIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import LeadFormModal from '../components/leads/LeadFormModal';
import EmptyState from '../components/common/EmptyState';
import SendMessageModal from '../components/leads/SendMessageModal';
import BulkMessageModal from '../components/leads/BulkMessageModal';
import MessageHistoryDrawer from '../components/leads/MessageHistoryDrawer';
import { useSortableData } from '../hooks/useSortableData';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useConfirmDialog } from '../hooks/useConfirmDialog';

const Leads: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LeadFilters>({});
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messagingLead, setMessagingLead] = useState<Lead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [showBulkMessageModal, setShowBulkMessageModal] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [historyLead, setHistoryLead] = useState<Lead | null>(null);

  const isSudo = currentUser?.role === 'sudo';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'sudo';
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  // Sorting
  const { items: sortedLeads, requestSort, getSortIndicator } = useSortableData(leads);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const data = await leadsApi.getLeads({
        ...filters,
        search: search || undefined,
      });
      setLeads(data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [search, filters]);

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      contacted: 'bg-yellow-100 text-yellow-800',
      interested: 'bg-green-100 text-green-800',
      enrolled: 'bg-purple-100 text-purple-800',
      lost: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getSourceBadgeColor = (source: string) => {
    const colors: Record<string, string> = {
      manual: 'bg-gray-100 text-gray-800',
      dropped_enrollment: 'bg-orange-100 text-orange-800',
      referral: 'bg-green-100 text-green-800',
      website: 'bg-blue-100 text-blue-800',
    };
    return colors[source] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };

  const handleCreateLead = async (data: CreateLeadInput) => {
    try {
      await leadsApi.createLead(data);
      toast.success('Lead created successfully');
      setShowModal(false);
      fetchLeads();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to create lead');
      throw error;
    }
  };

  const handleUpdateLead = async (data: UpdateLeadInput) => {
    if (!editingLead) return;
    try {
      await leadsApi.updateLead(editingLead.id, data);
      toast.success('Lead updated successfully');
      setShowModal(false);
      setEditingLead(null);
      fetchLeads();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update lead');
      throw error;
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    const confirmed = await confirmDialog({
      title: 'Delete Lead',
      message: `Are you sure you want to delete ${lead.name}?`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await leadsApi.deleteLead(lead.id);
      toast.success('Lead deleted successfully');
      fetchLeads();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete lead');
    }
  };

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeadIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLeadIds.size === leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((lead) => lead.id)));
    }
  };

  const getSelectedLeads = (): Lead[] => {
    return leads.filter((lead) => selectedLeadIds.has(lead.id));
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                You don't have permission to access this page. Contact your administrator.
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
          <h1 className="text-2xl font-bold text-gray-900">Leads Management</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage potential students</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          <PlusIcon className="w-5 h-5" />
          Add Lead
        </button>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, phone, email, or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <select
            value={filters.status || ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="interested">Interested</option>
            <option value="enrolled">Enrolled</option>
            <option value="lost">Lost</option>
          </select>
          <select
            value={filters.source || ''}
            onChange={(e) => setFilters({ ...filters, source: e.target.value || undefined })}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Sources</option>
            <option value="manual">Manual</option>
            <option value="dropped_enrollment">Dropped Enrollment</option>
            <option value="referral">Referral</option>
            <option value="website">Website</option>
          </select>
        </div>
      </div>

      {/* Bulk Actions */}
      {isSudo && selectedLeadIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <span className="text-sm font-medium text-blue-900">
            {selectedLeadIds.size} lead(s) selected
          </span>
          <button
            onClick={() => setShowBulkMessageModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Send Bulk Message
          </button>
          <button
            onClick={() => setSelectedLeadIds(new Set())}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Leads Table */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={UserGroupIcon}
          title="No leads found"
          description="Create your first lead to get started"
        />
      ) : (
        <div className="bg-white shadow-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {isSudo && (
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedLeadIds.size === leads.length && leads.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                  </th>
                )}
                <th
                  onClick={() => requestSort('name')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Name & Contact {getSortIndicator('name')}
                </th>
                <th
                  onClick={() => requestSort('status')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Status {getSortIndicator('status')}
                </th>
                <th
                  onClick={() => requestSort('source')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Source {getSortIndicator('source')}
                </th>
                <th
                  onClick={() => requestSort('nextMessageDate')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Next Message {getSortIndicator('nextMessageDate')}
                </th>
                <th
                  onClick={() => requestSort('potentialJoinDate')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Join Date {getSortIndicator('potentialJoinDate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 animate-fade-in">
              {sortedLeads.map((lead) => (
                <tr key={lead.id} className={`hover:bg-indigo-50/30 transition-colors ${selectedLeadIds.has(lead.id) ? 'bg-indigo-50/50' : ''}`}>
                  {isSudo && (
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedLeadIds.has(lead.id)}
                        onChange={() => handleSelectLead(lead.id)}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                    <div className="text-sm text-gray-500">{lead.phone}</div>
                    {lead.email && <div className="text-xs text-gray-400">{lead.email}</div>}
                    {lead.notes && (
                      <div className="text-xs text-gray-500 mt-1 italic max-w-xs truncate" title={lead.notes}>
                        {lead.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeColor(lead.status)}`}>
                      {lead.status}
                    </span>
                    {lead.optedOut && (
                      <div className="text-xs text-red-600 mt-1">Opted Out</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSourceBadgeColor(lead.source)}`}>
                      {lead.source.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(lead.nextMessageDate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(lead.potentialJoinDate)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    <div className="flex items-center gap-1">
                      {isSudo && (
                        <>
                          <button
                            onClick={() => {
                              setMessagingLead(lead);
                              setShowMessageModal(true);
                            }}
                            className="px-2 py-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            Message
                          </button>
                          <button
                            onClick={() => {
                              setHistoryLead(lead);
                              setShowHistoryDrawer(true);
                            }}
                            className="px-2 py-1 text-purple-600 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors"
                          >
                            History
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setEditingLead(lead);
                          setShowModal(true);
                        }}
                        className="px-2 py-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteLead(lead)}
                        className="px-2 py-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
            Showing {sortedLeads.length} result{sortedLeads.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {!loading && leads.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          {['new', 'contacted', 'interested', 'enrolled', 'lost'].map((status) => {
            const count = leads.filter((l) => l.status === status).length;
            return (
              <div key={status} className="bg-white p-4 rounded-lg border">
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <div className="text-sm text-gray-500 capitalize">{status}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lead Form Modal */}
      {showModal && (
        <LeadFormModal
          lead={editingLead}
          onClose={() => {
            setShowModal(false);
            setEditingLead(null);
          }}
          onSubmit={(data) => editingLead ? handleUpdateLead(data as UpdateLeadInput) : handleCreateLead(data as CreateLeadInput)}
        />
      )}

      {/* Send Message Modal */}
      {showMessageModal && messagingLead && (
        <SendMessageModal
          isOpen={showMessageModal}
          onClose={() => {
            setShowMessageModal(false);
            setMessagingLead(null);
          }}
          onSuccess={() => {
            fetchLeads();
          }}
          leadId={messagingLead.id}
          leadName={messagingLead.name}
          leadPhone={messagingLead.phone}
        />
      )}

      {/* Bulk Message Modal */}
      {showBulkMessageModal && (
        <BulkMessageModal
          isOpen={showBulkMessageModal}
          onClose={() => {
            setShowBulkMessageModal(false);
          }}
          onSuccess={() => {
            setSelectedLeadIds(new Set());
            fetchLeads();
          }}
          selectedLeads={getSelectedLeads()}
        />
      )}

      {/* Message History Drawer */}
      {showHistoryDrawer && historyLead && (
        <MessageHistoryDrawer
          isOpen={showHistoryDrawer}
          onClose={() => {
            setShowHistoryDrawer(false);
            setHistoryLead(null);
          }}
          leadId={historyLead.id}
          leadName={historyLead.name}
        />
      )}

      <ConfirmDialog {...dialogProps} />
    </div>
  );
};

export default Leads;
