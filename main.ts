/* eslint-disable no-irregular-whitespace */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* -------------------------------------------------------------
 * MOC‑System Plugin  ✦  2025 • Lean rewrite
 * -------------------------------------------------------------
 * Core feature set only – all obsolete “legacy” branches,
 *   debug helpers and colour fall‑backs removed.
 * -------------------------------------------------------------
 * FEATURES
 * • Context‑aware single‑command creation (root/sub‑MOC, note, resource, prompt)
 * • Hierarchical folders (each MOC has its own folder + Notes/Resources/Prompts)
 * • Unlimited random emoji + RGB colour per MOC (stored in front‑matter)
 * • Prompt iteration duplication + hub auto‑update
 * • Batch open `llm-links` blocks
 * • Cleanup ‑ delete every file carrying `note-type` metadata
 * -------------------------------------------------------------*/

import {
  App,
  Modal,
  Notice,
  Plugin,
  TFile,
  normalizePath,
} from 'obsidian';

/* ---------------------------  Constants  --------------------------- */
const FOLDERS = {
  MOCs: 'MOCs',
  Notes: 'Notes',
  Resources: 'Resources',
  Prompts: 'Prompts',
} as const;
const SECTION_ORDER = ['MOCs', 'Notes', 'Resources', 'Prompts'] as const;

const NOTE_TYPES = {
  moc:      { emoji: '🔵', folder: FOLDERS.MOCs },
  note:     { emoji: '📝', folder: FOLDERS.Notes },
  resource: { emoji: '📁', folder: FOLDERS.Resources },
  prompt:   { emoji: '🤖', folder: FOLDERS.Prompts },
} as const;

type NoteType = keyof typeof NOTE_TYPES;

/* ---------------------------  Utilities  --------------------------- */
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

function randomRGB() {
  const clamp = (v: number) => Math.max(64, Math.min(224, v));
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  const [r, g, b] = [clamp(rand(0, 255)), clamp(rand(0, 255)), clamp(rand(0, 255))];
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  const light = `#${toHex(Math.min(255, r + 50))}${toHex(Math.min(255, g + 50))}${toHex(Math.min(255, b + 50))}`;
  return { hex, light };
}

function randomEmoji(): string {
  const blocks = [
    [0x1f600, 0x1f64f],
    [0x1f300, 0x1f5ff],
    [0x1f680, 0x1f6ff],
    [0x1f900, 0x1f9ff],
    [0x2600, 0x26ff],
    [0x2700, 0x27bf],
  ] as const;
  const [start, end] = blocks[rand(0, blocks.length - 1)];
  return String.fromCodePoint(rand(start, end));
}

async function ensureFolder(app: App, path: string) {
  if (!app.vault.getAbstractFileByPath(path)) await app.vault.createFolder(path).catch(() => {});
}

function fm(app: App, f: TFile) {
  return app.metadataCache.getFileCache(f)?.frontmatter ?? {};
}

/* ---------------------------  Short modal  --------------------------- */
class InputModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private placeholder: string,
    private callback: (value: string) => void,
  ) { super(app); }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: this.title });
    const input = contentEl.createEl('input', { type: 'text', placeholder: this.placeholder });
    input.focus();
    const submit = () => { if (input.value.trim()) { this.callback(input.value.trim()); this.close(); } };
    input.addEventListener('keypress', (e) => e.key === 'Enter' && submit());
    contentEl.createEl('button', { text: 'OK', cls: 'mod-cta' }).onclick = submit;
  }
}

/* ---------------------------  Plugin  --------------------------- */
export default class MOCSystemPlugin extends Plugin {
  onload() {
    /* Context‑aware create */
    this.addCommand({ id: 'moc-context-create', name: 'Create MOC or add content', callback: () => this.contextCreate() });
    /* Duplicate prompt iteration */
    this.addCommand({ id: 'duplicate-prompt-iteration', name: 'Duplicate prompt iteration', checkCallback: (c) => this.withActive(c, this.isPromptIteration, this.duplicateIteration) });
    /* Open llm‑links */
    this.addCommand({ id: 'open-llm-links', name: 'Open all LLM links', checkCallback: (c) => this.withActive(c, this.isPromptHub, this.openLLMLinks) });
    /* Cleanup */
    this.addCommand({ id: 'cleanup-moc-system', name: 'Cleanup MOC system files', callback: () => this.cleanup() });
  }

  /* ----------  Command helpers ---------- */
  private withActive(checking: boolean, pred: (f: TFile) => boolean, action: (f: TFile) => void) {
    const f = this.app.workspace.getActiveFile();
    if (f && pred.call(this, f)) { if (!checking) action.call(this, f); return true; } return false;
  }

  /* ----------  Context create ---------- */
  private async contextCreate() {
    const active = this.app.workspace.getActiveFile();
    if (!active || !this.isMOC(active)) {
      return new InputModal(this.app, 'New MOC name', 'Project', (name) => this.createRootMOC(name)).open();
    }
    new InputModal(this.app, 'Add: "note Scope" / "resource spec" / "prompt AI helper" / "sub Name"', '', (raw) => {
      const [kindRaw, ...rest] = raw.split(' ');
      const name = rest.join(' ') || kindRaw;
      const kind = kindRaw.toLowerCase();
      if (kind === 'sub') return this.createSubMOC(active, name);
      if ((NOTE_TYPES as any)[kind]) return this.createTyped(active, kind as NoteType, name);
      new Notice('Unknown type!');
    }).open();
  }

