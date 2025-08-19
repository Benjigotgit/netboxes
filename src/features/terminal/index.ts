import type { Terminal, DevEnvironment } from '../../types';
import { TerminalImpl } from './TerminalImpl';

export class TerminalFeature {
  static async create(container: HTMLElement, env: DevEnvironment): Promise<Terminal> {
    const terminal = new TerminalImpl(container, env);
    await terminal.initialize();
    return terminal;
  }
}