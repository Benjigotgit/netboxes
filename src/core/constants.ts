export const DEFAULT_CDN_URL = 'https://cdn.netboxes.dev';
export const WASM_VERSION = '1.0.0';
export const API_VERSION = '1.0.0';
export const IS_DEVELOPMENT = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';

export const SUPPORTED_FEATURES = [
  'terminal',
  'editor', 
  'fileSystem',
  'bundler',
  'debugger',
  'preview'
] as const;

export type SupportedFeature = typeof SUPPORTED_FEATURES[number];

export const DEFAULT_CONFIG = {
  theme: 'light' as const,
  features: {
    terminal: true,
    editor: true,
    fileSystem: true,
    bundler: false
  }
};

export const ASSET_PATHS = {
  wasmModule: `/wasm/${WASM_VERSION}/netboxes.wasm`,
  workerScript: `/workers/${API_VERSION}/main.worker.js`,
  systemBinaries: {
    node: `/binaries/${WASM_VERSION}/node.wasm`,
    npm: `/binaries/${WASM_VERSION}/npm.wasm`
  }
};