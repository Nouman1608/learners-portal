import { useState } from 'react';
import { XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { OneToOneSession, SessionOverride } from '../../api/invoices.api';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  studentName: string;
  month: number;
  year: number;
  sessions: OneToOneSession[];
  onConfirm: (overrides: SessionOverride[]) => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function OneToOneSessionModal({
  studentName,
  month,
  year,
  sessions,
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      sessions.map((s) => [
        s.enrollmentId,
        s.existingSessionCount ?? s.completedSessions,
      ])
    )
  );

  const handleChange = (enrollmentId: string, value: string) => {
    const n = parseInt(value);
    setCounts((prev) => ({ ...prev, [enrollmentId]: isNaN(n) || n < 0 ? 0 : n }));
  };

  const handleConfirm = () => {
    const overrides: SessionOverride[] = sessions.map((s) => ({
      enrollmentId: s.enrollmentId,
      sessionCount: counts[s.enrollmentId] ?? 0,
    }));
    onConfirm(overrides);
  };

  const formatCurrency = (amount: string | null, currency: string) => {
    if (!amount) return '—';
    return `${currency} ${parseFloat(amount).toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">1-to-1 Sessions — {studentName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {MONTHS[month - 1]} {year} · Set sessions to charge per subject
            </p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Table */}
        <div className="px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                <th className="pb-3 pr-4">Subject</th>
                <th className="pb-3 pr-4 text-right">Rate / Session</th>
                <th className="pb-3 pr-4 text-center">Completed</th>
                <th className="pb-3 text-center">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map((s) => {
                const chargeCount = counts[s.enrollmentId] ?? 0;
                const total = s.perSessionFee
                  ? (parseFloat(s.perSessionFee) * chargeCount).toFixed(2)
                  : null;
                return (
                  <tr key={s.enrollmentId} className="py-3">
                    <td className="py-3 pr-4 font-medium text-gray-900">{s.courseTitle}</td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {formatCurrency(s.perSessionFee, s.currency)}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      <span className="inline-flex flex-col items-center">
                        <span className="text-green-700 font-medium">{s.completedSessions}</span>
                        {s.totalSessions > s.completedSessions && (
                          <span className="text-xs text-gray-400">
                            {s.totalSessions} total
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={chargeCount}
                          onChange={(e) => handleChange(s.enrollmentId, e.target.value)}
                          className="w-20 text-center border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {total !== null && (
                          <span className="text-xs text-indigo-600 font-medium">
                            = {s.currency} {total}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Total */}
          <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Estimated total: </span>
              {(() => {
                const byCurrency: Record<string, number> = {};
                for (const s of sessions) {
                  if (!s.perSessionFee) continue;
                  const cur = s.currency;
                  byCurrency[cur] = (byCurrency[cur] || 0) + parseFloat(s.perSessionFee) * (counts[s.enrollmentId] ?? 0);
                }
                return Object.entries(byCurrency)
                  .map(([cur, amt]) => `${cur} ${amt.toFixed(2)}`)
                  .join(' + ') || '—';
              })()}
            </div>
          </div>

          {/* Info note */}
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
            <InformationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              "Completed" shows sessions marked as completed in the calendar for this month.
              Adjust the "Charge" count if needed before generating the invoice.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}
