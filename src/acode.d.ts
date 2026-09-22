/* eslint-disable @typescript-eslint/no-explicit-any */

interface AcodeCommand {
  name: string;
  description: string;
  exec: () => void | Promise<void>;
}

interface CommandsModule {
  addCommand?: (cmd: AcodeCommand) => void;
  removeCommand?: (name: string) => void;
}

interface FileIconsApi {
  register(pack: {
    id: string;
    name: string;
    icons: Record<string, { src: string }>;
    fileExtensions: Record<string, string>;
  }): { dispose(): void };
  icon(resource: string): string;
  onChange(listener: (e: { activeId: string; preferredId: string }) => void): () => void;
}

interface TerminalInstance {
  id: string;
}

interface TerminalModule {
  create(options: { name: string }): Promise<TerminalInstance>;
  write(id: string, content: string): Promise<void>;
}

interface EditorFileTab {
  uri: string;
  filename: string;
  isUnsaved: boolean;
}

interface EditorManager {
  isCodeMirror: boolean;
  activeFile?: { path?: string; filename?: string } | null;
  files?: EditorFileTab[];
  getFile?(test: string, type: 'uri' | 'id' | 'name'): EditorFileTab;
  addFile?(file: EditorFileTab): void;
  on(event: string, callback: (...args: any[]) => void): void;
  off(event: string, callback: (...args: any[]) => void): void;
  editor?: {
    commands?: {
      addCommand?: (cmd: AcodeCommand) => void;
      removeCommand?: (name: string) => void;
    };
  };
}

interface AcodeModule {
  require(module: string): any;
  addCommand?: (cmd: AcodeCommand) => void;
  removeCommand?: (name: string) => void;
  registerFileHandler?(id: string, handler: { extensions: string[]; handleFile: (fileInfo: any) => void | Promise<void> }): void;
  unregisterFileHandler?(id: string): void;
  fileBrowser?(mode: 'file' | 'folder' | 'both', title: string): Promise<{ type: 'file' | 'folder'; url: string; name: string; filename?: string }>;
  fsOperation?(path: string): {
    readFile(encoding: string): Promise<string>;
  };
  loader?: { create(msg: string, sub: string): { show(): void; hide(): void } };
  alert?: (title: string, msg: string) => void;
  setPluginInit(id: string, fn: (baseUrl: string, $page: any, ctx: any) => Promise<void>): void;
  setPluginUnmount(id: string, fn: () => void): void;
}

declare let acode: AcodeModule;
declare let editorManager: EditorManager;

declare module '*.css' {
  const content: string;
  export default content;
}
