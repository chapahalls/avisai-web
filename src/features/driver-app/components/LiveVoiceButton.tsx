import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { checkLiveVoice, connectLiveVoice, disconnectLiveVoice, liveVoiceStore, useLiveVoice } from '../../../services/livekit/liveVoice';
import { AppIcon } from './AppIcon';

export function LiveVoiceButton() {
  const { t } = useTranslation();
  const status = useLiveVoice((state) => state.status);
  const room = useLiveVoice((state) => state.room);
  const error = useLiveVoice((state) => state.error);

  useEffect(() => {
    if (['idle', 'unavailable', 'unreachable', 'unconfigured', 'error'].includes(liveVoiceStore.getState().status)) void checkLiveVoice();
  }, []);

  const active = status === 'connecting' || status === 'requesting_microphone' || status === 'waiting_agent' || status === 'live';
  const statusText = status === 'error' && error ? t(`driverApp.live.errors.${error}`) : t(`driverApp.live.status.${status}`, { room: room ?? '' });
  const label = `${t(active ? 'driverApp.live.disconnect' : 'driverApp.live.connect')} · ${statusText}`;
  const toggle = async () => {
    if (active) {
      await disconnectLiveVoice();
      return;
    }
    if (status !== 'idle') await checkLiveVoice();
    if (liveVoiceStore.getState().status === 'idle') await connectLiveVoice();
  };

  return (
    <>
      <button type="button" className="mobile-demo-live-button" data-status={status} aria-label={label} title={label} aria-pressed={active} aria-busy={status === 'connecting' || status === 'requesting_microphone' || status === 'checking'} disabled={status === 'checking'} onClick={() => void toggle()}>
        <AppIcon name={status === 'live' ? 'connected' : active || status === 'checking' ? 'clock' : 'connect'} size={20} />
      </button>
      <span className="sr-only" role="status">{statusText}</span>
      {(status === 'requesting_microphone' || status === 'waiting_agent' || status === 'unreachable' || status === 'unconfigured' || status === 'unavailable' || status === 'error') && <span className="mobile-demo-live-message">{statusText}</span>}
    </>
  );
}