  /* ----------  Creation ---------- */
  private async createRootMOC(name: string) {
    const emoji = randomEmoji();
    const colour = randomRGB();
    const folder = `${emoji} ${name} MOC`;
    await Promise.all([ensureFolder(this.app, folder), ...Object.values(FOLDERS).map((f) => ensureFolder(this.app, `${folder}/${f}`))]);
    const file = await this.app.vault.create(`${folder}/${folder}.md`, [
      '---',
      'tags: [moc]',
      'note-type: moc',
      `root-moc-color: ${colour.hex}`,
      `root-moc-light: ${colour.light}`,
      '---\n',
    ].join('\n'));
    this.app.workspace.getLeaf().openFile(file);
    new Notice(`Created MOC “${name}”`);
  }

  private async createSubMOC(parent: TFile, name: string) {
    const pf = parent.parent?.path ?? '';
    const emoji = randomEmoji();
    const folder = `${pf}/${emoji} ${name} MOC`;
    await Promise.all([ensureFolder(this.app, folder), ...Object.values(FOLDERS).map((f) => ensureFolder(this.app, `${folder}/${f}`))]);
    const file = await this.app.vault.create(`${folder}/${emoji} ${name} MOC.md`, '---\ntags: [moc]\nnote-type: moc\n---\n');
    await this.addToSection(parent, 'MOCs', file);
  }

  private async createTyped(parent: TFile, type: NoteType, name: string) {
    const folder = `${parent.parent?.path}/${(NOTE_TYPES[type].folder)}`;
    await ensureFolder(this.app, folder);
    const path = `${folder}/${NOTE_TYPES[type].emoji} ${name}.md`;
    const file = await this.app.vault.create(path, `---\nnote-type: ${type}\n---\n`);
    await this.addToSection(parent, SECTION_ORDER.find((s) => s.toLowerCase() === type)!, file);
  }

  /* ----------  Section helper ---------- */
  private async addToSection(moc: TFile, section: string, fileToLink: TFile) {
    const lines = (await this.app.vault.read(moc)).split('\n');
    const fmEnd = lines.indexOf('---', 1) + 1;
    let header = lines.findIndex((l) => l.trim() === `## ${section}`);
    if (header === -1) {
      header = fmEnd;
      SECTION_ORDER.slice(0, SECTION_ORDER.indexOf(section as any)).forEach((s) => {
        const idx = lines.findIndex((l) => l.trim() === `## ${s}`);
        if (idx !== -1) header = this.sectionEnd(lines, idx);
      });
      lines.splice(header, 0, `## ${section}`, '', `- [[${fileToLink.basename}]]`, '');
    } else {
      if (!lines.some((l) => l.contains(`[[${fileToLink.basename}]]`))) lines.splice(header + 1, 0, `- [[${fileToLink.basename}]]`);
    }
    await this.app.vault.modify(moc, lines.join('\n'));
  }
  private sectionEnd(lines: string[], start: number) { for (let i = start + 1; i < lines.length; i++) if (lines[i].startsWith('## ')) return i; return lines.length; }

  /* ----------  Prompt helpers ---------- */
  private isPromptIteration(f: TFile) { return f.parent?.name === FOLDERS.Prompts && /v\d+/.test(f.basename); }
  private isPromptHub(f: TFile)       { return f.parent?.name === FOLDERS.Prompts && !/v\d+/.test(f.basename); }

  private async duplicateIteration(iter: TFile) {
    const base = iter.basename.replace(/ v\d+.*/, '').replace(/^🤖\s*/, '');
    const folder = iter.parent!.path;
    const versions = this.app.vault.getMarkdownFiles().filter((f) => f.parent?.path === folder && f.basename.startsWith(base));
    const next = Math.max(...versions.map((f) => Number(f.basename.match(/v(\d+)/)?.[1] ?? 0))) + 1;
    const name = `${NOTE_TYPES.prompt.emoji} ${base} v${next}`;
    await this.app.vault.create(`${folder}/${name}.md`, await this.app.vault.read(iter));
    const hub = versions.find((f) => this.isPromptHub(f));
    if (hub) {
      await this.app.vault.modify(hub, (await this.app.vault.read(hub)).replace(/(## Iterations[\s\S]*?)(\n##|$)/, `$1\n- [[${name}]]$2`));
    }
    new Notice(`Created iteration ${name}`);
  }

  private async openLLMLinks(f: TFile) {
    const match = (await this.app.vault.read(f)).match(/```llm-links\n([\s\S]*?)\n```/);
    if (!match) return new Notice('No llm-links block');
    const links = match[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    links.forEach((l) => window.open(l));
    new Notice(`Opened ${links.length} link(s)`);
  }

  /* ----------  Cleanup ---------- */
  private async cleanup() {
    const files = this.app.vault.getMarkdownFiles().filter((f) => !!fm(this.app, f)['note-type']);
    if (!files.length) return new Notice('Nothing to clean up');
    for (const f of files) await this.app.vault.delete(f);
    new Notice(`Deleted ${files.length} files`);
  }

  /* ----------  Helpers ---------- */
  private isMOC(f: TFile) { return fm(this.app, f).tags?.contains('moc'); }
}