interface FileInfo {
  uri: string;
  name: string;
}

export class FileHandler {
  constructor(id: string, onOpen: (info: FileInfo) => void | Promise<void>) {
    try {
      acode.registerFileHandler(id, {
        extensions: ['ipynb'],
        handleFile: async (fileInfo: { uri: string; filename?: string; url?: string }) => {
          await onOpen({ uri: fileInfo.url ?? fileInfo.uri, name: fileInfo.filename ?? 'notebook.ipynb' });
        },
      });
    } catch (e) {
      console.warn('Jupyter: file handler registration failed', e);
    }
  }
}
