import mitt, { Emitter } from 'mitt';
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { wrap, Remote } from 'comlink';

import type {
  DevEnvironment as IDevEnvironment,
  DevEnvironmentConfig,
  FileSystem,
  ProcessManager,
  Terminal,
  Editor,
  Plugin,
  Process,
  SpawnOptions,
  FileSystemTree
} from '../types';

import { DEFAULT_CDN_URL, DEFAULT_CONFIG, ASSET_PATHS } from './constants';
import { FileSystemImpl } from './FileSystem';
import { ProcessManagerImpl } from './ProcessManager';
import { AssetLoader } from '../utils/AssetLoader';
import { createWorker } from '../utils/workerUtils';
import type { WorkerAPI, DevEnvironmentEvents } from '../types/worker';

interface DevEnvironmentDB extends DBSchema {
  files: {
    key: string;
    value: {
      path: string;
      content: Uint8Array;
      type: 'file' | 'directory';
      modified: number;
    };
  };
  cache: {
    key: string;
    value: {
      url: string;
      data: Uint8Array;
      expires: number;
    };
    indexes: { 'expires': number };
  };
}

type Events = DevEnvironmentEvents;

export class DevEnvironment implements IDevEnvironment {
  public readonly config: DevEnvironmentConfig;
  public readonly container: HTMLElement;
  public fileSystem!: FileSystem;
  public processManager!: ProcessManager;
  public terminal?: Terminal;
  public editor?: Editor;
  public plugins: Map<string, Plugin> = new Map();

  private emitter: Emitter<DevEnvironmentEvents>;
  private worker?: Worker;
  private workerApi?: Remote<WorkerAPI>;
  private db?: IDBPDatabase<DevEnvironmentDB>;
  private assetLoader: AssetLoader;
  private initialized = false;

  constructor(config: DevEnvironmentConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.container = this.resolveContainer(config.container);
    this.emitter = mitt<DevEnvironmentEvents>();
    this.assetLoader = new AssetLoader(config.cdnUrl || DEFAULT_CDN_URL);
  }

