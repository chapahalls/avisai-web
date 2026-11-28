import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { ParticipantKind, Room, RoomEvent, Track, type Participant, type RemoteTrack, type TranscriptionSegment } from 'livekit-client';
import { API_BASE_URL } from '../../lib/apiConfig';
import { ApiClient, ApiError } from '../api/client';
import { hasLiveVoiceAgent } from './agent';

/**
 * Voz do guia do tour da Demo: o agente LiveKit (LIVEKIT_MODEL) numa sala só do visitante (`POST /demo/tour`).
 * Ação explícita (botão "Começar com voz"). O agente pede o celular; a tela lê o número da transcrição local
 * (nada vai para o backend) e manda o roteiro de cada etapa pelo canal de controle da sala (`rodar.control`).
 * Sem repetição automática: erro mostra a escolha entre tentar de novo e seguir só com texto.
 */
export type TourVoiceStatus = 'idle' | 'connecting' | 'waiting_agent' | 'live' | 'ended' | 'error';
export type TourVoiceError = 'unavailable' | 'rate_limited' | 'connection' | null;

interface TourVoiceState {
  status: TourVoiceStatus;
  error: TourVoiceError;
  agentSpeaking: boolean;
  muted: boolean;
  /** Microfone negado: o guia narra mesmo assim e o celular é digitado. */
  micBlocked: boolean;
  /** Falas finais do visitante desde `clearTourHeard`, separadas por " | " (para achar o celular dito). */
  heard: string;
  agentCaption: string | null;
}

const initial: TourVoiceState = { status: 'idle', error: null, agentSpeaking: false, muted: false, micBlocked: false, heard: '', agentCaption: null };
export const tourVoiceStore = createStore<TourVoiceState>(() => initial);
export const useTourVoice = <T,>(selector: (state: TourVoiceState) => T) => useStore(tourVoiceStore, selector);

let room: Room | null = null;
let generation = 0;
const audioElements = new Set<HTMLMediaElement>();
const heardSegments = new Map<string, string>();
const set = (patch: Partial<TourVoiceState>) => tourVoiceStore.setState(patch);
const speaking = { attribute: false, active: false };

function syncSpeaking() {
  set({ agentSpeaking: speaking.attribute || speaking.active });
}

function addHeard(id: string, text: string) {
  heardSegments.set(id, text.trim());
  set({ heard: [...heardSegments.values()].filter(Boolean).slice(-6).join(' | ') });
}

export function clearTourHeard() {
  heardSegments.clear();
  set({ heard: '' });
}

function cleanup() {
  audioElements.forEach((element) => element.remove());
  audioElements.clear();
  heardSegments.clear();
  speaking.attribute = false;
  speaking.active = false;
  room = null;
}

