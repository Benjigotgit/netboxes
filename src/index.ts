export { DevEnvironment } from './core/DevEnvironment';
export { DEFAULT_CDN_URL, WASM_VERSION, API_VERSION } from './core/constants';
export { checkBrowserCompatibility } from './utils/workerUtils';

export type {
  DevEnvironmentConfig,
  Plugin,
  FileSystemNode,
  Process,
  Terminal,
  Editor,
  FileSystem,
  ProcessManager,
  SpawnOptions,
  FileSystemTree,
  CDNAssets
} from './types';

export { createDevEnvironment } from './api';

export const VERSION = '0.1.0';