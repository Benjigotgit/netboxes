export class AssetLoader {
  private cache = new Map<string, string>();
  
  constructor(private cdnUrl: string) {}

  async loadAsset(path: string, mimeType: string): Promise<string> {
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
      throw error;
    }
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