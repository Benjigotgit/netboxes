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
          const { command, args } = options;
          
          // Create channels for stdio
          const stdoutChannel = new MessageChannel();
          const stderrChannel = new MessageChannel();
          const stdinChannel = new MessageChannel();
          
          // Mock command execution with realistic output
          setTimeout(() => {
            let output = '';
            let exitCode = 0;
            
            switch (command) {
              case 'echo':
                output = (args || []).join(' ') + '\\n';
                break;
                
              case 'node':
                if (args && args[0] === '--version') {
                  output = 'v18.17.0\\n';
                } else {
                  output = 'Node.js REPL would start here\\n';
                }
                break;
                
              case 'npm':
                if (args && args[0] === '--version') {
                  output = '9.6.7\\n';
                } else if (args && args[0] === 'install') {
                  output = 'npm WARN mock This is a mock npm install\\n';
                  output += 'added 0 packages in 0.1s\\n';
                } else {
                  output = 'npm <command>\\n\\nUsage:\\nnpm install\\nnpm --version\\n';
                }
                break;
                
              case 'ls':
                output = 'index.js  package.json  src/\\n';
                break;
                
              case 'pwd':
                output = '/\\n';
                break;
                
              case 'whoami':
                output = 'netboxes-user\\n';
                break;
                
              case 'date':
                output = new Date().toString() + '\\n';
                break;
                
              case 'uname':
                output = 'NetBoxes 1.0.0\\n';
                break;
                
              default:
                output = command + ': command not found\\n';
                exitCode = 127;
                break;
            }
            
            // Send output
            if (output) {
              stdoutChannel.port1.postMessage({
                type: 'data',
                buffer: new TextEncoder().encode(output)
              });
            }
            
            // Close streams after a short delay
            setTimeout(() => {
              stdoutChannel.port1.postMessage({ type: 'close' });
              stderrChannel.port1.postMessage({ type: 'close' });
              
              // Store exit code for waitForProcess
              self.mockProcesses = self.mockProcesses || {};
              self.mockProcesses[processId] = { exitCode };
            }, 50);
          }, 20);
          
          // Transfer the ports back to the main thread
          const result = {
            id: processId,
            stdoutPort: stdoutChannel.port2,
            stderrPort: stderrChannel.port2,
            stdinPort: stdinChannel.port2
          };
          
          return result;
        },
        
        async killProcess(id, signal) {
          console.log('Kill process:', id, signal);
        },
        
        async waitForProcess(id) {
          // Wait for process to complete and return exit code
          return new Promise((resolve) => {
            const checkProcess = () => {
              self.mockProcesses = self.mockProcesses || {};
              const process = self.mockProcesses[id];
              if (process) {
                resolve(process.exitCode || 0);
              } else {
                setTimeout(checkProcess, 10);
              }
            };
            checkProcess();
          });
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