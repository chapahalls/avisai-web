import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { AuroraOrb, type OrbState } from './AuroraOrb';

const ORB_SIZE = 64;
const EDGE = 10;
const BUBBLE_MS = 6000;
const DRAG_THRESHOLD = 5;

export type Utterance = { id: string; text: string };

/**
 * AvisAI flutuante (espelha o AvisaiDock do app): a esfera fica sobre qualquer tela,
 * pode ser arrastada dentro do celular (ou movida pelas setas) e mostra a última fala
 * num balão. Um toque sem arrastar abre o painel de comandos.
 */
export function AvisaiDock({
  containerRef, state, stateLabel, bubble, hidden, panelOpen, onOpenPanel, onClosePanel,
  utterances, onUtter, onOpenCabin, micLabel, liveActive, onLive, audioEnabled, onToggleAudio,
}: {
  containerRef: RefObject<HTMLElement | null>;
  state: OrbState;
  stateLabel: string;
  /** Última fala do agente; `key` muda a cada fala para reexibir o balão mesmo com o mesmo texto. */
  bubble: { text: string | null; key: number };
  hidden: boolean;
  panelOpen: boolean;
  onOpenPanel: () => void;
  onClosePanel: () => void;
  utterances: Utterance[];
  onUtter: (id: string) => void;
  onOpenCabin: () => void;
  micLabel: string;
  liveActive: boolean;
  onLive: () => void;
  audioEnabled: boolean;
  onToggleAudio: () => void;
}) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  const clamp = useCallback((x: number, y: number) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return { x, y };
    // Acima da barra de abas (≈ 64 px) e abaixo da barra de status do celular.
    return {
      x: Math.min(Math.max(EDGE, x), box.width - ORB_SIZE - EDGE),
      y: Math.min(Math.max(40, y), box.height - ORB_SIZE - 70),
    };
  }, [containerRef]);

  // Posição inicial do app: canto inferior direito, acima das abas. Reajusta se o celular mudar de tamanho.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const place = () => setPosition((current) => {
      const box = container.getBoundingClientRect();
      return current ? clamp(current.x, current.y) : clamp(box.width - ORB_SIZE - 14, box.height - ORB_SIZE - 84);
    });
    place();
    const observer = new ResizeObserver(place);
    observer.observe(container);
    return () => observer.disconnect();
  }, [clamp, containerRef]);

  useEffect(() => {
    if (!bubble.text) return;
    setBubbleVisible(true);
    const timer = window.setTimeout(() => setBubbleVisible(false), BUBBLE_MS);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!position || event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    current.moved = true;
    setPosition(clamp(current.originX + dx, current.originY + dy));
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current || current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    // Toque sem arrastar abre o painel; arrastar só reposiciona.
    if (!current.moved) onOpenPanel();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (!delta || !position) return;
    event.preventDefault();
    setPosition(clamp(position.x + delta[0], position.y + delta[1]));
  };

  const box = containerRef.current?.getBoundingClientRect();
  const onRightHalf = position && box ? position.x + ORB_SIZE / 2 > box.width / 2 : true;

  return (
    <>
      {!hidden && !panelOpen && position && (
        <div className="da-dock" style={{ left: position.x, top: position.y }}>
          {bubbleVisible && bubble.text && (
            <button type="button" className="da-bubble" data-side={onRightHalf ? 'left' : 'right'} onClick={() => setBubbleVisible(false)} aria-label={`${t('driverApp.voice.agent')}: ${bubble.text}. ${t('driverApp.voice.bubbleDismiss')}`} data-tour-target="mobile-orb-bubble">
              <strong>{t('driverApp.voice.agent')} · {stateLabel}</strong>
              <span>{bubble.text}</span>
            </button>
          )}
          <button
            type="button"
            className="da-dock-orb"
            data-tour-target="mobile-orb"
            aria-label={t('driverApp.voice.orb', { state: stateLabel })}
            aria-describedby="da-orb-hint"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { drag.current = null; }}
            onKeyDown={onKeyDown}
            onClick={(event) => { if (event.detail === 0) onOpenPanel(); }}
          >
            <AuroraOrb state={state} size={ORB_SIZE} />
          </button>
          <span id="da-orb-hint" className="sr-only">{t('driverApp.voice.orbMoveHint')}</span>
        </div>
      )}

      {panelOpen && !hidden && (
        <div className="da-sheet-backdrop">
          <button type="button" className="da-sheet-scrim" tabIndex={-1} aria-label={t('driverApp.voice.close')} onClick={onClosePanel} />
          <section className="da-panel" role="dialog" aria-modal="true" aria-labelledby="da-panel-title" onKeyDown={(event) => { if (event.key === 'Escape') onClosePanel(); }}>
            <header className="da-panel-head">
              <AuroraOrb state={state} size={48} />
              <div>
                <h3 id="da-panel-title">{t('driverApp.voice.panelTitle', { state: stateLabel })}</h3>
                <p>{t('driverApp.voice.panelSubtitle')}</p>
              </div>
              <button type="button" className="da-round" onClick={onClosePanel} aria-label={t('driverApp.voice.close')}>×</button>
            </header>
            <p className="da-panel-mic">{micLabel}</p>
            <p className="da-panel-label">{t('driverApp.voice.simulateLabel')}</p>
            <div className="da-utterances">
              {utterances.map((utterance) => (
                <button key={utterance.id} type="button" data-tour-target={`mobile-utterance-${utterance.id}`} onClick={() => onUtter(utterance.id)}>“{utterance.text}”</button>
              ))}
            </div>
            <div className="da-panel-row">
              <button type="button" className="da-chip" aria-pressed={audioEnabled} onClick={onToggleAudio}>{t(audioEnabled ? 'driverApp.voice.audioOn' : 'driverApp.voice.audioOff')}</button>
              <button type="button" className="da-chip" data-live={liveActive || undefined} onClick={onLive}>{t(liveActive ? 'driverApp.voice.liveOn' : 'driverApp.voice.live')}</button>
            </div>
            <button type="button" className="da-panel-cabin" data-tour-target="mobile-open-cabin" onClick={onOpenCabin}>{t('driverApp.voice.openCabin')}</button>
          </section>
        </div>
      )}
    </>
  );
}
