interface FileInfo {
  uri: string;
  name: string;
}

export class FileHandler {
  private id: string;

  constructor(id: string, onOpen: (info: FileInfo) => void | Promise<void>) {
    this.id = id;
    try {
      acode.registerFileHandler?.(id, {
        extensions: ['ipynb'],
        handleFile: async (fileInfo: Record<string, string>) => {
          await onOpen({ uri: fileInfo.url ?? fileInfo.uri, name: fileInfo.filename ?? 'notebook.ipynb' });
        },
      });
    } catch (e) {
      console.warn('Jupyter: file handler registration failed', e);
    }
  }

  unregister(): void {
    try { acode.unregisterFileHandler?.(this.id); } catch { /* ignore */ }
  }
}
