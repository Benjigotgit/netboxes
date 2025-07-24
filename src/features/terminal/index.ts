import type { Terminal, DevEnvironment } from '../../types';

export class TerminalFeature {
  static async create(container: HTMLElement, _env: DevEnvironment): Promise<Terminal> {
    // Stub implementation - will be fully implemented later
    const terminalDiv = document.createElement('div');
    terminalDiv.className = 'netboxes-terminal';
    container.appendChild(terminalDiv);

    return {
      write: (data: string | Uint8Array) => {
        console.log('Terminal write:', data);
      },
      onData: (_callback: (data: string) => void) => {
        // Stub
      },
      resize: (cols: number, rows: number) => {
        console.log('Terminal resize:', cols, rows);
      },
      clear: () => {
        console.log('Terminal clear');
      },
      destroy: () => {
        terminalDiv.remove();
      }
    };
  }
}