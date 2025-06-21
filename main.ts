import { App, Modal, Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian';

// =================================================================================
// PLUGIN CONSTANTS AND TYPES
// =================================================================================

interface PluginSettings {}

const DEFAULT_SETTINGS: PluginSettings = {};

/**
 * Defines the subfolder names within a MOC's primary folder.
 */
const FOLDERS = {
	Notes: 'Notes',
	Resources: 'Resources',
	Prompts: 'Prompts'
} as const;

/**
 * Defines the standard order of sections within a MOC file.
 */
const SECTION_ORDER = ['MOCs', 'Notes', 'Resources', 'Prompts'] as const;
type SectionType = typeof SECTION_ORDER[number];

/**
 * Defines the standard emoji prefixes and CSS classes for different note types.
 */
const NOTE_TYPES = {
	MOCs: { emoji: '🔵', class: 'moc' }, // Default for sub-MOCs, though new ones get random emojis.
	Notes: { emoji: '📝', class: 'note' },
	Resources: { emoji: '📁', class: 'resource' },
	Prompts: { emoji: '🤖', class: 'prompt' }
} as const;


// =================================================================================
// INTERFACES
// =================================================================================

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


// =================================================================================
// MAIN PLUGIN CLASS
// =================================================================================

export default class MOCSystemPlugin extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// --- Command Registration ---
		this.addCommand({
			id: 'moc-context-create',
			name: 'Create MOC or add content',
			callback: () => this.handleContextCreate()
		});

		this.addCommand({
			id: 'reorganize-moc',
			name: 'Reorganize MOC',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.isMOC(activeFile)) {
					if (!checking) this.reorganizeMOC(activeFile);
					return true;
				}
				return false;
			}
		});
		
		this.addCommand({
			id: 'duplicate-prompt-iteration',
			name: 'Duplicate prompt iteration',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.isPromptIteration(activeFile)) {
					if (!checking) this.duplicatePromptIteration(activeFile);
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'open-llm-links',
			name: 'Open all LLM links',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && this.isPromptHub(activeFile)) {
					if (!checking) this.openLLMLinks(activeFile);
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'update-vault-system',
			name: 'Update vault to latest system',
			callback: () => this.updateVaultToLatestSystem()
		});
		
		this.addCommand({
			id: 'cleanup-moc-system',
			name: 'Cleanup MOC system files',
			callback: () => this.cleanupMOCSystem()
		});

		// --- Event Listeners ---
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.cleanupBrokenLinks(file);
				}
			})
		);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// =================================================================================
	// CORE CREATION LOGIC
	// =================================================================================

	/**
	 * Handles the main command, creating a new root MOC or adding content to an existing one.
	 */
	async handleContextCreate() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile || !this.isMOC(activeFile)) {
			// If not in a MOC, open modal to create a new root MOC.
			new CreateMOCModal(this.app, async (name: string) => {
				await this.createMOC(name);
			}).open();
		} else {
			// If in a MOC, open modal to add new content (Sub-MOC, Note, etc.).
			new AddToMOCModal(this.app, activeFile, this).open();
		}
	}

	/**
	 * Creates a new root MOC, including its dedicated folder structure.
	 * @param name The name of the new MOC.
	 * @returns The newly created MOC file.
	 */
	async createMOC(name: string): Promise<TFile> {
		const randomEmoji = this.getRandomEmoji();
		const randomColor = this.generateRandomColor();
		
		const mocFolderName = `${randomEmoji} ${name} MOC`;
		const mocFilePath = `${mocFolderName}/${mocFolderName}.md`;
		
		await this.ensureMOCFolderStructure(mocFolderName);
		
		const content = `---
tags:
  - moc
note-type: moc
root-moc-color: ${randomColor.hex}
root-moc-light-color: ${randomColor.lightColor}
root-moc-dark-color: ${randomColor.darkColor}
---
`;
		
		const file = await this.app.vault.create(mocFilePath, content);
		await this.app.workspace.getLeaf().openFile(file);
		new Notice(`Created MOC: ${name}`);
		return file;
	}

	/**
	 * Creates a new sub-MOC within a parent MOC's folder structure.
	 * @param parentMOC The file of the parent MOC.
	 * @param name The name of the new sub-MOC.
	 * @returns The newly created sub-MOC file.
	 */
	async createSubMOC(parentMOC: TFile, name: string): Promise<TFile> {
		const randomEmoji = this.getRandomEmoji();
		const randomColor = this.generateRandomColor();
		const parentFolder = parentMOC.parent?.path || '';
		
		const subMocFolderName = `${parentFolder}/${randomEmoji} ${name} MOC`;
		const subMocFilePath = `${subMocFolderName}/${randomEmoji} ${name} MOC.md`;
		
		await this.ensureMOCFolderStructure(subMocFolderName);
		
		const content = `---
tags:
  - moc
note-type: moc
root-moc-color: ${randomColor.hex}
root-moc-light-color: ${randomColor.lightColor}
root-moc-dark-color: ${randomColor.darkColor}
---
`;
		
		const file = await this.app.vault.create(normalizePath(subMocFilePath), content);
		await this.addToMOCSection(parentMOC, 'MOCs', file);
		new Notice(`Created sub-MOC: ${name}`);
		return file;
	}

	/**
	 * Creates a new note inside a parent MOC's "Notes" subfolder.
	 * @param parentMOC The file of the parent MOC.
	 * @param name The name of the new note.
	 * @returns The newly created note file.
	 */
	async createNote(parentMOC: TFile, name: string): Promise<TFile> {
		const parentFolder = parentMOC.parent?.path || '';
		const fileName = `${parentFolder}/${FOLDERS.Notes}/${NOTE_TYPES.Notes.emoji} ${name}.md`;
		const content = `---\nnote-type: note\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'Notes', file);
		new Notice(`Created note: ${name}`);
		return file;
	}

	/**
	 * Creates a new resource inside a parent MOC's "Resources" subfolder.
	 * @param parentMOC The file of the parent MOC.
	 * @param name The name of the new resource.
	 * @returns The newly created resource file.
	 */
	async createResource(parentMOC: TFile, name: string): Promise<TFile> {
		const parentFolder = parentMOC.parent?.path || '';
		const fileName = `${parentFolder}/${FOLDERS.Resources}/${NOTE_TYPES.Resources.emoji} ${name}.md`;
		const content = `---\nnote-type: resource\n---\n`;
		
		const file = await this.app.vault.create(normalizePath(fileName), content);
		await this.addToMOCSection(parentMOC, 'Resources', file);
		new Notice(`Created resource: ${name}`);
		return file;
	}

	/**
	 * Creates a new prompt hub and its first iteration inside a parent MOC's "Prompts" subfolder.
	 * @param parentMOC The file of the parent MOC.
	 * @param name The name of the new prompt.
	 * @returns The newly created prompt hub file.
	 */
	async createPrompt(parentMOC: TFile, name: string): Promise<TFile> {
		const parentFolder = parentMOC.parent?.path || '';
		const promptFolder = `${parentFolder}/${FOLDERS.Prompts}`;
		const iterationBasename = `${NOTE_TYPES.Prompts.emoji} ${name} v1`;

		// Create prompt hub
		const hubFileName = `${promptFolder}/${NOTE_TYPES.Prompts.emoji} ${name}.md`;
		const hubContent = `---
note-type: prompt
---

# ${name}

## Iterations

- [[${iterationBasename}]]

## LLM Links

\`\`\`llm-links

\`\`\`
`;
		
		const hubFile = await this.app.vault.create(normalizePath(hubFileName), hubContent);
		
		// Create first iteration
		const iterationFileName = `${promptFolder}/${iterationBasename}.md`;
		const iterationContent = `---\nnote-type: prompt\n---\n`;
		await this.app.vault.create(normalizePath(iterationFileName), iterationContent);
		
		await this.addToMOCSection(parentMOC, 'Prompts', hubFile);
		new Notice(`Created prompt: ${name}`);
		return hubFile;
	}

	/**
	 * Ensures the full folder structure for a given MOC exists.
	 * @param mocFolderPath The path to the MOC's main folder.
	 */
	async ensureMOCFolderStructure(mocFolderPath: string) {
		if (!this.app.vault.getAbstractFileByPath(mocFolderPath)) {
			await this.app.vault.createFolder(mocFolderPath);
		}
		
		for (const folder of Object.values(FOLDERS)) {
			const subfolderPath = `${mocFolderPath}/${folder}`;
			if (!this.app.vault.getAbstractFileByPath(subfolderPath)) {
				await this.app.vault.createFolder(subfolderPath).catch(err => {
					// Ignore "folder already exists" errors which can happen in race conditions
					if (!err.message?.includes('Folder already exists')) throw err;
				});
			}
		}
	}


	// =================================================================================
	// MOC SECTION MANAGEMENT
	// =================================================================================

	/**
	 * Adds a link to a new file into the correct section of a MOC, reorganizing if necessary.
	 * @param moc The MOC file to modify.
	 * @param section The section to add the link to (e.g., 'Notes', 'Resources').
	 * @param newFile The file to link to.
	 */
	async addToMOCSection(moc: TFile, section: SectionType, newFile: TFile) {
		let content = await this.app.vault.read(moc);
		let lines = content.split('\n');
		
		let frontmatterEnd = 0;
		if (lines[0] === '---') {
			frontmatterEnd = lines.slice(1).indexOf('---') + 2;
		}
		
		const { reorganizedLines, sectionIndices } = this.reorganizeContentForPluginSections(lines, frontmatterEnd);
		
		let sectionLineIndex = sectionIndices.get(section);
		
		if (sectionLineIndex === undefined) {
			// Section doesn't exist, create it in the correct order.
			let insertIndex = frontmatterEnd;
			const currentSectionOrderIndex = SECTION_ORDER.indexOf(section);

			// Find the next existing section to insert before.
			for (let i = currentSectionOrderIndex + 1; i < SECTION_ORDER.length; i++) {
				const nextSection = SECTION_ORDER[i];
				if (sectionIndices.has(nextSection)) {
					insertIndex = sectionIndices.get(nextSection)!;
					break;
				}
			}

			// If no later sections exist, append after the last known plugin section.
			if (insertIndex === frontmatterEnd && sectionIndices.size > 0) {
				const lastSectionIndex = Math.max(...Array.from(sectionIndices.values()));
				insertIndex = this.findSectionEnd(reorganizedLines, lastSectionIndex);
			}

			const newSectionContent = [`## ${section}`, ``, `- [[${newFile.basename}]]`, ``];
			reorganizedLines.splice(insertIndex, 0, ...newSectionContent);

		} else {
			// Section exists, add the link.
			let insertIndex = sectionLineIndex + 1;
			// Skip header and any blank lines right after it.
			while (insertIndex < reorganizedLines.length && reorganizedLines[insertIndex].trim() === '') {
				insertIndex++;
			}
			// Insert the link at this position.
			reorganizedLines.splice(insertIndex, 0, `- [[${newFile.basename}]]`);
		}
		
		await this.app.vault.modify(moc, reorganizedLines.join('\n'));
	}

	/**
	 * Reorganizes MOC content to ensure plugin-managed sections are ordered correctly at the top.
	 * Any other content is moved to the end of the file.
	 * @param lines The lines of the MOC file.
	 * @param frontmatterEnd The index of the line after the closing '---'.
	 * @returns An object with the reorganized lines and a map of section start indices.
	 */
	private reorganizeContentForPluginSections(lines: string[], frontmatterEnd: number): { reorganizedLines: string[], sectionIndices: Map<SectionType, number> } {
		const pluginSections: { name: SectionType, content: string[] }[] = [];
		const otherContentLines: string[] = [];
		const sectionIndices = new Map<SectionType, number>();

		const consumedLineIndices = new Set<number>();

		// 1. Extract all known plugin sections
		for (const sectionName of SECTION_ORDER) {
			const header = `## ${sectionName}`;
			const startIndex = lines.findIndex((line, i) => i >= frontmatterEnd && line.trim() === header);

			if (startIndex !== -1) {
				const endIndex = this.findSectionEnd(lines, startIndex);
				const sectionContent = lines.slice(startIndex, endIndex);
				pluginSections.push({ name: sectionName, content: sectionContent });

				// Mark these lines as "consumed"
				for (let i = startIndex; i < endIndex; i++) {
					consumedLineIndices.add(i);
				}
			}
		}

		// 2. Collect all other content
		for (let i = frontmatterEnd; i < lines.length; i++) {
			if (!consumedLineIndices.has(i)) {
				otherContentLines.push(lines[i]);
			}
		}

		// 3. Rebuild the file
		const reorganizedLines: string[] = [...lines.slice(0, frontmatterEnd)];
		
		// Add plugin sections back in the correct order
		for (const section of pluginSections) {
			sectionIndices.set(section.name, reorganizedLines.length);
			reorganizedLines.push(...section.content);
		}

		// Add other content at the end, ensuring separation
		if (otherContentLines.length > 0) {
			if (reorganizedLines.length > frontmatterEnd && reorganizedLines[reorganizedLines.length-1].trim() !== '') {
				reorganizedLines.push('');
			}
			reorganizedLines.push(...otherContentLines);
		}
		
		return { reorganizedLines, sectionIndices };
	}

	/**
	 * Finds the end of a markdown section (i.e., the next H2 heading or end of file).
	 */
	private findSectionEnd(lines: string[], sectionStartIndex: number): number {
		for (let i = sectionStartIndex + 1; i < lines.length; i++) {
			if (lines[i].trim().startsWith('## ')) {
				return i;
			}
		}
		return lines.length;
	}


	// =================================================================================
	// PROMPT MANAGEMENT SYSTEM
	// =================================================================================

	/**
	 * Duplicates a prompt iteration, incrementing the version number.
	 * @param file The prompt iteration file to duplicate.
	 */
	async duplicatePromptIteration(file: TFile) {
		const match = file.basename.match(/^(?:🤖\s+)?(.+?)\s*v(\d+)/);
		if (!match) return;
		
		const [, baseName] = match;
		const promptsFolder = file.parent;
		if (!promptsFolder) return;
		
		const siblings = promptsFolder.children.filter(f => f instanceof TFile && f.name.includes(baseName) && f.name.match(/v(\d+)/)) as TFile[];
		
		let maxVersion = 0;
		for (const pFile of siblings) {
			const vMatch = pFile.basename.match(/v(\d+)/);
			if (vMatch) maxVersion = Math.max(maxVersion, parseInt(vMatch[1]));
		}
		const nextVersion = maxVersion + 1;
		
		new PromptDescriptionModal(this.app, async (description: string) => {
			const descPart = description ? ` - ${description}` : '';
			const newName = `${NOTE_TYPES.Prompts.emoji} ${baseName} v${nextVersion}${descPart}`;
			
			const newPath = `${promptsFolder.path}/${newName}.md`;
			const originalContent = await this.app.vault.read(file);
			const contentWithFrontmatter = originalContent.startsWith('---') ? originalContent : `---\nnote-type: prompt\n---\n\n${originalContent}`;
			
			const newFile = await this.app.vault.create(normalizePath(newPath), contentWithFrontmatter);
			
			await this.updatePromptHub(baseName, newFile, promptsFolder.path);
			await this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Created iteration: ${newName}`);
		}).open();
	}
	
	/**
	 * Adds a link to a new prompt iteration to its corresponding hub file.
	 */
	async updatePromptHub(baseName: string, newIteration: TFile, promptsFolderPath: string) {
		const hubPath = `${promptsFolderPath}/${NOTE_TYPES.Prompts.emoji} ${baseName}.md`;
		const hubFile = this.app.vault.getAbstractFileByPath(normalizePath(hubPath));
		
		if (hubFile instanceof TFile) {
			await this.app.vault.process(hubFile, (content) => {
				const lines = content.split('\n');
				const iterHeaderIndex = lines.findIndex(line => line.trim() === '## Iterations');

				if (iterHeaderIndex !== -1) {
					let insertIndex = iterHeaderIndex + 1;
					while(insertIndex < lines.length && (lines[insertIndex].trim() === '' || lines[insertIndex].trim().startsWith('- '))) {
						insertIndex++;
					}
					lines.splice(insertIndex, 0, `- [[${newIteration.basename}]]`);
				}
				return lines.join('\n');
			});
		}
	}

	/**
	 * Opens all URLs found in an `llm-links` code block in the active file.
	 */
	async openLLMLinks(file: TFile) {
		const content = await this.app.vault.read(file);
		const linkBlockMatch = content.match(/```llm-links\n([\s\S]*?)\n```/);
		
		if (linkBlockMatch) {
			const links = linkBlockMatch[1].split('\n').map(line => line.trim()).filter(line => line.startsWith('http'));
			if (links.length === 0) {
				new Notice('No links found in llm-links block');
				return;
			}
			links.forEach(link => window.open(link, '_blank'));
			new Notice(`Opened ${links.length} links`);
		} else {
			new Notice('No llm-links block found');
		}
	}


	// =================================================================================
	// MOC REORGANIZATION SYSTEM
	// =================================================================================

	/**
	 * Initiates the MOC reorganization process by opening a context-aware modal.
	 */
	async reorganizeMOC(moc: TFile) {
		new ReorganizeMOCModal(this.app, moc, this).open();
	}

	/**
	 * Converts a root MOC into a sub-MOC by moving its folder under a parent MOC.
	 * @param moc The root MOC to move.
	 * @param parentMOCName The name for a new parent MOC to be created.
	 * @param existingParent An existing MOC to use as the parent.
	 */
	async moveRootMOCToSub(moc: TFile, parentMOCName: string | null, existingParent: TFile | null) {
		try {
			let parentMOC: TFile;
			if (existingParent) {
				parentMOC = existingParent;
			} else {
				if (!parentMOCName) throw new Error('Parent MOC name is required.');
				parentMOC = await this.createMOC(parentMOCName);
			}

			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('Could not find folder for the MOC to move.');
			
			const parentMOCFolder = parentMOC.parent;
			if (!parentMOCFolder) throw new Error('Could not find folder for the parent MOC.');

			const newFolderPath = normalizePath(`${parentMOCFolder.path}/${mocFolder.name}`);
			
			// Move the entire folder. Obsidian's API handles internal link updates.
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			// Find the file at its new path
			const movedMOC = this.app.vault.getAbstractFileByPath(`${newFolderPath}/${moc.name}`) as TFile;
			if (!movedMOC) throw new Error('Failed to find moved MOC file after rename.');

			await this.addToMOCSection(parentMOC, 'MOCs', movedMOC);

			new Notice(`Moved ${moc.basename} to be under ${parentMOC.basename}`);
			await this.app.workspace.getLeaf().openFile(parentMOC);
		} catch (error) {
			console.error('Error moving MOC:', error);
			new Notice(`Failed to move MOC: ${error.message}`);
		}
	}

	/**
	 * Promotes a sub-MOC to a root MOC by moving its folder to the vault's root.
	 * @param moc The sub-MOC to promote.
	 */
	async promoteSubMOCToRoot(moc: TFile) {
		try {
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found.');

			// The new path is just the folder's name at the vault root.
			const newFolderPath = mocFolder.name;
			
			await this.removeFromParentMOCs(moc);
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			const movedMOC = this.app.vault.getAbstractFileByPath(`${newFolderPath}/${moc.name}`) as TFile;
			if (!movedMOC) throw new Error('Failed to find promoted MOC file.');

			new Notice(`Promoted ${moc.basename} to a root MOC.`);
			await this.app.workspace.getLeaf().openFile(movedMOC);
		} catch (error) {
			console.error('Error promoting MOC:', error);
			new Notice(`Failed to promote MOC: ${error.message}`);
		}
	}

	/**
	 * Moves a sub-MOC from its current parent to a new parent MOC.
	 * @param moc The sub-MOC to move.
	 * @param newParent The new parent MOC.
	 */
	async moveSubMOCToNewParent(moc: TFile, newParent: TFile) {
		try {
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found.');
			
			const newParentFolder = newParent.parent;
			if (!newParentFolder) throw new Error('New parent MOC folder not found.');

			await this.removeFromParentMOCs(moc);
			
			const newFolderPath = normalizePath(`${newParentFolder.path}/${mocFolder.name}`);
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			const movedMOC = this.app.vault.getAbstractFileByPath(`${newFolderPath}/${moc.name}`) as TFile;
			if (!movedMOC) throw new Error('Failed to find moved MOC file.');

			await this.addToMOCSection(newParent, 'MOCs', movedMOC);

			new Notice(`Moved ${moc.basename} to ${newParent.basename}`);
			await this.app.workspace.getLeaf().openFile(newParent);
		} catch (error) {
			console.error('Error moving MOC:', error);
			new Notice(`Failed to move MOC: ${error.message}`);
		}
	}

	/**
	 * Removes links to a given MOC from any other MOCs that link to it.
	 * @param moc The MOC file whose links should be removed from parents.
	 */
	async removeFromParentMOCs(moc: TFile) {
		const allMOCs = await this.getAllMOCs();
		const linkPattern = new RegExp(`^-\\s*\\[\\[${moc.basename}\\]\\]\\s*$`);
		
		for (const parentMOC of allMOCs) {
			if (parentMOC.path === moc.path) continue;
			
			await this.app.vault.process(parentMOC, (content) => {
				const lines = content.split('\n');
				const filteredLines = lines.filter(line => !linkPattern.test(line.trim()));
				return filteredLines.join('\n');
			});
		}
	}


	// =================================================================================
	// VAULT UPDATE & MAINTENANCE
	// =================================================================================

	/**
	 * Initiates the process to update the entire vault to the latest plugin standards.
	 */
	async updateVaultToLatestSystem() {
		new Notice('Analyzing vault for updates...');
		
		try {
			const updatePlan = await this.analyzeVaultForUpdates();
			if (updatePlan.totalChanges === 0) {
				new Notice('Vault is already up to date!');
				return;
			}
			new VaultUpdateModal(this.app, updatePlan, async () => {
				await this.executeUpdatePlan(updatePlan);
			}).open();
		} catch (error) {
			console.error('Error during vault update analysis:', error);
			new Notice('Failed to analyze vault for updates. Check console.');
		}
	}

	/**
	 * Scans the vault to find all files that need updating.
	 */
	async analyzeVaultForUpdates(): Promise<VaultUpdatePlan> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const filesToUpdate: TFile[] = [];
		const updateSummary = new Map<TFile, string[]>();

		for (const file of allFiles) {
			const requiredUpdates = await this.detectRequiredUpdates(file);
			if (requiredUpdates.length > 0) {
				filesToUpdate.push(file);
				updateSummary.set(file, requiredUpdates);
			}
		}

		return {
			filesToUpdate,
			updateSummary,
			totalChanges: Array.from(updateSummary.values()).reduce((sum, arr) => sum + arr.length, 0)
		};
	}
	
	/**
	 * Detects what updates an individual file needs to conform to the system.
	 */
	async detectRequiredUpdates(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		const noteType = cache?.frontmatter?.['note-type'];
		
		const isPluginFile = noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
		// A file is a potential plugin file if it looks like one, even without metadata
		const isLegacyFile = file.basename.includes('MOC') || file.path.includes(FOLDERS.Notes) || file.path.includes(FOLDERS.Resources) || file.path.includes(FOLDERS.Prompts);

		if (!isPluginFile && !isLegacyFile) return [];

		// Check 1: Missing metadata
		if (!noteType) {
			const detectedType = this.detectFileType(file);
			if (detectedType) updates.push(`Add missing note-type: ${detectedType}`);
		}

		// Check 2: Needs migration to hierarchical folder structure
		if (this.needsFolderMigration(file)) {
			updates.push('Migrate to new hierarchical folder structure');
		}

		// Check 3: MOC requirements
		if (this.isMOC(file)) {
			if (!file.basename.endsWith(' MOC')) updates.push('Add "MOC" suffix to filename');
			
			const hasRandomColor = cache?.frontmatter?.['root-moc-color'] && cache?.frontmatter?.['root-moc-light-color'];
			if (!hasRandomColor) updates.push('Add random color system to frontmatter');
			
			if (!/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(file.basename)) {
				updates.push('Add random emoji prefix to filename');
			}
		}
		// Check 4: Other file type requirements (e.g., emoji prefixes)
		else if (noteType === 'note' && !file.basename.startsWith(NOTE_TYPES.Notes.emoji)) {
			updates.push(`Add ${NOTE_TYPES.Notes.emoji} emoji prefix`);
		} 
		else if (noteType === 'resource' && !file.basename.startsWith(NOTE_TYPES.Resources.emoji)) {
			updates.push(`Add ${NOTE_TYPES.Resources.emoji} emoji prefix`);
		} 
		else if (noteType === 'prompt' && !file.basename.startsWith(NOTE_TYPES.Prompts.emoji)) {
			updates.push(`Add ${NOTE_TYPES.Prompts.emoji} emoji prefix`);
		}
		
		return updates;
	}

	/**
	 * Executes the update plan, modifying files as needed.
	 */
	async executeUpdatePlan(plan: VaultUpdatePlan): Promise<UpdateResult[]> {
		const results: UpdateResult[] = [];
		new Notice(`Updating ${plan.filesToUpdate.length} files...`);
		
		for (const file of plan.filesToUpdate) {
			const updates = plan.updateSummary.get(file) || [];
			const result = await this.updateFile(file, updates);
			results.push(result);
		}
		
		const successCount = results.filter(r => r.success).length;
		new Notice(`Update complete! Successfully updated ${successCount}/${plan.filesToUpdate.length} files`);
		return results;
	}

	/**
	 * Applies a list of specific updates to a single file.
	 */
	async updateFile(file: TFile, updates: string[]): Promise<UpdateResult> {
		let currentFile = file;
		try {
			for (const update of updates) {
				if (update.includes('note-type')) {
					const noteType = update.split(': ')[1];
					await this.app.fileManager.processFrontMatter(currentFile, (fm) => {
						fm['note-type'] = noteType;
					});
				} else if (update.includes('random color system')) {
					const randomColor = this.generateRandomColor();
					await this.app.fileManager.processFrontMatter(currentFile, (fm) => {
						fm['root-moc-color'] = randomColor.hex;
						fm['root-moc-light-color'] = randomColor.lightColor;
						fm['root-moc-dark-color'] = randomColor.darkColor;
					});
				} else if (update.includes('folder structure')) {
					currentFile = await this.migrateToHierarchicalStructure(currentFile);
				} else if (update.includes('emoji prefix') || update.includes('MOC suffix')) {
					currentFile = await this.updateFileName(currentFile, update);
				}
			}
			return { file: currentFile, changes: updates, success: true };
		} catch (error) {
			return { file, changes: updates, success: false, error: error.message };
		}
	}
	
	/**
	 * Migrates a file from the old flat structure to the new hierarchical one.
	 */
	private async migrateToHierarchicalStructure(file: TFile): Promise<TFile> {
		if (this.isMOC(file) && this.isRootMOC(file)) {
			// This is a root MOC currently sitting in the vault root. Give it a folder.
			const mocFolderName = file.basename.replace(/\.md$/, '');
			await this.ensureMOCFolderStructure(mocFolderName);
			const newPath = normalizePath(`${mocFolderName}/${file.name}`);
			await this.app.vault.rename(file, newPath);
			return this.app.vault.getAbstractFileByPath(newPath) as TFile;
		}
		// For other files (notes, resources, sub-MOCs in old flat folders), automatic migration is too complex
		// as we can't know which parent MOC they belong to. The user must use the "Reorganize MOC" command.
		// We log this, but don't perform an action.
		console.warn(`Cannot auto-migrate ${file.path}. Please manually reorganize it into a parent MOC.`);
		return file;
	}

	/**
	 * Updates a filename to add required prefixes or suffixes.
	 */
	private async updateFileName(file: TFile, update: string): Promise<TFile> {
		let newBasename = file.basename;
		
		if (update.includes('emoji prefix')) {
			const emojiMatch = update.match(/Add (.+) emoji prefix/);
			const emoji = emojiMatch ? emojiMatch[1] : this.getRandomEmoji();
			newBasename = `${emoji} ${newBasename}`;
		}
		
		if (update.includes('MOC suffix') && !newBasename.endsWith(' MOC')) {
			newBasename = `${newBasename} MOC`;
		}
		
		if (newBasename !== file.basename) {
			const newPath = `${file.parent?.path || ''}/${newBasename}.md`;
			await this.app.vault.rename(file, normalizePath(newPath));
			return this.app.vault.getAbstractFileByPath(newPath) as TFile;
		}
		return file;
	}

	/**
	 * Removes all files created by the plugin after confirmation.
	 */
	async cleanupMOCSystem() {
		const allFiles = this.app.vault.getMarkdownFiles();
		const pluginFiles = allFiles.filter(file => {
			const cache = this.app.metadataCache.getFileCache(file);
			const noteType = cache?.frontmatter?.['note-type'];
			return noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
		});

		if (pluginFiles.length === 0) {
			new Notice('No MOC system files found to cleanup.');
			return;
		}

		new CleanupConfirmationModal(this.app, pluginFiles, async () => {
			let deletedCount = 0;
			for (const file of pluginFiles) {
				try {
					await this.app.vault.delete(file);
					deletedCount++;
				} catch (error) {
					console.error(`Failed to delete ${file.path}:`, error);
				}
			}
			new Notice(`Cleanup complete! Deleted ${deletedCount} files.`);
		}).open();
	}
	
	/**
	 * Removes broken links from all files when a file is deleted.
	 */
	async cleanupBrokenLinks(deletedFile: TFile) {
		const allFiles = this.app.vault.getMarkdownFiles();
		const linkPattern = new RegExp(`-\\s*\\[\\[${deletedFile.basename}\\]\\]`);
		
		for (const file of allFiles) {
			await this.app.vault.process(file, (content) => {
				if (linkPattern.test(content)) {
					return content.split('\n').filter(line => !linkPattern.test(line.trim())).join('\n');
				}
				return content;
			});
		}
	}


	// =================================================================================
	// HELPER & UTILITY METHODS
	// =================================================================================

	/** Checks if a file is a MOC based on its frontmatter tag. */
	isMOC(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.tags?.includes('moc') ?? false;
	}
	
	/** Checks if a MOC is a root MOC (i.e., its folder is at the top level of the vault). */
	isRootMOC(file: TFile): boolean {
		if (!this.isMOC(file)) return false;
		const folderPath = file.parent?.path || '';
		// A root MOC's folder is directly in the vault root.
		return !folderPath.includes('/');
	}

	/** Checks if a file is a prompt iteration (e.g., contains 'v1', 'v2'). */
	isPromptIteration(file: TFile): boolean {
		const noteType = this.app.metadataCache.getFileCache(file)?.frontmatter?.['note-type'];
		return noteType === 'prompt' && /v\d+/.test(file.basename);
	}

	/** Checks if a file is a prompt hub (a prompt that isn't an iteration). */
	isPromptHub(file: TFile): boolean {
		const noteType = this.app.metadataCache.getFileCache(file)?.frontmatter?.['note-type'];
		return noteType === 'prompt' && !this.isPromptIteration(file);
	}

	/** Detects if a file needs to be migrated to the hierarchical folder structure. */
	private needsFolderMigration(file: TFile): boolean {
		// A root MOC that is a file in the vault root needs a folder.
		if (this.isMOC(file) && this.isRootMOC(file) && file.parent?.isRoot()) {
			return true;
		}
		return false;
	}

	/** Detects a file's type based on its path or name. */
	private detectFileType(file: TFile): string | null {
		if (this.isMOC(file)) return 'moc';
		if (file.path.includes(`/${FOLDERS.Notes}/`)) return 'note';
		if (file.path.includes(`/${FOLDERS.Resources}/`)) return 'resource';
		if (file.path.includes(`/${FOLDERS.Prompts}/`)) return 'prompt';
		return null;
	}

	/** Gets all MOC files in the vault. */
	async getAllMOCs(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
	}

	/** Checks if making a MOC a parent of another would create a circular dependency. */
	detectCircularDependency(moc: TFile, potentialParent: TFile): boolean {
		const visited = new Set<string>();
		const queue: TFile[] = [moc];
		
		while (queue.length > 0) {
			const currentFile = queue.shift()!;
			if (visited.has(currentFile.path)) continue;
			visited.add(currentFile.path);
			
			if (currentFile.path === potentialParent.path) return true; // Cycle detected!
			
			const links = this.app.metadataCache.getFileCache(currentFile)?.links ?? [];
			for (const link of links) {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, currentFile.path);
				if (linkedFile && this.isMOC(linkedFile)) {
					queue.push(linkedFile);
				}
			}
		}
		return false;
	}

	// =================================================================================
	// UNLIMITED RANDOM SYSTEM (DATA ONLY)
	// =================================================================================

	/**
	 * Generates a random, visually appealing RGB color and its light/dark variants.
	 */
	private generateRandomColor(): { lightColor: string, darkColor: string, hex: string } {
		// Generate RGB values that are not too dark or too light for good visibility.
		const randomChannel = () => 64 + Math.floor(Math.random() * (224 - 64));
		const r = randomChannel(), g = randomChannel(), b = randomChannel();
		
		const toHex = (c: number) => c.toString(16).padStart(2, '0');
		const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
		
		// Create a brighter variant for dark mode.
		const lightR = Math.min(255, r + 50);
		const lightG = Math.min(255, g + 50);
		const lightB = Math.min(255, b + 50);
		const lightHex = `#${toHex(lightR)}${toHex(lightG)}${toHex(lightB)}`;
		
		return { lightColor: hex, darkColor: lightHex, hex: hex };
	}

	/**
	 * Selects a random emoji from a wide range of Unicode blocks.
	 */
	private getRandomEmoji(): string {
		const emojiRanges = [
			[0x1F600, 0x1F64F], // Emoticons
			[0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
			[0x1F680, 0x1F6FF], // Transport and Map Symbols
			[0x1F900, 0x1F9FF], // Supplemental Symbols and Pictographs
		];
		
		const range = emojiRanges[Math.floor(Math.random() * emojiRanges.length)];
		const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
		return String.fromCodePoint(codePoint);
	}
}


// =================================================================================
// MODAL DIALOGS
// =================================================================================
// These are largely unchanged as they were already well-structured.

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
			
			const updateList = contentEl.createEl('div', { cls: 'moc-system-update-list' });

			for (const file of this.updatePlan.filesToUpdate) {
				const updates = this.updatePlan.updateSummary.get(file) || [];
				
				const fileItem = updateList.createEl('div');
				fileItem.createEl('div', { text: file.path, cls: 'moc-system-update-filepath' });
				
				const updatesList = fileItem.createEl('ul');
				updates.forEach(update => updatesList.createEl('li', { text: update }));
			}
		}

		contentEl.createEl('p', { 
			text: 'This will modify files to match the latest system requirements. It is recommended to have a backup.',
			cls: 'mod-warning'
		});

		const buttonContainer = contentEl.createDiv({ cls: 'moc-system-modal-buttons' });
		buttonContainer.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		buttonContainer.createEl('button', { text: `Update ${this.updatePlan.filesToUpdate.length} Files`, cls: 'mod-cta' }).addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

class CreateMOCModal extends Modal {
	constructor(app: App, private onSubmit: (name: string) => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create new MOC' });

		const inputEl = contentEl.createEl('input', { type: 'text', placeholder: 'MOC name...' });
		inputEl.style.width = '100%';
		inputEl.focus();

		const submit = () => {
			if (inputEl.value) {
				this.onSubmit(inputEl.value);
				this.close();
			}
		};

		inputEl.addEventListener('keypress', (e) => e.key === 'Enter' && submit());
		contentEl.createEl('button', { text: 'Create' }).addEventListener('click', submit);
	}

	onClose() {
		this.contentEl.empty();
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

		const options: { type: SectionType, label: string, action: (name: string) => Promise<any> }[] = [
			{ type: 'MOCs', label: 'Sub-MOC', action: (name) => this.plugin.createSubMOC(this.moc, name) },
			{ type: 'Notes', label: 'Note', action: (name) => this.plugin.createNote(this.moc, name) },
			{ type: 'Resources', label: 'Resource', action: (name) => this.plugin.createResource(this.moc, name) },
			{ type: 'Prompts', label: 'Prompt', action: (name) => this.plugin.createPrompt(this.moc, name) }
		];

		options.forEach(option => {
			const button = contentEl.createEl('button', { text: `Create ${option.label}`, cls: 'mod-cta' });
			button.style.cssText = 'display: block; width: 100%; margin-bottom: 10px;';
			button.addEventListener('click', () => {
				this.close();
				new CreateItemModal(this.app, option.label, option.action).open();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
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

		const inputEl = contentEl.createEl('input', { type: 'text', placeholder: `${this.itemType} name...` });
		inputEl.style.width = '100%';
		inputEl.focus();

		const submit = () => {
			if (inputEl.value) {
				this.onSubmit(inputEl.value);
				this.close();
			}
		};
		
		inputEl.addEventListener('keypress', (e) => e.key === 'Enter' && submit());
		contentEl.createEl('button', { text: 'Create' }).addEventListener('click', submit);
	}

	onClose() {
		this.contentEl.empty();
	}
}

class PromptDescriptionModal extends Modal {
	constructor(app: App, private onSubmit: (description: string) => void) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Add iteration description (optional)' });

		const inputEl = contentEl.createEl('input', { type: 'text', placeholder: 'Description...' });
		inputEl.style.width = '100%';
		inputEl.focus();

		const buttonContainer = contentEl.createDiv({ cls: 'moc-system-modal-buttons' });
		buttonContainer.createEl('button', { text: 'Skip' }).addEventListener('click', () => {
			this.onSubmit('');
			this.close();
		});
		buttonContainer.createEl('button', { text: 'Add Description', cls: 'mod-cta' }).addEventListener('click', () => {
			this.onSubmit(inputEl.value);
			this.close();
		});

		inputEl.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				this.onSubmit(inputEl.value);
				this.close();
			}
		});
	}

	onClose() {
		this.contentEl.empty();
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
		contentEl.createEl('p', { text: `This will permanently delete ${this.filesToDelete.length} files created by this plugin.` });
		contentEl.createEl('p', { text: 'This action cannot be undone.', cls: 'mod-warning' });

		if (this.filesToDelete.length > 0) {
			const fileList = contentEl.createEl('ul', { cls: 'moc-system-file-list' });
			this.filesToDelete.slice(0, 20).forEach(file => fileList.createEl('li', { text: file.path }));
			if (this.filesToDelete.length > 20) fileList.createEl('li', { text: `... and ${this.filesToDelete.length - 20} more.`});
		}

		const buttonContainer = contentEl.createDiv({ cls: 'moc-system-modal-buttons' });
		buttonContainer.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		buttonContainer.createEl('button', { text: 'Delete All Files', cls: 'mod-warning' }).addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
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
		
		const createButton = (text: string, onClick: () => void, isCta = false) => {
			const btn = contentEl.createEl('button', { text, cls: isCta ? 'mod-cta' : '' });
			btn.style.cssText = 'display: block; width: 100%; margin-bottom: 10px;';
			btn.addEventListener('click', onClick);
		};

		if (isRootMOC) {
			contentEl.createEl('p', { text: 'This is a root MOC. You can move it under another MOC.' });
			createButton('Move under a NEW parent MOC', () => {
				this.close();
				new CreateParentMOCModal(this.app, this.moc, this.plugin).open();
			}, true);
			createButton('Move under an EXISTING parent MOC', async () => {
				const availableParents = (await this.plugin.getAllMOCs()).filter(m => m.path !== this.moc.path && !this.plugin.detectCircularDependency(this.moc, m));
				if (availableParents.length === 0) return new Notice('No suitable parent MOCs available.');
				this.close();
				new SelectParentMOCModal(this.app, this.moc, availableParents, this.plugin, false).open();
			});
		} else {
			contentEl.createEl('p', { text: 'This is a sub-MOC. You can promote it or move it.' });
			createButton('Promote to a root MOC', () => {
				this.plugin.promoteSubMOCToRoot(this.moc);
				this.close();
			}, true);
			createButton('Move to a different parent MOC', async () => {
				const availableParents = (await this.plugin.getAllMOCs()).filter(m => m.path !== this.moc.path && !this.plugin.detectCircularDependency(this.moc, m));
				if (availableParents.length === 0) return new Notice('No suitable parent MOCs available.');
				this.close();
				new SelectParentMOCModal(this.app, this.moc, availableParents, this.plugin, true).open();
			});
		}
	}

	onClose() {
		this.contentEl.empty();
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
		contentEl.createEl('h2', { text: 'Create New Parent MOC' });
		contentEl.createEl('p', { text: `This will create a new root MOC and move "${this.childMOC.basename}" under it.` });

		const inputEl = contentEl.createEl('input', { type: 'text', placeholder: 'Parent MOC name...' });
		inputEl.style.width = '100%';
		inputEl.focus();

		const submit = () => {
			const name = inputEl.value.trim();
			if (name) {
				this.plugin.moveRootMOCToSub(this.childMOC, name, null);
				this.close();
			}
		};

		inputEl.addEventListener('keypress', (e) => e.key === 'Enter' && submit());
		const buttonContainer = contentEl.createDiv({ cls: 'moc-system-modal-buttons' });
		buttonContainer.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
		buttonContainer.createEl('button', { text: 'Create & Move', cls: 'mod-cta' }).addEventListener('click', submit);
	}

	onClose() {
		this.contentEl.empty();
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
		contentEl.createEl('h2', { text: 'Select Parent MOC' });
		contentEl.createEl('p', { text: `Choose where to move "${this.childMOC.basename}":` });

		const listContainer = contentEl.createDiv({ cls: 'moc-system-scroll-list' });
		
		this.availableMOCs.sort((a, b) => a.path.localeCompare(b.path)).forEach(moc => {
			const item = listContainer.createEl('div', { text: moc.path, cls: 'moc-system-list-item' });
			item.addEventListener('click', () => {
				if (this.isMovingSubMOC) {
					this.plugin.moveSubMOCToNewParent(this.childMOC, moc);
				} else {
					this.plugin.moveRootMOCToSub(this.childMOC, null, moc);
				}
				this.close();
			});
		});

		contentEl.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
	}

	onClose() {
		this.contentEl.empty();
	}
}