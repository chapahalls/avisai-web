import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { RodarLogo, RodarMark } from '../components/RodarLogo';
import { applyMobileDemoAction, useOps, useReceivers } from '../services/operations';
import type { FeedEvent } from '../services/mock/engine';
import { SIMULATION } from '../lib/config';
import { clock } from '../utils/format';
import './mobile-web-demo.css';

type Screen = 'home' | 'map' | 'documents' | 'messages' | 'queue';
type Phase = 'idle' | 'driving' | 'approaching' | 'waiting' | 'unloaded';
type VoiceCommand = 'start' | 'approach' | 'arrive' | 'occurrence' | 'invoice' | 'map' | 'documents' | 'queue' | 'message' | 'unload';
type EventKey = 'assigned' | 'pickup' | 'approach' | 'receiverCall' | 'arrival' | 'task' | 'push' | 'panel' | 'call' | 'escalated' | 'acknowledged' | 'occurrence' | 'message' | 'unload';
type DemoEvent = { key: EventKey; minute: number };
type ChatLine = { from: 'driver' | 'cco'; text: string };

const profiles = ['Carlos Andrade', 'Marina Souza', 'João Pereira'];
const baseClockMin = 14 * 60;
const commandIds: VoiceCommand[] = ['start', 'approach', 'arrive', 'occurrence', 'invoice', 'map', 'documents', 'queue', 'message', 'unload'];

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
      return event.payload.channel === 'panel' ? 'panel' : 'call';
    }
    case 'TaskAcknowledged': return 'acknowledged';
    case 'OccurrenceCreated': return 'occurrence';
    case 'DriverMessageSent': return 'message';
    case 'UnloadConfirmed': return 'unload';
    default: return null;
  }
}

function tripPhase(phase: 'driving' | 'approaching' | 'waiting' | 'unloaded'): Phase {
  return phase;
}

