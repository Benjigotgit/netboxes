import { IDBPDatabase } from 'idb';
import { Emitter } from 'mitt';
import type { FileSystem, FileSystemNode } from '../types';
import type { FileChangeEvent } from '../types/worker';

interface FileEntry {
  path: string;
  content: Uint8Array;
  type: 'file' | 'directory';
  modified: number;
}

export class FileSystemImpl implements FileSystem {
  constructor(
    private db: IDBPDatabase<any>,
    private emitter: Emitter<{ 'file:change': FileChangeEvent }>
  ) {}

  async initialize(): Promise<void> {
    // Ensure root directory exists
    try {
      await this.stat('/');
    } catch (error) {
      // Root directory doesn't exist, create it
      const rootEntry: FileEntry = {
        path: '/',
        content: new Uint8Array(),
        type: 'directory',
        modified: Date.now()
      };
      await this.db.put('files', rootEntry);
    }
  }

  async readFile(path: string): Promise<string | Uint8Array> {
    const normalizedPath = this.normalizePath(path);
    const entry = await this.db.get('files', normalizedPath);
    
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    
    if (entry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
    }
    
    return entry.content;
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const dirPath = this.dirname(normalizedPath);
    
    if (dirPath && !(await this.exists(dirPath))) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    const buffer = typeof content === 'string' 
      ? new TextEncoder().encode(content)
      : content;

    const entry: FileEntry = {
      path: normalizedPath,
      content: buffer,
      type: 'file',
      modified: Date.now()
    };

    await this.db.put('files', entry);
    this.emitter.emit('file:change', { path: normalizedPath, type: 'change' });
  }

  async mkdir(path: string, recursive = false): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    
    if (await this.exists(normalizedPath)) {
      // If recursive is true and target is already a directory, this is OK
      if (recursive) {
        try {
          const stat = await this.stat(normalizedPath);
          if (stat.type === 'directory') {
            return; // Directory already exists, nothing to do
          } else {
            throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
          }
        } catch {
          throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
        }
      } else {
        throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
      }
    }

    const parts = normalizedPath.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      
      if (!(await this.exists(currentPath))) {
        if (!recursive && i < parts.length - 1) {
          throw new Error(`ENOENT: no such file or directory, mkdir '${path}'`);
        }

        const entry: FileEntry = {
          path: currentPath,
          content: new Uint8Array(),
          type: 'directory',
          modified: Date.now()
        };

        await this.db.put('files', entry);
        this.emitter.emit('file:change', { path: currentPath, type: 'add' });
      }
    }
  }

  async rmdir(path: string, recursive = false): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const entry = await this.db.get('files', normalizedPath);
    
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
    }
    
    if (entry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, rmdir '${path}'`);
    }

    const children = await this.readdir(normalizedPath);
    
    if (children.length > 0 && !recursive) {
      throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
    }

    if (recursive) {
      for (const child of children) {
        const childPath = `${normalizedPath}/${child}`;
        const childEntry = await this.db.get('files', childPath);
        
        if (childEntry?.type === 'directory') {
          await this.rmdir(childPath, true);
        } else {
          await this.unlink(childPath);
        }
      }
    }

    await this.db.delete('files', normalizedPath);
    this.emitter.emit('file:change', { path: normalizedPath, type: 'unlink' });
  }

  async unlink(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const entry = await this.db.get('files', normalizedPath);
    
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
    }
    
    if (entry.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`);
    }

    await this.db.delete('files', normalizedPath);
    this.emitter.emit('file:change', { path: normalizedPath, type: 'unlink' });
  }

  async readdir(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    const entry = await this.db.get('files', normalizedPath);
    
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }
    
    if (entry.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory, scandir '${path}'`);
    }

    const allFiles = await this.db.getAllKeys('files');
    const prefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    const children = new Set<string>();

    for (const filePath of allFiles) {
      if (filePath.startsWith(prefix) && filePath !== normalizedPath) {
        const relative = filePath.slice(prefix.length);
        const firstSlash = relative.indexOf('/');
        
        if (firstSlash === -1) {
          children.add(relative);
        } else {
          children.add(relative.slice(0, firstSlash));
        }
      }
    }

    return Array.from(children).sort();
  }

  async stat(path: string): Promise<FileSystemNode> {
    const normalizedPath = this.normalizePath(path);
    const entry = await this.db.get('files', normalizedPath);
    
    if (!entry) {
      throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
    }

    return {
      path: normalizedPath,
      type: entry.type,
      content: entry.type === 'file' ? entry.content : undefined
    };
  }

  watch(path: string, callback: (event: string, filename: string) => void): () => void {
    const normalizedPath = this.normalizePath(path);
    
    const handler = ({ path: changedPath, type }: FileChangeEvent) => {
      if (changedPath === normalizedPath || changedPath.startsWith(normalizedPath + '/')) {
        const filename = changedPath === normalizedPath 
          ? this.basename(changedPath)
          : changedPath.slice(normalizedPath.length + 1);
        callback(type, filename);
      }
    };

    this.emitter.on('file:change', handler);
    
    return () => {
      this.emitter.off('file:change', handler);
    };
  }

  private async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    
    // Root directory always exists
    if (normalizedPath === '/') {
      return true;
    }
    
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  private normalizePath(path: string): string {
    if (!path || path === '.') return '/';
    
    const parts = path.split('/').filter(Boolean);
    const normalized: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        normalized.pop();
      } else if (part !== '.') {
        normalized.push(part);
      }
    }
    
    return '/' + normalized.join('/');
  }

  private dirname(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash <= 0 ? '/' : normalized.slice(0, lastSlash);
  }

  private basename(path: string): string {
    const normalized = this.normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  }
}