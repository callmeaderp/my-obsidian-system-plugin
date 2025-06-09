import { App, Modal, Notice, Plugin, TFile, TFolder, normalizePath, MarkdownView } from 'obsidian';

interface PluginSettings {
	
}

const DEFAULT_SETTINGS: PluginSettings = {
	
}

const FOLDERS = {
	MOCs: 'MOCs',
	Notes: 'Notes',
	Resources: 'Resources',
	Prompts: 'Prompts'
} as const;

const SECTION_ORDER = ['MOCs', 'Notes', 'Resources', 'Prompts'] as const;
type SectionType = typeof SECTION_ORDER[number];

// Note type configurations with emojis and classes
const NOTE_TYPES = {
	MOCs: { emoji: '🔵', class: 'moc' },
	Notes: { emoji: '📝', class: 'note' },
	Resources: { emoji: '📁', class: 'resource' },
	Prompts: { emoji: '🤖', class: 'prompt' }
} as const;

export default class MOCSystemPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();
		await this.ensureFolderStructure();

		// Main command for context-aware creation
		this.addCommand({
			id: 'moc-context-create',
			name: 'Create MOC or add content',
			callback: () => this.handleContextCreate()
		});

		// Command to duplicate prompt iteration
		this.addCommand({
			id: 'duplicate-prompt-iteration',
			name: 'Duplicate prompt iteration',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.isPromptIteration(activeFile)) {
					if (!checking) {
						this.duplicatePromptIteration(activeFile);
					}
					return true;
				}
				return false;
			}
		});

		// Command to open all LLM links
		this.addCommand({
			id: 'open-llm-links',
			name: 'Open all LLM links',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.isPromptHub(activeFile)) {
					if (!checking) {
						this.openLLMLinks(activeFile);
					}
					return true;
				}
				return false;
			}
		});

		// Command to cleanup all plugin-created files
		this.addCommand({
			id: 'cleanup-moc-system',
			name: 'Cleanup MOC system files',
			callback: () => this.cleanupMOCSystem()
		});

		// Auto-cleanup on file deletion
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.cleanupBrokenLinks(file);
				}
			})
		);

		// Add styling classes based on active file
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateStylingClasses();
			})
		);

		// Add initial styling classes
		this.updateStylingClasses();

		// Add file explorer styling on layout change
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.updateFileExplorerStyling();
			})
		);

		// Update tab classes when tabs change
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				setTimeout(() => this.updateTabStyling(), 100);
			})
		);
	}

	onunload() {
		
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async ensureFolderStructure() {
		for (const folder of Object.values(FOLDERS)) {
			const folderPath = normalizePath(folder);
			if (!this.app.vault.getAbstractFileByPath(folderPath)) {
				try {
					await this.app.vault.createFolder(folderPath);
				} catch (error) {
					// Folder might have been created by another process, ignore if it already exists
					if (!error.message?.includes('Folder already exists')) {
						throw error;
					}
				}
			}
		}
	}

	async handleContextCreate() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile || !this.isMOC(activeFile)) {
			// Not in a MOC, create new MOC
			new CreateMOCModal(this.app, async (name: string) => {
				await this.createMOC(name);
			}).open();
		} else {
			// In a MOC, show options to add content
			new AddToMOCModal(this.app, activeFile, this).open();
		}
	}

	async createMOC(name: string): Promise<TFile> {
		const fileName = `${NOTE_TYPES.MOCs.emoji} ${name} MOC.md`;
		const content = `---\ntags:\n  - moc\nnote-type: moc\n---\n`;
		
		const file = await this.app.vault.create(fileName, content);
		await this.app.workspace.getLeaf().openFile(file);
		new Notice(`Created MOC: ${name}`);
		return file;
	}

	async createSubMOC(parentMOC: TFile, name: string): Promise<TFile> {
		const fileName = `${FOLDERS.MOCs}/${NOTE_TYPES.MOCs.emoji} ${name} MOC.md`;
		const content = `---\ntags:\n  - moc\nnote-type: moc\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'MOCs', file);
		new Notice(`Created sub-MOC: ${name}`);
		return file;
	}

	async createNote(parentMOC: TFile, name: string): Promise<TFile> {
		const fileName = `${FOLDERS.Notes}/${NOTE_TYPES.Notes.emoji} ${name}.md`;
		const content = `---\nnote-type: note\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'Notes', file);
		new Notice(`Created note: ${name}`);
		return file;
	}

	async createResource(parentMOC: TFile, name: string): Promise<TFile> {
		const fileName = `${FOLDERS.Resources}/${NOTE_TYPES.Resources.emoji} ${name}.md`;
		const content = `---\nnote-type: resource\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'Resources', file);
		new Notice(`Created resource: ${name}`);
		return file;
	}

	async createPrompt(parentMOC: TFile, name: string): Promise<TFile> {
		// Create prompt hub
		const hubFileName = `${FOLDERS.Prompts}/${NOTE_TYPES.Prompts.emoji} ${name}.md`;
		const hubContent = `---\nnote-type: prompt\n---\n\n# ${name}\n\n## Iterations\n\n- [[${NOTE_TYPES.Prompts.emoji} ${name} v1]]\n\n## LLM Links\n\n\`\`\`llm-links\n\n\`\`\`\n`;
		
		const hubFile = await this.app.vault.create(normalizePath(hubFileName), hubContent);
		
		// Create first iteration
		const iterationFileName = `${FOLDERS.Prompts}/${NOTE_TYPES.Prompts.emoji} ${name} v1.md`;
		const iterationContent = `---\nnote-type: prompt\n---\n`;
		await this.app.vault.create(normalizePath(iterationFileName), iterationContent);
		
		await this.addToMOCSection(parentMOC, 'Prompts', hubFile);
		new Notice(`Created prompt: ${name}`);
		return hubFile;
	}

	async addToMOCSection(moc: TFile, section: SectionType, newFile: TFile) {
		const content = await this.app.vault.read(moc);
		const lines = content.split('\n');
		
		// Find or create section
		let sectionIndex = -1;
		let insertIndex = lines.length;
		
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === `## ${section}`) {
				sectionIndex = i;
				break;
			}
		}
		
		if (sectionIndex === -1) {
			// Section doesn't exist, find where to insert it
			const currentSectionIndices: Map<SectionType, number> = new Map();
			
			// Find existing sections
			for (let i = 0; i < lines.length; i++) {
				for (const sectionName of SECTION_ORDER) {
					if (lines[i].trim() === `## ${sectionName}`) {
						currentSectionIndices.set(sectionName, i);
					}
				}
			}
			
			// Find where to insert new section
			insertIndex = lines.length;
			for (let i = SECTION_ORDER.indexOf(section) + 1; i < SECTION_ORDER.length; i++) {
				if (currentSectionIndices.has(SECTION_ORDER[i])) {
					insertIndex = currentSectionIndices.get(SECTION_ORDER[i])!;
					break;
				}
			}
			
			// Insert section header
			const newSection = [`## ${section}`, '', `- [[${newFile.basename}]]`, ''];
			lines.splice(insertIndex, 0, ...newSection);
		} else {
			// Section exists, add link to it
			let linkInsertIndex = sectionIndex + 1;
			
			// Skip empty lines after header
			while (linkInsertIndex < lines.length && lines[linkInsertIndex].trim() === '') {
				linkInsertIndex++;
			}
			
			// Find end of section
			while (linkInsertIndex < lines.length && 
				   !lines[linkInsertIndex].startsWith('## ') && 
				   lines[linkInsertIndex].trim() !== '') {
				linkInsertIndex++;
			}
			
			// Insert before empty line or next section
			lines.splice(linkInsertIndex, 0, `- [[${newFile.basename}]]`);
		}
		
		await this.app.vault.modify(moc, lines.join('\n'));
	}

	async duplicatePromptIteration(file: TFile) {
		// Handle both old format (without emoji) and new format (with emoji)
		const match = file.basename.match(/^(?:🤖\s+)?(.+?)\s*v(\d+)(?:\s*-\s*(.+))?$/);
		if (!match) return;
		
		const [, baseName, currentVersion] = match;
		
		// Find all iterations to get next available version
		const promptFiles = this.app.vault.getMarkdownFiles()
			.filter(f => f.path.startsWith(FOLDERS.Prompts) && (
				f.basename.includes(baseName) && f.basename.includes('v')
			));
		
		let maxVersion = 0;
		for (const pFile of promptFiles) {
			const vMatch = pFile.basename.match(/v(\d+)/);
			if (vMatch) {
				maxVersion = Math.max(maxVersion, parseInt(vMatch[1]));
			}
		}
		
		const nextVersion = maxVersion + 1;
		
		// Ask for description
		new PromptDescriptionModal(this.app, async (description: string) => {
			const newName = description 
				? `${NOTE_TYPES.Prompts.emoji} ${baseName} v${nextVersion} - ${description}`
				: `${NOTE_TYPES.Prompts.emoji} ${baseName} v${nextVersion}`;
			
			const newPath = `${FOLDERS.Prompts}/${newName}.md`;
			const originalContent = await this.app.vault.read(file);
			// Add frontmatter if it doesn't exist
			const content = originalContent.startsWith('---') 
				? originalContent 
				: `---\nnote-type: prompt\n---\n\n${originalContent}`;
			
			const newFile = await this.app.vault.create(normalizePath(newPath), content);
			
			// Update hub file
			await this.updatePromptHub(baseName, newFile);
			
			await this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Created iteration: ${newName}`);
		}).open();
	}

	async updatePromptHub(baseName: string, newIteration: TFile) {
		const hubPath = `${FOLDERS.Prompts}/${NOTE_TYPES.Prompts.emoji} ${baseName}.md`;
		const hubFile = this.app.vault.getAbstractFileByPath(normalizePath(hubPath));
		
		if (hubFile instanceof TFile) {
			const content = await this.app.vault.read(hubFile);
			const lines = content.split('\n');
			
			// Find iterations section
			let iterIndex = -1;
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === '## Iterations') {
					iterIndex = i;
					break;
				}
			}
			
			if (iterIndex !== -1) {
				// Find where to insert
				let insertIndex = iterIndex + 1;
				while (insertIndex < lines.length && 
					   !lines[insertIndex].startsWith('## ') && 
					   lines[insertIndex].trim() !== '') {
					insertIndex++;
				}
				
				// Insert before empty line or next section
				lines.splice(insertIndex, 0, `- [[${newIteration.basename}]]`);
				await this.app.vault.modify(hubFile, lines.join('\n'));
			}
		}
	}

	async openLLMLinks(file: TFile) {
		const content = await this.app.vault.read(file);
		const linkBlockMatch = content.match(/```llm-links\n([\s\S]*?)\n```/);
		
		if (linkBlockMatch) {
			const links = linkBlockMatch[1]
				.split('\n')
				.map(line => line.trim())
				.filter(line => line.startsWith('http'));
			
			if (links.length === 0) {
				new Notice('No links found in llm-links block');
				return;
			}
			
			// Open all links
			for (const link of links) {
				window.open(link, '_blank');
			}
			
			new Notice(`Opened ${links.length} links`);
		} else {
			new Notice('No llm-links block found');
		}
	}

	async cleanupBrokenLinks(deletedFile: TFile) {
		const allFiles = this.app.vault.getMarkdownFiles();
		
		for (const file of allFiles) {
			const content = await this.app.vault.read(file);
			const linkPattern = new RegExp(`\\[\\[${deletedFile.basename}\\]\\]`, 'g');
			
			if (linkPattern.test(content)) {
				const lines = content.split('\n');
				const newLines = lines.filter(line => !line.includes(`[[${deletedFile.basename}]]`));
				
				if (lines.length !== newLines.length) {
					await this.app.vault.modify(file, newLines.join('\n'));
				}
			}
		}
	}

	async cleanupMOCSystem() {
		// Find all files created by the plugin
		const allFiles = this.app.vault.getMarkdownFiles();
		const pluginFiles: TFile[] = [];

		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			const noteType = cache?.frontmatter?.['note-type'];
			
			// Check if file has note-type metadata (indicates plugin creation)
			if (noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType)) {
				pluginFiles.push(file);
			}
		}

		if (pluginFiles.length === 0) {
			new Notice('No MOC system files found to cleanup');
			return;
		}

		// Show confirmation modal
		new CleanupConfirmationModal(this.app, pluginFiles, async () => {
			let deletedCount = 0;

			// Delete all plugin files
			for (const file of pluginFiles) {
				try {
					await this.app.vault.delete(file);
					deletedCount++;
				} catch (error) {
					console.error(`Failed to delete ${file.path}:`, error);
				}
			}

			// Clean up empty plugin folders
			await this.cleanupEmptyPluginFolders();

			new Notice(`Cleanup complete! Deleted ${deletedCount} files.`);
		}).open();
	}

	async cleanupEmptyPluginFolders() {
		for (const folderName of Object.values(FOLDERS)) {
			const folder = this.app.vault.getAbstractFileByPath(folderName);
			if (folder instanceof TFolder) {
				// Check if folder is empty
				if (folder.children.length === 0) {
					try {
						await this.app.vault.delete(folder);
					} catch (error) {
						// Folder might not be empty or might have been deleted already
						console.log(`Could not delete folder ${folderName}:`, error);
					}
				}
			}
		}
	}

	isMOC(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.tags?.includes('moc') ?? false;
	}

	isPromptIteration(file: TFile): boolean {
		return file.path.startsWith(FOLDERS.Prompts) && /v\d+/.test(file.basename);
	}

	isPromptHub(file: TFile): boolean {
		return file.path.startsWith(FOLDERS.Prompts) && !this.isPromptIteration(file);
	}

	getNoteType(file: TFile): string | null {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.['note-type'] ?? null;
	}

	getFileDisplayType(file: TFile): string {
		const noteType = this.getNoteType(file);
		if (noteType) {
			if (noteType === 'prompt') {
				// Differentiate between prompt hubs and iterations
				return this.isPromptIteration(file) ? 'prompt-iteration' : 'prompt-hub';
			}
			return noteType;
		}
		
		// Fallback for MOCs without proper metadata
		if (this.isMOC(file)) {
			return 'moc';
		}
		
		return 'unknown';
	}

	updateStylingClasses() {
		const activeFile = this.app.workspace.getActiveFile();
		
		// Remove all existing note type classes
		document.body.classList.remove('smart-note-group', 'smart-note-note', 'smart-note-prompt', 'smart-note-resource', 'smart-note-prompt-hub', 'smart-note-prompt-iteration');
		
		if (activeFile) {
			const displayType = this.getFileDisplayType(activeFile);
			if (displayType === 'moc') {
				document.body.classList.add('smart-note-group');
			} else if (displayType !== 'unknown') {
				document.body.classList.add(`smart-note-${displayType}`);
			}
		}
	}

	updateFileExplorerStyling() {
		// Add data attributes to file explorer items for CSS targeting
		const fileItems = document.querySelectorAll('.nav-file-title');
		fileItems.forEach((item: HTMLElement) => {
			const path = item.getAttribute('data-path');
			if (path) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const displayType = this.getFileDisplayType(file);
					if (displayType === 'moc') {
						item.setAttribute('data-smart-note-type', 'group');
					} else if (displayType !== 'unknown') {
						item.setAttribute('data-smart-note-type', displayType);
					}
				}
			}
		});
	}

	updateTabStyling() {
		// Add classes to tab headers for CSS targeting
		const tabHeaders = document.querySelectorAll('.workspace-tab-header');
		tabHeaders.forEach((tab: HTMLElement) => {
			// Remove existing classes
			tab.classList.remove('smart-note-tab-group', 'smart-note-tab-note', 'smart-note-tab-prompt', 'smart-note-tab-resource', 'smart-note-tab-prompt-hub', 'smart-note-tab-prompt-iteration');
			tab.removeAttribute('data-smart-note-type');
			
			const ariaLabel = tab.getAttribute('aria-label');
			if (ariaLabel) {
				const file = this.app.vault.getAbstractFileByPath(ariaLabel);
				if (file instanceof TFile) {
					const displayType = this.getFileDisplayType(file);
					if (displayType === 'moc') {
						tab.classList.add('smart-note-tab-group');
						tab.setAttribute('data-smart-note-type', 'group');
					} else if (displayType !== 'unknown') {
						tab.classList.add(`smart-note-tab-${displayType}`);
						tab.setAttribute('data-smart-note-type', displayType);
					}
				}
			}
		});
	}
}

class CreateMOCModal extends Modal {
	constructor(app: App, private onSubmit: (name: string) => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create new MOC' });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'MOC name...'
		});
		inputEl.style.width = '100%';
		inputEl.focus();

		inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && inputEl.value) {
				this.onSubmit(inputEl.value);
				this.close();
			}
		});

		const buttonEl = contentEl.createEl('button', { text: 'Create' });
		buttonEl.addEventListener('click', () => {
			if (inputEl.value) {
				this.onSubmit(inputEl.value);
				this.close();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class AddToMOCModal extends Modal {
	constructor(
		app: App, 
		private moc: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Add to MOC' });

		const options: Array<{ type: SectionType, label: string }> = [
			{ type: 'MOCs', label: 'Sub-MOC' },
			{ type: 'Notes', label: 'Note' },
			{ type: 'Resources', label: 'Resource' },
			{ type: 'Prompts', label: 'Prompt' }
		];

		options.forEach(option => {
			const button = contentEl.createEl('button', { 
				text: `Create ${option.label}`,
				cls: 'mod-cta'
			});
			button.style.display = 'block';
			button.style.width = '100%';
			button.style.marginBottom = '10px';
			
			button.addEventListener('click', () => {
				this.close();
				new CreateItemModal(this.app, option.label, async (name: string) => {
					switch (option.type) {
						case 'MOCs':
							await this.plugin.createSubMOC(this.moc, name);
							break;
						case 'Notes':
							await this.plugin.createNote(this.moc, name);
							break;
						case 'Resources':
							await this.plugin.createResource(this.moc, name);
							break;
						case 'Prompts':
							await this.plugin.createPrompt(this.moc, name);
							break;
					}
				}).open();
			});
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CreateItemModal extends Modal {
	constructor(
		app: App,
		private itemType: string,
		private onSubmit: (name: string) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: `Create ${this.itemType}` });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: `${this.itemType} name...`
		});
		inputEl.style.width = '100%';
		inputEl.focus();

		inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && inputEl.value) {
				this.onSubmit(inputEl.value);
				this.close();
			}
		});

		const buttonEl = contentEl.createEl('button', { text: 'Create' });
		buttonEl.addEventListener('click', () => {
			if (inputEl.value) {
				this.onSubmit(inputEl.value);
				this.close();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class PromptDescriptionModal extends Modal {
	constructor(app: App, private onSubmit: (description: string) => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Add iteration description (optional)' });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Description (optional)...'
		});
		inputEl.style.width = '100%';
		inputEl.focus();

		const submitFn = () => {
			this.onSubmit(inputEl.value);
			this.close();
		};

		inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				submitFn();
			}
		});

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '10px';

		const skipButton = buttonContainer.createEl('button', { text: 'Skip' });
		skipButton.addEventListener('click', () => {
			this.onSubmit('');
			this.close();
		});

		const addButton = buttonContainer.createEl('button', { 
			text: 'Add Description',
			cls: 'mod-cta'
		});
		addButton.addEventListener('click', submitFn);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CleanupConfirmationModal extends Modal {
	constructor(
		app: App, 
		private filesToDelete: TFile[],
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Cleanup MOC System Files' });

		contentEl.createEl('p', { 
			text: `This will permanently delete ${this.filesToDelete.length} files created by the MOC System Plugin.`
		});

		if (this.filesToDelete.length > 0) {
			contentEl.createEl('p', { text: 'Files to be deleted:' });
			const fileList = contentEl.createEl('ul');
			fileList.style.maxHeight = '200px';
			fileList.style.overflowY = 'auto';
			fileList.style.border = '1px solid var(--background-modifier-border)';
			fileList.style.padding = '10px';
			fileList.style.marginBottom = '15px';

			for (const file of this.filesToDelete) {
				fileList.createEl('li', { text: file.path });
			}
		}

		contentEl.createEl('p', { 
			text: 'This action cannot be undone.',
			cls: 'mod-warning'
		});

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '15px';

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		const confirmButton = buttonContainer.createEl('button', { 
			text: 'Delete All Files',
			cls: 'mod-warning'
		});
		confirmButton.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}