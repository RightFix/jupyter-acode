type GetIconFn = (filename: string) => string;

interface HelpersModule {
  getIconForFile?: GetIconFn;
}

type OwnedFn = GetIconFn & { __jupyterOwned?: boolean };

/**
 * Legacy icon path (works back to old Acode builds, no File Icons API).
 * Mirrors the proven material-icons approach: chain `helpers.getIconForFile`
 * for `.ipynb` only, delegate everything else, and paint via injected CSS.
 */
export class LegacyIcons {
  private helpers: HelpersModule | null = null;
  private orig: GetIconFn | null = null;
  private origThis: HelpersModule | null = null;
  private styleEl: HTMLStyleElement | null = null;

  install(assetBase: string): void {
    try { this.styleEl?.remove(); } catch { /* ignore */ }
    this.styleEl = null;
    this.injectCss(assetBase);
    let helpers: HelpersModule | undefined;
    try {
      helpers = acode.require('helpers') as HelpersModule | undefined;
    } catch {
      return;
    }
    const rawOrig = helpers?.getIconForFile;
    if (!helpers || typeof rawOrig !== 'function') return;
    if ((rawOrig as OwnedFn).__jupyterOwned && this.orig) {
      return; // already chained by a previous install; original link preserved
    }
    this.helpers = helpers;
    this.orig = rawOrig;
    this.origThis = helpers;
    const chained: OwnedFn = (filename: string): string => {
      try {
        if (String(filename).toLowerCase().endsWith('.ipynb')) {
          return 'file file_type_default file_type_ipynb';
        }
      } catch { /* fall through to original */ }
      return this.orig ? this.orig.call(this.origThis, filename) : 'file file_type_default';
    };
    chained.__jupyterOwned = true;
    helpers.getIconForFile = chained;
  }

  uninstall(): void {
    try { this.styleEl?.remove(); } catch { /* ignore */ }
    this.styleEl = null;
    try {
      if (this.helpers && this.orig) {
        const cur = this.helpers.getIconForFile as OwnedFn | undefined;
        if (cur && cur.__jupyterOwned) this.helpers.getIconForFile = this.orig;
      }
    } catch { /* ignore */ }
    this.helpers = null;
    this.orig = null;
    this.origThis = null;
  }

  private injectCss(assetBase: string): void {
    try {
      const base = assetBase.endsWith('/') ? assetBase : `${assetBase}/`;
      const el = document.createElement('style');
      el.setAttribute('data-jupyter-icons', 'true');
      el.textContent =
        `.file.file_type_ipynb::before{` +
        `display:inline-block;content:'' !important;` +
        `background-image:url(${base}ipynb.png) !important;` +
        `background-size:contain;background-repeat:no-repeat;` +
        `height:1em;width:1em;}`;
      document.head.appendChild(el);
      this.styleEl = el;
    } catch { /* DOM unavailable — ignore */ }
  }
}
