export function createWorker(scriptUrl: string): Worker {
  const worker = new Worker(scriptUrl, {
    type: 'module',
    credentials: 'same-origin'
  });

  worker.addEventListener('error', (event) => {
    console.error('Worker error:', event);
  });

  worker.addEventListener('messageerror', (event) => {
    console.error('Worker message error:', event);
  });

  return worker;
}

export function createSharedWorker(scriptUrl: string, name: string): SharedWorker {
  const worker = new SharedWorker(scriptUrl, {
    type: 'module',
    credentials: 'same-origin',
    name
  });

  worker.addEventListener('error', (event) => {
    console.error('SharedWorker error:', event);
  });

  return worker;
}

export function supportsSharedWorker(): boolean {
  return typeof SharedWorker !== 'undefined';
}

export function supportsOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

export function supportsWebAssembly(): boolean {
  return typeof WebAssembly !== 'undefined';
}

export function checkBrowserCompatibility(): {
  compatible: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  
  if (!supportsWebAssembly()) {
    missing.push('WebAssembly');
  }
  
  if (!('serviceWorker' in navigator)) {
    missing.push('Service Workers');
  }
  
  if (!('MessageChannel' in window)) {
    missing.push('MessageChannel');
  }
  
  if (!('BroadcastChannel' in window)) {
    missing.push('BroadcastChannel');
  }

  return {
    compatible: missing.length === 0,
    missing
  };
}