export async function connectTourVoice(language: 'pt-BR' | 'en') {
  if (!API_BASE_URL || ['connecting', 'waiting_agent', 'live'].includes(tourVoiceStore.getState().status)) return;
  const attempt = ++generation;
  set({ ...initial, status: 'connecting' });
  let credentials: { url: string; token: string };
  try {
    const client = new ApiClient(API_BASE_URL);
    const sso = await client.authSso();
    client.setAccessToken(sso.token);
    credentials = await client.createDemoTour(language);
  } catch (failure) {
    if (attempt !== generation) return;
    const error: TourVoiceError = failure instanceof ApiError && failure.status === 503 ? 'unavailable'
      : failure instanceof ApiError && failure.status === 429 ? 'rate_limited' : 'connection';
    set({ status: 'error', error });
    return;
  }
  if (attempt !== generation) return;

  const current = new Room({ adaptiveStream: true, dynacast: true });
  room = current;
  const agentLeft = () => room === current && tourVoiceStore.getState().status === 'live' && !hasLiveVoiceAgent(current.remoteParticipants.values());
  current
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (room !== current || track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.style.display = 'none';
      document.body.appendChild(element);
      audioElements.add(element);
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach().forEach((element) => { audioElements.delete(element); element.remove(); });
    })
    .on(RoomEvent.ParticipantConnected, () => {
      if (room === current && tourVoiceStore.getState().status === 'waiting_agent' && hasLiveVoiceAgent(current.remoteParticipants.values())) set({ status: 'live' });
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      // O guia saiu (teto do tour no backend): a voz acaba, o tour segue em texto.
      if (agentLeft()) { generation++; cleanup(); set({ ...initial, status: 'ended' }); void current.disconnect(); }
    })
    .on(RoomEvent.ParticipantAttributesChanged, (_changed: Record<string, string>, participant: Participant) => {
      if (room !== current || participant.kind !== ParticipantKind.AGENT) return;
      speaking.attribute = participant.attributes['lk.agent.state'] === 'speaking';
      syncSpeaking();
    })
    .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      if (room !== current) return;
      speaking.active = speakers.some((speaker) => speaker.kind === ParticipantKind.AGENT);
      syncSpeaking();
    })
    .on(RoomEvent.TranscriptionReceived, (segments: TranscriptionSegment[], participant?: Participant) => {
      if (room !== current) return;
      segments.forEach((segment) => {
        if (participant?.isLocal) { if (segment.final) addHeard(segment.id, segment.text); }
        else set({ agentCaption: segment.text });
      });
    })
    .on(RoomEvent.Disconnected, () => {
      if (room !== current) return;
      generation++;
      const wasLive = tourVoiceStore.getState().status === 'live';
      cleanup();
      set({ ...initial, status: wasLive ? 'ended' : 'idle' });
    });
  // Agentes recentes publicam a transcrição como fluxo de texto (tópico lk.transcription).
  try {
    current.registerTextStreamHandler('lk.transcription', async (reader, info) => {
      const text = await reader.readAll();
      if (room !== current) return;
      const segment = reader.info.attributes?.['lk.segment_id'] ?? reader.info.id;
      if (info.identity === current.localParticipant.identity) {
        if (reader.info.attributes?.['lk.transcription_final'] === 'true') addHeard(segment, text);
      } else set({ agentCaption: text });
    });
  } catch { /* SDK sem fluxo de texto: fica só o evento de transcrição. */ }

  try {
    await current.connect(credentials.url, credentials.token);
    // O clique em "Começar com voz" libera o áudio do navegador para o guia.
    await current.startAudio();
  } catch {
    if (attempt !== generation) return;
    cleanup();
    set({ status: 'error', error: 'connection' });
    return;
  }
  if (attempt !== generation) { await current.disconnect(); return; }
  let micBlocked = false;
  try {
    await current.localParticipant.setMicrophoneEnabled(true);
  } catch {
    // Sem microfone o guia ainda narra; o visitante digita o celular no cartão.
    micBlocked = true;
  }
  if (attempt !== generation) { await current.disconnect(); return; }
  set({ micBlocked, muted: micBlocked });
  set({ status: hasLiveVoiceAgent(current.remoteParticipants.values()) ? 'live' : 'waiting_agent' });
}

export async function setTourMuted(muted: boolean) {
  const current = room;
  const state = tourVoiceStore.getState();
  if (!current || state.muted === muted || state.micBlocked) return;
  try {
    await current.localParticipant.setMicrophoneEnabled(!muted);
    if (room === current) set({ muted });
  } catch { /* microfone indisponível: o guia continua falando, só não ouve. */ }
}

/** Espera o guia começar a falar e terminar (ou desistir pelos prazos), sem segurar o tour para sempre. */
function waitForSpeech(startMs: number, maxMs: number) {
  return new Promise<void>((resolve) => {
    // Se o guia já estava falando (resposta a uma pergunta), espera essa fala acabar antes de contar a nova.
    let phase: 'busy' | 'waiting' | 'speaking' = tourVoiceStore.getState().agentSpeaking ? 'busy' : 'waiting';
    let startTimer = phase === 'waiting' ? window.setTimeout(() => finish(), startMs) : undefined;
    const maxTimer = window.setTimeout(() => finish(), maxMs);
    const unsubscribe = tourVoiceStore.subscribe((state) => {
      if (state.status !== 'live') { finish(); return; }
      if (phase === 'busy' && !state.agentSpeaking) { phase = 'waiting'; startTimer = window.setTimeout(() => finish(), startMs); }
      else if (phase === 'waiting' && state.agentSpeaking) { phase = 'speaking'; window.clearTimeout(startTimer); }
      else if (phase === 'speaking' && !state.agentSpeaking) finish();
    });
    function finish() {
      unsubscribe();
      window.clearTimeout(startTimer);
      window.clearTimeout(maxTimer);
      resolve();
    }
  });
}

/** Pede ao guia que fale o texto (na fila, depois da fala atual) e resolve quando ele termina de falar. */
export async function sayTour(text: string, { startMs = 8_000, maxMs = 45_000 } = {}) {
  const current = room;
  if (!current || tourVoiceStore.getState().status !== 'live' || !text.trim()) return;
  const done = waitForSpeech(startMs, maxMs);
  try {
    await current.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ action: 'speak', text })), { reliable: true, topic: 'rodar.control' });
  } catch {
    return;
  }
  await done;
}

export async function disconnectTourVoice() {
  generation++;
  const current = room;
  cleanup();
  set(initial);
  if (current) await current.disconnect();
}
