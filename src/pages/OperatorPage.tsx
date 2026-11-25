import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC, { type IAgoraRTCClient, type IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { getApiClient, useConnection } from '../services/operations';
import type { BackendOperatorCall } from '../services/api/types';
import { APP_ROUTES } from '../lib/routes';

type JoinState = 'idle' | 'joining' | 'active' | 'error';

export function OperatorPage() {
  const { t } = useTranslation();
  const connection = useConnection();
  const client = getApiClient();
  const [call, setCall] = useState<BackendOperatorCall | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinState, setJoinState] = useState<JoinState>('idle');
  const rtc = useRef<IAgoraRTCClient | null>(null);
  const mic = useRef<IMicrophoneAudioTrack | null>(null);

  const leave = useCallback(async () => {
    try {
      mic.current?.close();
      mic.current = null;
      if (rtc.current) await rtc.current.leave();
    } finally {
      rtc.current = null;
      setJoinState('idle');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!client || connection.mode !== 'api') {
      setLoading(false);
      return;
    }
    try {
      const result = await client.getCurrentOperatorCall();
      setCall(result.chamada);
    } catch {
      setJoinState('error');
    } finally {
      setLoading(false);
    }
  }, [client, connection.mode]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 2_000);
    return () => {
      window.clearInterval(timer);
      void leave();
    };
  }, [leave, refresh]);

  const answer = async () => {
    if (!client || !call || joinState !== 'idle') return;
    if (!call.app_id || !call.channel || !call.token || !call.uid) {
      setJoinState('error');
      return;
    }
    setJoinState('joining');
    try {
      const rtcClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      rtc.current = rtcClient;
      rtcClient.on('user-published', async (user, mediaType) => {
        await rtcClient.subscribe(user, mediaType);
        if (mediaType === 'audio') user.audioTrack?.play();
      });
      await rtcClient.join(call.app_id, call.channel, call.token, call.uid);
      mic.current = await AgoraRTC.createMicrophoneAudioTrack({ AEC: true, ANS: true, AGC: true });
      await rtcClient.publish(mic.current);
      const answered = await client.answerOperatorCall(call.id);
      setCall((current) => current ? { ...current, ...answered } : current);
      setJoinState('active');
    } catch {
      await leave();
      setJoinState('error');
    }
  };

  return (
    <section className="mx-auto max-w-2xl">
      <Link to={APP_ROUTES.dashboard} className="text-sm text-brand-500 hover:underline">← {t('trip.back')}</Link>
      <div className="mt-5">
        <PageHeader eyebrow={t('operator.eyebrow')} title={t('operator.title')} description={t('operator.hint')} />
      </div>
      <div className="mt-6 rounded-card border border-ink-700 bg-ink-900 p-6">
        {loading && <p role="status" className="text-sm text-ink-300">{t('operator.loading')}</p>}
        {!loading && !call && <p className="text-sm text-ink-300">{t('operator.waiting')}</p>}
        {!loading && call && (
          <div className="space-y-5">
            <div className="rounded-input border border-wait-500/50 bg-wait-500/10 p-4">
              <p className="font-display text-lg font-semibold">{t('operator.title')}</p>
              <p className="mt-2 text-sm text-ink-100">{t('operator.callReason', { reason: call.motivo })}</p>
              <p className="mt-1 text-xs text-ink-300">{t('operator.callStatus', { status: call.status })}</p>
            </div>
            {joinState === 'error' && <p role="alert" className="rounded-input border border-alert-500/40 bg-alert-500/10 p-3 text-sm text-alert-500">
              {call.app_id ? t('operator.error') : t('operator.missingRtc')}
            </p>}
            {joinState === 'active' ? (
              <button type="button" onClick={() => void leave()} className="rounded-input border border-ink-700 px-4 py-2.5 text-sm font-semibold">{t('operator.leave')}</button>
            ) : (
              <button type="button" onClick={() => void answer()} disabled={joinState === 'joining' || call.status !== 'agora_tocando'}
                aria-busy={joinState === 'joining'} className="rounded-input bg-brand-500 text-on-accent px-4 py-2.5 text-sm font-semibold hover:bg-brand-600 disabled:cursor-wait disabled:opacity-50">
                {t(joinState === 'joining' ? 'operator.connecting' : 'operator.answer')}
              </button>
            )}
            {joinState === 'active' && <p className="text-sm text-ok-500">{t('operator.answered')}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
