import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppIcon, AuroraOrb } from '../../driver-app';
import type { CallLog } from '../../../types/ops';

const RING_MS = 1500;
const LINE_MS = 2200;
const END_HOLD_MS = 900;

type Stage = 'ringing' | 'live' | 'ended';

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

/**
 * Celular simulado do recebedor (espelha o chrome do celular do motorista): mostra a ligação de
 * escalonamento como ela realmente acontece na Demo, com a mesma transcrição do CallLog.
 */
export function ReceiverCallPhone({ open, call, receiverName, preview, live = false, onClose }: {
  open: boolean;
  call: CallLog | null;
  receiverName: string;
  /** A ligação foi gerada na hora pelo botão "Simular", sem esperar o relógio da demo. */
  preview: boolean;
  /** Ligação real (Demo com o celular do visitante): as falas aparecem quando chegam do backend. */
  live?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>('ringing');
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (!open || !call || live) return;
    setStage('ringing');
    setVisibleLines(0);
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setStage('live'), RING_MS));
    call.transcript.forEach((_, index) => {
      timers.push(window.setTimeout(() => setVisibleLines(index + 1), RING_MS + LINE_MS * (index + 1)));
    });
    timers.push(window.setTimeout(() => setStage('ended'), RING_MS + LINE_MS * call.transcript.length + END_HOLD_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [open, call, live]);

  if (!open || !call) return null;
  const shownStage: Stage = live ? (call.status === 'ended' ? 'ended' : call.transcript.length ? 'live' : 'ringing') : stage;
  const shownLines = live || shownStage === 'ended' ? call.transcript.length : visibleLines;
  const resultLabel = t(`calls.results.${call.resultCode}`, { dock: call.dock });

  return (
    <div className="rc-overlay" role="dialog" aria-modal="true" aria-label={t('driverApp.receiverCall.title')}>
      <div className="rc-phone">
        <div className="rc-phone-camera" />
        <div className="rc-phone-screen" data-stage={shownStage}>
          <button type="button" className="rc-close" onClick={onClose} aria-label={t('driverApp.receiverCall.close')}>
            <AppIcon name="back" size={16} />
          </button>
          <header className="rc-head">
            <span className="rc-avatar">{initials(receiverName)}</span>
            <strong>{receiverName}</strong>
            <small>{t('driverApp.receiverCall.caller')}</small>
            {preview && <em className="rc-preview-tag">{t('driverApp.receiverCall.previewTag')}</em>}
            {live && <em className="rc-preview-tag rc-live-tag">{t('driverApp.receiverCall.liveTag')}</em>}
          </header>

          {shownStage === 'ringing' && (
            <p className="rc-ringing">
              <AuroraOrb state="listening" size={46} />
              {t('driverApp.receiverCall.incoming')}
            </p>
          )}

          {shownStage !== 'ringing' && (
            <ul className="rc-transcript" aria-live={live ? 'polite' : undefined}>
              {call.transcript.slice(0, shownLines).map((line, index) => (
                <li key={`${call.id}-${index}`} data-who={line.who}>
                  <small>{t(`calls.who.${line.who}`)}</small>
                  <p>{line.messageKey ? t(line.messageKey, line.values ?? {}) : line.text}</p>
                </li>
              ))}
            </ul>
          )}

          {shownStage === 'ended' && <p className="rc-result">{t('driverApp.receiverCall.ended')} · {resultLabel}</p>}
        </div>
      </div>
    </div>
  );
}
