import { useTranslation } from 'react-i18next';
import { AppIcon } from './AppIcon';
import { AuroraOrb, type OrbState } from './AuroraOrb';
import type { Utterance } from './AvisaiDock';

/**
 * Conversa em tela cheia (espelha o CabinModeModal do app): esfera grande, última fala do
 * agente em fonte grande, a fala do motorista abaixo e controles de mudo e sessão ao vivo.
 * Na Demo, as falas sugeridas simulam o que o motorista diria.
 */
export function CabinConversation({
  state, stateLabel, contextPill, live, agentCaption, driverCaption, suggestions, onUtter, onClose, onTalk,
}: {
  state: OrbState;
  stateLabel: string;
  contextPill: string;
  live: { active: boolean; waiting: boolean; microphoneReady: boolean; muted: boolean; onToggleMute: () => void; onEnd: () => void };
  agentCaption: string | null;
  driverCaption: string | null;
  suggestions: Utterance[];
  onUtter: (id: string) => void;
  onClose: () => void;
  onTalk: () => void;
}) {
  const { t } = useTranslation();
  const mode = live.active ? t(live.waiting ? 'driverApp.voice.cabin.waitingAgent' : 'driverApp.voice.cabin.live') : t('driverApp.voice.cabin.simulated');
  return (
    <section className="da-cabin" role="dialog" aria-modal="true" aria-labelledby="da-cabin-agent">
      <header className="da-cabin-top">
        <button type="button" className="da-round da-round-lg" data-tour-target="mobile-cabin-close" onClick={onClose} aria-label={t('driverApp.voice.cabin.back')}>
          <AppIcon name="back" size={22} />
        </button>
        <span className="da-cabin-pill" data-tone={contextPill ? 'trip' : 'mode'}><i />{contextPill || mode}</span>
        <button type="button" className="da-round da-round-lg" aria-pressed={live.muted} disabled={!live.microphoneReady} onClick={live.onToggleMute}
          aria-label={t(live.muted ? 'driverApp.voice.cabin.unmute' : 'driverApp.voice.cabin.mute')}><AppIcon name={live.muted ? 'micOff' : 'mic'} size={20} /></button>
      </header>
      <div className="da-cabin-meta">
        <span><i data-state={state} />{stateLabel}{contextPill ? ` · ${mode}` : ''}</span>
        <span><AppIcon name="speaker" size={13} />{t('driverApp.voice.cabin.speaker')}</span>
        {live.muted && <b>{t('driverApp.voice.cabin.muted')}</b>}
      </div>

      <div className="da-cabin-center">
        <button type="button" className="da-cabin-orb" onClick={onTalk} aria-label={t('driverApp.voice.cabin.talk')}>
          <AuroraOrb state={state} size={176} muted={live.muted} />
        </button>
        <p id="da-cabin-agent" className="da-cabin-agent-tag">{t('driverApp.voice.agent')}</p>
        <p className="da-cabin-caption" aria-live="polite">{agentCaption ?? t(live.active ? 'driverApp.voice.cabin.liveEmpty' : 'driverApp.voice.cabin.empty')}</p>
        {driverCaption && <p className="da-cabin-driver">{t('driverApp.voice.you')}: “{driverCaption}”</p>}
      </div>

      <footer className="da-cabin-bottom">
        {live.active
          ? <button type="button" className="da-cabin-end" onClick={live.onEnd}>{t('driverApp.voice.cabin.end')}</button>
          : (
            <div className="da-cabin-suggestions" role="group" aria-label={t('driverApp.voice.cabin.suggestions')}>
              {suggestions.map((item) => <button key={item.id} type="button" data-tour-target={`mobile-cabin-${item.id}`} onClick={() => onUtter(item.id)}>“{item.text}”</button>)}
            </div>
          )}
        <div className="da-cabin-talk">
          <div><strong>{t('driverApp.voice.cabin.talk')}</strong><small>{t('driverApp.voice.cabin.voiceOnly')}</small></div>
          <button type="button" className="da-round da-round-xl" data-active={state === 'listening' || undefined} onClick={onTalk} aria-label={t('driverApp.voice.cabin.talk')}><AppIcon name="mic" size={24} /></button>
        </div>
      </footer>
    </section>
  );
}
