import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ParticipantKind, Room, RoomEvent, Track, type Participant, type RemoteTrack, type TranscriptionSegment } from 'livekit-client';
import { API_BASE_URL } from '../../lib/apiConfig';
import { ApiClient, ApiError } from '../api/client';
import { hasLiveVoiceAgent } from './agent';

/**
 * Voz ao vivo da Demo do app, como no app do motorista (porta de entrada do LIVEKIT_URL).
 * Ação explícita do usuário: entra com o SSO mock, abre no backend uma sessão de motorista na rota de
 * demonstração (`POST /demo/sessao`, o agente tem as ferramentas do app) e conecta o microfone à sala.
 * O que o agente faz chega pelo `/cco/stream` dessa rota (`routeId`). Nada aqui repete POST sozinho.
 */
export type LiveVoiceStatus = 'idle' | 'checking' | 'unavailable' | 'unreachable' | 'unconfigured' | 'connecting' | 'requesting_microphone' | 'waiting_agent' | 'live' | 'error';
export type LiveVoiceError = 'microphone' | 'auth' | 'token' | 'connection' | null;
export interface LiveCaption { id: string; who: 'agent' | 'driver'; text: string; final: boolean }

interface LiveVoiceState {
  status: LiveVoiceStatus;
  url: string | null;
  room: string | null;
  /** Rota de demonstração da sessão ao vivo: a Demo acompanha o stream dela. */
  routeId: number | null;
  agentSpeaking: boolean;
  driverSpeaking: boolean;
  muted: boolean;
  captions: LiveCaption[];
  error: LiveVoiceError;
}

const initial: LiveVoiceState = { status: 'idle', url: null, room: null, routeId: null, agentSpeaking: false, driverSpeaking: false, muted: false, captions: [], error: null };
export const liveVoiceStore = createStore<LiveVoiceState>(() => initial);
export const useLiveVoice = <T,>(selector: (state: LiveVoiceState) => T) => useStore(liveVoiceStore, selector);

let room: Room | null = null;
let generation = 0;
let session: { client: ApiClient; id: number } | null = null;
const audioElements = new Set<HTMLMediaElement>();
const set = (patch: Partial<LiveVoiceState>) => liveVoiceStore.setState(patch);

function upsertCaption(caption: LiveCaption) {
  const captions = liveVoiceStore.getState().captions;
  const index = captions.findIndex((item) => item.id === caption.id);
  const next = index >= 0 ? captions.map((item, position) => position === index ? caption : item) : [...captions, caption];
  set({ captions: next.slice(-12) });
}

const hasAgent = (current: Room) => hasLiveVoiceAgent(current.remoteParticipants.values());

/** Lê a configuração pública (`GET /livekit/config`) para mostrar a URL antes de conectar. */
export async function checkLiveVoice() {
  if (['connecting', 'requesting_microphone', 'waiting_agent', 'live'].includes(liveVoiceStore.getState().status)) return;
  const attempt = ++generation;
  if (!API_BASE_URL) { set({ status: 'unavailable', url: null }); return; }
  set({ status: 'checking', error: null });
  try {
    const config = await new ApiClient(API_BASE_URL).getLiveKitConfig();
    if (attempt !== generation) return;
    set({ status: config.configurado ? 'idle' : 'unconfigured', url: config.url });
  } catch {
    if (attempt !== generation) return;
    // URL configurada, mas o backend não respondeu (fora do ar ou origem fora do CORS_ORIGENS).
    set({ status: 'unreachable' });
  }
}

