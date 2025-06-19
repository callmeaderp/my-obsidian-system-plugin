import { App, Modal, Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian';

type PluginSettings = Record<string, never>;

const DEFAULT_SETTINGS: PluginSettings = {}

const FOLDERS = {
	MOCs: 'MOCs',
	Notes: 'Notes',
	Resources: 'Resources',
	Prompts: 'Prompts'
} as const;

const SECTION_ORDER = ['MOCs', 'Notes', 'Resources', 'Prompts'] as const;
type SectionType = typeof SECTION_ORDER[number];

// Legacy color mappings for backward compatibility with old emoji-based system
const LEGACY_EMOJI_TO_COLOR: { [key: string]: string } = {
	'🔴': 'red',
	'🟠': 'orange', 
	'🟡': 'yellow',
	'🟢': 'green',
	'🔵': 'blue',
	'🟣': 'purple',
	'🟤': 'brown',
	'⚫': 'gray',
	'🔺': 'rose'
};

const LEGACY_COLORS = [
	{ lightColor: '#dc2626', darkColor: '#ef4444', name: 'red' },
	{ lightColor: '#ea580c', darkColor: '#fb923c', name: 'orange' },
	{ lightColor: '#ca8a04', darkColor: '#eab308', name: 'yellow' },
	{ lightColor: '#16a34a', darkColor: '#4ade80', name: 'green' },
	{ lightColor: '#2563eb', darkColor: '#60a5fa', name: 'blue' },
	{ lightColor: '#9333ea', darkColor: '#a855f7', name: 'purple' },
	{ lightColor: '#a16207', darkColor: '#d97706', name: 'brown' },
	{ lightColor: '#374151', darkColor: '#6b7280', name: 'gray' },
	{ lightColor: '#be123c', darkColor: '#f43f5e', name: 'rose' }
] as const;

// Note type configurations with emojis and classes
const NOTE_TYPES = {
	MOCs: { emoji: '🔵', class: 'moc' }, // Default for sub-MOCs
	Notes: { emoji: '📝', class: 'note' },
	Resources: { emoji: '📁', class: 'resource' },
	Prompts: { emoji: '🤖', class: 'prompt' }
} as const;

// Interfaces for vault update system
interface UpdateResult {
	file: TFile;
	changes: string[];
	success: boolean;
	error?: string;
}

interface VaultUpdatePlan {
	filesToUpdate: TFile[];
	updateSummary: Map<TFile, string[]>;
	totalChanges: number;
}

export default class MOCSystemPlugin extends Plugin {
	settings: PluginSettings;
	private tabObserver: MutationObserver | null = null;

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

		// Test command for random system (development only)
		this.addCommand({
			id: 'test-random-system',
			name: 'Test random emoji and color system',
			callback: () => this.testRandomSystem()
		});

		// Debug command for file explorer styling (development only)
		this.addCommand({
			id: 'debug-file-explorer',
			name: 'Debug file explorer styling',
			callback: () => this.debugFileExplorerStyling()
		});


		// Command to update vault to latest system version
		this.addCommand({
			id: 'update-vault-system',
			name: 'Update vault to latest system',
			callback: () => this.updateVaultToLatestSystem()
		});

		// Command to reorganize MOCs
		this.addCommand({
			id: 'reorganize-moc',
			name: 'Reorganize MOC',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.isMOC(activeFile)) {
					if (!checking) {
						this.reorganizeMOC(activeFile);
					}
					return true;
				}
				return false;
			}
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
		
		// Add initial tab styling
		console.log('🔍 [EVENT DEBUG] Scheduling initial tab styling');
		setTimeout(() => {
			console.log('🔍 [EVENT DEBUG] Running initial tab styling');
			this.updateTabStyling();
		}, 200);

		// Add file explorer styling on layout change and file changes
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.updateFileExplorerStyling();
			})
		);
		
		// Update file explorer when files are created/renamed/moved
		this.registerEvent(
			this.app.vault.on('create', () => {
				setTimeout(() => this.updateFileExplorerStyling(), 100);
			})
		);
		
		this.registerEvent(
			this.app.vault.on('rename', () => {
				setTimeout(() => this.updateFileExplorerStyling(), 100);
			})
		);

		// Update tab classes when tabs change - multiple events to catch all tab updates
		this.registerEvent(
			this.app.workspace.on('file-open', () => {
				console.log('🔍 [EVENT DEBUG] file-open event triggered');
				setTimeout(() => this.updateTabStyling(), 100);
			})
		);
		
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				console.log('🔍 [EVENT DEBUG] layout-change event triggered');
				setTimeout(() => this.updateTabStyling(), 100);
			})
		);
		
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				console.log('🔍 [EVENT DEBUG] active-leaf-change event triggered');
				setTimeout(() => this.updateTabStyling(), 50);
			})
		);
		
		// Add mutation observer to catch tab DOM changes that events might miss
		this.tabObserver = new MutationObserver((mutations) => {
			console.log('🔍 [EVENT DEBUG] MutationObserver triggered', mutations.length, 'mutations');
			this.updateTabStyling();
		});
		
		// Observe the workspace container for tab changes
		const workspaceEl = document.querySelector('.mod-root .workspace');
		if (workspaceEl) {
			this.tabObserver.observe(workspaceEl, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['aria-label']
			});
		}
	}

	onunload() {
		// Clean up mutation observer
		if (this.tabObserver) {
			this.tabObserver.disconnect();
			this.tabObserver = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Legacy method - kept for backward compatibility but not used with new folder structure
	async ensureFolderStructure() {
		// No longer needed with new MOC folder structure
		// Each MOC has its own folder structure created on demand
	}
	
	// Create folder structure for a MOC
	async ensureMOCFolderStructure(mocFolderPath: string) {
		// Create the main MOC folder
		if (!this.app.vault.getAbstractFileByPath(mocFolderPath)) {
			await this.app.vault.createFolder(mocFolderPath);
		}
		
		// Create subfolders for Notes, Resources, and Prompts
		for (const folder of ['Notes', 'Resources', 'Prompts']) {
			const subfolderPath = `${mocFolderPath}/${folder}`;
			if (!this.app.vault.getAbstractFileByPath(subfolderPath)) {
				try {
					await this.app.vault.createFolder(subfolderPath);
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
		// Get random emoji and color for this root MOC
		const randomEmoji = this.getRandomEmoji();
		const randomColor = this.generateRandomColor();
		
		// Create folder for the MOC
		const mocFolderPath = `${randomEmoji} ${name} MOC`;
		const mocFilePath = `${mocFolderPath}/${randomEmoji} ${name} MOC.md`;
		
		// Ensure the MOC folder and subfolders exist
		await this.ensureMOCFolderStructure(mocFolderPath);
		
		const content = `---\ntags:\n  - moc\nnote-type: moc\nroot-moc-color: ${randomColor.hex}\nroot-moc-light-color: ${randomColor.lightColor}\nroot-moc-dark-color: ${randomColor.darkColor}\n---\n`;
		
		const file = await this.app.vault.create(mocFilePath, content);
		await this.app.workspace.getLeaf().openFile(file);
		new Notice(`Created MOC: ${name}`);
		return file;
	}

	async createSubMOC(parentMOC: TFile, name: string): Promise<TFile> {
		// Get random emoji and color for sub-MOCs too
		const randomEmoji = this.getRandomEmoji();
		const randomColor = this.generateRandomColor();
		
		// Get parent MOC folder path
		const parentFolder = parentMOC.parent?.path || '';
		
		// Create sub-MOC folder path
		const subMocFolderPath = `${parentFolder}/${randomEmoji} ${name} MOC`;
		const subMocFilePath = `${subMocFolderPath}/${randomEmoji} ${name} MOC.md`;
		
		// Ensure the sub-MOC folder and subfolders exist
		await this.ensureMOCFolderStructure(subMocFolderPath);
		
		const content = `---\ntags:\n  - moc\nnote-type: moc\nroot-moc-color: ${randomColor.hex}\nroot-moc-light-color: ${randomColor.lightColor}\nroot-moc-dark-color: ${randomColor.darkColor}\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(subMocFilePath), content);
		await this.addToMOCSection(parentMOC, 'MOCs', file);
		new Notice(`Created sub-MOC: ${name}`);
		return file;
	}

	async createNote(parentMOC: TFile, name: string): Promise<TFile> {
		// Get parent MOC folder path
		const parentFolder = parentMOC.parent?.path || '';
		
		const fileName = `${parentFolder}/${FOLDERS.Notes}/${NOTE_TYPES.Notes.emoji} ${name}.md`;
		const content = `---\nnote-type: note\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'Notes', file);
		new Notice(`Created note: ${name}`);
		return file;
	}

	async createResource(parentMOC: TFile, name: string): Promise<TFile> {
		// Get parent MOC folder path
		const parentFolder = parentMOC.parent?.path || '';
		
		const fileName = `${parentFolder}/${FOLDERS.Resources}/${NOTE_TYPES.Resources.emoji} ${name}.md`;
		const content = `---\nnote-type: resource\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'Resources', file);
		new Notice(`Created resource: ${name}`);
		return file;
	}

	async createPrompt(parentMOC: TFile, name: string): Promise<TFile> {
		// Get parent MOC folder path
		const parentFolder = parentMOC.parent?.path || '';
		
		// Create prompt hub
		const hubFileName = `${parentFolder}/${FOLDERS.Prompts}/${NOTE_TYPES.Prompts.emoji} ${name}.md`;
		const hubContent = `---\nnote-type: prompt\n---\n\n# ${name}\n\n## Iterations\n\n- [[${NOTE_TYPES.Prompts.emoji} ${name} v1]]\n\n## LLM Links\n\n\`\`\`llm-links\n\n\`\`\`\n`;
		
		const hubFile = await this.app.vault.create(normalizePath(hubFileName), hubContent);
		
		// Create first iteration
		const iterationFileName = `${parentFolder}/${FOLDERS.Prompts}/${NOTE_TYPES.Prompts.emoji} ${name} v1.md`;
		const iterationContent = `---\nnote-type: prompt\n---\n`;
		await this.app.vault.create(normalizePath(iterationFileName), iterationContent);
		
		await this.addToMOCSection(parentMOC, 'Prompts', hubFile);
		new Notice(`Created prompt: ${name}`);
		return hubFile;
	}

	async addToMOCSection(moc: TFile, section: SectionType, newFile: TFile) {
		const content = await this.app.vault.read(moc);
		const lines = content.split('\n');
		
		// Find frontmatter bounds
		let frontmatterEnd = 0;
		if (lines[0] === '---') {
			for (let i = 1; i < lines.length; i++) {
				if (lines[i] === '---') {
					frontmatterEnd = i + 1;
					break;
				}
			}
		}
		
		// Find existing plugin sections and reorganize content if needed
		const { reorganizedLines, sectionIndices } = this.reorganizeContentForPluginSections(lines, frontmatterEnd);
		
		// Find or create section in reorganized content
		let sectionIndex = -1;
		for (const [sectionName, index] of sectionIndices) {
			if (sectionName === section) {
				sectionIndex = index;
				break;
			}
		}
		
		if (sectionIndex === -1) {
			// Section doesn't exist, find where to insert it according to SECTION_ORDER
			let insertIndex = frontmatterEnd;
			
			// Find correct position based on section order
			const currentSectionIndex = SECTION_ORDER.indexOf(section);
			for (let i = currentSectionIndex + 1; i < SECTION_ORDER.length; i++) {
				if (sectionIndices.has(SECTION_ORDER[i])) {
					const sectionIndex = sectionIndices.get(SECTION_ORDER[i]);
				if (sectionIndex !== undefined) {
					insertIndex = sectionIndex;
				}
					break;
				}
			}
			
			// If no later sections found, insert after last plugin section
			if (insertIndex === frontmatterEnd && sectionIndices.size > 0) {
				const lastSectionIndex = Math.max(...Array.from(sectionIndices.values()));
				// Find the end of the last section
				insertIndex = this.findSectionEnd(reorganizedLines, lastSectionIndex);
			}
			
			// Insert section header with proper spacing
			const newSection = [`## ${section}`, '', `- [[${newFile.basename}]]`, ''];
			reorganizedLines.splice(insertIndex, 0, ...newSection);
		} else {
			// Section exists, add link to it
			let linkInsertIndex = sectionIndex + 1;
			
			// Skip empty lines after header
			while (linkInsertIndex < reorganizedLines.length && reorganizedLines[linkInsertIndex].trim() === '') {
				linkInsertIndex++;
			}
			
			// Find where to insert among plugin-managed links
			let lastPluginLinkIndex = linkInsertIndex - 1;
			while (linkInsertIndex < reorganizedLines.length) {
				const line = reorganizedLines[linkInsertIndex].trim();
				
				// Stop at next section
				if (line.startsWith('## ')) {
					break;
				}
				
				// If it's a plugin link, track it
				if (line.match(/^-\s*\[\[.+\]\]$/)) {
					lastPluginLinkIndex = linkInsertIndex;
					linkInsertIndex++;
					continue;
				}
				
				// Stop at user content (non-empty, non-link lines)
				if (line !== '') {
					break;
				}
				
				// Skip empty lines to find more plugin links
				linkInsertIndex++;
			}
			
			// Insert right after the last plugin link (no blank lines between plugin links)
			reorganizedLines.splice(lastPluginLinkIndex + 1, 0, `- [[${newFile.basename}]]`);
		}
		
		await this.app.vault.modify(moc, reorganizedLines.join('\n'));
	}

	private reorganizeContentForPluginSections(lines: string[], frontmatterEnd: number): { reorganizedLines: string[], sectionIndices: Map<SectionType, number> } {
		const sectionIndices: Map<SectionType, number> = new Map();
		const pluginSections: Array<{name: SectionType, startIndex: number, endIndex: number}> = [];
		
		// Find all existing plugin sections
		for (let i = frontmatterEnd; i < lines.length; i++) {
			for (const sectionName of SECTION_ORDER) {
				if (lines[i].trim() === `## ${sectionName}`) {
					const startIndex = i;
					const endIndex = this.findSectionEnd(lines, i);
					pluginSections.push({ name: sectionName, startIndex, endIndex });
					break;
				}
			}
		}
		
		if (pluginSections.length === 0) {
			// No plugin sections exist, return as-is
			return { reorganizedLines: [...lines], sectionIndices };
		}
		
		// Extract plugin sections and other content
		const extractedSections: string[][] = [];
		const otherContent: string[] = [];
		let lastProcessedIndex = frontmatterEnd;
		
		// Sort sections by their start index
		pluginSections.sort((a, b) => a.startIndex - b.startIndex);
		
		for (const section of pluginSections) {
			// Add content before this section to other content
			if (section.startIndex > lastProcessedIndex) {
				otherContent.push(...lines.slice(lastProcessedIndex, section.startIndex));
			}
			
			// Extract the section
			extractedSections.push(lines.slice(section.startIndex, section.endIndex));
			lastProcessedIndex = section.endIndex;
		}
		
		// Add any remaining content after the last section
		if (lastProcessedIndex < lines.length) {
			otherContent.push(...lines.slice(lastProcessedIndex));
		}
		
		// Rebuild the file: frontmatter + plugin sections (in order) + other content
		const reorganizedLines: string[] = [];
		
		// Add frontmatter
		reorganizedLines.push(...lines.slice(0, frontmatterEnd));
		
		// Add plugin sections in proper order
		for (const sectionName of SECTION_ORDER) {
			const sectionData = pluginSections.find(s => s.name === sectionName);
			if (sectionData) {
				const correspondingExtraction = extractedSections[pluginSections.indexOf(sectionData)];
				sectionIndices.set(sectionName, reorganizedLines.length);
				reorganizedLines.push(...correspondingExtraction);
			}
		}
		
		// Add other content at the end
		if (otherContent.length > 0) {
			// Ensure there's a blank line before other content if plugin sections exist
			if (reorganizedLines.length > frontmatterEnd && otherContent[0]?.trim() !== '') {
				reorganizedLines.push('');
			}
			reorganizedLines.push(...otherContent);
		}
		
		return { reorganizedLines, sectionIndices };
	}

	private findSectionEnd(lines: string[], sectionStartIndex: number): number {
		for (let i = sectionStartIndex + 1; i < lines.length; i++) {
			if (lines[i].trim().startsWith('## ')) {
				return i;
			}
		}
		return lines.length;
	}

	private findPluginSectionInsertPoint(lines: string[], frontmatterEnd: number): number {
		// Look for the first section-like header or end of initial content
		for (let i = frontmatterEnd; i < lines.length; i++) {
			// If we find any section header, insert before it
			if (lines[i].trim().startsWith('## ')) {
				return i;
			}
		}
		
		// No sections found, insert at end
		return lines.length;
	}

	async duplicatePromptIteration(file: TFile) {
		// Handle both old format (without emoji) and new format (with emoji)
		const match = file.basename.match(/^(?:🤖\s+)?(.+?)\s*v(\d+)(?:\s*-\s*(.+))?$/);
		if (!match) return;
		
		const [, baseName] = match;
		
		// Get the parent folder (should be a Prompts folder within a MOC folder)
		const promptsFolder = file.parent?.path || '';
		
		// Find all iterations in the same folder to get next available version
		const promptFiles = this.app.vault.getMarkdownFiles()
			.filter(f => {
				// Check if file is in the same Prompts folder
				if (f.parent?.path !== promptsFolder) return false;
				// Check if it's an iteration of the same prompt
				return f.basename.includes(baseName) && f.basename.includes('v');
			});
		
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
			
			// Create in the same Prompts folder as the original
			const newPath = `${promptsFolder}/${newName}.md`;
			const originalContent = await this.app.vault.read(file);
			// Add frontmatter if it doesn't exist
			const content = originalContent.startsWith('---') 
				? originalContent 
				: `---\nnote-type: prompt\n---\n\n${originalContent}`;
			
			const newFile = await this.app.vault.create(normalizePath(newPath), content);
			
			// Update hub file (look in the same folder)
			await this.updatePromptHub(baseName, newFile, promptsFolder);
			
			await this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Created iteration: ${newName}`);
		}).open();
	}

	async updatePromptHub(baseName: string, newIteration: TFile, promptsFolder?: string) {
		// If promptsFolder is provided, use it; otherwise fall back to old global folder (for backward compatibility)
		const folder = promptsFolder || FOLDERS.Prompts;
		const hubPath = `${folder}/${NOTE_TYPES.Prompts.emoji} ${baseName}.md`;
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
				const newLines: string[] = [];
				let removedLinkIndex = -1;
				
				// First pass: remove lines with the broken link and track where they were
				for (let i = 0; i < lines.length; i++) {
					if (lines[i].includes(`[[${deletedFile.basename}]]`)) {
						removedLinkIndex = i;
					} else {
						newLines.push(lines[i]);
					}
				}
				
				// Second pass: clean up orphaned blank lines in plugin sections
				if (removedLinkIndex !== -1) {
					const cleanedLines = this.cleanupOrphanedBlankLines(newLines, file);
					if (lines.length !== cleanedLines.length || lines.join('\n') !== cleanedLines.join('\n')) {
						await this.app.vault.modify(file, cleanedLines.join('\n'));
					}
				} else if (lines.length !== newLines.length) {
					// No cleanup needed, just save if changed
					await this.app.vault.modify(file, newLines.join('\n'));
				}
			}
		}
	}

	private cleanupOrphanedBlankLines(lines: string[], file: TFile): string[] {
		// Only cleanup blank lines in MOCs
		if (!this.isMOC(file)) {
			return lines;
		}
		
		const result: string[] = [];
		let inPluginSection = false;
		let sectionHasContent = false;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();
			
			// Check if we're entering a plugin section
			if (trimmedLine.startsWith('## ') && SECTION_ORDER.includes(trimmedLine.substring(3) as SectionType)) {
				inPluginSection = true;
				sectionHasContent = false;
				result.push(line);
				continue;
			}
			
			// Check if we're leaving a plugin section
			if (trimmedLine.startsWith('## ') && !SECTION_ORDER.includes(trimmedLine.substring(3) as SectionType)) {
				inPluginSection = false;
			}
			
			// In plugin section: only keep blank lines if there's content after them
			if (inPluginSection) {
				if (trimmedLine === '') {
					// Look ahead to see if there's content coming
					let hasContentAfter = false;
					for (let j = i + 1; j < lines.length; j++) {
						const nextLine = lines[j].trim();
						if (nextLine.startsWith('## ')) {
							break;
						}
						if (nextLine !== '') {
							hasContentAfter = true;
							break;
						}
					}
					// Only keep the blank line if we have content in the section and content after
					if (sectionHasContent && hasContentAfter) {
						result.push(line);
					}
				} else {
					// Non-blank line in plugin section
					sectionHasContent = true;
					result.push(line);
				}
			} else {
				// Outside plugin sections, keep everything
				result.push(line);
			}
		}
		
		return result;
	}

	debugFileExplorerStyling() {
		console.log('🔍 [FILE EXPLORER DEBUG] ===== Starting file explorer debug =====');
		
		// Find all MOC files
		const allMOCs = this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
		console.log(`🔍 [FILE EXPLORER DEBUG] Found ${allMOCs.length} MOC files:`, allMOCs.map(f => f.basename));
		
		// Check what file explorer items exist
		const fileItems = document.querySelectorAll('.nav-file-title');
		console.log(`🔍 [FILE EXPLORER DEBUG] Found ${fileItems.length} file explorer items`);
		
		// Check each MOC file's styling
		allMOCs.forEach((file, index) => {
			console.log(`🔍 [FILE EXPLORER DEBUG] --- Checking MOC ${index + 1}: "${file.basename}" ---`);
			
			const isRootMOC = this.isRootMOC(file);
			console.log(`🔍 [FILE EXPLORER DEBUG] Is root MOC: ${isRootMOC}`);
			
			if (isRootMOC) {
				const color = this.getRootMOCColor(file);
				console.log(`🔍 [FILE EXPLORER DEBUG] Root MOC color:`, color);
				
				// Find the corresponding DOM element
				const correspondingItem = Array.from(fileItems).find(item => 
					item.getAttribute('data-path') === file.path
				);
				
				if (correspondingItem) {
					console.log(`🔍 [FILE EXPLORER DEBUG] Found DOM element for ${file.basename}`);
					const attributes = {
						'data-path': correspondingItem.getAttribute('data-path'),
						'data-smart-note-type': correspondingItem.getAttribute('data-smart-note-type'),
						'data-root-moc-color': correspondingItem.getAttribute('data-root-moc-color'),
						'data-root-moc-random-color': correspondingItem.getAttribute('data-root-moc-random-color')
					};
					console.log(`🔍 [FILE EXPLORER DEBUG] DOM attributes:`, attributes);
					
					// Check computed styles
					const computedStyle = window.getComputedStyle(correspondingItem);
					console.log(`🔍 [FILE EXPLORER DEBUG] Computed styles:`, {
						color: computedStyle.color,
						fontWeight: computedStyle.fontWeight,
						backgroundColor: computedStyle.backgroundColor
					});
					
					// Check for CSS rules that might apply
					if (color.name.startsWith('#')) {
						const colorId = color.name.replace('#', '');
						const expectedCSSId = `random-color-${colorId}`;
						const cssRule = document.getElementById(expectedCSSId);
						console.log(`🔍 [FILE EXPLORER DEBUG] Expected CSS rule ID: ${expectedCSSId}`);
						console.log(`🔍 [FILE EXPLORER DEBUG] CSS rule exists: ${cssRule ? 'YES' : 'NO'}`);
						if (cssRule) {
							console.log(`🔍 [FILE EXPLORER DEBUG] CSS rule content:`, cssRule.textContent?.substring(0, 200) + '...');
						}
					}
				} else {
					console.log(`🔍 [FILE EXPLORER DEBUG] ❌ No DOM element found for ${file.basename}`);
					console.log(`🔍 [FILE EXPLORER DEBUG] Expected path: ${file.path}`);
					console.log(`🔍 [FILE EXPLORER DEBUG] Available paths:`, Array.from(fileItems).map(item => item.getAttribute('data-path')));
				}
			}
		});
		
		// Count total injected CSS rules
		const allRandomStyles = document.querySelectorAll('style[id^="random-color-"]');
		console.log(`🔍 [FILE EXPLORER DEBUG] Total injected random color CSS rules: ${allRandomStyles.length}`);
		
		// Manually trigger file explorer styling update and see what happens
		console.log(`🔍 [FILE EXPLORER DEBUG] Manually triggering file explorer styling update...`);
		this.updateFileExplorerStyling();
		
		console.log('🔍 [FILE EXPLORER DEBUG] ===== Completed file explorer debug =====');
		new Notice('File explorer debug completed - check console for details');
	}

	async testRandomSystem() {
		console.log('Testing unlimited random emoji and color system...');
		
		// Test random emoji selection
		const emojis = new Set<string>();
		for (let i = 0; i < 20; i++) {
			emojis.add(this.getRandomEmoji());
		}
		console.log('Random emojis generated:', Array.from(emojis));
		
		// Test random color generation
		const colors: Array<{ lightColor: string, darkColor: string, hex: string }> = [];
		for (let i = 0; i < 5; i++) {
			const color = this.generateRandomColor();
			colors.push(color);
			console.log(`Random color ${i + 1}:`, color);
		}
		
		// Create a test MOC to verify the system works
		try {
			const testFile = await this.createMOC('Test Unlimited Random System');
			const content = await this.app.vault.read(testFile);
			console.log('Test MOC created successfully');
			console.log('Filename:', testFile.basename);
			console.log('Content preview:', content.substring(0, 300));
			
			// Test the color retrieval system
			const retrievedColor = this.getRootMOCColor(testFile);
			console.log('Retrieved color:', retrievedColor);
			
			// Clean up test file
			await this.app.vault.delete(testFile);
			console.log('Test MOC cleaned up');
			
			new Notice('Unlimited random system test completed - check console for details');
		} catch (error) {
			console.error('Error during random system test:', error);
			new Notice('Random system test failed - check console for details');
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

			// Note: We deliberately preserve plugin folders even if empty

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

	async reorganizeMOC(moc: TFile) {
		// Show reorganization options based on MOC type
		new ReorganizeMOCModal(this.app, moc, this).open();
	}

	async moveRootMOCToSub(moc: TFile, parentMOCName: string | null, existingParent: TFile | null) {
		try {
			// Step 1: Create or get parent MOC
			let parentMOC: TFile;
			if (existingParent) {
				parentMOC = existingParent;
			} else {
				// Create new parent MOC
				if (!parentMOCName) throw new Error('Parent MOC name required');
				parentMOC = await this.createMOC(parentMOCName);
			}

			// Step 2: Get MOC folder and base name
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found');
			
			const mocBaseName = moc.basename.replace(/^[^\s]+\s+/, '').replace(/ MOC$/, '').trim(); // Remove emoji prefix and MOC suffix
			
			// Step 3: Store the original paths
			const originalFolderPath = mocFolder.path;
			
			// Step 4: Generate new sub-MOC properties (keep random color for consistency)
			// No need to change color - sub-MOCs now use random colors too
			
			// Step 5: Determine new folder location (inside parent MOC folder)
			const parentFolder = parentMOC.parent?.path || '';
			const newFolderPath = `${parentFolder}/${mocFolder.name}`;
			
			// Step 6: Move entire folder structure
			// First, ensure the parent folder exists
			if (!this.app.vault.getAbstractFileByPath(parentFolder)) {
				throw new Error('Parent MOC folder not found');
			}
			
			// Move the folder
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			// Step 7: Get the moved MOC file
			const newMocPath = `${newFolderPath}/${moc.name}`;
			const movedMOC = this.app.vault.getAbstractFileByPath(newMocPath) as TFile;
			
			if (!movedMOC) throw new Error('Failed to find moved MOC');

			// Step 8: Add to parent MOC
			await this.addToMOCSection(parentMOC, 'MOCs', movedMOC);

			// Step 9: Update all references to files in the moved folder
			await this.updateAllFolderReferences(originalFolderPath, newFolderPath);

			new Notice(`Moved ${mocBaseName} under ${parentMOC.basename}`);
			
			// Open the parent MOC to show the result
			await this.app.workspace.getLeaf().openFile(parentMOC);
			
		} catch (error) {
			console.error('Error moving MOC:', error);
			new Notice(`Failed to move MOC: ${error.message}`);
		}
	}

	async promoteSubMOCToRoot(moc: TFile) {
		try {
			// Step 1: Get MOC folder and store original paths
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found');
			
			const originalFolderPath = mocFolder.path;
			const mocBaseName = moc.basename.replace(/^[^\s]+\s+/, '').replace(/ MOC$/, '').trim();
			
			// Step 2: The MOC already has random emoji and color (from new system)
			// Just need to move folder to root
			
			// Step 3: Determine new folder location (vault root)
			const newFolderPath = mocFolder.name; // Same folder name, but at root
			
			// Step 4: Move entire folder structure to root
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			// Step 5: Get the moved MOC file
			const newMocPath = `${newFolderPath}/${moc.name}`;
			const movedMOC = this.app.vault.getAbstractFileByPath(newMocPath) as TFile;
			
			if (!movedMOC) throw new Error('Failed to find moved MOC');

			// Step 6: Remove from parent MOC(s)
			await this.removeFromParentMOCs(moc);

			// Step 7: Update all references to files in the moved folder
			await this.updateAllFolderReferences(originalFolderPath, newFolderPath);

			new Notice(`Promoted ${mocBaseName} to root MOC`);
			
			// Open the promoted MOC
			await this.app.workspace.getLeaf().openFile(movedMOC);
			
		} catch (error) {
			console.error('Error promoting MOC:', error);
			new Notice(`Failed to promote MOC: ${error.message}`);
		}
	}

	async moveSubMOCToNewParent(moc: TFile, newParent: TFile) {
		try {
			// Step 1: Get MOC folder
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found');
			
			const originalFolderPath = mocFolder.path;
			
			// Step 2: Remove from current parent(s)
			await this.removeFromParentMOCs(moc);

			// Step 3: Determine new folder location (inside new parent MOC folder)
			const newParentFolder = newParent.parent?.path || '';
			const newFolderPath = `${newParentFolder}/${mocFolder.name}`;
			
			// Step 4: Move entire folder structure
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			// Step 5: Get the moved MOC file
			const newMocPath = `${newFolderPath}/${moc.name}`;
			const movedMOC = this.app.vault.getAbstractFileByPath(newMocPath) as TFile;
			
			if (!movedMOC) throw new Error('Failed to find moved MOC');

			// Step 6: Add to new parent
			await this.addToMOCSection(newParent, 'MOCs', movedMOC);
			
			// Step 7: Update all references to files in the moved folder
			await this.updateAllFolderReferences(originalFolderPath, newFolderPath);

			new Notice(`Moved ${moc.basename} to ${newParent.basename}`);
			
			// Open the new parent MOC
			await this.app.workspace.getLeaf().openFile(newParent);
			
		} catch (error) {
			console.error('Error moving MOC:', error);
			new Notice(`Failed to move MOC: ${error.message}`);
		}
	}

	async removeFromParentMOCs(moc: TFile) {
		// Find all MOCs that link to this MOC
		const allMOCs = this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
		
		for (const parentMOC of allMOCs) {
			if (parentMOC === moc) continue;
			
			const content = await this.app.vault.read(parentMOC);
			const linkPattern = new RegExp(`-\\s*\\[\\[${moc.basename}\\]\\]`, 'g');
			
			if (linkPattern.test(content)) {
				// Remove the link
				const newContent = content.replace(linkPattern, '');
				const cleanedContent = this.cleanupOrphanedBlankLines(newContent.split('\n'), parentMOC).join('\n');
				await this.app.vault.modify(parentMOC, cleanedContent);
			}
		}
	}

	async updateAllFolderReferences(oldFolderPath: string, newFolderPath: string) {
		// Update references for all files that were moved with the folder
		const allFiles = this.app.vault.getMarkdownFiles();
		
		for (const file of allFiles) {
			const content = await this.app.vault.read(file);
			let modified = false;
			
			// Find all links in the file
			const linkRegex = /\[\[([^\]]+)\]\]/g;
			const newContent = content;
			
			let match;
			while ((match = linkRegex.exec(content)) !== null) {
				const linkedName = match[1];
				
				// Check if this link might reference a file in the moved folder
				const possibleOldPaths = [
					`${oldFolderPath}/${linkedName}.md`,
					`${oldFolderPath}/${linkedName}`,
					`${oldFolderPath}/Notes/${linkedName}.md`,
					`${oldFolderPath}/Resources/${linkedName}.md`,
					`${oldFolderPath}/Prompts/${linkedName}.md`
				];
				
				for (const oldPath of possibleOldPaths) {
					const newPath = oldPath.replace(oldFolderPath, newFolderPath);
					if (this.app.vault.getAbstractFileByPath(newPath)) {
						// Update the link if we find a matching file in the new location
						// Keep just the basename in the link
						modified = true;
						break;
					}
				}
			}
			
			if (modified) {
				await this.app.vault.modify(file, newContent);
			}
		}
	}

	async updateAllReferences(oldPath: string, newPath: string) {
		const allFiles = this.app.vault.getMarkdownFiles();
		const oldBasename = oldPath.split('/').pop()?.replace('.md', '') || '';
		const newBasename = newPath.split('/').pop()?.replace('.md', '') || '';
		
		for (const file of allFiles) {
			const content = await this.app.vault.read(file);
			const linkPattern = new RegExp(`\\[\\[${oldBasename}\\]\\]`, 'g');
			
			if (linkPattern.test(content)) {
				const newContent = content.replace(linkPattern, `[[${newBasename}]]`);
				await this.app.vault.modify(file, newContent);
			}
		}
	}

	async getAllMOCs(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
	}

	detectCircularDependency(moc: TFile, potentialParent: TFile): boolean {
		// Check if potentialParent is a descendant of moc
		const visited = new Set<string>();
		const queue = [moc.path];
		
		while (queue.length > 0) {
			const currentPath = queue.shift();
			if (!currentPath) continue;
			if (visited.has(currentPath)) continue;
			visited.add(currentPath);
			
			if (currentPath === potentialParent.path) {
				return true; // Circular dependency detected
			}
			
			// Get all MOCs linked from current MOC
			const currentFile = this.app.vault.getAbstractFileByPath(currentPath);
			if (currentFile instanceof TFile) {
				const content = this.app.vault.cachedRead(currentFile);
				content.then(text => {
					const linkRegex = /\[\[([^\]]+)\]\]/g;
					let match;
					while ((match = linkRegex.exec(text)) !== null) {
						const linkedFile = this.app.metadataCache.getFirstLinkpathDest(match[1], currentPath);
						if (linkedFile && this.isMOC(linkedFile)) {
							queue.push(linkedFile.path);
						}
					}
				});
			}
		}
		
		return false;
	}

	async updateVaultToLatestSystem() {
		new Notice('Analyzing vault for updates...');
		
		try {
			// Analyze what needs to be updated
			const updatePlan = await this.analyzeVaultForUpdates();
			
			if (updatePlan.totalChanges === 0) {
				new Notice('Vault is already up to date!');
				return;
			}
			
			// Show update plan and get confirmation
			new VaultUpdateModal(this.app, updatePlan, async () => {
				await this.executeUpdatePlan(updatePlan);
			}).open();
			
		} catch (error) {
			console.error('Error during vault update analysis:', error);
			new Notice('Failed to analyze vault for updates - check console');
		}
	}

	async analyzeVaultForUpdates(): Promise<VaultUpdatePlan> {
		// Ensure folder structure exists first
		await this.ensureFolderStructure();
		
		const allFiles = this.app.vault.getMarkdownFiles();
		const filesToUpdate: TFile[] = [];
		const updateSummary = new Map<TFile, string[]>();
		let totalChanges = 0;

		for (const file of allFiles) {
			const requiredUpdates = await this.detectRequiredUpdates(file);
			if (requiredUpdates.length > 0) {
				filesToUpdate.push(file);
				updateSummary.set(file, requiredUpdates);
				totalChanges += requiredUpdates.length;
			}
		}

		return {
			filesToUpdate,
			updateSummary,
			totalChanges
		};
	}

	async detectRequiredUpdates(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		const noteType = cache?.frontmatter?.['note-type'];
		
		// Only check plugin-created files and potential plugin files
		const isPluginFile = noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
		const couldBePluginFile = this.isMOC(file) || 
			file.path.startsWith(FOLDERS.Notes) || 
			file.path.startsWith(FOLDERS.Resources) || 
			file.path.startsWith(FOLDERS.Prompts) ||
			file.basename.includes('MOC');

		if (!isPluginFile && !couldBePluginFile) {
			return updates;
		}

		// Check frontmatter requirements
		if (!noteType) {
			const detectedType = this.detectFileType(file);
			if (detectedType) {
				updates.push(`Add missing note-type: ${detectedType}`);
			}
		}

		// Check if file needs to be migrated to new folder structure
		if (this.needsFolderMigration(file)) {
			updates.push('Migrate to new hierarchical folder structure');
		}

		// Check file type specific requirements
		if (this.isMOC(file)) {
			if (this.isRootMOC(file)) {
				updates.push(...await this.checkRootMOCRequirements(file));
			} else {
				updates.push(...await this.checkSubMOCRequirements(file));
			}
		} else if (noteType === 'note' || file.path.includes('/Notes/')) {
			updates.push(...await this.checkNoteRequirements(file));
		} else if (noteType === 'resource' || file.path.includes('/Resources/')) {
			updates.push(...await this.checkResourceRequirements(file));
		} else if (noteType === 'prompt' || file.path.includes('/Prompts/')) {
			updates.push(...await this.checkPromptRequirements(file));
		}

		return updates;
	}

	private needsFolderMigration(file: TFile): boolean {
		// Check if file is in old flat structure and needs migration
		const path = file.path;
		
		// Root MOCs in root without folder
		if (this.isMOC(file) && this.isRootMOC(file) && !file.parent) {
			return true;
		}
		
		// Files in old global folders
		if (path.startsWith(FOLDERS.MOCs + '/') || 
			path.startsWith(FOLDERS.Notes + '/') || 
			path.startsWith(FOLDERS.Resources + '/') || 
			path.startsWith(FOLDERS.Prompts + '/')) {
			// These are in the old flat structure
			return true;
		}
		
		return false;
	}

	private detectFileType(file: TFile): string | null {
		if (this.isMOC(file)) return 'moc';
		if (file.path.startsWith(FOLDERS.Notes) || file.path.includes('/Notes/')) return 'note';
		if (file.path.startsWith(FOLDERS.Resources) || file.path.includes('/Resources/')) return 'resource';
		if (file.path.startsWith(FOLDERS.Prompts) || file.path.includes('/Prompts/')) return 'prompt';
		return null;
	}

	private async checkRootMOCRequirements(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		
		// Check MOC suffix
		if (!file.basename.endsWith(' MOC')) {
			updates.push('Add "MOC" suffix to filename');
		}
		
		// Check random color system
		const hasRandomColor = cache?.frontmatter?.['root-moc-color'] && 
			cache?.frontmatter?.['root-moc-light-color'] && 
			cache?.frontmatter?.['root-moc-dark-color'];
		
		if (!hasRandomColor) {
			updates.push('Add random color system to frontmatter');
		}
		
		// Check emoji prefix
		const hasEmojiPrefix = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(file.basename);
		if (!hasEmojiPrefix) {
			updates.push('Add emoji prefix to filename');
		}

		return updates;
	}

	private async checkSubMOCRequirements(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		
		// Check if it's in the new hierarchical structure
		// Sub-MOCs should be in a folder within another MOC folder
		const isInHierarchicalStructure = file.path.includes('/') && 
			!file.path.startsWith(FOLDERS.MOCs + '/') && 
			!file.path.startsWith(FOLDERS.Notes + '/') && 
			!file.path.startsWith(FOLDERS.Resources + '/') && 
			!file.path.startsWith(FOLDERS.Prompts + '/');
		
		if (!isInHierarchicalStructure && file.path.startsWith(FOLDERS.MOCs + '/')) {
			updates.push('Migrate to hierarchical folder structure');
		}
		
		// Check random color system (sub-MOCs now use random colors too)
		const hasRandomColor = cache?.frontmatter?.['root-moc-color'] && 
			cache?.frontmatter?.['root-moc-light-color'] && 
			cache?.frontmatter?.['root-moc-dark-color'];
		
		if (!hasRandomColor) {
			updates.push('Add random color system to frontmatter');
		}
		
		// Check emoji prefix (should be random emoji, not blue circle)
		const hasRandomEmojiPrefix = /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(file.basename);
		if (!hasRandomEmojiPrefix) {
			updates.push('Update to random emoji prefix');
		}
		
		// Check MOC suffix
		if (!file.basename.endsWith(' MOC')) {
			updates.push('Add "MOC" suffix to filename');
		}

		return updates;
	}

	private async checkNoteRequirements(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		
		// Check emoji prefix
		if (!file.basename.startsWith(NOTE_TYPES.Notes.emoji)) {
			updates.push(`Add ${NOTE_TYPES.Notes.emoji} emoji prefix`);
		}

		return updates;
	}

	private async checkResourceRequirements(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		
		// Check emoji prefix
		if (!file.basename.startsWith(NOTE_TYPES.Resources.emoji)) {
			updates.push(`Add ${NOTE_TYPES.Resources.emoji} emoji prefix`);
		}

		return updates;
	}

	private async checkPromptRequirements(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		
		// Check emoji prefix
		if (!file.basename.startsWith(NOTE_TYPES.Prompts.emoji)) {
			updates.push(`Add ${NOTE_TYPES.Prompts.emoji} emoji prefix`);
		}
		
		// Check prompt hub structure
		if (this.isPromptHub(file)) {
			const content = await this.app.vault.read(file);
			if (!content.includes('## Iterations') || !content.includes('```llm-links')) {
				updates.push('Update prompt hub structure');
			}
		}

		return updates;
	}

	async executeUpdatePlan(plan: VaultUpdatePlan): Promise<UpdateResult[]> {
		const results: UpdateResult[] = [];
		let successCount = 0;
		
		new Notice(`Updating ${plan.filesToUpdate.length} files...`);
		
		for (const file of plan.filesToUpdate) {
			const updates = plan.updateSummary.get(file) || [];
			const result = await this.updateFile(file, updates);
			results.push(result);
			
			if (result.success) {
				successCount++;
			}
		}
		
		new Notice(`Update complete! Successfully updated ${successCount}/${plan.filesToUpdate.length} files`);
		return results;
	}

	async updateFile(file: TFile, updates: string[]): Promise<UpdateResult> {
		const changes: string[] = [];
		
		try {
			let fileRenamed = false;
			let newFile = file;
			
			for (const update of updates) {
				if (update.includes('note-type')) {
					await this.addMissingNoteType(file, update);
					changes.push(`Added ${update}`);
				} else if (update.includes('random color system')) {
					await this.addRandomColorSystem(file);
					changes.push('Added random color system');
				} else if (update.includes('folder structure') || update.includes('hierarchical')) {
					newFile = await this.migrateToHierarchicalStructure(newFile);
					fileRenamed = true;
					changes.push('Migrated to new hierarchical folder structure');
				} else if (update.includes('emoji prefix') || update.includes('MOC suffix')) {
					newFile = await this.updateFileName(newFile, update);
					changes.push(`Updated filename: ${update}`);
				} else if (update.includes('Move to')) {
					newFile = await this.moveFileToCorrectLocation(newFile, update);
					changes.push(`Moved file: ${update}`);
				} else if (update.includes('prompt hub structure')) {
					await this.updatePromptHubStructure(newFile);
					changes.push('Updated prompt hub structure');
				}
			}
			
			return {
				file: newFile,
				changes,
				success: true
			};
		} catch (error) {
			return {
				file,
				changes,
				success: false,
				error: error.message
			};
		}
	}

	private async addMissingNoteType(file: TFile, update: string): Promise<void> {
		const noteType = update.split(': ')[1];
		const content = await this.app.vault.read(file);
		
		if (content.startsWith('---')) {
			// Has frontmatter, add note-type
			const lines = content.split('\n');
			const frontmatterEnd = lines.findIndex((line, index) => index > 0 && line === '---');
			if (frontmatterEnd !== -1) {
				lines.splice(frontmatterEnd, 0, `note-type: ${noteType}`);
				await this.app.vault.modify(file, lines.join('\n'));
			}
		} else {
			// No frontmatter, add it
			const newContent = `---\nnote-type: ${noteType}\n---\n\n${content}`;
			await this.app.vault.modify(file, newContent);
		}
	}

	private async addRandomColorSystem(file: TFile): Promise<void> {
		const randomColor = this.generateRandomColor();
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');
		
		const frontmatterEnd = lines.findIndex((line, index) => index > 0 && line === '---');
		if (frontmatterEnd !== -1) {
			lines.splice(frontmatterEnd, 0, 
				`root-moc-color: ${randomColor.hex}`,
				`root-moc-light-color: ${randomColor.lightColor}`,
				`root-moc-dark-color: ${randomColor.darkColor}`
			);
			await this.app.vault.modify(file, lines.join('\n'));
		}
	}

	private async migrateToHierarchicalStructure(file: TFile): Promise<TFile> {
		const cache = this.app.metadataCache.getFileCache(file);
		const noteType = cache?.frontmatter?.['note-type'];
		
		if (this.isMOC(file)) {
			if (this.isRootMOC(file)) {
				// Root MOC: Create folder structure for it
				// Keep existing emoji if it has one, otherwise add one
				let fileName = file.basename;
				if (!/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(fileName)) {
					const randomEmoji = this.getRandomEmoji();
					const baseName = fileName.replace(/ MOC$/, '').trim();
					fileName = `${randomEmoji} ${baseName} MOC`;
				}
				
				const folderName = fileName.replace('.md', '');
				const newPath = `${folderName}/${fileName}`;
				
				// Create folder structure
				await this.ensureMOCFolderStructure(folderName);
				
				// Move file
				await this.app.vault.rename(file, newPath);
				return this.app.vault.getAbstractFileByPath(newPath) as TFile;
			} else {
				// Sub-MOC: Move to hierarchical location
				// For now, keep in root until user reorganizes manually
				// This is complex because we need to determine which MOC it belongs to
				return file;
			}
		} else if (noteType === 'note' || noteType === 'resource' || noteType === 'prompt') {
			// These files need to be assigned to a MOC
			// For migration, we can't automatically determine which MOC they belong to
			// Users will need to manually move them or reorganize
			console.log(`File ${file.path} needs manual assignment to a MOC`);
			return file;
		}
		
		return file;
	}

	private async updateFileName(file: TFile, update: string): Promise<TFile> {
		let newBasename = file.basename;
		
		if (update.includes('emoji prefix')) {
			const emoji = update.match(/Add (.+) emoji prefix/)?.[1] || '';
			if (emoji && !newBasename.startsWith(emoji)) {
				newBasename = `${emoji} ${newBasename}`;
			} else if (update.includes('Add emoji prefix')) {
				// For root MOCs, add random emoji
				const randomEmoji = this.getRandomEmoji();
				newBasename = `${randomEmoji} ${newBasename}`;
			}
		}
		
		if (update.includes('MOC suffix') && !newBasename.endsWith(' MOC')) {
			newBasename = `${newBasename} MOC`;
		}
		
		if (newBasename !== file.basename) {
			const newPath = file.path.replace(file.basename, newBasename);
			try {
				await this.app.vault.rename(file, newPath);
				return this.app.vault.getAbstractFileByPath(newPath) as TFile;
			} catch (error) {
				console.error(`Failed to rename ${file.path} to ${newPath}:`, error);
				throw error;
			}
		}
		
		return file;
	}

	private async moveFileToCorrectLocation(file: TFile, update: string): Promise<TFile> {
		const targetFolder = update.match(/Move to (.+) folder/)?.[1];
		if (!targetFolder) return file;
		
		const newPath = `${targetFolder}/${file.basename}.md`;
		try {
			await this.app.vault.rename(file, newPath);
			return this.app.vault.getAbstractFileByPath(newPath) as TFile;
		} catch (error) {
			console.error(`Failed to move ${file.path} to ${newPath}:`, error);
			throw error;
		}
	}

	private async updatePromptHubStructure(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		let newContent = content;
		
		if (!content.includes('## Iterations')) {
			newContent += '\n\n## Iterations\n\n';
		}
		
		if (!content.includes('```llm-links')) {
			newContent += '\n## LLM Links\n\n```llm-links\n\n```\n';
		}
		
		if (newContent !== content) {
			await this.app.vault.modify(file, newContent);
		}
	}

	isMOC(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.tags?.includes('moc') ?? false;
	}

	isPromptIteration(file: TFile): boolean {
		// Check if file is in a Prompts folder (hierarchical structure)
		const isInPromptsFolder = file.parent?.name === FOLDERS.Prompts;
		return isInPromptsFolder && /v\d+/.test(file.basename);
	}

	isPromptHub(file: TFile): boolean {
		// Check if file is in a Prompts folder (hierarchical structure)
		const isInPromptsFolder = file.parent?.name === FOLDERS.Prompts;
		// Check for note-type metadata as primary indicator
		const noteType = this.getNoteType(file);
		if (noteType === 'prompt') {
			return isInPromptsFolder && !this.isPromptIteration(file);
		}
		// Fallback: check if in Prompts folder and not an iteration
		return isInPromptsFolder && !this.isPromptIteration(file);
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
		
		// Remove all existing note type classes and root MOC color classes
		document.body.classList.remove('smart-note-group', 'smart-note-note', 'smart-note-prompt', 'smart-note-resource', 'smart-note-prompt-hub', 'smart-note-prompt-iteration');
		
		// Remove any existing root MOC color classes (legacy)
		LEGACY_COLORS.forEach(color => {
			document.body.classList.remove(`smart-note-root-moc-${color.name}`);
		});
		
		// Remove any existing random color classes
		const existingColorClasses = Array.from(document.body.classList).filter(cls => cls.startsWith('smart-note-root-moc-random-'));
		existingColorClasses.forEach(cls => document.body.classList.remove(cls));
		
		if (activeFile) {
			const displayType = this.getFileDisplayType(activeFile);
			if (displayType === 'moc') {
				document.body.classList.add('smart-note-group');
				
				// Add root MOC color styling
				if (this.isRootMOC(activeFile)) {
					const color = this.getRootMOCColor(activeFile);
					
					// For new random colors, create a dynamic class
					if (color.name.startsWith('#')) {
						const colorId = color.name.replace('#', '');
						const className = `smart-note-root-moc-random-${colorId}`;
						document.body.classList.add(className);
						
						// Inject CSS for this specific color if not already present
						this.injectRandomColorCSS(colorId, color.lightColor, color.darkColor);
					} else {
						// Legacy named colors
						document.body.classList.add(`smart-note-root-moc-${color.name}`);
					}
				}
			} else if (displayType !== 'unknown') {
				document.body.classList.add(`smart-note-${displayType}`);
			}
		}
	}

	updateFileExplorerStyling() {
		// Add data attributes to file explorer items for CSS targeting
		const fileItems = document.querySelectorAll('.nav-file-title');
		
		fileItems.forEach((item: HTMLElement) => {
			// Remove existing attributes
			item.removeAttribute('data-root-moc-color');
			item.removeAttribute('data-root-moc-random-color');
			
			// Remove existing random color classes
			Array.from(item.classList).forEach(className => {
				if (className.startsWith('smart-random-color-')) {
					item.classList.remove(className);
				}
			});
			
			const path = item.getAttribute('data-path');
			if (path) {
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) {
					const displayType = this.getFileDisplayType(file);
					if (displayType === 'moc') {
						item.setAttribute('data-smart-note-type', 'group');
						
						// Add color attribute for root MOCs
						if (this.isRootMOC(file)) {
							const color = this.getRootMOCColor(file);
							
							if (color.name.startsWith('#')) {
								// New random color system
								item.setAttribute('data-root-moc-random-color', color.name);
								item.setAttribute('data-root-moc-color', 'random'); // Prevent blue fallback rule
								
								// Add CSS class as backup approach
								const colorId = color.name.replace('#', '');
								item.classList.add(`smart-random-color-${colorId}`);
								
								// Inject CSS for this color if not already present
								this.injectRandomColorCSS(colorId, color.lightColor, color.darkColor);
							} else {
								// Legacy named colors
								item.setAttribute('data-root-moc-color', color.name);
							}
						}
					} else if (displayType !== 'unknown') {
						item.setAttribute('data-smart-note-type', displayType);
					}
				}
			}
		});
	}

	updateTabStyling() {
		console.log('🔍 [TAB DEBUG] ===== Starting updateTabStyling =====');
		
		// Add classes to tab headers for CSS targeting
		const tabHeaders = document.querySelectorAll('.workspace-tab-header');
		console.log(`🔍 [TAB DEBUG] Found ${tabHeaders.length} tab headers`);
		
		tabHeaders.forEach((tab: HTMLElement, index: number) => {
			console.log(`🔍 [TAB DEBUG] --- Processing tab ${index + 1} ---`);
			
			// Remove existing classes and attributes
			const beforeClasses = Array.from(tab.classList);
			tab.classList.remove('smart-note-tab-group', 'smart-note-tab-note', 'smart-note-tab-prompt', 'smart-note-tab-resource', 'smart-note-tab-prompt-hub', 'smart-note-tab-prompt-iteration');
			tab.removeAttribute('data-smart-note-type');
			tab.removeAttribute('data-root-moc-color');
			tab.removeAttribute('data-root-moc-random-color');
			console.log(`🔍 [TAB DEBUG] Cleaned tab classes. Before: [${beforeClasses.join(', ')}]`);
			
			const ariaLabel = tab.getAttribute('aria-label');
			console.log(`🔍 [TAB DEBUG] Tab aria-label: "${ariaLabel}"`);
			
			if (ariaLabel) {
				// Find file by basename since aria-label doesn't include .md extension
				let file: TFile | null = null;
				
				// First try exact path match (in case aria-label includes extension)
				const exactFile = this.app.vault.getAbstractFileByPath(ariaLabel);
				if (exactFile instanceof TFile) {
					file = exactFile;
				} else {
					// Search for file with matching basename
					const allFiles = this.app.vault.getMarkdownFiles();
					file = allFiles.find(f => f.basename === ariaLabel) || null;
				}
				
				console.log(`🔍 [TAB DEBUG] File found: ${file ? `"${file.path}"` : 'null'}`);
				
				if (file instanceof TFile) {
					const displayType = this.getFileDisplayType(file);
					const isRootMOC = this.isRootMOC(file);
					console.log(`🔍 [TAB DEBUG] Display type: "${displayType}", Is root MOC: ${isRootMOC}`);
					
					if (displayType === 'moc') {
						tab.classList.add('smart-note-tab-group');
						tab.setAttribute('data-smart-note-type', 'group');
						console.log(`🔍 [TAB DEBUG] Added MOC styling classes`);
						
						// Add color attribute for root MOCs
						if (isRootMOC) {
							const color = this.getRootMOCColor(file);
							console.log(`🔍 [TAB DEBUG] Root MOC color object:`, {
								name: color.name,
								lightColor: color.lightColor,
								darkColor: color.darkColor
							});
							
							if (color.name.startsWith('#')) {
								// New random color system
								console.log(`🔍 [TAB DEBUG] Applying random color system`);
								tab.setAttribute('data-root-moc-random-color', color.name);
								tab.style.setProperty('--root-moc-color-light', color.lightColor);
								tab.style.setProperty('--root-moc-color-dark', color.darkColor);
								
								// Verify attributes were set
								const actualRandomAttr = tab.getAttribute('data-root-moc-random-color');
								const actualLightProp = tab.style.getPropertyValue('--root-moc-color-light');
								const actualDarkProp = tab.style.getPropertyValue('--root-moc-color-dark');
								console.log(`🔍 [TAB DEBUG] Attributes set:`, {
									'data-root-moc-random-color': actualRandomAttr,
									'--root-moc-color-light': actualLightProp,
									'--root-moc-color-dark': actualDarkProp
								});
								
								// Ensure CSS is injected for this color
								const colorId = color.name.replace('#', '');
								console.log(`🔍 [TAB DEBUG] Injecting CSS for colorId: ${colorId}`);
								this.injectRandomColorCSS(colorId, color.lightColor, color.darkColor);
								
								// Verify CSS was injected
								const cssExists = document.getElementById(`random-color-${colorId}`);
								console.log(`🔍 [TAB DEBUG] CSS injection result: ${cssExists ? 'SUCCESS' : 'FAILED'}`);
								if (cssExists) {
									console.log(`🔍 [TAB DEBUG] CSS content preview:`, cssExists.textContent?.substring(0, 200) + '...');
								}
							} else {
								// Legacy named colors
								console.log(`🔍 [TAB DEBUG] Applying legacy color system: ${color.name}`);
								tab.setAttribute('data-root-moc-color', color.name);
								
								const actualLegacyAttr = tab.getAttribute('data-root-moc-color');
								console.log(`🔍 [TAB DEBUG] Legacy attribute set: data-root-moc-color="${actualLegacyAttr}"`);
							}
						} else {
							console.log(`🔍 [TAB DEBUG] Sub-MOC detected, no special color handling`);
						}
						
						// Final verification
						const finalClasses = Array.from(tab.classList);
						const finalAttributes = {
							'data-smart-note-type': tab.getAttribute('data-smart-note-type'),
							'data-root-moc-color': tab.getAttribute('data-root-moc-color'),
							'data-root-moc-random-color': tab.getAttribute('data-root-moc-random-color')
						};
						console.log(`🔍 [TAB DEBUG] Final tab state:`, {
							classes: finalClasses,
							attributes: finalAttributes
						});
						
					} else if (displayType !== 'unknown') {
						tab.classList.add(`smart-note-tab-${displayType}`);
						tab.setAttribute('data-smart-note-type', displayType);
						console.log(`🔍 [TAB DEBUG] Added non-MOC styling: smart-note-tab-${displayType}`);
					} else {
						console.log(`🔍 [TAB DEBUG] Unknown display type, no styling applied`);
					}
				} else {
					console.log(`🔍 [TAB DEBUG] File is not a TFile instance`);
				}
			} else {
				console.log(`🔍 [TAB DEBUG] No aria-label found on tab`);
			}
		});
		
		console.log('🔍 [TAB DEBUG] ===== Finished updateTabStyling =====');
		
		// Additional debugging: check what CSS rules are currently applied
		setTimeout(() => {
			console.log('🔍 [TAB DEBUG] ===== Post-styling CSS verification =====');
			tabHeaders.forEach((tab: HTMLElement, index: number) => {
				const ariaLabel = tab.getAttribute('aria-label');
				if (ariaLabel && ariaLabel.includes('MOC')) {
					const titleEl = tab.querySelector('.workspace-tab-header-inner-title') as HTMLElement;
					if (titleEl) {
						const computedStyle = window.getComputedStyle(titleEl);
						console.log(`🔍 [TAB DEBUG] Tab ${index + 1} ("${ariaLabel}") computed styles:`, {
							color: computedStyle.color,
							fontWeight: computedStyle.fontWeight,
							backgroundColor: computedStyle.backgroundColor
						});
					}
				}
			});
		}, 100);
	}

	private injectRandomColorCSS(colorId: string, lightColor: string, darkColor: string) {
		console.log(`🔍 [CSS DEBUG] ===== injectRandomColorCSS called =====`);
		console.log(`🔍 [CSS DEBUG] Parameters:`, { colorId, lightColor, darkColor });
		
		// Check if CSS for this color already exists
		const existingStyle = document.getElementById(`random-color-${colorId}`);
		console.log(`🔍 [CSS DEBUG] Existing style element: ${existingStyle ? 'EXISTS' : 'NOT FOUND'}`);
		
		if (existingStyle) {
			console.log(`🔍 [CSS DEBUG] Style already exists, skipping injection`);
			return;
		}
		
		// Create CSS for this specific random color
		const style = document.createElement('style');
		style.id = `random-color-${colorId}`;
		console.log(`🔍 [CSS DEBUG] Created style element with ID: ${style.id}`);
		
		style.textContent = `
			/* Random color styling for ${colorId} */
			body.smart-note-root-moc-random-${colorId} .view-header-title {
				color: ${lightColor} !important;
				font-weight: bold !important;
			}
			
			.theme-dark body.smart-note-root-moc-random-${colorId} .view-header-title {
				color: ${darkColor} !important;
			}
			
			/* File explorer styling - Target the correct child element */
			.nav-file-title[data-root-moc-random-color="\\#${colorId}"] .nav-file-title-content,
			.nav-file-title.smart-random-color-${colorId} .nav-file-title-content {
				color: ${lightColor} !important;
				font-weight: bold !important;
			}
			
			.theme-dark .nav-file-title[data-root-moc-random-color="\\#${colorId}"] .nav-file-title-content,
			.theme-dark .nav-file-title.smart-random-color-${colorId} .nav-file-title-content {
				color: ${darkColor} !important;
			}
			
			/* Tab styling - Maximum specificity to override all existing CSS */
			.app-container .workspace .workspace-tab-header.smart-note-tab-group[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"] .workspace-tab-header-inner-title,
			.app-container .workspace .workspace-tab-header.smart-note-tab-group[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"].is-active .workspace-tab-header-inner-title,
			.app-container .workspace .workspace-tab-header.smart-note-tab-group[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"]:not(.is-active) .workspace-tab-header-inner-title,
			.mod-root .workspace .workspace-tab-header[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"] .workspace-tab-header-inner-title,
			.workspace-tab-header[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"] .workspace-tab-header-inner-title {
				color: ${lightColor} !important;
				font-weight: bold !important;
				--root-moc-color-light: ${lightColor} !important;
				--root-moc-color-dark: ${darkColor} !important;
			}
			
			.theme-dark .app-container .workspace .workspace-tab-header.smart-note-tab-group[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"] .workspace-tab-header-inner-title,
			.theme-dark .app-container .workspace .workspace-tab-header.smart-note-tab-group[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"].is-active .workspace-tab-header-inner-title,
			.theme-dark .app-container .workspace .workspace-tab-header.smart-note-tab-group[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"]:not(.is-active) .workspace-tab-header-inner-title,
			.theme-dark .mod-root .workspace .workspace-tab-header[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"] .workspace-tab-header-inner-title,
			.theme-dark .workspace-tab-header[data-root-moc-random-color="\\#${colorId}"][data-smart-note-type="group"] .workspace-tab-header-inner-title {
				color: ${darkColor} !important;
				font-weight: bold !important;
			}
			
			/* Backup approach with even higher specificity using ID-like selectors */
			body .workspace-tab-header[data-root-moc-random-color="\\#${colorId}"] .workspace-tab-header-inner-title {
				color: ${lightColor} !important;
				font-weight: bold !important;
			}
			
			body.theme-dark .workspace-tab-header[data-root-moc-random-color="\\#${colorId}"] .workspace-tab-header-inner-title {
				color: ${darkColor} !important;
				font-weight: bold !important;
			}
		`;
		
		console.log(`🔍 [CSS DEBUG] Generated CSS content:`, style.textContent);
		
		document.head.appendChild(style);
		console.log(`🔍 [CSS DEBUG] Style element appended to document head`);
		
		// Verify the style was actually added
		const verifyStyle = document.getElementById(`random-color-${colorId}`);
		console.log(`🔍 [CSS DEBUG] Verification - Style in DOM: ${verifyStyle ? 'SUCCESS' : 'FAILED'}`);
		
		// Check total number of injected styles
		const allRandomStyles = document.querySelectorAll('style[id^="random-color-"]');
		console.log(`🔍 [CSS DEBUG] Total random color styles in DOM: ${allRandomStyles.length}`);
		
		console.log(`🔍 [CSS DEBUG] ===== injectRandomColorCSS completed =====`);
	}

	// Helper methods for root MOC color system
	private generateRandomColor(): { lightColor: string, darkColor: string, hex: string } {
		// Generate completely random RGB values with maximum entropy
		// Use crypto.getRandomValues for better randomness if available
		let r, g, b;
		
		if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
			const randomBytes = new Uint8Array(3);
			crypto.getRandomValues(randomBytes);
			r = randomBytes[0];
			g = randomBytes[1];
			b = randomBytes[2];
		} else {
			// Fallback to Math.random with better distribution
			r = Math.floor(Math.random() * 256);
			g = Math.floor(Math.random() * 256);
			b = Math.floor(Math.random() * 256);
		}
		
		// Ensure colors are not too dark or too light for better visibility
		// Adjust to minimum brightness of 64 and maximum of 224 for good contrast
		r = Math.max(64, Math.min(224, r));
		g = Math.max(64, Math.min(224, g));
		b = Math.max(64, Math.min(224, b));
		
		const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
		
		// For dark mode, create a brighter variant
		const lightR = Math.min(255, r + 50);
		const lightG = Math.min(255, g + 50);
		const lightB = Math.min(255, b + 50);
		const lightHex = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`;
		
		return {
			lightColor: hex,
			darkColor: lightHex,
			hex: hex
		};
	}

	private getRandomEmoji(): string {
		// Generate truly random emoji from the entire emoji range
		// Unicode emoji blocks: U+1F600-U+1F64F, U+1F300-U+1F5FF, U+1F680-U+1F6FF, U+1F900-U+1F9FF, U+2600-U+26FF, U+2700-U+27BF
		const emojiRanges = [
			[0x1F600, 0x1F64F], // Emoticons
			[0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
			[0x1F680, 0x1F6FF], // Transport and Map Symbols
			[0x1F900, 0x1F9FF], // Supplemental Symbols and Pictographs
			[0x2600, 0x26FF],   // Miscellaneous Symbols
			[0x2700, 0x27BF]    // Dingbats
		];
		
		// Pick a random range
		const range = emojiRanges[Math.floor(Math.random() * emojiRanges.length)];
		
		// Pick a random code point within that range
		const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
		
		return String.fromCodePoint(codePoint);
	}

	private hashString(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return Math.abs(hash);
	}

	private getRootMOCColor(file: TFile): { lightColor: string, darkColor: string, name: string } {
		console.log(`🔍 [COLOR DEBUG] ===== getRootMOCColor called for file: ${file.path} =====`);
		
		const cache = this.app.metadataCache.getFileCache(file);
		console.log(`🔍 [COLOR DEBUG] File cache exists: ${cache ? 'YES' : 'NO'}`);
		console.log(`🔍 [COLOR DEBUG] Frontmatter:`, cache?.frontmatter);
		
		// Check for new random color system (hex colors in frontmatter)
		const storedHexColor = cache?.frontmatter?.['root-moc-color'];
		const storedLightColor = cache?.frontmatter?.['root-moc-light-color'];
		const storedDarkColor = cache?.frontmatter?.['root-moc-dark-color'];
		
		console.log(`🔍 [COLOR DEBUG] Stored colors from frontmatter:`, {
			hex: storedHexColor,
			light: storedLightColor,
			dark: storedDarkColor
		});
		
		if (storedHexColor && storedLightColor && storedDarkColor) {
			const result = {
				lightColor: storedLightColor,
				darkColor: storedDarkColor,
				name: storedHexColor // Use hex as identifier
			};
			console.log(`🔍 [COLOR DEBUG] Using random color system:`, result);
			return result;
		}
		
		// Legacy compatibility: check for old named colors
		const storedColorName = cache?.frontmatter?.['root-moc-color'];
		if (storedColorName && typeof storedColorName === 'string' && !storedColorName.startsWith('#')) {
			const foundColor = LEGACY_COLORS.find(color => color.name === storedColorName);
			if (foundColor) {
				return foundColor;
			}
		}
		
		// Backward compatibility: check if the file has one of the old colored emojis
		const existingColorMatch = file.basename.match(/^([🔴🟠🟡🟢🔵🟣🟤⚫🔺])\s+/u);
		if (existingColorMatch) {
			const emoji = existingColorMatch[1];
			const colorName = LEGACY_EMOJI_TO_COLOR[emoji];
			if (colorName) {
				const foundColor = LEGACY_COLORS.find(color => color.name === colorName);
				if (foundColor) {
					return foundColor;
				}
			}
		}
		
		// Final fallback: Use hash-based system for consistent colors
		const baseName = file.basename.replace(/^[^\s]+\s+/, '').replace(/\s+MOC$/, '');
		const hash = this.hashString(baseName);
		
		// For root MOCs, use unlimited hash-based colors instead of limited legacy set
		if (this.isRootMOC(file)) {
			const unlimitedColor = this.generateHashBasedColor(hash);
			console.log(`🔍 [COLOR DEBUG] Using unlimited hash-based color for root MOC:`, {
				baseName,
				hash,
				selectedColor: unlimitedColor
			});
			return unlimitedColor;
		}
		
		// For sub-MOCs and other legacy files, use the original 9-color system
		const legacyColor = LEGACY_COLORS[hash % LEGACY_COLORS.length];
		console.log(`🔍 [COLOR DEBUG] Using legacy hash fallback:`, {
			baseName,
			hash,
			selectedColor: legacyColor
		});
		return legacyColor;
	}


	private generateHashBasedColor(hash: number): { lightColor: string, darkColor: string, name: string } {
		// Better hash-based color generation with improved distribution
		// Use multiple hash transformations to spread colors across spectrum
		const h1 = hash;
		const h2 = hash * 0x9e3779b9; // Golden ratio multiplier for better distribution
		const h3 = hash ^ (hash >>> 16); // XOR with shifted bits
		
		// Extract RGB components with better mixing
		const r = Math.max(64, Math.min(224, ((h1 >>> 0) & 0xFF)));
		const g = Math.max(64, Math.min(224, ((h2 >>> 8) & 0xFF)));  
		const b = Math.max(64, Math.min(224, ((h3 >>> 16) & 0xFF)));
		
		const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
		
		// For dark mode, create a brighter variant
		const lightR = Math.min(255, r + 50);
		const lightG = Math.min(255, g + 50);
		const lightB = Math.min(255, b + 50);
		const lightHex = `#${lightR.toString(16).padStart(2, '0')}${lightG.toString(16).padStart(2, '0')}${lightB.toString(16).padStart(2, '0')}`;
		
		return {
			lightColor: hex,
			darkColor: lightHex,
			name: hex
		};
	}

	isRootMOC(file: TFile): boolean {
		// With new folder structure, root MOCs are those in folders at the vault root
		// Check if the MOC's parent folder is in the vault root (no other MOC folders in path)
		if (!this.isMOC(file)) return false;
		
		// Get the folder path (parent of the MOC file)
		const folderPath = file.parent?.path || '';
		
		// Root MOCs have their folder directly in the vault root (no '/' in folder path)
		// Or the file itself is in the root (legacy support)
		return !folderPath.includes('/') || file.path.split('/').length === 1;
	}
}

