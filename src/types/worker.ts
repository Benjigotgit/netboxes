export interface WorkerAPI {
  initialize(config: WorkerInitConfig): Promise<void>;
  spawnProcess(options: SpawnProcessOptions): Promise<ProcessInfo>;
  killProcess(id: string, signal: string): Promise<void>;
  waitForProcess(id: string): Promise<number>;
}

export interface WorkerInitConfig {
  wasmUrl: string;
}

export interface SpawnProcessOptions {
  command: string;
  args: string[];
  options: {
    cwd: string;
    env: Record<string, string>;
    shell: boolean;
  };
}

export interface ProcessInfo {
  id: string;
  stdoutPort: MessagePort;
  stderrPort: MessagePort;
  stdinPort: MessagePort;
}

export type FileChangeEvent = {
  path: string;
  type: 'change' | 'add' | 'unlink';
};

export type ProcessSpawnEvent = {
  process: import('./index').Process;
};

export type ProcessExitEvent = {
  pid: number;
  exitCode: number;
};

export type DevEnvironmentEvents = {
  ready: void;
  error: Error;
  'file:change': FileChangeEvent;
  'process:spawn': ProcessSpawnEvent;
  'process:exit': ProcessExitEvent;
};