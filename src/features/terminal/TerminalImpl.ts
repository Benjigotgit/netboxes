import type { Terminal as ITerminal, DevEnvironment } from "../../types";

// Note: xterm.js interfaces removed - using fallback terminal only

export class TerminalImpl implements ITerminal {
  private element: HTMLElement;
  private dataCallbacks: Array<(data: string) => void> = [];
  private currentProcess?: unknown;
  private commandHistory: string[] = [];
  private historyIndex = -1;
  private prompt = "$ ";

  constructor(private container: HTMLElement, private env: DevEnvironment) {
    this.element = this.createTerminalElement();
    
    // Look for a terminal-specific container, otherwise use the provided container
    const terminalContainer = this.container.querySelector('#terminal') || 
                             this.container.querySelector('.terminal-panel') || 
                             this.container;
    
    terminalContainer.appendChild(this.element);
  }

  private createTerminalElement(): HTMLElement {
    const terminalDiv = document.createElement("div");
    terminalDiv.className = "netboxes-terminal";
    // Ensure proper containment and positioning
    terminalDiv.style.cssText = `
      width: 100%;
      height: 100%;
      background: black;
      color: white;
      font-family: monospace;
      font-size: 14px;
      overflow: hidden;
      position: relative;
    `;
    return terminalDiv;
  }

  async initialize(): Promise<void> {
    try {
      // For now, skip xterm.js and use fallback to avoid layout issues
      // const xtermModule = await this.loadXterm();
      // if (xtermModule) { ... }
      
      // Always use fallback terminal for now
      this.setupFallbackTerminal();
      this.showWelcome();
      this.showPrompt();
    } catch (error) {
      console.warn("Failed to initialize terminal:", error);
      this.setupFallbackTerminal();
      this.showWelcome();
      this.showPrompt();
    }
  }


