import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { getSyncSnapshot, subscribeSyncStatus, processOutbox } from '../offline/syncManager';

export default function SyncStatusBadge() {
  const [syncState, setSyncState] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
  });

  useEffect(() => {
    let isMounted = true;
    const update = async () => {
      const snap = await getSyncSnapshot();
      if (isMounted) setSyncState(snap);
    };

    update();
    processOutbox();
    const unsubscribe = subscribeSyncStatus(update);
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleManualSync = () => {
    if (syncState.isOnline && !syncState.isSyncing) {
      processOutbox();
    }
  };

  const { isOnline, isSyncing, pendingCount, failedCount } = syncState;

  if (syncState.storageUnavailable || syncState.recoveryNeeded) {
    return <div className="sync-badge sync-badge-pending" role="status"
      title={syncState.storageUnavailable ? 'This browser cannot access offline storage. Keep unsent work open and reconnect before saving.'
        : 'Older offline changes have no recorded account owner. They are preserved, but need administrator review before they can sync.'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
        borderRadius: 9999, fontSize: 12, backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
      <AlertTriangle size={13} /><span>{syncState.storageUnavailable ? 'Offline storage unavailable' : 'Older offline work needs review'}</span>
    </div>;
  }

  if (failedCount > 0) {
    return <div className="sync-badge sync-badge-pending" role="status"
      title="The server rejected a saved change. Your work is retained on this device. Contact your administrator before retrying."
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
        borderRadius: 9999, fontSize: 12, backgroundColor: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
      <AlertTriangle size={13} /><span>{failedCount} change(s) need review</span>
    </div>;
  }

  // Render different states
  if (isSyncing) {
    return (
      <div
        className="sync-badge sync-badge-syncing"
        title="Syncing changes with server..."
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: '#eff6ff',
          color: '#1d4ed8',
          border: '1px solid #bfdbfe',
          cursor: 'default',
        }}
      >
        <RefreshCw size={13} className="spin-animation" style={{ animation: 'spin 1s linear infinite' }} />
        <span>Syncing...</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className="sync-badge sync-badge-offline"
        title={pendingCount > 0 ? `${pendingCount} change(s) saved locally, will sync when online` : 'Working offline'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: '#fffbeb',
          color: '#b45309',
          border: '1px solid #fde68a',
          cursor: 'default',
        }}
      >
        <WifiOff size={13} />
        <span>Offline {pendingCount > 0 ? `(${pendingCount} saved)` : ''}</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <button
        type="button"
        onClick={handleManualSync}
        className="sync-badge sync-badge-pending"
        title="Click to sync your pending changes now"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '12px',
          fontWeight: 600,
          backgroundColor: '#fef3c7',
          color: '#92400e',
          border: '1px solid #fcd34d',
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={13} />
        <span>{pendingCount} unsynced (Click to sync)</span>
      </button>
    );
  }

  return (
    <div
      className="sync-badge sync-badge-synced"
      title="Connected & synced"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        backgroundColor: '#f0fdf4',
        color: '#15803d',
        border: '1px solid #bbf7d0',
        cursor: 'default',
      }}
    >
      <Check size={13} />
      <span>Synced</span>
    </div>
  );
}
