export interface DevEnvironmentConfig {
  container: HTMLElement | string;
  cdnUrl?: string;
  theme?: 'light' | 'dark';
  features?: {
    terminal?: boolean;
    editor?: boolean;
    fileSystem?: boolean;
    bundler?: boolean;
  };
  plugins?: Plugin[];
  onReady?: () => void;
  onError?: (error: Error) => void;
}

export interface Plugin {
  name: string;
  version: string;
  initialize: (env: DevEnvironment) => Promise<void>;
  destroy?: () => Promise<void>;
}

export interface FileSystemNode {
  path: string;
  type: 'file' | 'directory';
  content?: string | Uint8Array;
  children?: Map<string, FileSystemNode>;
}

export interface Process {
  pid: number;
  command: string;
  args: string[];
  status: 'running' | 'exited' | 'killed';
  exitCode?: number;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdin: WritableStream<Uint8Array>;
  kill: (signal?: string) => Promise<void>;
  wait: () => Promise<number>;
}

export interface Terminal {
  write: (data: string | Uint8Array) => void;
  onData: (callback: (data: string) => void) => void;
  resize: (cols: number, rows: number) => void;
  clear: () => void;
  destroy: () => void;
}

export interface Editor {
  open: (path: string) => Promise<void>;
  getValue: () => string;
  setValue: (value: string) => void;
  onChange: (callback: (value: string) => void) => void;
  setLanguage: (language: string) => void;
  setTheme: (theme: string) => void;
  destroy: () => void;
}

export interface DevEnvironment {
  config: DevEnvironmentConfig;
  container: HTMLElement;
  fileSystem: FileSystem;
  processManager: ProcessManager;
  terminal?: Terminal;
  editor?: Editor;
  plugins: Map<string, Plugin>;
  
  mount: (files: FileSystemTree) => Promise<void>;
  spawn: (command: string, args?: string[], options?: SpawnOptions) => Promise<Process>;
  loadFeature: (feature: string) => Promise<void>;
  dispose: () => Promise<void>;
}

export interface FileSystem {
  readFile: (path: string) => Promise<string | Uint8Array>;
  writeFile: (path: string, content: string | Uint8Array) => Promise<void>;
  mkdir: (path: string, recursive?: boolean) => Promise<void>;
  rmdir: (path: string, recursive?: boolean) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<FileSystemNode>;
  watch: (path: string, callback: (event: string, filename: string) => void) => () => void;
}

export interface ProcessManager {
  spawn: (command: string, args?: string[], options?: SpawnOptions) => Promise<Process>;
  kill: (pid: number, signal?: string) => Promise<void>;
  killAll: () => Promise<void>;
  getProcess: (pid: number) => Process | undefined;
  listProcesses: () => Process[];
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
}

export type FileSystemTree = {
  [path: string]: string | Uint8Array | FileSystemTree;
};

export interface CDNAssets {
  wasmModule?: string;
  workerScript?: string;
  systemBinaries?: Record<string, string>;
}