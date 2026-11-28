import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(new URL('../.cache/tests', import.meta.url), { recursive: true, force: true });
for (const args of [
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.test.json'],
  ['--test', 'tests/domain.test.mjs', 'tests/api-client.test.mjs', 'tests/operations.test.mjs', 'tests/dispatch.test.mjs', 'tests/home.test.mjs', 'tests/monitoring.test.mjs', 'tests/analytics.test.mjs', 'tests/trip-view.test.mjs', 'tests/demo-conversations.test.mjs', 'tests/live-voice.test.mjs', 'tests/receiver-call.test.mjs', 'tests/demo-bridge.test.mjs', 'docs/examples/mobile-client.test.mjs'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
