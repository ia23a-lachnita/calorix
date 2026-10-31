import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import {
  admissionFixture, admissionSha, canonicalFixtureJson, repinFixture,
} from './calibration-v2-admission-fixtures';

// Fixture authority is confined to mocked trusted ports/pins in unit tests.
// No runtime context producer or admission result generates these goldens.
export function v2BootstrapFixture() {
  const fixture = admissionFixture();
  fixture.lock.shared = {
    publicManifestHash: '2dc17d06752c2981862690953a7b134235bb6a20da4dc9b5fef5528f91f5bb56',
    promptHash: '205b635a252e1f378023f5e1f3c670a6fba0ecfdfc8ce4f08f30efa24c544263',
    responseSchemaHash: '1237ece38177ff83fcbb97fb0630718ca8943b0f17833721f19d4510876e94b0',
    offLockRawSha256: '2b9d7b9baecb22ec20662f52010810fdb4f2fde3dd7c464d73b0cb56855003a1',
    historicalReferenceRawSha256: 'fd712bee2d4229bc8476d1cc25fce1a21172e6013c6abfe8949498cc5ce15acb',
  };
  repinFixture(fixture);
  fixture.expectedManifest.sourceLockHash = fixture.input.expectedActivationLockSha256;
  const git = { headCommit: 'c'.repeat(40), implementationCommit: 'd'.repeat(40),
    functionsTreeId: 'e'.repeat(40), dirtyPaths: [] as string[] };
  const owner = { hostname: 'fixture-host', bootId: '11111111-1111-4111-8111-111111111111',
    pid: 12345, startTicks: 987654, acquiredAt: '2026-10-30T00:00:00.000Z' };
  const paths = ['functions/eval/nutrition/public-manifest.json', 'functions/eval/nutrition/off-snapshot-lock.json',
    'functions/eval/nutrition/historical-reference-v1.json'] as const;
  const shared = new Map<string, string>(paths.map(path => [path, readFileSync(
    new URL('../../../eval/nutrition/' + path.split('/').at(-1), import.meta.url), 'utf8',
  )]));
  const deps = { baseDir: '/fixture/calorix', readGitState: vi.fn(() => structuredClone(git)),
    readAdmissionInputs: vi.fn(async () => fixture.input),
    readCommittedSharedFile: vi.fn((path: string, _commit: string) => {
      const text = shared.get(path); if (text === undefined) throw new Error('unexpected fixture asset'); return text;
    }), readOwner: vi.fn(() => owner) };
  return { fixture, git, owner, shared, paths, deps,
    expectedManifestText: () => canonicalFixtureJson(fixture.expectedManifest),
    expectedManifestHash: () => admissionSha(Buffer.from(canonicalFixtureJson(fixture.expectedManifest))) };
}

export function formatV2FixtureLock(f: ReturnType<typeof v2BootstrapFixture>): void {
  f.fixture.input.activationLockBytes = Buffer.from(JSON.stringify(f.fixture.lock, null, 2) + '\n');
  f.fixture.input.expectedActivationLockSha256 = admissionSha(f.fixture.input.activationLockBytes);
  f.fixture.expectedManifest.sourceLockHash = f.fixture.input.expectedActivationLockSha256;
}