class VaultUpdateModal extends Modal {
	constructor(
		app: App,
		private updatePlan: VaultUpdatePlan,
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Update Vault to Latest System' });

		contentEl.createEl('p', { 
			text: `Found ${this.updatePlan.totalChanges} updates needed across ${this.updatePlan.filesToUpdate.length} files.`
		});

		if (this.updatePlan.filesToUpdate.length > 0) {
			contentEl.createEl('h3', { text: 'Files to be updated:' });
			
			const updateList = contentEl.createEl('div');
			updateList.style.maxHeight = '300px';
			updateList.style.overflowY = 'auto';
			updateList.style.border = '1px solid var(--background-modifier-border)';
			updateList.style.padding = '15px';
			updateList.style.marginBottom = '20px';
			updateList.style.backgroundColor = 'var(--background-secondary)';

			for (const file of this.updatePlan.filesToUpdate) {
				const updates = this.updatePlan.updateSummary.get(file) || [];
				
				const fileItem = updateList.createEl('div');
				fileItem.style.marginBottom = '15px';
				fileItem.style.paddingBottom = '10px';
				fileItem.style.borderBottom = '1px solid var(--background-modifier-border-hover)';
				
				const fileName = fileItem.createEl('div');
				fileName.style.fontWeight = 'bold';
				fileName.style.color = 'var(--text-accent)';
				fileName.style.marginBottom = '5px';
				fileName.textContent = file.path;
				
				const updatesList = fileItem.createEl('ul');
				updatesList.style.marginLeft = '15px';
				updatesList.style.fontSize = '0.9em';
				
				for (const update of updates) {
					const updateItem = updatesList.createEl('li');
					updateItem.textContent = update;
					updateItem.style.marginBottom = '2px';
				}
			}
		}

		contentEl.createEl('p', { 
			text: 'This will modify files to match the latest system requirements. All changes are reversible.',
			cls: 'mod-warning'
		});

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.marginTop = '20px';

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		const confirmButton = buttonContainer.createEl('button', { 
			text: `Update ${this.updatePlan.filesToUpdate.length} Files`,
			cls: 'mod-cta'
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

class ReorganizeMOCModal extends Modal {
	constructor(
		app: App,
		private moc: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		const isRootMOC = this.plugin.isRootMOC(this.moc);
		
		contentEl.createEl('h2', { text: `Reorganize "${this.moc.basename}"` });
		
		if (isRootMOC) {
			contentEl.createEl('p', { text: 'This is a root-level MOC. Choose how to reorganize it:' });
			
			// Option 1: Move under new parent
			const newParentButton = contentEl.createEl('button', { 
				text: 'Move under new parent MOC',
				cls: 'mod-cta'
			});
			newParentButton.style.display = 'block';
			newParentButton.style.marginBottom = '10px';
			newParentButton.style.width = '100%';
			newParentButton.addEventListener('click', () => {
				this.close();
				new CreateParentMOCModal(this.app, this.moc, this.plugin).open();
			});
			
			// Option 2: Move under existing MOC
			const existingParentButton = contentEl.createEl('button', { 
				text: 'Move under existing MOC'
			});
			existingParentButton.style.display = 'block';
			existingParentButton.style.marginBottom = '10px';
			existingParentButton.style.width = '100%';
			existingParentButton.addEventListener('click', async () => {
				const allMOCs = await this.plugin.getAllMOCs();
				const availableMOCs = allMOCs.filter(m => m !== this.moc && !this.plugin.detectCircularDependency(this.moc, m));
				
				if (availableMOCs.length === 0) {
					new Notice('No suitable parent MOCs available');
					return;
				}
				
				this.close();
				new SelectParentMOCModal(this.app, this.moc, availableMOCs, this.plugin).open();
			});
			
		} else {
			// Sub-MOC options
			contentEl.createEl('p', { text: 'This is a sub-MOC. Choose how to reorganize it:' });
			
			// Option 1: Promote to root
			const promoteButton = contentEl.createEl('button', { 
				text: 'Promote to root MOC',
				cls: 'mod-cta'
			});
			promoteButton.style.display = 'block';
			promoteButton.style.marginBottom = '10px';
			promoteButton.style.width = '100%';
			promoteButton.addEventListener('click', () => {
				this.plugin.promoteSubMOCToRoot(this.moc);
				this.close();
			});
			
			// Option 2: Move to different parent
			const moveButton = contentEl.createEl('button', { 
				text: 'Move to different parent'
			});
			moveButton.style.display = 'block';
			moveButton.style.marginBottom = '10px';
			moveButton.style.width = '100%';
			moveButton.addEventListener('click', async () => {
				const allMOCs = await this.plugin.getAllMOCs();
				const availableMOCs = allMOCs.filter(m => m !== this.moc && !this.plugin.detectCircularDependency(this.moc, m));
				
				if (availableMOCs.length === 0) {
					new Notice('No suitable parent MOCs available');
					return;
				}
				
				this.close();
				new SelectParentMOCModal(this.app, this.moc, availableMOCs, this.plugin, true).open();
			});
		}
		
		// Cancel button
		const cancelButton = contentEl.createEl('button', { text: 'Cancel' });
		cancelButton.style.display = 'block';
		cancelButton.style.marginTop = '20px';
		cancelButton.style.width = '100%';
		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class CreateParentMOCModal extends Modal {
	constructor(
		app: App,
		private childMOC: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create new parent MOC' });
		contentEl.createEl('p', { text: `This will create a new MOC and move "${this.childMOC.basename}" under it.` });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Parent MOC name...'
		});
		inputEl.style.width = '100%';
		inputEl.style.marginBottom = '15px';
		inputEl.focus();

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';

		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		const createButton = buttonContainer.createEl('button', { 
			text: 'Create & Move',
			cls: 'mod-cta'
		});
		
		const submitFn = () => {
			const name = inputEl.value.trim();
			if (name) {
				this.plugin.moveRootMOCToSub(this.childMOC, name, null);
				this.close();
			}
		};
		
		createButton.addEventListener('click', submitFn);
		inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && inputEl.value) {
				submitFn();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SelectParentMOCModal extends Modal {
	constructor(
		app: App,
		private childMOC: TFile,
		private availableMOCs: TFile[],
		private plugin: MOCSystemPlugin,
		private isMovingSubMOC: boolean = false
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Select parent MOC' });
		contentEl.createEl('p', { text: `Choose where to move "${this.childMOC.basename}":` });

		// Create scrollable list
		const listContainer = contentEl.createDiv();
		listContainer.style.maxHeight = '300px';
		listContainer.style.overflowY = 'auto';
		listContainer.style.border = '1px solid var(--background-modifier-border)';
		listContainer.style.padding = '10px';
		listContainer.style.marginBottom = '15px';

		// Sort MOCs by path for better organization
		const sortedMOCs = this.availableMOCs.sort((a, b) => a.path.localeCompare(b.path));

		for (const moc of sortedMOCs) {
			const item = listContainer.createDiv();
			item.style.padding = '5px 10px';
			item.style.cursor = 'pointer';
			item.style.borderRadius = '3px';
			item.textContent = moc.path;
			
			item.addEventListener('mouseenter', () => {
				item.style.backgroundColor = 'var(--background-modifier-hover)';
			});
			
			item.addEventListener('mouseleave', () => {
				item.style.backgroundColor = '';
			});
			
			item.addEventListener('click', () => {
				if (this.isMovingSubMOC) {
					this.plugin.moveSubMOCToNewParent(this.childMOC, moc);
				} else {
					this.plugin.moveRootMOCToSub(this.childMOC, null, moc);
				}
				this.close();
			});
		}

		const cancelButton = contentEl.createEl('button', { text: 'Cancel' });
		cancelButton.style.width = '100%';
		cancelButton.addEventListener('click', () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}