  private resolveContainer(container: HTMLElement | string): HTMLElement {
    if (typeof container === 'string') {
      const element = document.querySelector(container);
      if (!element) {
        throw new Error(`Container element not found: ${container}`);
      }
      return element as HTMLElement;
    }
    return container;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.initializeDatabase();
      await this.initializeWorker();
      await this.initializeFileSystem();
      await this.initializeProcessManager();
      await this.loadRequestedFeatures();
      await this.initializePlugins();

      this.initialized = true;
      this.emitter.emit('ready');
      this.config.onReady?.();
    } catch (error) {
      const err = error as Error;
      this.emitter.emit('error', err);
      this.config.onError?.(err);
      throw err;
    }
  }

  private async initializeDatabase(): Promise<void> {
    this.db = await openDB<DevEnvironmentDB>('netboxes-dev-env', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'path' });
        }
        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'url' });
          cacheStore.createIndex('expires', 'expires');
        }
      }
    });
  }

  private async initializeWorker(): Promise<void> {
    const workerUrl = await this.assetLoader.loadAsset(
      ASSET_PATHS.workerScript,
      'application/javascript'
    );
    
    this.worker = createWorker(workerUrl);
    
    // For local development with mock worker, use a simplified wrapper
    if (workerUrl.startsWith('blob:')) {
      this.workerApi = this.createMockWorkerApi(this.worker);
    } else {
      this.workerApi = wrap(this.worker);
    }
    
    await this.workerApi.initialize({
      wasmUrl: this.assetLoader.getAssetUrl(ASSET_PATHS.wasmModule)
    });
  }
  
  private createMockWorkerApi(worker: Worker): Remote<WorkerAPI> {
    let messageId = 0;
    const pendingCalls = new Map<number, { resolve: Function; reject: Function }>();
    
    worker.addEventListener('message', (event) => {
      const { id, result, error } = event.data;
      const pending = pendingCalls.get(id);
      if (pending) {
        pendingCalls.delete(id);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
      }
    });
    
    const callMethod = (method: string, ...args: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        const id = messageId++;
        pendingCalls.set(id, { resolve, reject });
        worker.postMessage({ id, method, args });
      });
    };
    
    return {
      initialize: (config: any) => callMethod('initialize', config),
      spawnProcess: (options: any) => callMethod('spawnProcess', options),
      killProcess: (id: any, signal: any) => callMethod('killProcess', id, signal),
      waitForProcess: (id: any) => callMethod('waitForProcess', id),
      [Symbol.asyncDispose]: async () => worker.terminate()
    } as unknown as Remote<WorkerAPI>;
  }

  private async initializeFileSystem(): Promise<void> {
    this.fileSystem = new FileSystemImpl(this.db!, this.emitter as any);
    await this.fileSystem.initialize();
  }

  private async initializeProcessManager(): Promise<void> {
    this.processManager = new ProcessManagerImpl(
      this.workerApi!,
      this.fileSystem,
      this.emitter as any
    );
  }

  private async loadRequestedFeatures(): Promise<void> {
    const features = this.config.features || {};
    
    for (const [feature, enabled] of Object.entries(features)) {
      if (enabled && feature !== 'fileSystem') {
        // fileSystem is always initialized by default, skip loading it as a feature
        await this.loadFeature(feature);
      }
    }
  }

  private async initializePlugins(): Promise<void> {
    const plugins = this.config.plugins || [];
    
    for (const plugin of plugins) {
      await this.registerPlugin(plugin);
    }
  }

  public async mount(files: FileSystemTree): Promise<void> {
    const mountFiles = async (tree: FileSystemTree, basePath = ''): Promise<void> => {
      for (const [path, content] of Object.entries(tree)) {
        const fullPath = basePath ? `${basePath}/${path}` : path;
        
        if (typeof content === 'string' || content instanceof Uint8Array) {
          await this.fileSystem.writeFile(fullPath, content);
        } else {
          await this.fileSystem.mkdir(fullPath, true);
          await mountFiles(content, fullPath);
        }
      }
    };

    await mountFiles(files);
  }

  public async spawn(
    command: string,
    args: string[] = [],
    options?: SpawnOptions
  ): Promise<Process> {
    return this.processManager.spawn(command, args, options);
  }

  public async loadFeature(feature: string): Promise<void> {
    switch (feature) {
      case 'terminal': {
        const { TerminalFeature } = await import('../features/terminal');
        this.terminal = await TerminalFeature.create(this.container, this);
        break;
      }
        
      case 'editor': {
        const { EditorFeature } = await import('../features/editor');
        this.editor = await EditorFeature.create(this.container, this);
        break;
      }
        
      case 'bundler': {
        const { BundlerPlugin } = await import('../plugins/bundler');
        await this.registerPlugin(new BundlerPlugin());
        break;
      }
        
      default:
        throw new Error(`Unknown feature: ${feature}`);
    }
  }

  private async registerPlugin(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin already registered: ${plugin.name}`);
    }

    await plugin.initialize(this);
    this.plugins.set(plugin.name, plugin);
  }

  public async dispose(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.destroy?.();
    }

    this.terminal?.destroy();
    this.editor?.destroy();
    
    await this.processManager.killAll();
    
    this.worker?.terminate();
    await this.db?.close();
    
    this.initialized = false;
  }

  public on<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
    this.emitter.on(event, handler as any);
  }

  public off<K extends keyof Events>(event: K, handler: (data: Events[K]) => void): void {
    this.emitter.off(event, handler as any);
  }

  public static async create(config: DevEnvironmentConfig): Promise<DevEnvironment> {
    const env = new DevEnvironment(config);
    await env.initialize();
    return env;
  }
}