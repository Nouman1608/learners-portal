import { useState } from 'react';
import toast from 'react-hot-toast';
import { invoicesApi, Invoice } from '../../api/invoices.api';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Today as a Pakistan calendar day (YYYY-MM-DD), the most a payment date can be
const pakistanToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

/** Record, change or remove the day a salary slip was paid (admins) */
export default function SlipPaymentModal({ slip, onClose, onSaved }: {
  slip: Invoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paidOn, setPaidOn] = useState(slip.payment?.paidOn ?? pakistanToday());
  const [paymentMethod, setPaymentMethod] = useState<string>(slip.payment?.paymentMethod ?? 'bank_transfer');
  const [note, setNote] = useState(slip.payment?.note ?? '');
  const [busy, setBusy] = useState(false);
  const name = `${slip.recipient.firstName} ${slip.recipient.lastName}`;
  const input = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm';

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not save the payment date');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => invoicesApi.setSlipPayment(slip.id, { paidOn, paymentMethod, note }), 'Payment date saved');
        }}
      >
        <div className="border-b border-gray-200 p-5">
          <h2 className="text-lg font-bold text-gray-900">Salary slip paid – {name}</h2>
          <p className="text-sm text-gray-500">
            {slip.type === 'teacher_1to1' ? '1-to-1 slip, ' : ''}{MONTHS[slip.month - 1]} {slip.year}. The date shows on the slip and its PDF.
          </p>
        </div>
        <div className="space-y-4 p-5">
          <label className="block text-sm font-medium text-gray-700">
            Paid on
            <input type="date" required value={paidOn} max={pakistanToday()} onChange={(e) => setPaidOn(e.target.value)} className={`mt-1 ${input}`} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            How
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`mt-1 ${input}`}>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Note (optional)
            <input type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`mt-1 ${input}`} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 p-4">
          <div>
            {slip.payment && (
              <button type="button" disabled={busy}
                onClick={() => void run(() => invoicesApi.clearSlipPayment(slip.id), 'Marked as not paid')}
                className="rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                Mark as not paid
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={busy}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
