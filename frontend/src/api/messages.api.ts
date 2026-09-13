import apiClient from './client';

export interface MessageTemplate {
  id: string;
  name: string;
  templateType: 're_engagement' | 'course_info' | 'follow_up' | 'reminder';
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string;
  subject: string | null;
  body: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadMessage {
  id: string;
  leadId: string;
  templateId: string | null;
  messageType: 're_engagement' | 'course_info' | 'follow_up' | 'ad_hoc';
  messageContent: string;
  whatsappMessageId: string | null;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  scheduledFor: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  sentBy: string;
  createdAt: Date;
}

export interface SendMessageInput {
  leadId: string;
  templateId?: string;
  messageType: 're_engagement' | 'course_info' | 'follow_up' | 'ad_hoc';
  messageContent?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  scheduledFor?: string; // ISO datetime string
}

export interface SendBulkMessagesInput {
  leadIds: string[];
  templateId: string;
  templateName: string;
  templateLanguage?: string;
  templateParameters?: string[];
  messageType: 're_engagement' | 'course_info' | 'follow_up' | 'ad_hoc';
  messageContent: string;
  scheduledFor?: string; // ISO datetime string
}

export interface CreateMessageTemplateInput {
  name: string;
  templateType: 're_engagement' | 'course_info' | 'follow_up' | 'reminder';
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  subject?: string;
  body: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  isActive?: boolean;
}

export interface UpdateMessageTemplateInput {
  name?: string;
  templateType?: 're_engagement' | 'course_info' | 'follow_up' | 'reminder';
  whatsappTemplateName?: string;
  whatsappTemplateLanguage?: string;
  subject?: string;
  body?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  isActive?: boolean;
}

export interface WhatsAppCredentialsInput {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
}

export interface MessageStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
}

export const messagesApi = {
  // Message sending
  sendMessage: async (data: SendMessageInput): Promise<LeadMessage> => {
    const response = await apiClient.post<{ message: LeadMessage }>('/messages/send', data);
    return response.data.message;
  },

  sendBulkMessages: async (data: SendBulkMessagesInput): Promise<{ success: number; failed: number; errors: any[] }> => {
    const response = await apiClient.post<{ results: { success: number; failed: number; errors: any[] } }>(
      '/messages/send-bulk',
      data
    );
    return response.data.results;
  },

  scheduleMessage: async (data: SendMessageInput): Promise<LeadMessage> => {
    const response = await apiClient.post<{ message: LeadMessage }>('/messages/schedule', data);
    return response.data.message;
  },

  // Message history
  getMessageHistory: async (leadId: string): Promise<LeadMessage[]> => {
    const response = await apiClient.get<{ messages: LeadMessage[] }>(`/messages/lead/${leadId}`);
    return response.data.messages;
  },

  getMessageStats: async (): Promise<MessageStats> => {
    const response = await apiClient.get<{ stats: MessageStats }>('/messages/stats');
    return response.data.stats;
  },

  // Message templates
  getMessageTemplates: async (activeOnly?: boolean): Promise<MessageTemplate[]> => {
    const params = new URLSearchParams();
    if (activeOnly !== undefined) params.append('activeOnly', String(activeOnly));

    const response = await apiClient.get<{ templates: MessageTemplate[] }>(
      `/messages/templates?${params.toString()}`
    );
    return response.data.templates;
  },

  getMessageTemplateById: async (id: string): Promise<MessageTemplate> => {
    const response = await apiClient.get<{ template: MessageTemplate }>(`/messages/templates/${id}`);
    return response.data.template;
  },

  createMessageTemplate: async (data: CreateMessageTemplateInput): Promise<MessageTemplate> => {
    const response = await apiClient.post<{ template: MessageTemplate }>('/messages/templates', data);
    return response.data.template;
  },

  updateMessageTemplate: async (id: string, data: UpdateMessageTemplateInput): Promise<MessageTemplate> => {
    const response = await apiClient.put<{ template: MessageTemplate }>(`/messages/templates/${id}`, data);
    return response.data.template;
  },

  deleteMessageTemplate: async (id: string): Promise<void> => {
    await apiClient.delete(`/messages/templates/${id}`);
  },

  // WhatsApp credentials
  storeWhatsAppCredentials: async (data: WhatsAppCredentialsInput): Promise<void> => {
    await apiClient.post('/messages/whatsapp-credentials', data);
  },

  getWhatsAppStatus: async (): Promise<{ isConfigured: boolean }> => {
    const response = await apiClient.get<{ isConfigured: boolean }>('/messages/whatsapp-status');
    return response.data;
  },
};

export default messagesApi;