export async function connectLiveVoice() {
  const state = liveVoiceStore.getState();
  if (!API_BASE_URL || ['connecting', 'requesting_microphone', 'live', 'waiting_agent'].includes(state.status)) return;
  const attempt = ++generation;
  set({ status: 'connecting', error: null, captions: [], muted: false });
  const client = new ApiClient(API_BASE_URL);
  let credentials: { url: string; token: string; sala: string; routeId: number };
  try {
    const sso = await client.authSso();
    if (attempt !== generation) return;
    client.setAccessToken(sso.token);
  } catch {
    if (attempt !== generation) return;
    set({ status: 'error', error: 'auth' });
    return;
  }
  try {
    const created = await client.createDemoSession();
    session = { client, id: created.id };
    if (attempt !== generation) { void endSession(); return; }
    credentials = { url: created.livekit_url, token: created.token, sala: created.canal, routeId: created.rota_id };
    set({ routeId: created.rota_id });
  } catch (failure) {
    if (attempt !== generation) return;
    set(failure instanceof ApiError && failure.status === 503 ? { status: 'unconfigured' } : { status: 'error', error: 'token' });
    return;
  }

  const current = new Room({ adaptiveStream: true, dynacast: true });
  room = current;
  current
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (room !== current) return;
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.style.display = 'none';
      document.body.appendChild(element);
      audioElements.add(element);
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((element) => { audioElements.delete(element); element.remove(); });
    })
    .on(RoomEvent.ParticipantConnected, () => {
      if (room === current && liveVoiceStore.getState().status === 'waiting_agent' && hasAgent(current)) set({ status: 'live' });
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      if (room === current && liveVoiceStore.getState().status === 'live' && !hasAgent(current)) set({ status: 'waiting_agent' });
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (room === current) set({ agentSpeaking: speakers.some((speaker) => speaker.kind === ParticipantKind.AGENT), driverSpeaking: speakers.some((speaker) => speaker.isLocal) });
    })
    .on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: Participant) => {
      if (room === current) segments.forEach((segment) => upsertCaption({ id: segment.id, who: participant?.isLocal ? 'driver' : 'agent', text: segment.text, final: segment.final }));
    })
    .on(RoomEvent.Disconnected, () => { if (room === current) { generation++; cleanup(); set({ ...initial, url: liveVoiceStore.getState().url }); void endSession(); } });
  // Agentes recentes publicam a transcrição como fluxo de texto (tópico lk.transcription).
  try {
    current.registerTextStreamHandler('lk.transcription', async (reader, info) => {
      const text = await reader.readAll();
      if (room !== current) return;
      const final = reader.info.attributes?.['lk.transcription_final'] === 'true';
      const segment = reader.info.attributes?.['lk.segment_id'] ?? reader.info.id;
      upsertCaption({ id: segment, who: info.identity === current.localParticipant.identity ? 'driver' : 'agent', text, final });
    });
  } catch { /* SDK sem fluxo de texto: fica só o evento de transcrição. */ }

  try {
    await current.connect(credentials.url, credentials.token);
  } catch {
    if (attempt !== generation) return;
    cleanup();
    set({ status: 'error', error: 'connection' });
    void endSession();
    return;
  }
  if (attempt !== generation) { await current.disconnect(); return; }
  set({ status: 'requesting_microphone', url: credentials.url, room: credentials.sala });
  try {
    await current.localParticipant.setMicrophoneEnabled(true);
  } catch {
    if (attempt !== generation) return;
    cleanup();
    set({ status: 'error', error: 'microphone' });
    await current.disconnect();
    void endSession();
    return;
  }
  if (attempt !== generation) {
    await current.localParticipant.setMicrophoneEnabled(false);
    await current.disconnect();
    return;
  }
  set({ status: hasAgent(current) ? 'live' : 'waiting_agent', url: credentials.url, room: credentials.sala });
}

export async function toggleLiveMute() {
  const current = room;
  const state = liveVoiceStore.getState();
  if (!current || (state.status !== 'live' && state.status !== 'waiting_agent')) return;
  const muted = !state.muted;
  try {
    await current.localParticipant.setMicrophoneEnabled(!muted);
    if (room === current) set({ muted });
  } catch {
    if (room !== current) return;
    cleanup();
    set({ ...initial, url: state.url, status: 'error', error: 'microphone' });
    await current.disconnect();
  }
}

function cleanup() {
  audioElements.forEach((element) => element.remove());
  audioElements.clear();
  room = null;
}

/** Encerra a sessão do agente no backend (sem repetir: um pedido por desligamento). */
async function endSession() {
  const current = session;
  session = null;
  if (current) await current.client.endDemoSession(current.id).catch(() => undefined);
}

export async function disconnectLiveVoice() {
  generation++;
  const current = room;
  cleanup();
  set({ ...initial, url: liveVoiceStore.getState().url });
  if (current) await current.disconnect();
  await endSession();
}
