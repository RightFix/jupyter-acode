interface FileInfo {
  uri: string;
  name: string;
}

export function baseName(uri: string): string {
  const part = uri.split('/').pop() ?? '';
  const clean = part.split('?')[0];
  return clean || 'notebook.ipynb';
}

export class FileHandler {
  private id: string;

  constructor(id: string, onOpen: (info: FileInfo) => void | Promise<void>) {
    this.id = id;
    try {
      acode.registerFileHandler?.(id, {
        extensions: ['ipynb'],
        handleFile: async (fileInfo: Record<string, string>) => {
          const uri = fileInfo.url ?? fileInfo.uri;
          const name = fileInfo.filename ?? fileInfo.name ?? baseName(uri);
          await onOpen({ uri, name });
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
