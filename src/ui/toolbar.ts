interface CommandDef {
  name: string;
  description: string;
  exec: () => void | Promise<void>;
}

export function registerCommands(commands: CommandDef[]): void {
  for (const cmd of commands) {
    try {
      const cmds = acode.require('commands') as CommandsModule;
      if (cmds?.addCommand) {
        cmds.addCommand(cmd);
        continue;
      }
    } catch { /* fall through */ }
    try {
      if (typeof acode.addCommand === 'function') {
        acode.addCommand(cmd);
        continue;
      }
    } catch { /* fall through */ }
    try {
      if (editorManager?.editor?.commands?.addCommand) {
        editorManager.editor.commands.addCommand(cmd);
      }
    } catch { /* ignore */ }
  }
}

export function removeCommands(names: string[]): void {
  for (const name of names) {
    try {
      const cmds = acode.require('commands') as CommandsModule;
      if (cmds?.removeCommand) { cmds.removeCommand(name); continue; }
    } catch { /* fall through */ }
    try {
      if (typeof acode.removeCommand === 'function') { acode.removeCommand(name); continue; }
    } catch { /* fall through */ }
    try {
      if (editorManager?.editor?.commands?.removeCommand) { editorManager.editor.commands.removeCommand(name); }
    } catch { /* ignore */ }
  }
}
