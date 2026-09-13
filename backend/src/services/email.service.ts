import nodemailer from 'nodemailer';
import path from 'path';
import logger from '../utils/logger';

// Email configuration from environment variables
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
};

const EMAIL_FROM = process.env.EMAIL_FROM || 'learners-academy@example.com';

export interface SendInvoiceEmailInput {
  to: string;
  recipientName: string;
  invoiceNumber: string;
  month: string;
  year: number;
  totalAmount: string;
  pdfPath: string;
  type: 'student' | 'teacher';
}

export const emailService = {
  /**
   * Create transporter
   */
  createTransporter() {
    // Skip if SMTP not configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      logger.warn('[EMAIL] SMTP credentials not configured. Emails will not be sent.');
      return null;
    }

    return nodemailer.createTransport(SMTP_CONFIG);
  },

  /**
   * Send invoice email
   */
  async sendInvoiceEmail(input: SendInvoiceEmailInput): Promise<boolean> {
    try {
      const transporter = this.createTransporter();

      if (!transporter) {
        logger.info(`[EMAIL] Skipping email to ${input.to} (SMTP not configured)`);
        return false;
      }

      const subject =
        input.type === 'student'
          ? `Your Monthly Invoice - ${input.month} ${input.year}`
          : `Your Monthly Payment Invoice - ${input.month} ${input.year}`;

      const htmlContent =
        input.type === 'student'
          ? this.generateStudentEmailHTML(input)
          : this.generateTeacherEmailHTML(input);

      const textContent =
        input.type === 'student'
          ? this.generateStudentEmailText(input)
          : this.generateTeacherEmailText(input);

      const mailOptions = {
        from: `Learners Academy <${EMAIL_FROM}>`,
        to: input.to,
        subject,
        text: textContent,
        html: htmlContent,
        attachments: [
          {
            filename: `${input.invoiceNumber}.pdf`,
            path: path.join(process.cwd(), input.pdfPath),
          },
        ],
      };

      const info = await transporter.sendMail(mailOptions);
      logger.info(`[EMAIL] Invoice sent to ${input.to}: ${info.messageId}`);

      return true;
    } catch (error: any) {
      logger.error(`[EMAIL] Failed to send invoice to ${input.to}:`, error);
      return false;
    }
  },

  /**
   * Generate student email HTML
   */
  generateStudentEmailHTML(input: SendInvoiceEmailInput): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
          .button { background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
          .amount { font-size: 24px; font-weight: bold; color: #4F46E5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Learners Academy</h1>
            <p>Your Monthly Invoice</p>
          </div>
          <div class="content">
            <h2>Dear ${input.recipientName},</h2>
            <p>Your invoice for <strong>${input.month} ${input.year}</strong> is now available.</p>
            <p><strong>Invoice Number:</strong> ${input.invoiceNumber}</p>
            <p><strong>Total Amount:</strong> <span class="amount">PKR ${parseFloat(input.totalAmount).toFixed(2)}</span></p>
            <p>Please find the detailed invoice attached to this email.</p>
            <p>If you have any questions or concerns regarding this invoice, please contact our administration team.</p>
            <p style="margin-top: 30px;">
              <em>This is an automated email. Please do not reply to this message.</em>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Learners Academy. All rights reserved.</p>
            
          </div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Generate teacher email HTML
   */
  generateTeacherEmailHTML(input: SendInvoiceEmailInput): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
          .amount { font-size: 24px; font-weight: bold; color: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Learners Academy</h1>
            <p>Your Monthly Payment Invoice</p>
          </div>
          <div class="content">
            <h2>Dear ${input.recipientName},</h2>
            <p>Your payment invoice for <strong>${input.month} ${input.year}</strong> is now available.</p>
            <p><strong>Invoice Number:</strong> ${input.invoiceNumber}</p>
            <p><strong>Total Payment:</strong> <span class="amount">PKR ${parseFloat(input.totalAmount).toFixed(2)}</span></p>
            <p>Please find the detailed breakdown of your earnings attached to this email.</p>
            <p>If you have any questions regarding this payment invoice, please contact our administration team.</p>
            <p style="margin-top: 30px;">
              <em>This is an automated email. Please do not reply to this message.</em>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Learners Academy. All rights reserved.</p>
           
          </div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Generate student email text (plain text version)
   */
  generateStudentEmailText(input: SendInvoiceEmailInput): string {
    return `
Learners Academy
Your Monthly Invoice

Dear ${input.recipientName},

Your invoice for ${input.month} ${input.year} is now available.

Invoice Number: ${input.invoiceNumber}
Total Amount: PKR ${parseFloat(input.totalAmount).toFixed(2)}

Please find the detailed invoice attached to this email.

If you have any questions or concerns regarding this invoice, please contact our administration team.

This is an automated email. Please do not reply to this message.

© ${new Date().getFullYear()} Learners Academy. All rights reserved.

    `;
  },

  /**
   * Generate teacher email text (plain text version)
   */
  generateTeacherEmailText(input: SendInvoiceEmailInput): string {
    return `
Learners Academy
Your Monthly Payment Invoice

Dear ${input.recipientName},

Your payment invoice for ${input.month} ${input.year} is now available.

Invoice Number: ${input.invoiceNumber}
Total Payment: PKR ${parseFloat(input.totalAmount).toFixed(2)}

Please find the detailed breakdown of your earnings attached to this email.

If you have any questions regarding this payment invoice, please contact our administration team.

This is an automated email. Please do not reply to this message.

© ${new Date().getFullYear()} Learners Academy. All rights reserved.

    `;
  },
};

export default emailService;
