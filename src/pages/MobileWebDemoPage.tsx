import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Lenis from 'lenis';
import { Icon } from '../components/Icon';
import { RodarLogo, RodarMark } from '../components/RodarLogo';
import { AppIcon, AvisaiDock, CabinConversation, type OrbState, type Utterance } from '../features/driver-app';
import { applyMobileDemoAction, useOps, useReceivers } from '../services/operations';
import { connectLiveVoice, disconnectLiveVoice, toggleLiveMute, useLiveVoice } from '../services/livekit/liveVoice';
import type { FeedEvent } from '../services/mock/engine';
import type { TripPhase } from '../types/ops';
import { SIMULATION } from '../lib/config';
import { brl, clock } from '../utils/format';
import { stayValue } from '../utils/stay';
import './mobile-web-demo.css';

/** Abas do app (Início, Mapa, Documentos, Mensagens) e a fila, que abre empilhada sobre o Início. */
type Screen = 'home' | 'map' | 'documents' | 'messages' | 'queue';
type Phase = 'idle' | 'driving' | 'approaching' | 'waiting' | 'unloaded';
type VoiceCommand = 'start' | 'approach' | 'arrive' | 'occurrence' | 'invoice' | 'map' | 'documents' | 'queue' | 'message' | 'unload';
type EventKey = 'assigned' | 'pickup' | 'approach' | 'receiverCall' | 'arrival' | 'task' | 'push' | 'panel' | 'call' | 'escalated' | 'acknowledged' | 'occurrence' | 'message' | 'unload';
type DemoEvent = { key: EventKey; minute: number };
type ChatLine = { from: 'driver' | 'cco'; text: string };
type MobileTourStep = { target: string; title: string; body: string; delay: number; click?: boolean };
type TourPlacement = 'above' | 'below' | 'left' | 'right';
type TourPosition = { top: number; left: number; placement: TourPlacement };
type TourCursorPosition = { top: number; left: number; visible: boolean; clicking: boolean };
type TourSpotlight = { top: number; left: number; width: number; height: number };

const profiles = ['Carlos Andrade', 'Marina Souza', 'João Pereira'];
const baseClockMin = 14 * 60;
/** Falas sugeridas por etapa, como o `getQuickUtterances` do app. */
const contextCommands: Record<Phase, VoiceCommand[]> = {
  idle: ['start', 'invoice', 'map'],
  driving: ['approach', 'occurrence', 'map'],
  approaching: ['arrive', 'message', 'map'],
  waiting: ['queue', 'message', 'unload', 'occurrence'],
  unloaded: ['documents', 'map'],
};
/** Ritmo da conversa simulada: ouvir, pensar e responder. */
const VOICE_TIMING = { think: 700, reply: 1500, settle: 2800 } as const;
const tabs = ['home', 'map', 'documents', 'messages'] as const;
const tabIcons = { home: 'home', map: 'map', documents: 'document', messages: 'chat' } as const;
/** O tour conduz a viagem por conversa com o AvisAI: falas simuladas, respostas no balão e na tela cheia. */
const mobileTourSteps: MobileTourStep[] = [
  { target: 'mobile-login', title: 'login', body: 'login', delay: 5500 },
  { target: 'mobile-orb', title: 'orb', body: 'orb', delay: 6500 },
  { target: 'mobile-utterance-start', title: 'sayStart', body: 'sayStart', delay: 6000 },
  { target: 'mobile-orb-bubble', title: 'reply', body: 'reply', delay: 6000, click: false },
  { target: 'mobile-approach', title: 'approach', body: 'approach', delay: 6500 },
  { target: 'mobile-orb', title: 'cabin', body: 'cabin', delay: 5000 },
  { target: 'mobile-open-cabin', title: 'openCabin', body: 'openCabin', delay: 5000 },
  { target: 'mobile-cabin-arrive', title: 'sayArrive', body: 'sayArrive', delay: 7000 },
  { target: 'mobile-cabin-close', title: 'closeCabin', body: 'closeCabin', delay: 5000 },
  { target: 'mobile-queue-tab', title: 'queue', body: 'queue', delay: 6000 },
  { target: 'mobile-push', title: 'push', body: 'push', delay: 6000, click: false },
  { target: 'mobile-advance-20', title: 'panel', body: 'panel', delay: 6000 },
  { target: 'mobile-advance-20', title: 'call', body: 'call', delay: 6000 },
  { target: 'mobile-advance-20', title: 'escalation', body: 'escalation', delay: 6500 },
  { target: 'dashboard-task-action', title: 'acknowledge', body: 'acknowledge', delay: 6500 },
  { target: 'mobile-home-tab', title: 'home', body: 'home', delay: 5500 },
  { target: 'mobile-orb', title: 'orbUnload', body: 'orbUnload', delay: 5000 },
  { target: 'mobile-utterance-unload', title: 'sayUnload', body: 'sayUnload', delay: 7000 },
];

/** Identificador curto e estável para os cartões de mensagem (como o ID da fila do app). */
function shortId(seed: string) {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `${hex.slice(0, 6)}…${hex.slice(-6).padStart(6, 'a')}`;
}