export function MobileWebDemoPage({ embedded = false, integrated = false }: { embedded?: boolean; integrated?: boolean }) {
  const { t, i18n } = useTranslation();
  const mobileTripId = useOps((state) => state.trips[0]?.id ?? null);
  const mobileTrip = useOps((state) => integrated && mobileTripId ? state.trips.find((trip) => trip.id === mobileTripId) : undefined);
  const receivers = useReceivers();
  const mobileReceiver = integrated && mobileTrip ? receivers.find((receiver) => receiver.id === mobileTrip.receiverId) : undefined;
  const sharedFeed = useOps((state) => state.feed);
  const simMinutes = useOps((state) => state.simMinutes);
  const simulationRunning = useOps((state) => state.running);
  const mobileTask = useOps((state) => integrated && mobileTripId ? state.tasks.find((task) => task.tripId === mobileTripId) : undefined);
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState(profiles[0]);
  const [screen, setScreen] = useState<Screen>('home');
  const [localPhase, setLocalPhase] = useState<Phase>('idle');
  const [localElapsed, setLocalElapsed] = useState(0);
  const [localEvents, setLocalEvents] = useState<DemoEvent[]>([{ key: 'assigned', minute: 0 }]);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [transcript, setTranscript] = useState<ChatLine[]>([]);
  const [ccoAcknowledged, setCcoAcknowledged] = useState(false);
  const [mobileStarted, setMobileStarted] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [documentOpen, setDocumentOpen] = useState<'nfe' | 'cte' | null>(null);
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
      applyDriverAction('advance', minutes);
      return;
    }
    const next = elapsed + minutes;
    setLocalElapsed(next);
    if (elapsed < 20 && next >= 20) addEvent('panel', 20);
    if (elapsed < 40 && next >= 40) addEvent('call', 40);
    if (elapsed < 60 && next >= 60) addEvent('escalated', 60);
  };

  const runVoiceCommand = (command: VoiceCommand) => {
    const phrase = t(`mobileWeb.voice.${command}.say`);
    const reply = t(`mobileWeb.voice.${command}.reply`);
    setTranscript((current) => [...current.slice(-4), { from: 'driver', text: phrase }, { from: 'cco', text: reply }]);
    switch (command) {
      case 'start': startTrip(); break;
      case 'approach': approachReceiver(); break;
      case 'arrive': registerArrival(); setScreen('queue'); break;
      case 'occurrence': applyDriverAction('occurrence'); addEvent('occurrence'); break;
      case 'invoice': setScreen('documents'); setDocumentOpen('nfe'); break;
      case 'map': setScreen('map'); break;
      case 'documents': setScreen('documents'); break;
      case 'queue': setScreen('queue'); break;
      case 'message':
        setScreen('messages');
        applyDriverAction('message', phrase);
        addEvent('message');
        break;
      case 'unload': confirmUnload(); setScreen('home'); break;
    }
    if (command === 'message') setChat((current) => [...current, { from: 'driver', text: phrase }]);
    sayOutLoud(reply);
  };

  const [chat, setChat] = useState<ChatLine[]>([]);

  const submitMessage = () => {
    const clean = messageDraft.trim();
    if (!clean || phase === 'driving' || phase === 'approaching') return;
    setChat((current) => [...current, { from: 'driver', text: clean }]);
    setMessageDraft('');
    applyDriverAction('message', clean);
    addEvent('message');
  };

  const resetDemo = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setAuthenticated(false);
    setScreen('home');
    setLocalPhase('idle');
    setLocalElapsed(0);
    setLocalEvents([{ key: 'assigned', minute: 0 }]);
    setVoiceOpen(false);
    setTranscript([]);
    setCcoAcknowledged(false);
    setMobileStarted(false);
    setChat([]);
  };

  const sendToSignIn = () => {
    setAuthenticated(false);
    setScreen('home');
    setVoiceOpen(false);
  };

  const login = () => {
    setAuthenticated(true);
    setScreen('home');
  };

  const voiceNav = (page: Screen) => {
    setScreen(page);
    setVoiceOpen(false);
  };

  const renderScreen = () => {
    if (screen === 'map') return <>
      <div className="mw-screen-heading"><span className="mw-overline">{t('mobileWeb.map.mock')}</span><h2>{t('mobileWeb.map.title')}</h2><p>{t('mobileWeb.map.subtitle')}</p></div>
      <div className="mw-map-card">
        <svg viewBox="0 0 360 300" role="img" aria-label={t('mobileWeb.map.mock')}>
          <defs><pattern id="map-grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0H0V26" fill="none" stroke="#26332b" strokeWidth="1" /></pattern></defs>
          <rect width="360" height="300" fill="url(#map-grid)" />
          <path d="M-10 225 C70 210 90 148 150 165 S230 232 370 68" fill="none" stroke="#657563" strokeWidth="19" strokeLinecap="round" opacity=".22" />
          <path d="M-10 225 C70 210 90 148 150 165 S230 232 370 68" fill="none" stroke="#a2f200" strokeWidth="3" strokeDasharray="7 8" strokeLinecap="round" />
          <circle cx={mapX} cy={mapY} r="18" fill="#a2f200" opacity=".18" />
          <circle cx={mapX} cy={mapY} r="7" fill="#a2f200" />
          <circle cx="336" cy="75" r="7" fill="#f5a524" /><circle cx="336" cy="75" r="14" fill="none" stroke="#f5a524" strokeWidth="2" />
          <text x="20" y="270" fill="#aeb8b0" fontSize="11">JUNDIAÍ</text><text x="270" y="48" fill="#aeb8b0" fontSize="11">CAMPINAS</text>
        </svg>
        <div className="mw-map-legend"><span><i className="mw-dot-truck" />{t('mobileWeb.map.current')}</span><span><i className="mw-dot-destination" />{t('mobileWeb.map.receiver')}</span></div>
      </div>
      <div className="mw-map-info"><span>{t('mobileWeb.eta')}</span><strong>{arrived ? currentClock : t('mobileWeb.minutes', { count: currentEtaMinutes })}</strong><span>{t('mobileWeb.kmAway', { count: currentDistance })}</span></div>
      <button className="mw-primary-button" type="button" onClick={() => canStartTrip ? startTrip() : approachReceiver()}>{canStartTrip ? t('mobileWeb.startTrip') : t('mobileWeb.approach')}</button>
    </>;

    if (screen === 'documents') return <>
      <div className="mw-screen-heading"><span className="mw-overline">{t('mobileWeb.currentTrip', { id: mobileRouteLabel })}</span><h2>{t('mobileWeb.documents.title')}</h2><p>{t('mobileWeb.documents.hint')}</p></div>
      <button type="button" className="mw-ask-card" onClick={() => { setVoiceOpen(true); }}><span className="mw-ask-icon">✦</span><span><strong>{t('mobileWeb.voiceTitle')}</strong><small>{t('mobileWeb.voiceHint')}</small></span></button>
      <div className="mw-document-card"><div className="mw-document-icon">NF</div><div className="mw-document-body"><strong>{t('mobileWeb.documents.nfe')}</strong><span>{t('mobileWeb.documents.fiscalMock')}</span></div><button type="button" aria-expanded={documentOpen === 'nfe'} onClick={() => setDocumentOpen((value) => value === 'nfe' ? null : 'nfe')}>{documentOpen === 'nfe' ? '−' : '+'}</button>{documentOpen === 'nfe' && <div className="mw-document-fields"><span>{t('mobileWeb.documents.invoiceNumber')}<b>000.482.913</b></span><span>{t('mobileWeb.documents.weight')}<b>28.000 kg · 28 t</b></span><span>{t('mobileWeb.documents.cargo')}<b>{t('mobileWeb.documents.cargoValue')}</b></span><span>{t('mobileWeb.documents.amount')}<b>{t('mobileWeb.documents.amountValue')}</b></span></div>}</div>
      <div className="mw-document-card"><div className="mw-document-icon mw-cte-icon">CT</div><div className="mw-document-body"><strong>{t('mobileWeb.documents.cte')}</strong><span>{t('mobileWeb.documents.fiscalMock')}</span></div><button type="button" aria-expanded={documentOpen === 'cte'} onClick={() => setDocumentOpen((value) => value === 'cte' ? null : 'cte')}>{documentOpen === 'cte' ? '−' : '+'}</button>{documentOpen === 'cte' && <div className="mw-document-fields"><span>{t('mobileWeb.documents.freight')}<b>{t('mobileWeb.documents.freightValue')}</b></span><span>{t('mobileWeb.plate')}<b>{integrated && mobileTrip ? mobileTrip.plate : 'RST-4B21'}</b></span><span>{t('mobileWeb.documents.invoiceNumber')}<b>000.771.204</b></span></div>}</div>
    </>;

    if (screen === 'messages') return <>
      <div className="mw-screen-heading"><span className="mw-overline">{t('mobileWeb.currentTrip', { id: mobileRouteLabel })}</span><h2>{t('mobileWeb.messages.title')}</h2><p>{t('mobileWeb.messages.hint')}</p></div>
      <div className="mw-message-thread">{(chat.length ? chat : [{ from: 'cco' as const, text: t('mobileWeb.messages.sampleCco') }, { from: 'driver' as const, text: t('mobileWeb.messages.sampleDriver') }]).map((line, index) => <div className={`mw-chat-line ${line.from}`} key={`${line.from}-${index}`}><small>{line.from === 'cco' ? 'CCO' : driverName.split(' ')[0]}</small><p>{line.text}</p><span>{t('mobileWeb.messages.sent')}</span></div>)}</div>
      {(phase === 'driving' || phase === 'approaching') ? <p className="mw-inline-note">{t('mobileWeb.messages.voiceOnly')}</p> : <form className="mw-message-form" onSubmit={(event) => { event.preventDefault(); submitMessage(); }}><input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder={t('mobileWeb.messages.placeholder')} /><button type="submit" aria-label={t('mobileWeb.messages.send')}>↑</button></form>}
      <button type="button" className="mw-voice-link" onClick={() => setVoiceOpen(true)}>✦ {t('mobileWeb.voiceOpen')}</button>
    </>;

    if (screen === 'queue') {
      const remain = Math.max(0, 300 - elapsed);
      return <>
        <div className="mw-screen-heading"><span className="mw-overline">{destinationName}</span><h2>{t('mobileWeb.queue.title')}</h2></div>
        <div className="mw-dock-card"><span className="mw-dock-symbol">⌖</span><span>{t('mobileWeb.queue.dock')}</span><strong>{t('mobileWeb.queue.dockTime')}</strong><small>{receiverNotified ? t('mobileWeb.confirmed') : t('mobileWeb.receiverPending')}</small></div>
        <div className="mw-wait-card"><span>{t('mobileWeb.queue.elapsed')}</span><strong>{arrived ? durationLabel(elapsed) : '—:—'}</strong><div className="mw-progress-track"><span style={{ width: `${arrived ? Math.min(100, elapsed / 3) : 0}%` }} /></div><span>{t('mobileWeb.queue.franchise')}</span><b>{remain > 0 ? t('mobileWeb.stayRemaining', { count: Math.ceil(remain / 60) }) : t('mobileWeb.overstay')}</b></div>
        <p className="mw-inline-note">{arrived ? t(taskClosed ? 'mobileWeb.taskClosed' : hasCcoAcknowledged ? 'mobileWeb.taskTaken' : 'mobileWeb.taskOpen') : t('mobileWeb.queue.waiting')} · {t('mobileWeb.queue.position')}</p>
        {arrived && phase === 'waiting' && <div className="mw-advance-buttons"><button type="button" onClick={() => advanceTime(20)} disabled={integrated && !simulationRunning}>{t('mobileWeb.queue.advance')}</button><button type="button" onClick={() => advanceTime(60)} disabled={integrated && !simulationRunning}>{t('mobileWeb.queue.advanceHour')}</button></div>}
        {escalated && !hasCcoAcknowledged && !taskClosed && <button type="button" className="mw-primary-button" onClick={() => { applyDriverAction('acknowledge'); setCcoAcknowledged(true); addEvent('acknowledged'); }}>{t('mobileWeb.taskAcknowledge')}</button>}
        <p className="mw-inline-note">{t(taskClosed ? 'mobileWeb.taskClosed' : hasCcoAcknowledged ? 'mobileWeb.taskTaken' : escalated ? 'mobileWeb.taskEscalated' : 'mobileWeb.taskChannels')}</p>
        <div className="mw-channel-list">{([['push', 'channelPush'], ['panel', 'channelPanel'], ['call', 'channelCall'], ['escalated', 'channelEscalation']] as const).map(([key, label], index) => { const event = events.some((item) => item.key === key); return <div key={key}><span>{t(`mobileWeb.${label}`)}</span><b>{event ? t('mobileWeb.sent') : index === 0 && arrived ? t('mobileWeb.sent') : t('mobileWeb.waiting')}</b></div>; })}</div>
      </>;
    }

    return <>
      <div className="mw-driver-greeting"><div><span>{t('mobileWeb.greeting')}</span><strong>{driverName.split(' ')[0]}</strong></div><span className="mw-online-pill"><i />AvisAI</span></div>
      <section className="mw-trip-card">
        <div className="mw-trip-card-top"><span>{t('mobileWeb.currentTrip', { id: mobileRouteLabel })}</span><b>{integrated && mobileTrip ? mobileTrip.plate : 'RST-4B21'}</b></div>
        <div className="mw-route-stop"><i className="mw-route-origin" /><div><small>{t('mobileWeb.origin')}</small><strong>{t('mobileWeb.routeOrigin')}</strong></div></div>
        <div className="mw-route-connector" />
        <div className="mw-route-stop"><i className="mw-route-end" /><div><small>{t('mobileWeb.destination')}</small><strong>{destinationName}</strong><small>{t('mobileWeb.unloadWindow')}</small></div></div>
        {canStartTrip ? <button type="button" className="mw-primary-button" onClick={startTrip}>{t('mobileWeb.startTrip')}</button> : <>
          <div className="mw-status-row"><span className="mw-phase-pill">{t(`mobileWeb.phases.${phase}`)}</span><span className="mw-location-distance">{t('mobileWeb.kmAway', { count: currentDistance })}</span></div>
          <div className="mw-step-bars" aria-label={t('mobileWeb.routeProgress')}>{['idle', 'driving', 'approaching', 'waiting', 'unloaded'].map((step, index) => <i key={step} data-state={phase === step || (step === 'waiting' && arrived) || (step === 'unloaded' && phase === 'unloaded') ? 'active' : index < ['idle', 'driving', 'approaching', 'waiting', 'unloaded'].indexOf(phase) ? 'done' : 'future'} />)}</div>
          <div className="mw-trip-shortcuts">{phase === 'driving' && <button type="button" onClick={approachReceiver}>{t('mobileWeb.approach')}</button>}{phase === 'approaching' && <button type="button" onClick={registerArrival}>{t('mobileWeb.arrival')}</button>}{phase === 'waiting' && <button type="button" onClick={confirmUnload}>{t('mobileWeb.unload')}</button>}{phase === 'unloaded' && <span>✓ {t('mobileWeb.unloaded')}</span>}</div>
        </>}
        {receiverNotified && <div className="mw-receiver-confirmation"><span>✓</span><p><b>{t('mobileWeb.receiverNotified')}</b><small>{t('mobileWeb.dockConfirmed')}</small></p></div>}
        {arrived && <div className="mw-receiver-confirmation"><span>◷</span><p><b>{t('mobileWeb.arrivalRegistered')}</b><small>{t('mobileWeb.stay')}: {durationLabel(elapsed)} · {t('mobileWeb.stayLimit')}</small></p></div>}
      </section>
      <section className="mw-timeline-card"><div className="mw-section-title"><h3>{t('mobileWeb.timelineTitle')}</h3><span>{events.length}</span></div>{events.length === 0 ? <p className="mw-empty-timeline">{t('mobileWeb.timelineEmpty')}</p> : [...events].reverse().slice(0, 4).map((event, index) => <div className="mw-event-row" key={`${event.key}-${event.minute}-${index}`}><i data-latest={index === 0} /><time>{timeLabel(event.minute, integrated)}</time><span>{t(`mobileWeb.events.${event.key}`)}</span></div>)}</section>
      <button type="button" className="mw-voice-dock-button" onClick={() => setVoiceOpen((open) => !open)}><span className="mw-voice-orb">✦</span><span><b>{t('mobileWeb.voiceTitle')}</b><small>{t(voiceOpen ? 'mobileWeb.voiceClose' : 'mobileWeb.voiceOpen')}</small></span><span className="mw-mic-label">{t('mobileWeb.voiceMock')}</span></button>
    </>;
  };

  return <div className={`mobile-web-page${embedded ? ' mw-embedded' : ''}`}>
    {!embedded && <header className="mw-topbar"><Link to="/home" aria-label={t('app.name')}><RodarLogo size={34} /></Link><div className="mw-topbar-actions"><Link to="/home" className="mw-top-link">{t('mobileWeb.back')}</Link><Link to="/login" className="mw-top-cco"><Icon name="dashboard" />{t('mobileWeb.dashboard')}</Link><select value={isEn ? 'en' : 'pt-BR'} onChange={(event) => void i18n.changeLanguage(event.target.value)} aria-label={t('app.language')}><option value="pt-BR">PT</option><option value="en">EN</option></select></div></header>}
    <main className={`mw-main${embedded ? ' mw-main-embedded' : ''}`}>
      {embedded ? <h1 className="sr-only">{t('mobileWeb.title')}</h1> : <section className="mw-intro"><p className="mw-eyebrow"><span />{t('mobileWeb.eyebrow')}</p><h1>{t('mobileWeb.title')}</h1><p className="mw-intro-copy">{t('mobileWeb.intro')}</p><span className="mw-demo-badge">◉ {t('mobileWeb.mockNote')}</span></section>}
      <div className={`mw-demo-grid${embedded ? ' mw-demo-grid-embedded' : ''}`}>
        {!embedded && <aside className="mw-guide-panel"><p className="mw-guide-label">{t('mobileWeb.systemTitle')}</p><ul>{(t('mobileWeb.systemItems', { returnObjects: true }) as string[]).map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, '0')}</span>{item}</li>)}</ul><p className="mw-guide-foot">{t('mobileWeb.systemFoot')}</p><Link to="/login" className="mw-guide-link">{t('mobileWeb.ccoLink')} ↗</Link></aside>}
        <section className="mw-phone-column" aria-label={t('mobileWeb.phoneLabel')}>
          <div className="mw-phone-frame"><div className="mw-phone-camera" /><div className="mw-phone-screen">
          <div className="mw-phone-status"><span>{integrated ? currentClock : '9:41'}</span><span>●●●　◖　▰</span></div>
            {!authenticated ? <div className="mw-login-screen"><div className="mw-login-brand"><RodarMark /><span>RODAR</span></div><p className="mw-login-overline">{t('mobileWeb.driverDemo')}</p><h2>{t('mobileWeb.loginTitle')}</h2><p>{t('mobileWeb.loginSubtitle')}</p><label htmlFor="mw-profile-select">{t('mobileWeb.profile')}</label><select id="mw-profile-select" value={driverName} onChange={(event) => setProfile(event.target.value)}>{(integrated ? [driverName] : profiles).map((name) => <option key={name}>{name}</option>)}</select><button type="button" className="mw-primary-button" onClick={login}>{t('mobileWeb.enter')}</button><span className="mw-login-mock">● {t('mobileWeb.mockLogin')}</span></div> : <>
              <div className="mw-app-topline"><div><strong>RODAR</strong><span>{t(`mobileWeb.phases.${phase}`)}</span></div><button type="button" onClick={sendToSignIn} aria-label={t('mobileWeb.reset')}>{driverName.slice(0, 1)}</button></div>
              <div className="mw-app-content" key={screen}>{renderScreen()}</div>
              {voiceOpen && <div className="mw-voice-panel"><div className="mw-voice-panel-head"><div><span className="mw-voice-orb small">✦</span><span><b>{t('mobileWeb.voiceTitle')}</b><small>{t('mobileWeb.voiceMock')}</small></span></div><button type="button" onClick={() => setVoiceOpen(false)} aria-label={t('mobileWeb.voiceClose')}>×</button></div><p className="mw-voice-hint">{t('mobileWeb.voiceHint')}</p><div className="mw-transcript-list">{transcript.length ? transcript.slice(-4).map((line, index) => <div className={`mw-transcript-line ${line.from}`} key={`${index}-${line.text}`}><small>{t(line.from === 'driver' ? 'mobileWeb.voiceUser' : 'mobileWeb.voiceAgent')}</small><span>{line.text}</span></div>) : <p className="mw-agent-greeting">{t('mobileWeb.voiceGreeting')}</p>}</div><div className="mw-voice-audio-toggle"><span>{t('mobileWeb.voiceSpeak')}</span><button type="button" aria-pressed={audioEnabled} onClick={() => setAudioEnabled((value) => !value)}>{t(audioEnabled ? 'mobileWeb.voiceOn' : 'mobileWeb.voiceOff')}</button></div><div className="mw-command-list">{commandIds.map((command) => <button key={command} type="button" onClick={() => runVoiceCommand(command)}><span>“{t(`mobileWeb.voice.${command}.say`)}”</span><b>↗</b></button>)}</div></div>}
              <nav className="mw-phone-tabs" aria-label={t('mobileWeb.phoneLabel')}>{(['home', 'map', 'documents', 'messages', 'queue'] as const).map((tab) => <button type="button" key={tab} aria-current={screen === tab ? 'page' : undefined} onClick={() => voiceNav(tab)}><span>{tab === 'home' ? '⌂' : tab === 'map' ? '⌖' : tab === 'documents' ? '▤' : tab === 'messages' ? '◌' : '◷'}</span><small>{t(`mobileWeb.tabs.${tab}`)}</small></button>)}</nav>
            </>}
          </div></div>
          {!embedded && <p className="mw-phone-caption">{t('mobileWeb.phoneLabel')}</p>}
        </section>
        {!embedded && <aside className="mw-control-panel"><div className="mw-control-heading"><span className="mw-demo-tag">DEMO</span><h2>{t('mobileWeb.controlsTitle')}</h2><p>{t('mobileWeb.controlsHint')}</p></div><div className="mw-control-status"><span>{t(`mobileWeb.phases.${phase}`)}</span><time>{currentClock}</time></div><div className="mw-control-actions">{!authenticated ? <button type="button" className="mw-control-primary" onClick={login}><span>01</span>{t('mobileWeb.enter')}<b>→</b></button> : <><button type="button" onClick={startTrip} disabled={phase !== 'idle'}><span>01</span>{t('mobileWeb.startTrip')}<b>→</b></button><button type="button" onClick={approachReceiver} disabled={phase === 'idle' || phase === 'waiting' || phase === 'unloaded' || receiverNotified}><span>02</span>{t('mobileWeb.approach')}<b>→</b></button><button type="button" onClick={registerArrival} disabled={phase === 'waiting' || phase === 'unloaded'}><span>03</span>{t('mobileWeb.arrival')}<b>→</b></button><button type="button" onClick={() => { setVoiceOpen(true); }}><span>04</span>{t('mobileWeb.voiceOpen')}<b>✦</b></button><button type="button" onClick={confirmUnload} disabled={!arrived || phase === 'unloaded'}><span>05</span>{t('mobileWeb.unload')}<b>✓</b></button></>}</div>{authenticated && <div className="mw-control-time"><span>{t('mobileWeb.queue.advanceHour')}</span><button type="button" onClick={() => advanceTime(60)} disabled={phase !== 'waiting'}>+60</button></div>}<button type="button" className="mw-reset-button" onClick={resetDemo}>↺ {t('mobileWeb.reset')}</button></aside>}
      </div>
      {!embedded && <p className="mw-page-footer">{t('mobileWeb.footer')}</p>}
    </main>
  </div>;
}
