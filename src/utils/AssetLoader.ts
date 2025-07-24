export class AssetLoader {
  private cache = new Map<string, string>();
  private useLocalAssets: boolean;
  
  constructor(private cdnUrl: string) {
    // Check if we're in a local development environment
    this.useLocalAssets = window.location.protocol === 'file:' || 
                         window.location.hostname === 'localhost' ||
                         window.location.hostname === '127.0.0.1';
  }

  async loadAsset(path: string, mimeType: string): Promise<string> {
    // For local development, return a data URL with inline worker code
    if (this.useLocalAssets && path.includes('main.worker.js')) {
      return this.createLocalWorkerUrl();
    }
    
    const url = this.getAssetUrl(path);
    
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to load asset: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));
      
      this.cache.set(url, objectUrl);
      return objectUrl;
    } catch (error) {
      console.error(`Failed to load asset from CDN: ${url}`, error);
      
      // Fallback for development
      if (this.useLocalAssets) {
        console.log('Using local fallback for:', path);
        if (path.includes('main.worker.js')) {
          return this.createLocalWorkerUrl();
        }
      }
      
      throw error;
    }
  }
  
  private createLocalWorkerUrl(): string {
    // Inline worker code for local development
    const workerCode = `
      // Mock worker for local development
      self.onmessage = function(e) {
        if (e.data && e.data.type === 'init') {
          self.postMessage({ type: 'ready' });
        }
      };
      
      // Comlink stub
      const expose = (api) => {
        self.addEventListener('message', async (event) => {
          const { id, method, args } = event.data;
          
          try {
            if (api[method]) {
              const result = await api[method](...args);
              
              // Handle special case for spawnProcess which returns MessagePorts
              if (method === 'spawnProcess' && result) {
                // Transfer the MessagePorts
                self.postMessage({ id, result }, [
                  result.stdoutPort,
                  result.stderrPort,
                  result.stdinPort
                ]);
              } else {
                self.postMessage({ id, result });
              }
            } else {
              throw new Error('Method not found: ' + method);
            }
          } catch (error) {
            self.postMessage({ id, error: error.message });
          }
        });
      };
      
      // Mock API
      const workerAPI = {
        async initialize(config) {
          console.log('Worker initialized:', config);
          return true;
        },
        
        async spawnProcess(options) {
          const processId = 'mock-process-' + Date.now();
          
          // Create channels for stdio
          const stdoutChannel = new MessageChannel();
          const stderrChannel = new MessageChannel();
          const stdinChannel = new MessageChannel();
          
          // Send mock output after a short delay
          setTimeout(() => {
            stdoutChannel.port1.postMessage({
              type: 'data',
              buffer: new TextEncoder().encode('Mock process output from: ' + options.command + '\\n')
            });
            setTimeout(() => {
              stdoutChannel.port1.postMessage({ type: 'close' });
              stderrChannel.port1.postMessage({ type: 'close' });
            }, 100);
          }, 10);
          
          // Transfer the ports back to the main thread
          const result = {
            id: processId,
            stdoutPort: stdoutChannel.port2,
            stderrPort: stderrChannel.port2,
            stdinPort: stdinChannel.port2
          };
          
          // Return result with transferable ports
          return result;
        },
        
        async killProcess(id, signal) {
          console.log('Kill process:', id, signal);
        },
        
        async waitForProcess(id) {
          return 0;
        }
      };
      
      expose(workerAPI);
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  async loadWasmModule(path: string): Promise<WebAssembly.Module> {
    const url = this.getAssetUrl(path);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to load WASM module: ${response.status}`);
      }

      const bytes = await response.arrayBuffer();
      return WebAssembly.compile(bytes);
    } catch (error) {
      console.error(`Failed to load WASM module: ${url}`, error);
      throw error;
    }
  }

  getAssetUrl(path: string): string {
    return `${this.cdnUrl}${path}`;
  }

  preloadAssets(paths: string[]): Promise<void[]> {
    return Promise.all(
      paths.map(path => this.loadAsset(path, 'application/octet-stream').then(() => {}))
    );
  }

  clearCache(): void {
    for (const objectUrl of this.cache.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    this.cache.clear();
  }
}