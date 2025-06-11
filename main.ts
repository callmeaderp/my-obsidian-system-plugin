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

		// Test command for random system (development only)
		this.addCommand({
			id: 'test-random-system',
			name: 'Test random emoji and color system',
			callback: () => this.testRandomSystem()
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
		// Get random emoji and color for this root MOC
		const randomEmoji = this.getRandomEmoji();
		const randomColor = this.generateRandomColor();
		
		const fileName = `${randomEmoji} ${name} MOC.md`;
		const content = `---\ntags:\n  - moc\nnote-type: moc\nroot-moc-color: ${randomColor.hex}\nroot-moc-light-color: ${randomColor.lightColor}\nroot-moc-dark-color: ${randomColor.darkColor}\n---\n`;
		
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
					insertIndex = sectionIndices.get(SECTION_ORDER[i])!;
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
								item.style.setProperty('--root-moc-color-light', color.lightColor);
								item.style.setProperty('--root-moc-color-dark', color.darkColor);
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
		// Add classes to tab headers for CSS targeting
		const tabHeaders = document.querySelectorAll('.workspace-tab-header');
		tabHeaders.forEach((tab: HTMLElement) => {
			// Remove existing classes and attributes
			tab.classList.remove('smart-note-tab-group', 'smart-note-tab-note', 'smart-note-tab-prompt', 'smart-note-tab-resource', 'smart-note-tab-prompt-hub', 'smart-note-tab-prompt-iteration');
			tab.removeAttribute('data-smart-note-type');
			tab.removeAttribute('data-root-moc-color');
			tab.removeAttribute('data-root-moc-random-color');
			
			const ariaLabel = tab.getAttribute('aria-label');
			if (ariaLabel) {
				const file = this.app.vault.getAbstractFileByPath(ariaLabel);
				if (file instanceof TFile) {
					const displayType = this.getFileDisplayType(file);
					if (displayType === 'moc') {
						tab.classList.add('smart-note-tab-group');
						tab.setAttribute('data-smart-note-type', 'group');
						
						// Add color attribute for root MOCs
						if (this.isRootMOC(file)) {
							const color = this.getRootMOCColor(file);
							
							if (color.name.startsWith('#')) {
								// New random color system
								tab.setAttribute('data-root-moc-random-color', color.name);
								tab.style.setProperty('--root-moc-color-light', color.lightColor);
								tab.style.setProperty('--root-moc-color-dark', color.darkColor);
							} else {
								// Legacy named colors
								tab.setAttribute('data-root-moc-color', color.name);
							}
						}
					} else if (displayType !== 'unknown') {
						tab.classList.add(`smart-note-tab-${displayType}`);
						tab.setAttribute('data-smart-note-type', displayType);
					}
				}
			}
		});
	}

	private injectRandomColorCSS(colorId: string, lightColor: string, darkColor: string) {
		// Check if CSS for this color already exists
		const existingStyle = document.getElementById(`random-color-${colorId}`);
		if (existingStyle) return;
		
		// Create CSS for this specific random color
		const style = document.createElement('style');
		style.id = `random-color-${colorId}`;
		style.textContent = `
			/* Random color styling for ${colorId} */
			body.smart-note-root-moc-random-${colorId} .view-header-title {
				color: ${lightColor} !important;
				font-weight: bold !important;
			}
			
			.theme-dark body.smart-note-root-moc-random-${colorId} .view-header-title {
				color: ${darkColor} !important;
			}
			
			/* File explorer styling */
			.nav-file-title[data-root-moc-random-color="${lightColor}"] {
				color: var(--root-moc-color-light) !important;
				font-weight: bold !important;
			}
			
			.theme-dark .nav-file-title[data-root-moc-random-color="${lightColor}"] {
				color: var(--root-moc-color-dark) !important;
			}
			
			/* Tab styling */
			.workspace-tab-header[data-root-moc-random-color="${lightColor}"] .workspace-tab-header-inner-title {
				color: var(--root-moc-color-light) !important;
				font-weight: bold !important;
			}
			
			.theme-dark .workspace-tab-header[data-root-moc-random-color="${lightColor}"] .workspace-tab-header-inner-title {
				color: var(--root-moc-color-dark) !important;
			}
		`;
		
		document.head.appendChild(style);
	}

	// Helper methods for root MOC color system
	private generateRandomColor(): { lightColor: string, darkColor: string, hex: string } {
		// Generate completely random RGB values
		const r = Math.floor(Math.random() * 256);
		const g = Math.floor(Math.random() * 256);
		const b = Math.floor(Math.random() * 256);
		
		const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
		
		// For dark mode, lighten the color slightly
		const lightR = Math.min(255, r + 40);
		const lightG = Math.min(255, g + 40);
		const lightB = Math.min(255, b + 40);
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
		const cache = this.app.metadataCache.getFileCache(file);
		
		// Check for new random color system (hex colors in frontmatter)
		const storedHexColor = cache?.frontmatter?.['root-moc-color'];
		const storedLightColor = cache?.frontmatter?.['root-moc-light-color'];
		const storedDarkColor = cache?.frontmatter?.['root-moc-dark-color'];
		
		if (storedHexColor && storedLightColor && storedDarkColor) {
			return {
				lightColor: storedLightColor,
				darkColor: storedDarkColor,
				name: storedHexColor // Use hex as identifier
			};
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
		const existingColorMatch = file.basename.match(/^([🔴🟠🟡🟢🔵🟣🟤⚫🔺])\s+/);
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
		
		// Final fallback: Use the MOC name for consistent hashing (for very old MOCs)
		const baseName = file.basename.replace(/^[^\s]+\s+/, '').replace(/\s+MOC$/, '');
		const hash = this.hashString(baseName);
		const legacyColor = LEGACY_COLORS[hash % LEGACY_COLORS.length];
		return legacyColor;
	}

	private isRootMOC(file: TFile): boolean {
		return this.isMOC(file) && !file.path.includes('/');
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