import { DevEnvironment } from './core/DevEnvironment';
import type { DevEnvironmentConfig } from './types';
import { checkBrowserCompatibility } from './utils/workerUtils';

export async function createDevEnvironment(
  config: DevEnvironmentConfig
): Promise<DevEnvironment> {
  const compatibility = checkBrowserCompatibility();
  
  if (!compatibility.compatible) {
    throw new Error(
      `Your browser is missing required features: ${compatibility.missing.join(', ')}`
    );
  }

  return DevEnvironment.create(config);
}