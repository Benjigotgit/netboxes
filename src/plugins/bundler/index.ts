import type { Plugin, DevEnvironment } from '../../types';

export class BundlerPlugin implements Plugin {
  name = 'bundler';
  version = '1.0.0';

  async initialize(_env: DevEnvironment): Promise<void> {
    console.log('Bundler plugin initialized');
    // Stub implementation - will be fully implemented later
  }

  async destroy(): Promise<void> {
    console.log('Bundler plugin destroyed');
  }
}