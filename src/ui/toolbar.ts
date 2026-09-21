import { CellType } from '../types';

interface CommandDef {
  name: string;
  description: string;
  exec: () => void | Promise<void>;
}

export class Toolbar {
  constructor(commands: CommandDef[]) {
    this.register(commands);
  }

  private register(commands: CommandDef[]): void {
    const addCmd = (name: string, desc: string, exec: () => void | Promise<void>): void => {
      try {
        if (editorManager?.isCodeMirror) {
          const cmds = acode.require('commands') as { addCommand?: (cmd: { name: string; description: string; exec: () => void | Promise<void> }) => void };
          cmds?.addCommand?.({ name, description: desc, exec });
          return;
        }
      } catch { /* fall through */ }
      try {
        if (typeof acode.addCommand === 'function') acode.addCommand?.({ name, description: desc, exec });
        return;
      } catch { /* fall through */ }
      try { editorManager.editor?.commands?.addCommand?.({ name, description: desc, exec }); } catch {}
    };
    commands.forEach(cmd => addCmd(cmd.name, cmd.description, cmd.exec));
  }
}
