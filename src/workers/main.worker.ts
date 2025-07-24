import { expose } from 'comlink';

interface WorkerState {
  initialized: boolean;
  processes: Map<string, MockProcess>;
}

interface MockProcess {
  id: string;
  command: string;
  args: string[];
  status: 'running' | 'exited';
  exitCode?: number;
}

const state: WorkerState = {
  initialized: false,
  processes: new Map()
};

const workerAPI = {
  async initialize(config: { wasmUrl: string }): Promise<void> {
    console.log('Worker initializing with config:', config);
    state.initialized = true;
    // In a real implementation, we would load the WASM module here
  },

  async spawnProcess(options: {
    command: string;
    args: string[];
    options: { cwd: string; env: Record<string, string>; shell: boolean };
  }): Promise<{
    id: string;
    stdoutPort: MessagePort;
    stderrPort: MessagePort;
    stdinPort: MessagePort;
  }> {
    const processId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create message channels for stdio
    const stdoutChannel = new MessageChannel();
    const stderrChannel = new MessageChannel();
    const stdinChannel = new MessageChannel();

    const process: MockProcess = {
      id: processId,
      command: options.command,
      args: options.args,
      status: 'running'
    };

    state.processes.set(processId, process);

    // Simulate some output
    setTimeout(() => {
      stdoutChannel.port1.postMessage({
        type: 'data',
        buffer: new TextEncoder().encode(`Mock output from ${options.command}\n`)
      });
      
      // Simulate process exit
      setTimeout(() => {
        process.status = 'exited';
        process.exitCode = 0;
        stdoutChannel.port1.postMessage({ type: 'close' });
        stderrChannel.port1.postMessage({ type: 'close' });
      }, 1000);
    }, 100);

    return {
      id: processId,
      stdoutPort: stdoutChannel.port2,
      stderrPort: stderrChannel.port2,
      stdinPort: stdinChannel.port2
    };
  },

  async killProcess(id: string, signal: string): Promise<void> {
    const process = state.processes.get(id);
    if (process) {
      process.status = 'exited';
      process.exitCode = signal === 'SIGKILL' ? -9 : -15;
    }
  },

  async waitForProcess(id: string): Promise<number> {
    const process = state.processes.get(id);
    if (!process) {
      throw new Error(`Process ${id} not found`);
    }

    // Wait for process to exit
    while (process.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return process.exitCode || 0;
  }
};

expose(workerAPI);