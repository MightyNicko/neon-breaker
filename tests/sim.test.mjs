// Runs the simulation bot (tools/sim.mjs) once on every level and test board, with every power-up hidden in it,
// and fails if it finds a physics problem. For more runs: node tools/sim.mjs 20
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('the simulation bot finds no physics problems', () => {
  const sim = fileURLToPath(new URL('../tools/sim.mjs', import.meta.url));
  const out = spawnSync(process.execPath, [sim, '1'], { encoding: 'utf8', timeout: 240000 });
  assert.equal(out.status, 0, out.stdout + out.stderr);
  assert.match(out.stdout, /no problems found/);
});
