import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticipantKind } from 'livekit-client';
import { hasLiveVoiceAgent } from '../.cache/tests/services/livekit/agent.js';

test('voz ao vivo só reconhece participante do tipo agente', () => {
  assert.equal(hasLiveVoiceAgent([]), false);
  assert.equal(hasLiveVoiceAgent([{ kind: ParticipantKind.STANDARD }, { kind: ParticipantKind.SIP }]), false);
  assert.equal(hasLiveVoiceAgent([{ kind: ParticipantKind.STANDARD }, { kind: ParticipantKind.AGENT }]), true);
  assert.equal(hasLiveVoiceAgent(new Map([['agent', { kind: ParticipantKind.AGENT }]]).values()), true);
});
