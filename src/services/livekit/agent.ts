import { ParticipantKind } from 'livekit-client';

export function hasLiveVoiceAgent(participants: Iterable<{ kind: ParticipantKind }>) {
  return Array.from(participants).some((participant) => participant.kind === ParticipantKind.AGENT);
}
