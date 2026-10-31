// Where career-ops (the engine) and its user layer live, and how to load its own libraries.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ROOT } from '../paths.ts';

export const ENGINE_DIR = join(ROOT, 'engine/career-ops');
export const ENGINE_DATA = join(ROOT, 'engine-data');
export const ENGINE_FILES = {
  cv: join(ENGINE_DATA, 'cv.md'),
  profile: join(ENGINE_DATA, 'config/profile.yml'),
  portals: join(ENGINE_DATA, 'portals.yml'),
  tracker: join(ENGINE_DATA, 'data/applications.md'),
  statusLog: join(ENGINE_DATA, 'data/status-log.tsv'),
  pipeline: join(ENGINE_DATA, 'data/pipeline.md'),
  scanHistory: join(ENGINE_DATA, 'data/scan-history.tsv'),
  reports: join(ENGINE_DATA, 'reports'),
  output: join(ENGINE_DATA, 'output'),
  additions: join(ENGINE_DATA, 'batch/tracker-additions'),
};

// The engine ships js-yaml; use its copy so we parse YAML exactly as it does.
const engineRequire = createRequire(join(ENGINE_DIR, 'package.json'));
export const yaml = engineRequire('js-yaml') as { load: (s: string) => any; dump: (o: unknown, opts?: object) => string };

/** Env every engine process gets: the data root, so scripts and agents read engine-data/. */
export const ENGINE_ENV = { CAREER_OPS_ROOT: ENGINE_DATA, CAREER_OPS_CLI: 'claude' };
