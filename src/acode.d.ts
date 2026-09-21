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

interface TerminalInstance {
  id: string;
}

interface TerminalModule {
  create(options: { name: string }): Promise<TerminalInstance>;
  write(id: string, content: string): Promise<void>;
}

interface EditorManager {
  isCodeMirror: boolean;
  activeFile?: { path?: string; filename?: string } | null;
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
  fileBrowser?(type: string, title: string): Promise<{ url: string; filename?: string }>;
  fsOperation?(path: string): { readFile(encoding: string): Promise<string>; writeFile(content: string): Promise<void> };
  loader?: { create(msg: string, sub: string): { show(): void; hide(): void } };
  toast?: (msg: string, duration?: number) => void;
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
