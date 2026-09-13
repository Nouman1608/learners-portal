import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import TeamsConnectButton from '../components/teams/TeamsConnectButton';
import { calendarApi, Event } from '../api/calendar.api';
import teamsApi from '../api/teams.api';
import { CheckCircleIcon, XCircleIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useAuth } from '../context/AuthContext';

export default function TeamsSettings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixingLobby, setFixingLobby] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'sudo';

  const handleFixLobby = async () => {
    setFixingLobby(true);
    try {
      const result = await teamsApi.fixMeetingLobby();
      toast.success(result.message);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update meeting lobby settings');
    } finally {
      setFixingLobby(false);
    }
  };

  useEffect(() => {
    // Check for OAuth callback success/error
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      toast.success('Microsoft Teams connected successfully!');
      // Clear URL params
      navigate('/settings/teams', { replace: true });
    } else if (error) {
      toast.error(`Failed to connect Teams: ${error}`);
      // Clear URL params
      navigate('/settings/teams', { replace: true });
    }

    fetchUpcomingEvents();
  }, [searchParams, navigate]);

  const fetchUpcomingEvents = async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const events = await calendarApi.getEvents({
        startDate: today,
        endDate: nextWeek,
        status: 'scheduled',
      });

      setUpcomingEvents(events);
    } catch (error) {
      console.error('Failed to fetch upcoming events:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Microsoft Teams Settings</h1>
          <p className="mt-2 text-sm text-gray-600">
            Connect your Microsoft Teams account to automatically sync attendance from meeting participants.
          </p>
        </div>

        {/* Connection Status */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Status</h2>
          <TeamsConnectButton />
        </div>

        {/* How It Works */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">How It Works</h2>
          <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
            <li>
              <strong>Connect your account:</strong> Click "Connect Microsoft Teams" above to authorize access to your Teams meetings.
            </li>
            <li>
              <strong>Create events with Teams meetings:</strong> When creating a class event, enable "Auto-create Teams meeting" or provide a manual Teams meeting URL.
            </li>
            <li>
              <strong>Automatic attendance sync:</strong> After each meeting ends, attendance is automatically synced from Teams participants (runs every hour).
            </li>
            <li>
              <strong>View attendance:</strong> View attendance records in the Calendar or Attendance pages. Attendance is read-only from Teams data.
            </li>
          </ol>
        </div>

        {/* Upcoming Events */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Upcoming Events (Next 7 Days)</h2>

          {loading ? (
            <LoadingSpinner message="Loading events..." className="py-4" />
          ) : upcomingEvents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Course
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Teams Meeting
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Attendance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {upcomingEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {new Date(event.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {event.course.title}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {event.startTime} - {event.endTime}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {event.teamsMeetingId || event.teamsMeetingUrl ? (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="text-xs">Linked</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <XCircleIcon className="h-4 w-4" />
                            <span className="text-xs">Not linked</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {event.attendanceSynced ? (
                          <span className="inline-flex items-center gap-1 text-blue-600">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span className="text-xs">Synced</span>
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not synced</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500">No upcoming events in the next 7 days.</p>
            </div>
          )}
        </div>

        {/* Troubleshooting */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Troubleshooting</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium text-gray-900">Q: Attendance isn't syncing automatically</dt>
              <dd className="mt-1 text-gray-600">
                A: Attendance syncs every hour after a meeting ends. You can also manually trigger a sync from the event's attendance view by clicking "Sync Attendance".
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Q: Some students are marked as absent even though they attended</dt>
              <dd className="mt-1 text-gray-600">
                A: Students must join with the same email address registered in the system. Check that students are using their registered email in Teams.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Q: I get an error when connecting Teams</dt>
              <dd className="mt-1 text-gray-600">
                A: Ensure you're using a Microsoft account with access to Teams. Contact your system administrator if the issue persists.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-900">Q: How do I disconnect my Teams account?</dt>
              <dd className="mt-1 text-gray-600">
                A: Click the "Disconnect Teams" button in the Connection Status section above. This will stop automatic attendance syncing.
              </dd>
            </div>
          </dl>
        </div>

        {/* Admin Tools */}
        {isAdmin && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-1">Admin Tools</h2>
            <p className="text-sm text-gray-500 mb-4">
              Maintenance actions for existing Teams meetings.
            </p>
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <WrenchScrewdriverIcon className="h-6 w-6 text-gray-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Fix Meeting Lobby Settings</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Patches all existing Teams meetings to admit participants directly (no lobby wait).
                  Run this once to fix meetings that were created before the lobby bypass was added.
                </p>
              </div>
              <button
                onClick={handleFixLobby}
                disabled={fixingLobby}
                className="shrink-0 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {fixingLobby ? 'Updating…' : 'Fix Now'}
              </button>
            </div>
          </div>
        )}

        {/* Back to Calendar */}
        <div className="flex justify-center">
          <button
            onClick={() => navigate('/calendar')}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Back to Calendar
          </button>
        </div>
      </div>
    </div>
  );
}