function timeLabel(minute: number, integrated = false) {
  if (integrated) return clock(minute);
  const total = baseClockMin + minute;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function durationLabel(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function eventKey(event: FeedEvent): EventKey | null {
  switch (event.type) {
    case 'RouteAssigned': return 'assigned';
    case 'PickupConfirmed': return 'pickup';
    case 'ApproachDetected': return 'approach';
    case 'ReceiverCallResult': return event.payload.moment === 'escalation' ? 'call' : 'receiverCall';
    case 'ArrivalRegistered': return 'arrival';
    case 'TaskCreated': return 'task';
    case 'TaskEscalated': {
      if (event.payload.status === 'escalated') return 'escalated';
      return event.payload.channel === 'painel' ? 'panel' : 'call';
    }
    case 'TaskAcknowledged': return 'acknowledged';
    case 'OccurrenceCreated': return 'occurrence';
    case 'DriverMessageSent': return 'message';
    case 'UnloadConfirmed': return 'unload';
    default: return null;
  }
}

/** Viagem cancelada encerra o roteiro do app como se não houvesse viagem ativa. */
function tripPhase(phase: TripPhase): Phase {
  return phase === 'cancelled' ? 'idle' : phase;
}

export function MobileWebDemoPage({ embedded = false, integrated = false, guided = true, dashboardVisible = true }: { embedded?: boolean; integrated?: boolean; guided?: boolean; dashboardVisible?: boolean }) {
  const { t, i18n } = useTranslation();
  const mobileTripId = useOps((state) => state.trips[0]?.id ?? null);
  const mobileTrip = useOps((state) => integrated && mobileTripId ? state.trips.find((trip) => trip.id === mobileTripId) : undefined);
  const receivers = useReceivers();
  const mobileReceiver = integrated && mobileTrip ? receivers.find((receiver) => receiver.id === mobileTrip.receiverId) : undefined;
  const sharedFeed = useOps((state) => state.feed);
  const simMinutes = useOps((state) => state.simMinutes);
  const simulationRunning = useOps((state) => state.running);
  const operatorResponsiveness = useOps((state) => state.operatorResponsiveness);
  const toggleSimulation = useOps((state) => state.toggle);
  const setResponsiveness = useOps((state) => state.setResponsiveness);
  const mobileTask = useOps((state) => integrated && mobileTripId ? state.tasks.find((task) => task.tripId === mobileTripId) : undefined);
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState(profiles[0]);
  const [screen, setScreen] = useState<Screen>('home');
  const [localPhase, setLocalPhase] = useState<Phase>('idle');
  const [localElapsed, setLocalElapsed] = useState(0);
  const [localEvents, setLocalEvents] = useState<DemoEvent[]>([{ key: 'assigned', minute: 0 }]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [cabinOpen, setCabinOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<OrbState>('idle');
  const [bubble, setBubble] = useState<{ text: string | null; key: number }>({ text: null, key: 0 });
  const voiceTimers = useRef<number[]>([]);
  const phoneScreenRef = useRef<HTMLDivElement | null>(null);
  const liveStatus = useLiveVoice((state) => state.status);
  const liveCaptions = useLiveVoice((state) => state.captions);
  const liveAgentSpeaking = useLiveVoice((state) => state.agentSpeaking);
  const liveDriverSpeaking = useLiveVoice((state) => state.driverSpeaking);
  const liveMuted = useLiveVoice((state) => state.muted);
  const liveActive = liveStatus === 'live' || liveStatus === 'waiting_agent' || liveStatus === 'requesting_microphone' || liveStatus === 'connecting';
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [transcript, setTranscript] = useState<ChatLine[]>([]);
  const [ccoAcknowledged, setCcoAcknowledged] = useState(false);
  const [mobileStarted, setMobileStarted] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [documentOpen, setDocumentOpen] = useState<'nfe' | 'cte' | null>(null);
  const [tourIndex, setTourIndex] = useState(0);
  const [tourPlaying, setTourPlaying] = useState(guided);
  const [tourDone, setTourDone] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);
  const [tourPaused, setTourPaused] = useState(false);
  const [tourPosition, setTourPosition] = useState<TourPosition>({ top: 16, left: 16, placement: 'above' });
  const [tourCursor, setTourCursor] = useState<TourCursorPosition>({ top: 0, left: 0, visible: false, clicking: false });
  const [tourSpotlight, setTourSpotlight] = useState<TourSpotlight | null>(null);
  const tourCardRef = useRef<HTMLElement | null>(null);
  const originalSimulationRef = useRef<{ running: boolean; responsiveness: number } | null>(null);
  const currentSimulationRef = useRef({ running: simulationRunning, responsiveness: operatorResponsiveness, toggle: toggleSimulation, setResponsiveness });
  currentSimulationRef.current = { running: simulationRunning, responsiveness: operatorResponsiveness, toggle: toggleSimulation, setResponsiveness };
  const linkedEvents = useMemo(() => integrated && mobileTripId
    ? sharedFeed.filter((event) => event.tripId === mobileTripId).reverse().flatMap((event) => {
      const key = eventKey(event);
      return key ? [{ key, minute: event.simMin }] : [];
    })
    : [], [integrated, mobileTripId, sharedFeed]);
  const events = integrated ? linkedEvents : localEvents;
  const phase = integrated && mobileTrip ? tripPhase(mobileTrip.phase) : localPhase;
  const elapsed = integrated && mobileTrip?.arrivedAtMin !== undefined ? Math.max(0, simMinutes - mobileTrip.arrivedAtMin) : localElapsed;
  const currentClock = useMemo(() => integrated ? clock(simMinutes) : timeLabel(elapsed), [elapsed, integrated, simMinutes]);
  const isEn = i18n.resolvedLanguage === 'en';
  const receiverNotified = integrated && mobileTrip
    ? sharedFeed.some((event) => event.tripId === mobileTrip.id && event.type === 'ReceiverNotified' && event.payload.delivered === true)
    : events.some((event) => event.key === 'receiverCall');
  const arrived = phase === 'waiting' || phase === 'unloaded';
  const escalated = integrated
    ? mobileTask?.status === 'escalated' || mobileTask?.escalatedAtMin !== undefined || sharedFeed.some((event) => event.tripId === mobileTripId && event.type === 'TaskEscalated' && event.payload.status === 'escalated')
    : events.some((event) => event.key === 'escalated');
  const hasCcoAcknowledged = integrated
    ? mobileTask?.status === 'acknowledged' || mobileTask?.acknowledgedAtMin !== undefined || sharedFeed.some((event) => event.tripId === mobileTripId && event.type === 'TaskAcknowledged')
    : ccoAcknowledged;
  const taskClosed = integrated && (mobileTask?.status === 'closed' || sharedFeed.some((event) => event.tripId === mobileTripId && event.type === 'UnloadConfirmed'));
  const currentDistance = integrated && mobileTrip
    ? Math.max(0, Math.round(mobileTrip.routeKm * (1 - mobileTrip.progress)))
    : phase === 'idle' ? 188 : phase === 'driving' ? 74 : phase === 'approaching' ? 8 : 0;
  const canStartTrip = phase === 'idle' || (integrated && phase === 'driving' && !mobileStarted);
  /** Etapa vista pelo app: na Demo integrada, a viagem só começa quando o motorista confirma a retirada. */
  const appPhase: Phase = canStartTrip ? 'idle' : phase;
  const driverName = integrated && mobileTrip ? mobileTrip.driver : profile;
  const destinationName = mobileReceiver?.name ?? t('mobileWeb.routeDestination');
  const mobileRouteLabel = integrated && mobileTrip ? mobileTrip.id.replace(/^trip-/, '') : '1048';
  const currentEtaMinutes = integrated ? Math.ceil(currentDistance / SIMULATION.speedKmh * 60) : phase === 'approaching' ? 18 : 92;
  const mapX = integrated && mobileTrip ? 52 + mobileTrip.progress * 284 : phase === 'idle' ? 52 : phase === 'approaching' ? 270 : arrived ? 336 : 177;
  const mapY = integrated && mobileTrip ? 216 - mobileTrip.progress * 141 + Math.sin(mobileTrip.progress * Math.PI) * 32 : phase === 'idle' ? 216 : phase === 'approaching' ? 125 : arrived ? 75 : 165;

  const addEvent = (key: EventKey, minute = elapsed) => setLocalEvents((current) => {
    if (current.some((event) => event.key === key)) return current;
    return [...current, { key, minute }];
  });

  const applyDriverAction = (action: 'start' | 'approach' | 'arrive' | 'occurrence' | 'message' | 'acknowledge' | 'unload' | 'advance', value?: string | number) => {
    if (integrated && mobileTripId) applyMobileDemoAction(mobileTripId, action, value);
  };

  const restoreTourEnvironment = useCallback(() => {
    const original = originalSimulationRef.current;
    if (!original || !integrated) return;
    const current = currentSimulationRef.current;
    current.setResponsiveness(original.responsiveness);
    if (current.running !== original.running) {
      current.toggle();
      currentSimulationRef.current.running = original.running;
    }
    originalSimulationRef.current = null;
  }, [integrated]);

  const sayOutLoud = (text: string) => {
    if (!audioEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isEn ? 'en-US' : 'pt-BR';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    if (!embedded) return;
    const syncLanguage = (event: StorageEvent) => {
      if (event.key === 'rodar.language' && (event.newValue === 'pt-BR' || event.newValue === 'en')) {
        void i18n.changeLanguage(event.newValue);
      }
    };
    window.addEventListener('storage', syncLanguage);
    return () => window.removeEventListener('storage', syncLanguage);
  }, [embedded, i18n]);

  useEffect(() => {
    if (!guided || tourDismissed || tourDone) return;
    if (tourIndex >= mobileTourSteps.length) {
      setTourPlaying(false);
      setTourDone(true);
      restoreTourEnvironment();
      return;
    }
    if (tourPlaying && !tourPaused && integrated && !originalSimulationRef.current) {
      const current = currentSimulationRef.current;
      originalSimulationRef.current = { running: current.running, responsiveness: current.responsiveness };
      if (current.running) {
        current.toggle();
        currentSimulationRef.current.running = false;
      }
      current.setResponsiveness(0);
    }

    const step = mobileTourSteps[tourIndex];
    const targetName = step.target === 'dashboard-task-action' && (!integrated || !dashboardVisible) ? 'mobile-task-ack' : step.target;
    const selector = `[data-tour-target="${targetName}"]`;
    let waitTimer: number | undefined;
    let stepTimer: number | undefined;
    let clickResetTimer: number | undefined;
    let positionFrame: number | undefined;
    let positionTourCard: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;
    const smoothScrolls: Lenis[] = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const waitStartedAt = Date.now();
    const focusAndRunStep = () => {
      const target = document.querySelector<HTMLElement>(selector);
      if (!target || !target.getClientRects().length || getComputedStyle(target).visibility === 'hidden') {
        setTourSpotlight(null);
        setTourCursor((current) => current.visible ? { ...current, visible: false } : current);
        if (tourPlaying && !tourPaused && Date.now() - waitStartedAt >= 12000) {
          setTourIndex((index) => index + 1);
          return;
        }
        waitTimer = window.setTimeout(focusAndRunStep, 200);
        return;
      }
      const scrollTargetIntoView = () => {
        let ancestor = target.parentElement;
        while (ancestor) {
          if (ancestor.matches('.mw-app-content, .da-login, .da-panel, .mon-alert-list, .mobile-demo-dashboard-pane') && ancestor.scrollHeight > ancestor.clientHeight) {
            const targetRect = target.getBoundingClientRect();
            const containerRect = ancestor.getBoundingClientRect();
            const targetTop = targetRect.top - containerRect.top + ancestor.scrollTop;
            if (targetTop < ancestor.scrollTop + 12 || targetTop + targetRect.height > ancestor.scrollTop + ancestor.clientHeight - 12) {
              const lenis = new Lenis({ wrapper: ancestor, content: ancestor, autoRaf: true, autoResize: false, naiveDimensions: true, smoothWheel: false });
              smoothScrolls.push(lenis);
              lenis.scrollTo(Math.max(0, targetTop - (ancestor.clientHeight - targetRect.height) / 2), { duration: 1, immediate: reducedMotion });
            }
          }
          ancestor = ancestor.parentElement;
        }
        const anchor = target.closest<HTMLElement>('.mobile-demo-phone-pane, .mobile-demo-dashboard-pane, .mw-phone-column') ?? target;
        const anchorRect = anchor.getBoundingClientRect();
        const topbarBottom = document.querySelector<HTMLElement>('.cco-topbar')?.getBoundingClientRect().bottom ?? 0;
        const safeTop = Math.max(12, topbarBottom + 12);
        if (anchorRect.top < safeTop || anchorRect.bottom > window.innerHeight - 12) {
          const lenis = new Lenis({ autoRaf: true, smoothWheel: false });
          smoothScrolls.push(lenis);
          lenis.scrollTo(Math.max(0, window.scrollY + anchorRect.top - safeTop), { duration: 1, immediate: reducedMotion });
        }
      };
      const updateTourCardPosition = () => {
        const card = tourCardRef.current;
        if (!card) return;
        const targetRect = target.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const margin = 12;
        const gap = 16;
        let visibleTop = Math.max(0, targetRect.top);
        let visibleLeft = Math.max(0, targetRect.left);
        let visibleRight = Math.min(window.innerWidth, targetRect.right);
        let visibleBottom = Math.min(window.innerHeight, targetRect.bottom);
        let ancestor = target.parentElement;
        while (ancestor) {
          const style = getComputedStyle(ancestor);
          const ancestorRect = ancestor.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
            visibleLeft = Math.max(visibleLeft, ancestorRect.left);
            visibleRight = Math.min(visibleRight, ancestorRect.right);
          }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
            visibleTop = Math.max(visibleTop, ancestorRect.top);
            visibleBottom = Math.min(visibleBottom, ancestorRect.bottom);
          }
          ancestor = ancestor.parentElement;
        }
        const spotlight = visibleRight > visibleLeft && visibleBottom > visibleTop ? {
          top: Math.max(0, Math.round(visibleTop - 5)),
          left: Math.max(0, Math.round(visibleLeft - 5)),
          width: Math.round(Math.min(window.innerWidth, visibleRight + 5) - Math.max(0, visibleLeft - 5)),
          height: Math.round(Math.min(window.innerHeight, visibleBottom + 5) - Math.max(0, visibleTop - 5)),
        } : null;
        setTourSpotlight((current) => current?.top === spotlight?.top && current?.left === spotlight?.left && current?.width === spotlight?.width && current?.height === spotlight?.height ? current : spotlight);
        const cursorLeft = Math.round(visibleRight - 8);
        const cursorTop = Math.round(visibleTop + (visibleBottom - visibleTop) / 2);
        const topbarBottom = document.querySelector<HTMLElement>('.cco-topbar')?.getBoundingClientRect().bottom ?? 0;
        const safeTop = Math.max(margin, topbarBottom + 8);
        const maxTop = Math.max(safeTop, window.innerHeight - cardRect.height - margin);
        const maxLeft = Math.max(margin, window.innerWidth - cardRect.width - margin);
        const centeredLeft = Math.max(margin, Math.min(maxLeft, targetRect.left + targetRect.width / 2 - cardRect.width / 2));
        const centeredTop = Math.max(safeTop, Math.min(maxTop, targetRect.top + targetRect.height / 2 - cardRect.height / 2));
        let placement: TourPlacement;
        let top: number;
        let left: number;
        if (targetRect.top - gap - cardRect.height >= safeTop) {
          placement = 'above';
          top = targetRect.top - gap - cardRect.height;
          left = centeredLeft;
        } else if (targetRect.bottom + gap + cardRect.height <= window.innerHeight - margin) {
          placement = 'below';
          top = targetRect.bottom + gap;
          left = centeredLeft;
        } else if (targetRect.left - gap - cardRect.width >= margin) {
          placement = 'left';
          top = centeredTop;
          left = targetRect.left - gap - cardRect.width;
        } else if (targetRect.right + gap + cardRect.width <= window.innerWidth - margin) {
          placement = 'right';
          top = centeredTop;
          left = targetRect.right + gap;
        } else {
          placement = targetRect.top - safeTop > window.innerHeight - margin - targetRect.bottom ? 'above' : 'below';
          top = placement === 'above' ? safeTop : maxTop;
          left = centeredLeft;
        }
        const viewSwitch = document.querySelector<HTMLElement>('.mobile-demo-view-switch')?.getBoundingClientRect();
        if (viewSwitch && left < viewSwitch.right && left + cardRect.width > viewSwitch.left && top < viewSwitch.bottom && top + cardRect.height > viewSwitch.top) {
          const aboveSwitch = viewSwitch.top - gap - cardRect.height;
          if (aboveSwitch >= margin) {
            top = aboveSwitch;
            placement = 'above';
          }
        }
        top = Math.round(top);
        left = Math.round(left);
        setTourPosition((current) => current.top === top && current.left === left && current.placement === placement ? current : { top, left, placement });
        setTourCursor((current) => current.top === cursorTop && current.left === cursorLeft && current.visible === Boolean(spotlight)
          ? current
          : { ...current, top: cursorTop, left: cursorLeft, visible: Boolean(spotlight) });
      };
      positionTourCard = updateTourCardPosition;
      window.addEventListener('scroll', updateTourCardPosition, true);
      window.addEventListener('resize', updateTourCardPosition);
      resizeObserver = new ResizeObserver(updateTourCardPosition);
      resizeObserver.observe(target);
      if (tourCardRef.current) resizeObserver.observe(tourCardRef.current);
      scrollTargetIntoView();
      positionFrame = window.requestAnimationFrame(updateTourCardPosition);
      if (tourPlaying && !tourPaused) stepTimer = window.setTimeout(() => {
        const currentTarget = document.querySelector<HTMLElement>(selector);
        if (step.click !== false && currentTarget && !('disabled' in currentTarget && currentTarget.disabled)) {
          setTourCursor((current) => ({ ...current, clicking: true }));
          currentTarget.click();
          clickResetTimer = window.setTimeout(() => {
            setTourCursor((current) => ({ ...current, clicking: false }));
            setTourIndex((index) => index + 1);
          }, 180);
          return;
        }
        setTourIndex((index) => index + 1);
      }, step.delay);
    };
    focusAndRunStep();

    return () => {
      if (waitTimer !== undefined) window.clearTimeout(waitTimer);
      if (stepTimer !== undefined) window.clearTimeout(stepTimer);
      if (clickResetTimer !== undefined) window.clearTimeout(clickResetTimer);
      if (positionFrame !== undefined) window.cancelAnimationFrame(positionFrame);
      resizeObserver?.disconnect();
      smoothScrolls.forEach((lenis) => lenis.destroy());
      setTourCursor((current) => current.clicking ? { ...current, clicking: false } : current);
      if (positionTourCard) {
        window.removeEventListener('scroll', positionTourCard, true);
        window.removeEventListener('resize', positionTourCard);
      }
    };
  }, [dashboardVisible, guided, integrated, restoreTourEnvironment, tourDone, tourDismissed, tourIndex, tourPaused, tourPlaying]);

  useEffect(() => () => restoreTourEnvironment(), [restoreTourEnvironment]);

  const startTrip = () => {
    if (!canStartTrip) return;
    setMobileStarted(true);
    applyDriverAction('start');
    setLocalPhase('driving');
    addEvent('pickup');
  };

  const approachReceiver = () => {
    if (phase === 'idle') startTrip();
    if (phase === 'waiting' || phase === 'unloaded' || receiverNotified) return;
    setMobileStarted(true);
    applyDriverAction('approach');
    setLocalPhase('approaching');
    addEvent('approach');
    addEvent('receiverCall');
  };

  const registerArrival = () => {
    if (phase === 'idle') startTrip();
    if (!receiverNotified) approachReceiver();
    if (arrived) return;
    applyDriverAction('arrive');
    setLocalPhase('waiting');
    setLocalElapsed(0);
    addEvent('arrival', 0);
    addEvent('task', 0);
    addEvent('push', 0);
  };

  const confirmUnload = () => {
    if (!arrived) registerArrival();
    if (phase === 'unloaded') return;
    applyDriverAction('unload');
    setLocalPhase('unloaded');
    addEvent('unload');
  };

  const advanceTime = (minutes: number) => {
    if (phase !== 'waiting') return;
    if (integrated) {
      const current = currentSimulationRef.current;
      const resumeForStep = Boolean(originalSimulationRef.current) && !current.running;
      if (resumeForStep) {
        current.toggle();
        currentSimulationRef.current.running = true;
      }
      try {
        applyDriverAction('advance', minutes);
      } finally {
        if (resumeForStep) {
          current.toggle();
          currentSimulationRef.current.running = false;
        }
      }
      return;
    }
    const next = elapsed + minutes;
    setLocalElapsed(next);
    if (elapsed < 20 && next >= 20) addEvent('panel', 20);
    if (elapsed < 40 && next >= 40) addEvent('call', 40);
    if (elapsed < 60 && next >= 60) addEvent('escalated', 60);
  };

  // ---------------------------------------------------------------- conversa com o AvisAI
  const later = (callback: () => void, ms: number) => { voiceTimers.current.push(window.setTimeout(callback, ms)); };
  const clearVoiceTimers = () => { voiceTimers.current.forEach((timer) => window.clearTimeout(timer)); voiceTimers.current = []; };
  useEffect(() => () => { voiceTimers.current.forEach((timer) => window.clearTimeout(timer)); }, []);

  /** O agente fala: entra na conversa, aparece no balão da bola e, com o áudio ligado, é falado. */
  const agentSays = (text: string) => {
    setTranscript((current) => [...current.slice(-8), { from: 'cco', text }]);
    setBubble((current) => ({ text, key: current.key + 1 }));
    setVoiceState('speaking');
    sayOutLoud(text);
    later(() => setVoiceState('idle'), VOICE_TIMING.settle);
  };

  const applyCommand = (command: VoiceCommand, phrase: string) => {
    switch (command) {
      case 'start': startTrip(); break;
      case 'approach': approachReceiver(); break;
      case 'arrive': registerArrival(); break;
      case 'occurrence': applyDriverAction('occurrence'); addEvent('occurrence'); break;
      case 'invoice': setScreen('documents'); setDocumentOpen('nfe'); break;
      case 'map': setScreen('map'); break;
      case 'documents': setScreen('documents'); break;
      case 'queue': setScreen('queue'); break;
      case 'message':
        setScreen('messages');
        setChat((current) => [...current, { from: 'driver', text: phrase }]);
        applyDriverAction('message', phrase);
        addEvent('message');
        break;
      case 'unload': confirmUnload(); setScreen('home'); break;
    }
  };

  /** Fala simulada do motorista: ouvindo → pensando → o agente responde e executa a ação. */
  const runVoiceCommand = (command: VoiceCommand) => {
    const phrase = t(`driverApp.utterances.${command}.say`);
    const reply = t(`driverApp.utterances.${command}.reply`);
    clearVoiceTimers();
    setPanelOpen(false);
    setTranscript((current) => [...current.slice(-8), { from: 'driver', text: phrase }]);
    setVoiceState('listening');
    later(() => setVoiceState('thinking'), VOICE_TIMING.think);
    later(() => { applyCommand(command, phrase); agentSays(reply); }, VOICE_TIMING.reply);
  };

  const [chat, setChat] = useState<ChatLine[]>([]);

  // Falas proativas do agente: saudação no login, escalonamento e retorno do CCO.
  // A ref guarda a versão atual de `agentSays` para os efeitos reagirem só às mudanças de estado.
  const spoken = useRef({ greeting: false, escalated: false, acknowledged: false });
  const agentSaysRef = useRef(agentSays);
  agentSaysRef.current = agentSays;
  useEffect(() => {
    if (!authenticated || appPhase !== 'idle' || spoken.current.greeting) return;
    spoken.current.greeting = true;
    voiceTimers.current.push(window.setTimeout(() => agentSaysRef.current(t('driverApp.agent.greeting')), 900));
  }, [authenticated, appPhase, t]);
  useEffect(() => {
    if (authenticated && escalated && !hasCcoAcknowledged && !spoken.current.escalated) { spoken.current.escalated = true; agentSaysRef.current(t('driverApp.agent.escalated')); }
  }, [authenticated, escalated, hasCcoAcknowledged, t]);
  useEffect(() => {
    if (authenticated && hasCcoAcknowledged && !taskClosed && !spoken.current.acknowledged) { spoken.current.acknowledged = true; agentSaysRef.current(t('driverApp.agent.acknowledged')); }
  }, [authenticated, hasCcoAcknowledged, taskClosed, t]);

  /** Botões de simulação também passam pelo agente, como no app (o AvisAI confirma o que aconteceu). */
  const simulate = (command: 'start' | 'approach' | 'arrive' | 'unload') => {
    clearVoiceTimers();
    applyCommand(command, t(`driverApp.utterances.${command}.say`));
    agentSays(t(`driverApp.utterances.${command}.reply`));
  };

  const utterances: Utterance[] = Array.from(new Set([...contextCommands[appPhase], ...(screen === 'documents' ? ['invoice' as const] : [])]))
    .map((command) => ({ id: command, text: t(`driverApp.utterances.${command}.say`) }));
  const orbState: OrbState = liveActive ? liveAgentSpeaking ? 'speaking' : liveDriverSpeaking ? 'listening' : 'idle' : voiceState;
  const orbStateLabel = t(`driverApp.voice.state.${orbState}`);
  const lastLive = (who: 'agent' | 'driver') => [...liveCaptions].reverse().find((caption) => caption.who === who)?.text ?? null;
  const lastLine = (from: ChatLine['from']) => [...transcript].reverse().find((line) => line.from === from)?.text ?? null;
  const liveAgentLine = lastLive('agent');
  const agentCaption = liveActive ? liveAgentLine : lastLine('cco');
  const driverCaption = liveActive ? lastLive('driver') : lastLine('driver');
  const moving = appPhase === 'driving' || appPhase === 'approaching';
  const contextPill = moving ? t('driverApp.voice.cabin.tripMode', { speed: SIMULATION.speedKmh }) : '';
  useEffect(() => { if (liveAgentLine) setBubble((current) => ({ text: liveAgentLine, key: current.key + 1 })); }, [liveAgentLine]);

  const openLive = () => {
    setPanelOpen(false);
    setCabinOpen(true);
    if (!liveActive) void connectLiveVoice();
  };

  const currentTourStep = mobileTourSteps[Math.min(tourIndex, mobileTourSteps.length - 1)];
  const tourVisible = guided && !tourDismissed;

  const submitMessage = () => {
    const clean = messageDraft.trim();
    if (!clean || moving) return;
    setChat((current) => [...current, { from: 'driver', text: clean }]);
    setMessageDraft('');
    applyDriverAction('message', clean);
    addEvent('message');
  };

  const resetDemo = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    clearVoiceTimers();
    spoken.current = { greeting: false, escalated: false, acknowledged: false };
    setAuthenticated(false);
    setScreen('home');
    setLocalPhase('idle');
    setLocalElapsed(0);
    setLocalEvents([{ key: 'assigned', minute: 0 }]);
    setPanelOpen(false);
    setCabinOpen(false);
    setVoiceState('idle');
    setBubble({ text: null, key: 0 });
    setTranscript([]);
    setCcoAcknowledged(false);
    setMobileStarted(false);
    setChat([]);
    setDocumentOpen(null);
  };

  const sendToSignIn = () => {
    setAuthenticated(false);
    setScreen('home');
    setPanelOpen(false);
    setCabinOpen(false);
  };

  const login = () => {
    setAuthenticated(true);
    setScreen('home');
  };

  const goTo = (page: Screen) => {
    setScreen(page);
    setPanelOpen(false);
  };

  // ---------------------------------------------------------------- telas (espelham o rodar-mobile)
  const plate = integrated && mobileTrip ? mobileTrip.plate : 'RST-4B21';
  const originName = t('mobileWeb.routeOrigin');
  const firstName = driverName.split(' ')[0];
  const progress = appPhase === 'idle' ? 0 : integrated && mobileTrip ? mobileTrip.progress : phase === 'idle' ? 0 : phase === 'driving' ? 0.45 : phase === 'approaching' ? 0.86 : 1;
  const receiverChip = receiverNotified ? t('driverApp.home.receiverNotified') : t('driverApp.home.receiverPending');
  const tonnes = integrated && mobileTrip ? mobileTrip.capacityTons : 28;
  const stay = arrived ? stayValue(elapsed, tonnes) : 0;
  const locale = isEn ? 'en' : 'pt-BR';
  const overFranchise = elapsed > 300;
  const phaseIndex = ['idle', 'driving', 'approaching', 'waiting', 'unloaded'].indexOf(appPhase);
  const messageItems = [
    ...events.filter((event) => ['pickup', 'receiverCall', 'arrival', 'task', 'acknowledged', 'occurrence', 'unload'].includes(event.key))
      .map((event) => ({ id: `${event.key}-${event.minute}`, time: timeLabel(event.minute, integrated), title: t(`driverApp.messages.items.${event.key === 'receiverCall' ? 'approach' : event.key}`) })),
    ...chat.filter((line) => line.from === 'driver').map((line, index) => ({ id: `chat-${index}-${line.text}`, time: currentClock, title: line.text })),
  ].reverse();

  const renderHome = () => <>
    <header className="da-home-head">
      <RodarMark />
      <div><span>{t('driverApp.home.greeting')}</span><strong>{firstName}</strong></div>
      <span className="da-ready-pill" data-state={orbState}><i />{t('driverApp.home.ready', { state: orbStateLabel })}</span>
      <button type="button" className="da-round" onClick={sendToSignIn} aria-label={t('mobileWeb.reset')}><AppIcon name="sliders" size={18} /></button>
    </header>
    <section className="da-trip-card">
      <div className="da-trip-top"><span>{t(appPhase === 'idle' ? 'driverApp.home.nextTrip' : 'driverApp.home.trip', { id: mobileRouteLabel })}</span><b>{plate}</b></div>
      <div className="da-stop"><i data-kind="origin" data-done={appPhase !== 'idle' || undefined} /><div><small>{t('driverApp.home.origin')}</small><strong>{originName}</strong></div></div>
      <div className="da-stop-line" />
      <div className="da-stop"><i data-kind="destination" /><div><small>{t('driverApp.home.window')}</small><strong>{destinationName}</strong></div></div>
      {appPhase === 'idle' ? <>
        <button type="button" className="da-primary" data-tour-target="mobile-start" onClick={() => simulate('start')}><AppIcon name="play" size={18} />{t('driverApp.home.start')}</button>
        <p className="da-say-hint">{t('driverApp.home.sayHint')}</p>
      </> : <>
        <div className="da-chips">
          <span className="da-chip-status" data-tone="ok">{t(`mobileWeb.phases.${appPhase}`)}</span>
          <span className="da-chip-status" data-tone={receiverNotified ? 'ok' : 'wait'}>{receiverChip}</span>
          {!arrived && <span className="da-chip-status">{t('driverApp.home.eta', { min: currentEtaMinutes })}</span>}
        </div>
        <ol className="da-progress" aria-label={t('mobileWeb.routeProgress')}>
          {(['pickup', 'route', 'km', 'arrival', 'unload'] as const).map((step, index) => (
            <li key={step} data-state={index < phaseIndex ? 'done' : index === phaseIndex ? 'current' : 'next'}><i /><span>{t(`driverApp.home.steps.${step}`, { km: currentDistance })}</span></li>
          ))}
        </ol>
        {phase !== 'unloaded' ? <div className="da-simulate">
          <span>{t('driverApp.home.simulate')}</span>
          {appPhase === 'driving' && <button type="button" data-tour-target="mobile-approach" onClick={() => simulate('approach')}>{t('driverApp.home.approach')}</button>}
          {appPhase === 'approaching' && <button type="button" data-tour-target="mobile-arrival" onClick={() => simulate('arrive')}>{t('driverApp.home.arrive')}</button>}
          {phase === 'waiting' && <button type="button" data-tour-target="mobile-unload" onClick={() => simulate('unload')}>{t('driverApp.home.unload')}</button>}
        </div> : <p className="da-done"><AppIcon name="check" size={16} />{t('driverApp.home.unloaded')}</p>}
      </>}
    </section>
    <div className="da-tiles">
      <button type="button" onClick={() => goTo('messages')}><span className="da-tile-icon" data-tone="info"><AppIcon name="chat" /></span><strong>{t('driverApp.home.tiles.cco.title')}</strong><small>{t('driverApp.home.tiles.cco.hint')}</small></button>
      <button type="button" data-tour-target="mobile-queue-tab" onClick={() => goTo('queue')}><span className="da-tile-icon" data-tone="wait"><AppIcon name="list" /></span><strong>{t('driverApp.home.tiles.queue.title')}</strong><small>{t('driverApp.home.tiles.queue.hint')}</small></button>
      <button type="button" onClick={() => goTo('map')}><span className="da-tile-icon"><AppIcon name="map" /></span><strong>{t('driverApp.home.tiles.map.title')}</strong><small>{t('driverApp.home.tiles.map.hint')}</small></button>
    </div>
    <section className="da-card da-journey">
      <h3>{t('driverApp.home.journey')} <span>{events.length}</span></h3>
      {events.length === 0 ? <p>{t('driverApp.home.journeyEmpty')}</p> : [...events].reverse().slice(0, 5).map((event, index) => (
        <div className="da-journey-row" key={`${event.key}-${event.minute}-${index}`}><i data-latest={index === 0 || undefined} /><time>{timeLabel(event.minute, integrated)}</time><span>{t(`mobileWeb.events.${event.key}`)}</span></div>
      ))}
    </section>
  </>;

  const renderMap = () => {
    const x1 = 40; const y1 = 34; const x2 = 296; const y2 = 252;
    const tx = x1 + (x2 - x1) * progress; const ty = y1 + (y2 - y1) * progress;
    return <div className="da-map-screen">
      <header className="da-map-head"><div><small>{t('driverApp.map.goingTo')}</small><strong>{destinationName}</strong></div><button type="button" className="da-demo-chip" onClick={() => goTo('home')}><AppIcon name="sliders" size={14} />{t('driverApp.map.demo')}</button></header>
      <section className="da-map-card">
        <div className="da-map-chips"><span><i />{t(appPhase === 'idle' ? 'driverApp.map.idle' : arrived ? 'driverApp.map.arrived' : 'driverApp.map.inTrip')}</span>{!arrived && <span><b>{t('driverApp.map.remaining', { km: currentDistance })}</b> · {t('driverApp.map.eta', { min: currentEtaMinutes })}</span>}</div>
        <svg viewBox="0 0 336 286" role="img" aria-label={t('driverApp.map.label', { origin: originName, destination: destinationName })}>
          <defs><pattern id="da-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" className="da-map-grid" /></pattern></defs>
          <rect width="336" height="286" fill="url(#da-grid)" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} className="da-map-route-shadow" />
          <line x1={x1} y1={y1} x2={tx} y2={ty} className="da-map-route-done" />
          <line x1={tx} y1={ty} x2={x2} y2={y2} className="da-map-route" />
          <circle cx={x1} cy={y1} r="9" className="da-map-origin" />
          <circle cx={x2} cy={y2} r="13" className="da-map-dest-halo" /><circle cx={x2} cy={y2} r="6" className="da-map-dest" />
          <circle cx={tx} cy={ty} r="15" className="da-map-truck-halo" /><circle cx={tx} cy={ty} r="8" className="da-map-truck" />
        </svg>
        <div className="da-map-legend"><span><i data-kind="origin" />{originName}</span><em>{t('driverApp.map.simulated')}</em><span>{destinationName}<i data-kind="destination" /></span></div>
      </section>
      <section className="da-map-sheet">
        <span className="da-sheet-grip" aria-hidden="true" />
        <div className="da-map-eta"><div><strong>{arrived ? currentClock : clock((integrated ? simMinutes : baseClockMin) + currentEtaMinutes)}</strong><span>{t('driverApp.map.summary', { km: currentDistance, min: currentEtaMinutes, speed: moving ? SIMULATION.speedKmh : 0 })}</span></div>
          <button type="button" className="da-navigate" title={t('driverApp.map.navigateNote')}><AppIcon name="navigate" size={16} />{t('driverApp.map.navigate')}</button></div>
        <div className="da-sheet-stop"><span className="da-stop-badge" data-done="true"><AppIcon name="check" size={16} /></span><div><strong>{originName}</strong><small>{t('driverApp.map.originRole')}</small></div></div>
        <div className="da-sheet-stop"><span className="da-stop-badge" data-done={arrived || undefined}>{arrived ? <AppIcon name="check" size={16} /> : 2}</span><div><strong>{destinationName}</strong><small data-tone={receiverNotified ? 'ok' : 'wait'}>{receiverChip}</small></div></div>
      </section>
    </div>;
  };

  const renderDocuments = () => <>
    <header className="da-screen-head"><small>{t('driverApp.documents.overline', { id: mobileRouteLabel, plate })}</small><div><h2>{t('driverApp.documents.title')}</h2><span>{t('driverApp.documents.count', { count: 2 })}</span></div></header>
    <button type="button" className="da-ask" onClick={() => setPanelOpen(true)}><span><AppIcon name="mic" size={22} /></span><div><strong>{t('driverApp.documents.ask')}</strong><small>{t('driverApp.documents.askHint')}</small></div></button>
    <p className="da-section-label">{t('driverApp.documents.cargo')}</p>
    <article className="da-doc" data-open={documentOpen === 'nfe' || undefined}>
      <button type="button" aria-expanded={documentOpen === 'nfe'} onClick={() => setDocumentOpen((value) => value === 'nfe' ? null : 'nfe')}><span className="da-doc-icon">NF-e</span><div><strong>{t('mobileWeb.documents.nfe')}</strong><small>{t('driverApp.documents.nfeSummary')}</small></div><em>{t('driverApp.documents.verified')}</em></button>
      {documentOpen === 'nfe' && <dl><div><dt>{t('mobileWeb.documents.invoiceNumber')}</dt><dd>000.482.913</dd></div><div><dt>{t('mobileWeb.documents.weight')}</dt><dd>28.000 kg · 28 t</dd></div><div><dt>{t('mobileWeb.documents.cargo')}</dt><dd>{t('mobileWeb.documents.cargoValue')}</dd></div><div><dt>{t('mobileWeb.documents.amount')}</dt><dd>{t('mobileWeb.documents.amountValue')}</dd></div></dl>}
    </article>
    <p className="da-section-label">{t('driverApp.documents.transport')}</p>
    <article className="da-doc" data-open={documentOpen === 'cte' || undefined}>
      <button type="button" aria-expanded={documentOpen === 'cte'} onClick={() => setDocumentOpen((value) => value === 'cte' ? null : 'cte')}><span className="da-doc-icon">CT-e</span><div><strong>{t('mobileWeb.documents.cte')}</strong><small>{t('driverApp.documents.cteSummary')}</small></div><em>{t('driverApp.documents.verified')}</em></button>
      {documentOpen === 'cte' && <dl><div><dt>{t('mobileWeb.documents.freight')}</dt><dd>{t('mobileWeb.documents.freightValue')}</dd></div><div><dt>{t('mobileWeb.plate')}</dt><dd>{plate}</dd></div><div><dt>{t('mobileWeb.documents.invoiceNumber')}</dt><dd>000.771.204</dd></div></dl>}
    </article>
    <p className="da-mock-note">{t('mobileWeb.documents.fiscalMock')}</p>
  </>;

  const renderMessages = () => <>
    <header className="da-screen-head"><small>{t('driverApp.messages.overline')}</small><h2>{t('driverApp.messages.title')}</h2>
      <div className="da-chips"><span className="da-chip-status" data-tone="wait">{t('driverApp.messages.queued', { count: 0 })}</span><span className="da-chip-status" data-tone="ok">{t('driverApp.messages.delivered', { count: messageItems.length })}</span></div></header>
    {messageItems.length === 0 ? <p className="da-empty">{t('driverApp.messages.empty')}</p> : messageItems.map((item) => (
      <article className="da-message" key={item.id}>
        <div><span>{t('driverApp.messages.attempts', { time: item.time })}</span><em>{t('driverApp.messages.sent')}</em></div>
        <strong>{item.title}</strong>
        <span className="da-message-bars" aria-hidden="true"><i /><i /><i /></span>
        <code>ID: {shortId(item.id)}</code>
      </article>
    ))}
    <form className="da-composer" onSubmit={(event) => { event.preventDefault(); submitMessage(); }}>
      <button type="button" className="da-composer-mic" onClick={() => setPanelOpen(true)} aria-label={t('driverApp.messages.mic')}><AppIcon name="mic" size={20} /></button>
      <input value={messageDraft} disabled={moving} onChange={(event) => setMessageDraft(event.target.value)} aria-label={t('driverApp.messages.placeholder')}
        placeholder={t(moving ? 'driverApp.messages.moving' : 'driverApp.messages.placeholder')} />
      <button type="submit" disabled={moving || !messageDraft.trim()} aria-label={t('driverApp.messages.send')}><AppIcon name="navigate" size={16} /></button>
    </form>
  </>;

  const renderQueue = () => {
    const remain = Math.max(0, 300 - elapsed);
    const steps = [['push', arrived], ['panel', events.some((event) => event.key === 'panel')], ['call', events.some((event) => event.key === 'call' || event.key === 'escalated')]] as const;
    return <>
      <header className="da-stack-head"><button type="button" className="da-round" onClick={() => goTo('home')} aria-label={t('driverApp.queue.back')}><AppIcon name="back" size={20} /></button><div><small>{destinationName}</small><h2>{t('driverApp.queue.title')}</h2></div></header>
      <section className="da-dock-card">
        <span className="da-dock-ring" data-ok={receiverNotified || undefined}>{receiverNotified ? <AppIcon name="check" size={30} /> : <AppIcon name="clock" size={30} />}</span>
        <div><small>{t('driverApp.queue.dockLabel')}</small><strong>{t('driverApp.queue.dock')}</strong><span>{t('driverApp.queue.receiver', { name: destinationName })}</span></div>
      </section>
      <section className="da-stopped" data-over={overFranchise || undefined}>
        <header><span><AppIcon name="clock" size={15} />{t('driverApp.queue.stopped')}</span>{arrived && <em>{t(overFranchise ? 'driverApp.queue.overFranchise' : 'driverApp.queue.withinFranchise')}</em>}</header>
        {arrived ? <>
          <strong>{durationLabel(elapsed).replace(':', 'h')}</strong>
          <div className="da-stopped-row"><span>{t('driverApp.queue.franchise')}</span><span>{t('driverApp.queue.remaining', { time: durationLabel(remain).replace(':', 'h') })}</span></div>
          <span className="da-bar"><i style={{ width: `${Math.min(100, (elapsed / 300) * 100)}%` }} /></span>
          {stay > 0 && <p className="da-stay">{t('driverApp.queue.stay', { value: brl(stay, locale) })}</p>}
        </> : <p className="da-empty">{t('driverApp.queue.notArrived')}</p>}
        <div className="da-escalation">
          <span>{t(hasCcoAcknowledged ? 'driverApp.queue.ccoTook' : 'driverApp.queue.ccoEscalation')}</span>
          <ol>{steps.map(([key, done], index) => <li key={key} data-done={done || undefined} data-tour-target={key === 'push' ? 'mobile-push' : undefined}><i /><small>{index + 1} {t(`driverApp.queue.steps.${key}`)}</small></li>)}</ol>
        </div>
      </section>
      {arrived && phase === 'waiting' && <div className="da-simulate"><span>{t('driverApp.queue.simulate')}</span>
        <button type="button" data-tour-target="mobile-advance-20" onClick={() => advanceTime(20)} disabled={integrated && !simulationRunning && !originalSimulationRef.current}>{t('driverApp.queue.advance20')}</button>
        <button type="button" onClick={() => advanceTime(60)} disabled={integrated && !simulationRunning && !originalSimulationRef.current}>{t('driverApp.queue.advance60')}</button>
        {escalated && !hasCcoAcknowledged && !taskClosed && <button type="button" data-tour-target="mobile-task-ack" onClick={() => { applyDriverAction('acknowledge'); setCcoAcknowledged(true); addEvent('acknowledged'); }}>{t('driverApp.queue.ack')}</button>}
      </div>}
      <p className="da-mock-note">{t('driverApp.queue.position')}</p>
      <div className="da-queue-actions">
        <button type="button" className="da-primary" onClick={() => setCabinOpen(true)}>{t('driverApp.queue.talk')}</button>
        <button type="button" className="da-secondary" disabled={!arrived || phase === 'unloaded'} onClick={() => simulate('unload')}>{t('driverApp.queue.unload')}</button>
      </div>
    </>;
  };

  const renderScreen = () => screen === 'map' ? renderMap() : screen === 'documents' ? renderDocuments() : screen === 'messages' ? renderMessages() : screen === 'queue' ? renderQueue() : renderHome();

  const renderLogin = () => <div className="da-login">
    <header className="da-login-brand"><RodarMark /><div><strong>RODAR</strong><small>{t('driverApp.login.brandTag')}</small></div>
      <div className="da-lang" role="group" aria-label={t('app.language')}>{(['pt-BR', 'en'] as const).map((lang) => <button key={lang} type="button" aria-pressed={(isEn ? 'en' : 'pt-BR') === lang} onClick={() => void i18n.changeLanguage(lang)}>{lang === 'en' ? 'EN' : 'PT'}</button>)}</div></header>
    <h2>{t('driverApp.login.title')}</h2>
    <p>{t('driverApp.login.subtitle')}</p>
    <section className="da-profiles">
      <small>{t('driverApp.login.choose', { count: integrated ? 1 : profiles.length })}</small>
      {(integrated ? [driverName] : profiles).map((name, index) => (
        <button type="button" key={name} aria-pressed={driverName === name} onClick={() => setProfile(name)}>
          <span className="da-avatar">{name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
          <span><strong>{name}</strong><small>{index === 0 ? `${plate} · ${originName} → ${destinationName}` : `DMO-${index + 1}A0${index + 1} · ${originName}`}</small></span>
          <em>{driverName === name ? t('driverApp.login.selected') : t('driverApp.login.route', { n: index + 1 })}</em>
        </button>
      ))}
      <button type="button" className="da-primary" data-tour-target="mobile-login" onClick={login}>→ {t('driverApp.login.enterAs', { name: firstName })}</button>
      <p className="da-sso"><i />{t('driverApp.login.sso')}</p>
    </section>
    <p className="da-powered">{t('driverApp.login.powered')}</p>
  </div>;

  const skipTour = () => {
    setTourPlaying(false);
    setTourDismissed(true);
    restoreTourEnvironment();
  };

  const restartTour = () => {
    if (integrated && mobileTripId) applyMobileDemoAction(mobileTripId, 'reset');
    resetDemo();
    setTourIndex(0);
    setTourDone(false);
    setTourDismissed(false);
    setTourPaused(false);
    setTourPlaying(true);
  };

  return <div className={`mobile-web-page${embedded ? ' mw-embedded' : ''}`}>
    {!embedded && <header className="mw-topbar"><Link to="/home" aria-label={t('app.name')}><RodarLogo size={34} /></Link><div className="mw-topbar-actions"><Link to="/home" className="mw-top-link">{t('mobileWeb.back')}</Link><Link to="/login" className="mw-top-cco"><Icon name="dashboard" />{t('mobileWeb.dashboard')}</Link><select value={isEn ? 'en' : 'pt-BR'} onChange={(event) => void i18n.changeLanguage(event.target.value)} aria-label={t('app.language')}><option value="pt-BR">PT</option><option value="en">EN</option></select></div></header>}
    <main className={`mw-main${embedded ? ' mw-main-embedded' : ''}`}>
      {embedded ? <h1 className="sr-only">{t('mobileWeb.title')}</h1> : <section className="mw-intro"><p className="mw-eyebrow"><span />{t('mobileWeb.eyebrow')}</p><h1>{t('mobileWeb.title')}</h1><p className="mw-intro-copy">{t('mobileWeb.intro')}</p><span className="mw-demo-badge">◉ {t('mobileWeb.mockNote')}</span></section>}
      {tourVisible && createPortal(<>
      {!tourDone && tourSpotlight && <div className="mw-tour-spotlight" style={tourSpotlight} aria-hidden="true" />}
      <section ref={tourCardRef} className="mw-tour-card" data-placement={tourPosition.placement} style={{ top: tourPosition.top, left: tourPosition.left }} aria-live="polite" aria-atomic="true">
        <div className="mw-tour-copy">
          <div className="mw-tour-meta"><span>{t('mobileDemo.tour.label')}</span>{tourDone ? <span>{t('mobileDemo.tour.complete')}</span> : <span>{t('mobileDemo.tour.step', { current: tourIndex + 1, total: mobileTourSteps.length })}</span>}</div>
          <div className="mw-tour-progress" aria-hidden="true"><span style={{ width: `${tourDone ? 100 : (tourIndex / mobileTourSteps.length) * 100}%` }} /></div>
          <h2>{tourDone || !currentTourStep ? t('mobileDemo.tour.doneTitle') : t(`mobileDemo.tour.steps.${currentTourStep.title === 'acknowledge' && (!integrated || !dashboardVisible) ? 'acknowledgeLocal' : currentTourStep.title}.title`)}</h2>
          <p>{tourDone || !currentTourStep ? t('mobileDemo.tour.doneBody') : t(`mobileDemo.tour.steps.${currentTourStep.title === 'acknowledge' && (!integrated || !dashboardVisible) ? 'acknowledgeLocal' : currentTourStep.body}.body`)}</p>
        </div>
        <div className="mw-tour-actions">
          {!tourDone ? <>
            <button type="button" className="mw-tour-pause" onClick={() => setTourPaused((paused) => !paused)}>{t(tourPaused ? 'mobileDemo.tour.resume' : 'mobileDemo.tour.pause')}</button>
            <button type="button" className="mw-tour-skip" onClick={skipTour}>{t('mobileDemo.tour.skip')}</button>
          </> : <>
            <button type="button" className="mw-tour-pause" onClick={restartTour}>{t('mobileDemo.tour.replay')}</button>
            <button type="button" className="mw-tour-skip" onClick={skipTour}>{t('mobileDemo.tour.close')}</button>
          </>}
        </div>
      </section>
      {!tourDone && tourCursor.visible && <svg className={`mw-tour-cursor${tourCursor.clicking ? ' is-clicking' : ''}`} style={{ top: tourCursor.top, left: tourCursor.left }} viewBox="0 0 28 34" aria-hidden="true">
        <path d="M3 2v21l5.5-5.3 4.1 10 4.2-1.8-4.2-9.9H23L3 2Z" fill="#a2f200" stroke="#071007" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="m5.4 6.2 12.2 8.5h-6.1l4.1 9.7-1.5.7-4-9.8-4.7 4.4V6.2Z" fill="#efffc9" opacity=".8" />
      </svg>}
      </>, document.body)}
      {guided && tourDismissed && <button type="button" className="mw-tour-replay" onClick={restartTour}>{t('mobileDemo.tour.replay')}</button>}
      <div className={`mw-demo-grid${embedded ? ' mw-demo-grid-embedded' : ''}`}>
        {!embedded && <aside className="mw-guide-panel"><p className="mw-guide-label">{t('mobileWeb.systemTitle')}</p><ul>{(t('mobileWeb.systemItems', { returnObjects: true }) as string[]).map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ul><p className="mw-guide-foot">{t('mobileWeb.systemFoot')}</p><Link to="/login" className="mw-guide-link">{t('mobileWeb.ccoLink')} ↗</Link></aside>}
        <section className="mw-phone-column" aria-label={t('mobileWeb.phoneLabel')}>
          <div className="mw-phone-frame"><div className="mw-phone-camera" /><div className="mw-phone-screen da-app" ref={phoneScreenRef}>
          <div className="mw-phone-status"><span>{integrated ? currentClock : '9:41'}</span><span>●●●　◖　▰</span></div>
            {!authenticated ? renderLogin() : <>
              <div className={`mw-app-content da-content${screen === 'map' ? ' da-content-map' : ''}`} key={screen}>{renderScreen()}</div>
              <nav className="da-tabs" aria-label={t('mobileWeb.phoneLabel')}>{tabs.map((tab) => (
                <button type="button" key={tab} data-tour-target={tab === 'home' ? 'mobile-home-tab' : undefined} aria-current={screen === tab || (tab === 'home' && screen === 'queue') ? 'page' : undefined} onClick={() => goTo(tab)}>
                  <span><AppIcon name={tabIcons[tab]} size={21} /></span><small>{t(`driverApp.tabs.${tab}`)}</small>
                </button>
              ))}</nav>
              <AvisaiDock containerRef={phoneScreenRef} state={orbState} stateLabel={orbStateLabel} bubble={bubble}
                hidden={cabinOpen} panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} onClosePanel={() => setPanelOpen(false)}
                utterances={utterances} onUtter={(id) => runVoiceCommand(id as VoiceCommand)} onOpenCabin={() => { setPanelOpen(false); setCabinOpen(true); }}
                micLabel={t(liveActive ? 'driverApp.voice.micLive' : 'driverApp.voice.micSimulated')} liveActive={liveActive} onLive={openLive}
                audioEnabled={audioEnabled} onToggleAudio={() => setAudioEnabled((value) => !value)} />
              {cabinOpen && <CabinConversation state={orbState} stateLabel={orbStateLabel} contextPill={contextPill}
                live={{ active: liveActive, waiting: liveStatus !== 'live', microphoneReady: liveStatus === 'live' || liveStatus === 'waiting_agent', muted: liveMuted, onToggleMute: () => void toggleLiveMute(), onEnd: () => void disconnectLiveVoice() }}
                agentCaption={agentCaption} driverCaption={driverCaption} suggestions={utterances} onUtter={(id) => runVoiceCommand(id as VoiceCommand)}
                onClose={() => setCabinOpen(false)} onTalk={() => { if (!liveActive && utterances[0]) runVoiceCommand(utterances[0].id as VoiceCommand); }} />}
            </>}
          </div></div>
          {!embedded && <p className="mw-phone-caption">{t('mobileWeb.phoneLabel')}</p>}
        </section>
        {!embedded && <aside className="mw-control-panel"><div className="mw-control-heading"><span className="mw-demo-tag">DEMO</span><h2>{t('mobileWeb.controlsTitle')}</h2><p>{t('mobileWeb.controlsHint')}</p></div><div className="mw-control-status"><span>{t(`mobileWeb.phases.${phase}`)}</span><time>{currentClock}</time></div><div className="mw-control-actions">{!authenticated ? <button type="button" className="mw-control-primary" onClick={login}><span>01</span>{t('mobileWeb.enter')}<b>→</b></button> : <><button type="button" onClick={() => simulate('start')} disabled={!canStartTrip}><span>01</span>{t('mobileWeb.startTrip')}<b>→</b></button><button type="button" onClick={() => simulate('approach')} disabled={phase === 'idle' || phase === 'waiting' || phase === 'unloaded' || receiverNotified}><span>02</span>{t('mobileWeb.approach')}<b>→</b></button><button type="button" onClick={() => simulate('arrive')} disabled={phase === 'waiting' || phase === 'unloaded'}><span>03</span>{t('mobileWeb.arrival')}<b>→</b></button><button type="button" onClick={() => setCabinOpen(true)}><span>04</span>{t('mobileWeb.voiceOpen')}<b>✦</b></button><button type="button" onClick={() => simulate('unload')} disabled={!arrived || phase === 'unloaded'}><span>05</span>{t('mobileWeb.unload')}<b>✓</b></button></>}</div>{authenticated && <div className="mw-control-time"><span>{t('mobileWeb.queue.advanceHour')}</span><button type="button" onClick={() => advanceTime(60)} disabled={phase !== 'waiting'}>+60</button></div>}<button type="button" className="mw-reset-button" onClick={resetDemo}>↺ {t('mobileWeb.reset')}</button></aside>}
      </div>
      {!embedded && <p className="mw-page-footer">{t('mobileWeb.footer')}</p>}
    </main>
  </div>;
}
