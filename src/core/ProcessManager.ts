import { Remote } from 'comlink';
import { Emitter } from 'mitt';
import type { ProcessManager, Process, SpawnOptions, FileSystem } from '../types';
import type { WorkerAPI, ProcessInfo, ProcessSpawnEvent, ProcessExitEvent } from '../types/worker';

export class ProcessManagerImpl implements ProcessManager {
  private processes = new Map<number, ProcessImpl>();
  private nextPid = 1;

  constructor(
    private workerApi: Remote<WorkerAPI>,
    _fileSystem: FileSystem,
    private emitter: Emitter<{
      'process:spawn': ProcessSpawnEvent;
      'process:exit': ProcessExitEvent;
    }>
  ) {
    // fileSystem parameter kept for future use
  }

  async spawn(
    command: string,
    args: string[] = [],
    options: SpawnOptions = {}
  ): Promise<Process> {
    const pid = this.nextPid++;
    
    const processInfo = await this.workerApi.spawnProcess({
      command,
      args,
      options: {
        cwd: options.cwd || '/',
        env: options.env || {},
        shell: options.shell || false
      }
    });

    const process = new ProcessImpl(
      pid,
      command,
      args,
      processInfo,
      this.workerApi,
      this.emitter
    );

    this.processes.set(pid, process);
    this.emitter.emit('process:spawn', { process });

    process.onExit = (exitCode: number) => {
      this.processes.delete(pid);
      this.emitter.emit('process:exit', { pid, exitCode });
    };

    return process;
  }

  async kill(pid: number, signal = 'SIGTERM'): Promise<void> {
    const process = this.processes.get(pid);
    if (!process) {
      throw new Error(`Process ${pid} not found`);
    }
    await process.kill(signal);
  }

  async killAll(): Promise<void> {
    const promises = Array.from(this.processes.values()).map(
      process => process.kill()
    );
    await Promise.all(promises);
  }

  getProcess(pid: number): Process | undefined {
    return this.processes.get(pid);
  }

  listProcesses(): Process[] {
    return Array.from(this.processes.values());
  }
}

class ProcessImpl implements Process {
  public status: 'running' | 'exited' | 'killed' = 'running';
  public exitCode?: number;
  public stdout: ReadableStream<Uint8Array>;
  public stderr: ReadableStream<Uint8Array>;
  public stdin: WritableStream<Uint8Array>;
  public onExit?: (exitCode: number) => void;

  constructor(
    public readonly pid: number,
    public readonly command: string,
    public readonly args: string[],
    private processInfo: ProcessInfo,
    private workerApi: Remote<WorkerAPI>,
    _emitter: Emitter<{
      'process:spawn': ProcessSpawnEvent;
      'process:exit': ProcessExitEvent;
    }>
  ) {
    this.stdout = this.createReadableStream(processInfo.stdoutPort);
    this.stderr = this.createReadableStream(processInfo.stderrPort);
    this.stdin = this.createWritableStream(processInfo.stdinPort);
    
    this.monitorProcess();
  }

  async kill(signal = 'SIGTERM'): Promise<void> {
    if (this.status !== 'running') return;
    
    await this.workerApi.killProcess(this.processInfo.id, signal);
    this.status = 'killed';
  }

  async wait(): Promise<number> {
    if (this.exitCode !== undefined) {
      return this.exitCode;
    }

    return new Promise((resolve) => {
      const checkExit = () => {
        if (this.exitCode !== undefined) {
          resolve(this.exitCode);
        } else {
          setTimeout(checkExit, 100);
        }
      };
      checkExit();
    });
  }

  private createReadableStream(port: MessagePort): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        port.onmessage = (event) => {
          if (event.data.type === 'data') {
            controller.enqueue(event.data.buffer);
          } else if (event.data.type === 'close') {
            controller.close();
          }
        };
      },
      cancel() {
        port.close();
      }
    });
  }

  private createWritableStream(port: MessagePort): WritableStream<Uint8Array> {
    return new WritableStream({
      write(chunk) {
        port.postMessage({ type: 'data', buffer: chunk });
      },
      close() {
        port.postMessage({ type: 'close' });
        port.close();
      }
    });
  }

  private async monitorProcess(): Promise<void> {
    try {
      const exitCode = await this.workerApi.waitForProcess(this.processInfo.id);
      this.exitCode = exitCode;
      this.status = 'exited';
      this.onExit?.(exitCode);
    } catch (error) {
      this.exitCode = -1;
      this.status = 'killed';
      this.onExit?.(-1);
    }
  }
}