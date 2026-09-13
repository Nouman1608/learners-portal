import { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { teamsApi, TeamsConnectionStatus } from '../../api/teams.api';
import toast from 'react-hot-toast';
import ConfirmDialog from '../common/ConfirmDialog';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

export default function TeamsConnectButton() {
  const [status, setStatus] = useState<TeamsConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const { confirm: confirmDialog, dialogProps } = useConfirmDialog();

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const connectionStatus = await teamsApi.getConnectionStatus();
      setStatus(connectionStatus);
    } catch (error) {
      console.error('Failed to fetch Teams connection status:', error);
      toast.error('Failed to load Teams connection status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const authUrl = await teamsApi.getOAuthUrl();

      // Open OAuth URL in a new window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const authWindow = window.open(
        authUrl,
        'Microsoft Teams OAuth',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
      );

      // Poll for connection status after OAuth window opens
      const pollInterval = setInterval(async () => {
        if (authWindow?.closed) {
          clearInterval(pollInterval);
          setConnecting(false);
          // Refresh status after window closes
          await fetchStatus();
        }
      }, 1000);

      // Also listen for URL changes (in case callback happens in same window)
      window.addEventListener('focus', async () => {
        if (authWindow?.closed) {
          await fetchStatus();
        }
      }, { once: true });
    } catch (error) {
      console.error('Failed to initiate Teams OAuth:', error);
      toast.error('Failed to connect to Microsoft Teams');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = await confirmDialog({
      title: 'Disconnect Teams',
      message: 'Are you sure you want to disconnect Microsoft Teams? This will prevent automatic attendance syncing.',
      confirmLabel: 'Disconnect',
      variant: 'warning',
    });
    if (!confirmed) return;

    try {
      await teamsApi.revokeConnection();
      toast.success('Microsoft Teams disconnected successfully');
      setStatus({ connected: false });
    } catch (error) {
      console.error('Failed to disconnect Teams:', error);
      toast.error('Failed to disconnect Microsoft Teams');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-600">
        <ArrowPathIcon className="h-5 w-5 animate-spin" />
        <span>Loading connection status...</span>
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircleIcon className="h-6 w-6" />
          <div>
            <p className="font-medium">Microsoft Teams Connected</p>
            {status.email && (
              <p className="text-sm text-gray-600">
                Connected as {status.displayName || status.email}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleDisconnect}
          className="text-sm text-red-600 hover:text-red-700 font-medium"
        >
          Disconnect Teams
        </button>
        <ConfirmDialog {...dialogProps} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-gray-600">
        <XCircleIcon className="h-6 w-6" />
        <p>Microsoft Teams not connected</p>
      </div>
      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? (
          <>
            <ArrowPathIcon className="h-5 w-5 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M0 0h11v11H0V0zm0 13h11v11H0V13zm13 0h11v11H13V13zm0-13h11v11H13V0z"/>
            </svg>
            Connect Microsoft Teams
          </>
        )}
      </button>
      <p className="text-xs text-gray-500">
        Connect your Microsoft Teams account to automatically sync attendance from meeting participants.
      </p>
    </div>
  );
}