  private setupFallbackTerminal(): void {
    // Clear any existing content
    this.element.innerHTML = '';
    
    // Create main container with flex layout
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; flex-direction: column; height: 100%; background: black;';
    
    // Create output area that grows and aligns content to bottom
    const output = document.createElement('div');
    output.id = 'terminal-output';
    output.style.cssText = `
      flex: 1;
      overflow-y: auto;
      background: black;
      color: white;
      font-family: monospace;
      font-size: 14px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      min-height: 0;
    `;
    
    // Create content wrapper for the actual terminal content
    const contentWrapper = document.createElement('div');
    contentWrapper.id = 'terminal-content';
    contentWrapper.style.cssText = 'flex-shrink: 0;';
    output.appendChild(contentWrapper);
    
    // Create input area fixed at bottom
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      flex-shrink: 0;
      background: black;
      padding: 5px 10px;
      display: flex;
      align-items: center;
      border-top: 1px solid #333;
    `;
    
    const promptSpan = document.createElement('span');
    promptSpan.textContent = this.prompt;
    promptSpan.style.cssText = 'color: green; font-family: monospace; margin-right: 5px;';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'terminal-input';
    input.style.cssText = `
      flex: 1;
      background: transparent;
      border: none;
      color: white;
      font-family: monospace;
      outline: none;
      font-size: 14px;
    `;
    
    inputContainer.appendChild(promptSpan);
    inputContainer.appendChild(input);
    
    container.appendChild(output);
    container.appendChild(inputContainer);
    this.element.appendChild(container);

    // Set up input event handlers
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          this.handleCommand(input.value);
          input.value = "";
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.navigateHistory(1, input);  // Up arrow = older commands (forward in history)
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          this.navigateHistory(-1, input); // Down arrow = newer commands (backward in history)
        }
      });
      
      // Focus the input field
      setTimeout(() => input.focus(), 100);
    }
  }

  private navigateHistory(direction: number, input?: HTMLInputElement): void {
    if (this.commandHistory.length === 0) return;

    this.historyIndex += direction;
    this.historyIndex = Math.max(
      -1,
      Math.min(this.historyIndex, this.commandHistory.length - 1)
    );

    let command = "";
    if (
      this.historyIndex >= 0 &&
      this.historyIndex < this.commandHistory.length
    ) {
      command = this.commandHistory[this.historyIndex] || "";
    }

    if (input) {
      input.value = command;
    }
  }

  private async handleCommand(command: string): Promise<void> {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      this.showPrompt();
      return;
    }

    // Add to history
    if (
      this.commandHistory[this.commandHistory.length - 1] !== trimmedCommand
    ) {
      this.commandHistory.push(trimmedCommand);
    }
    this.historyIndex = -1;

    // Handle built-in commands
    if (await this.handleBuiltinCommand(trimmedCommand)) {
      this.showPrompt();
      return;
    }

    // Execute command through process manager
    try {
      const args = this.parseCommand(trimmedCommand);
      const cmd = args.shift();
      if (!cmd) {
        this.showPrompt();
        return;
      }

      const process = await this.env.spawn(cmd, args, { cwd: "/" });
      this.currentProcess = process;

      // Handle process output
      const reader = process.stdout.getReader();
      this.readProcessOutput(reader);

      // Wait for process to complete
      const exitCode = await process.wait();
      this.currentProcess = undefined;

      if (exitCode !== 0) {
        this.write(`\r\nProcess exited with code ${exitCode}\r\n`);
      }
    } catch (error) {
      this.write(
        `\r\nError: ${
          error instanceof Error ? error.message : String(error)
        }\r\n`
      );
    }

    this.showPrompt();
  }

  private async readProcessOutput(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        this.write(text);
      }
    } catch (error) {
      console.error("Error reading process output:", error);
    } finally {
      reader.releaseLock();
    }
  }

  private async handleBuiltinCommand(command: string): Promise<boolean> {
    const args = this.parseCommand(command);
    const cmd = args[0];

    switch (cmd) {
      case "clear":
        this.clear();
        return true;

      case "ls":
        try {
          const path = args[1] || "/";
          const files = await this.env.fileSystem.readdir(path);
          this.write(files.join("  ") + "\r\n");
        } catch (error) {
          this.write(
            `ls: ${error instanceof Error ? error.message : String(error)}\r\n`
          );
        }
        return true;

      case "cat":
        if (args.length < 2) {
          this.write("Usage: cat <filename>\r\n");
          return true;
        }
        try {
          const filename = args[1];
          if (!filename) {
            this.write("Usage: cat <filename>\r\n");
            return true;
          }
          const content = await this.env.fileSystem.readFile(filename);
          const text =
            typeof content === "string"
              ? content
              : new TextDecoder().decode(content);
          this.write(text + "\r\n");
        } catch (error) {
          this.write(
            `cat: ${error instanceof Error ? error.message : String(error)}\r\n`
          );
        }
        return true;

      case "pwd":
        this.write("/\r\n"); // For now, always show root
        return true;

      case "help":
        this.showHelp();
        return true;

      default:
        return false;
    }
  }

  private parseCommand(command: string): string[] {
    // Simple command parsing - could be enhanced for quotes, etc.
    return command.trim().split(/\s+/);
  }

  private showWelcome(): void {
    this.write("Welcome to NetBoxes Terminal\r\n");
    this.write('Type "help" for available commands.\r\n\r\n');
  }

  private showHelp(): void {
    this.write("Available commands:\r\n");
    this.write("  help     - Show this help message\r\n");
    this.write("  clear    - Clear the terminal\r\n");
    this.write("  ls [dir] - List directory contents\r\n");
    this.write("  cat file - Display file contents\r\n");
    this.write("  pwd      - Show current directory\r\n");
    this.write("  echo ... - Echo text\r\n");
    this.write("\r\n");
  }

  private showPrompt(): void {
    this.write(this.prompt);
  }

  // Public Terminal interface methods
  write(data: string | Uint8Array): void {
    const content = this.element.querySelector("#terminal-content");
    const output = this.element.querySelector("#terminal-output");
    
    if (content && output) {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      // Simple text append with basic line break handling
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
          content.appendChild(document.createElement('br'));
        }
        const line = lines[i];
        if (line) {
          content.appendChild(document.createTextNode(line));
        }
      }
      // Scroll to bottom after adding content
      output.scrollTop = output.scrollHeight;
    }
  }

  onData(callback: (data: string) => void): void {
    this.dataCallbacks.push(callback);
  }

  resize(cols: number, rows: number): void {
    // Fallback terminal doesn't need specific resize handling
    console.log('Terminal resize requested:', cols, rows);
  }

  clear(): void {
    const content = this.element.querySelector("#terminal-content");
    if (content) {
      content.innerHTML = "";
    }
  }

  destroy(): void {
    // Kill current process if any
    if (this.currentProcess && typeof this.currentProcess === 'object' && 'kill' in this.currentProcess) {
      (this.currentProcess as { kill: () => void }).kill();
    }

    // Remove DOM element
    this.element.remove();
  }
}
