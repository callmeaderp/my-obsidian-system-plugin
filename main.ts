import { App, Modal, Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian';

// =================================================================================
// PLUGIN CONSTANTS AND TYPES
// =================================================================================

/**
 * Plugin settings interface (currently empty but maintained for future extensibility)
 */
type PluginSettings = Record<string, never>;

/**
 * Default plugin settings
 */
const DEFAULT_SETTINGS: PluginSettings = {};

/**
 * Defines the subfolder names within a MOC's primary folder.
 * Each MOC folder contains these three subfolders for organizing different content types.
 * 
 * WHY: This structure was chosen to provide clear separation of concerns within each MOC.
 * Having dedicated folders prevents naming conflicts and makes the file explorer more scannable.
 * The folder names are intentionally plural to indicate they contain collections.
 */
const FOLDERS = {
	Notes: 'Notes',
	Resources: 'Resources',
	Prompts: 'Prompts'
} as const;

/**
 * Defines the standard order of sections within a MOC file.
 * This order is enforced when adding new content to ensure consistency.
 * 
 * WHY: This specific order follows a hierarchy from most abstract (other MOCs) to most
 * concrete (prompts). MOCs come first as they represent the highest level of organization,
 * followed by content (Notes), reference materials (Resources), and finally AI interactions (Prompts).
 * This ordering helps users mentally navigate from structure to content to tools.
 */
const SECTION_ORDER = ['MOCs', 'Notes', 'Resources', 'Prompts'] as const;
type SectionType = typeof SECTION_ORDER[number];

/**
 * Defines the standard emoji prefixes for different note types.
 * These emojis are prepended to filenames for visual identification.
 * 
 * WHY: Fixed emojis for non-MOC types provide instant visual recognition in the file explorer.
 * The specific choices:
 * - 📝 (Notes): Universal symbol for writing/documentation
 * - 📁 (Resources): Represents stored reference materials
 * - 🤖 (Prompts): Clearly indicates AI/LLM interaction files
 * - 🔵 (MOCs fallback): Only used as a default; actual MOCs get random emojis for distinction
 * 
 * Random emojis for MOCs were chosen to make each MOC visually unique and memorable,
 * helping with quick identification when scanning many MOCs.
 */
const NOTE_TYPES = {
	MOCs: { emoji: '🔵' }, // Default for sub-MOCs, though new ones get random emojis
	Notes: { emoji: '📝' },
	Resources: { emoji: '📁' },
	Prompts: { emoji: '🤖' }
} as const;


// =================================================================================
// INTERFACES
// =================================================================================

/**
 * Represents the result of updating a single file during vault modernization.
 * Tracks whether the update succeeded and what changes were applied.
 */
interface UpdateResult {
	file: TFile;
	changes: string[];
	success: boolean;
	error?: string;
}

/**
 * Represents a plan for updating multiple files in the vault.
 * Used to preview changes before executing them.
 */
interface VaultUpdatePlan {
	filesToUpdate: TFile[];
	updateSummary: Map<TFile, string[]>;
	totalChanges: number;
}


// =================================================================================
// MAIN PLUGIN CLASS
// =================================================================================

/**
 * Main plugin class for the MOC System Plugin.
 * 
 * This plugin implements a hierarchical note-taking system based on Maps of Content (MOCs).
 * Each MOC serves as a hub that organizes related sub-MOCs, notes, resources, and prompts.
 * 
 * Key features:
 * - Context-aware note creation based on current location
 * - Hierarchical folder structure with each MOC having its own folder
 * - Automatic organization of content into predefined sections
 * - Prompt iteration management with version control
 * - MOC reorganization capabilities (promote/demote/move)
 * - Vault-wide modernization tools
 * - Cleanup utilities for safe file removal
 */
export default class MOCSystemPlugin extends Plugin {
	settings: PluginSettings;
	private styleElement: HTMLStyleElement | null = null;

	/**
	 * Plugin initialization and setup.
	 * Loads settings, registers commands, and sets up event listeners.
	 * 
	 * WHY: The initialization order matters - settings must load first as they may affect
	 * other operations, then styles for immediate visual feedback, then commands become available.
	 */
	async onload() {
		await this.loadSettings();
		await this.loadStyles();

		// --- Command Registration ---
		// WHY: This is the primary command and comes first. Context-aware creation reduces
		// cognitive load by determining the appropriate action based on current location.
		this.addCommand({
			id: 'moc-context-create',
			name: 'Create MOC or add content',
			callback: () => this.handleContextCreate()
		});

		// WHY: checkCallback is used here instead of callback because this command should only
		// be available when the active file is a MOC. This prevents user confusion and errors.
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
		// WHY: Automatic broken link cleanup maintains vault integrity without user intervention.
		// This prevents the accumulation of dead links which could confuse users and break navigation.
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.cleanupBrokenLinks(file);
				}
			})
		);
	}

	/**
	 * Plugin cleanup and teardown.
	 * Removes injected styles when the plugin is disabled.
	 */
	onunload() {
		this.removeStyles();
	}

	/**
	 * Loads plugin settings from disk.
	 * Merges saved settings with defaults to ensure all properties exist.
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Saves current plugin settings to disk.
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Loads and injects CSS styles for MOC folder highlighting.
	 * 
	 * Reads the styles.css file and injects it into the document head
	 * to provide visual distinction for MOC folders in the file explorer.
	 */
	async loadStyles() {
		try {
			const cssPath = normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/styles.css`);
			const cssContent = await this.app.vault.adapter.read(cssPath);
			
			this.styleElement = document.createElement('style');
			this.styleElement.id = 'moc-system-plugin-styles';
			this.styleElement.textContent = cssContent;
			document.head.appendChild(this.styleElement);
		} catch (error) {
			console.warn('MOC System Plugin: Could not load styles.css', error);
		}
	}

	/**
	 * Removes injected CSS styles.
	 * 
	 * Called during plugin unload to clean up any styling changes.
	 */
	removeStyles() {
		if (this.styleElement) {
			this.styleElement.remove();
			this.styleElement = null;
		}
	}

	// =================================================================================
	// CORE CREATION LOGIC
	// =================================================================================

	/**
	 * Handles the main command, creating a new root MOC or adding content to an existing one.
	 * 
	 * This is the primary entry point for user interaction with the plugin.
	 * If the user is not currently in a MOC, it opens a modal to create a new root MOC.
	 * If the user is in a MOC, it opens a modal to add new content to that MOC.
	 */
	async handleContextCreate() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile || !this.isMOC(activeFile)) {
			// If not in a MOC, open modal to create a new root MOC.
			new CreateMOCModal(this.app, this, async (name: string) => {
				// MOC creation is now handled within the modal
			}).open();
		} else {
			// If in a MOC, open modal to add new content (Sub-MOC, Note, etc.).
			new AddToMOCModal(this.app, activeFile, this).open();
		}
	}

	/**
	 * Creates a new root MOC, including its dedicated folder structure.
	 * 
	 * This method:
	 * 1. Generates a random emoji prefix for visual identification
	 * 2. Creates a dedicated folder for the MOC
	 * 3. Creates subfolders (Notes, Resources, Prompts) within that folder
	 * 4. Creates the MOC file with appropriate frontmatter
	 * 5. Opens the newly created file in the workspace
	 * 
	 * WHY: Each MOC gets its own folder to prevent file sprawl and maintain clear boundaries
	 * between different knowledge domains. The MOC file has the same name as its folder for
	 * consistency and to reinforce the 1:1 relationship between MOC and folder.
	 * 
	 * @param name The name of the new MOC (without emoji prefix or 'MOC' suffix)
	 * @returns The newly created MOC file
	 */
	async createMOC(name: string): Promise<TFile> {
		// Generate a random emoji for visual identification
		const randomEmoji = this.getRandomEmoji();
		
		// Create folder and file paths
		// WHY: The folder and file share the same name to reinforce that a MOC
		// represents both a concept (the file) and a container (the folder).
		const mocFolderName = `${randomEmoji} ${name} MOC`;
		const mocFilePath = `${mocFolderName}/${mocFolderName}.md`;
		
		// Ensure the MOC folder and its subfolders exist
		await this.ensureMOCFolderStructure(mocFolderName);
		
		// Create the MOC file with minimal frontmatter
		// WHY: Minimal frontmatter keeps MOCs clean and focused on content. The 'tags' array
		// format is used for Obsidian compatibility, while 'note-type' provides plugin-specific
		// metadata. No content is added to encourage users to define their own structure.
		const content = `---
tags:
  - moc
note-type: moc
---
`;
		
		const file = await this.app.vault.create(mocFilePath, content);
		await this.app.workspace.getLeaf().openFile(file);
		new Notice(`Created MOC: ${name}`);
		return file;
	}

	/**
	 * Creates a new sub-MOC within a parent MOC's folder structure.
	 * 
	 * Similar to createMOC but:
	 * 1. Places the new MOC folder within the parent MOC's folder
	 * 2. Automatically adds a link to the new sub-MOC in the parent's MOCs section
	 * 
	 * @param parentMOC The file of the parent MOC where this sub-MOC will be nested
	 * @param name The name of the new sub-MOC (without emoji prefix or 'MOC' suffix)
	 * @returns The newly created sub-MOC file
	 */
	async createSubMOC(parentMOC: TFile, name: string): Promise<TFile> {
		// Generate a random emoji for visual identification
		const randomEmoji = this.getRandomEmoji();
		const parentFolder = parentMOC.parent?.path || '';
		
		// Create folder and file paths within the parent MOC's folder
		const subMocFolderName = `${parentFolder}/${randomEmoji} ${name} MOC`;
		const subMocFilePath = `${subMocFolderName}/${randomEmoji} ${name} MOC.md`;
		
		// Ensure the sub-MOC folder and its subfolders exist
		await this.ensureMOCFolderStructure(subMocFolderName);
		
		// Create the sub-MOC file with minimal frontmatter
		const content = `---
tags:
  - moc
note-type: moc
---
`;
		
		const file = await this.app.vault.create(normalizePath(subMocFilePath), content);
		await this.addToMOCSection(parentMOC, 'MOCs', file);
		new Notice(`Created sub-MOC: ${name}`);
		return file;
	}

	/**
	 * Creates a new note inside a parent MOC's "Notes" subfolder.
	 * 
	 * Notes are the primary content files within a MOC.
	 * They are automatically:
	 * 1. Prefixed with 📝 emoji
	 * 2. Placed in the MOC's Notes subfolder
	 * 3. Tagged with note-type: note in frontmatter
	 * 4. Linked in the parent MOC's Notes section
	 * 
	 * @param parentMOC The file of the parent MOC where this note belongs
	 * @param name The name of the new note (without emoji prefix)
	 * @returns The newly created note file
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
	 * 
	 * Resources are reference materials or external content related to a MOC.
	 * They are automatically:
	 * 1. Prefixed with 📁 emoji
	 * 2. Placed in the MOC's Resources subfolder
	 * 3. Tagged with note-type: resource in frontmatter
	 * 4. Linked in the parent MOC's Resources section
	 * 
	 * @param parentMOC The file of the parent MOC where this resource belongs
	 * @param name The name of the new resource (without emoji prefix)
	 * @returns The newly created resource file
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
	 * Creates a new prompt hub and its first iteration inside a dedicated subfolder.
	 * 
	 * Prompts are special files designed for LLM interactions.
	 * This method creates:
	 * 1. A dedicated subfolder for the prompt within the Prompts folder
	 * 2. A prompt hub file that tracks all iterations
	 * 3. The first iteration (v1) of the prompt
	 * 
	 * Structure created:
	 * - MOC/Prompts/PromptName/🤖 PromptName.md (hub)
	 * - MOC/Prompts/PromptName/🤖 PromptName v1.md (iteration)
	 * 
	 * The hub includes:
	 * - An Iterations section with links to all versions
	 * - An LLM Links section with a code block for storing URLs
	 * 
	 * @param parentMOC The file of the parent MOC where this prompt belongs
	 * @param name The name of the new prompt (without emoji prefix or version)
	 * @returns The newly created prompt hub file
	 */
	async createPrompt(parentMOC: TFile, name: string): Promise<TFile> {
		const parentFolder = parentMOC.parent?.path || '';
		const promptsFolder = `${parentFolder}/${FOLDERS.Prompts}`;
		const promptSubfolder = `${promptsFolder}/${name}`;
		const iterationBasename = `${NOTE_TYPES.Prompts.emoji} ${name} v1`;

		// Ensure the prompt's dedicated subfolder exists
		if (!this.app.vault.getAbstractFileByPath(promptSubfolder)) {
			await this.app.vault.createFolder(promptSubfolder);
		}

		// Create prompt hub in the subfolder
		const hubFileName = `${promptSubfolder}/${NOTE_TYPES.Prompts.emoji} ${name}.md`;
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
		
		// Create first iteration in the same subfolder
		const iterationFileName = `${promptSubfolder}/${iterationBasename}.md`;
		const iterationContent = `---\nnote-type: prompt\n---\n`;
		await this.app.vault.create(normalizePath(iterationFileName), iterationContent);
		
		await this.addToMOCSection(parentMOC, 'Prompts', hubFile);
		new Notice(`Created prompt: ${name}`);
		return hubFile;
	}

	/**
	 * Ensures the full folder structure for a given MOC exists.
	 * 
	 * Creates the MOC's main folder and all required subfolders:
	 * - Notes/
	 * - Resources/
	 * - Prompts/
	 * 
	 * Handles race conditions gracefully by ignoring "folder already exists" errors.
	 * 
	 * @param mocFolderPath The path to the MOC's main folder
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
	 * 
	 * This method:
	 * 1. Reads the MOC content and identifies section locations
	 * 2. Reorganizes sections to maintain the standard order (MOCs, Notes, Resources, Prompts)
	 * 3. Creates the section if it doesn't exist
	 * 4. Adds the new file link in the appropriate section
	 * 
	 * The reorganization ensures that plugin-managed sections always appear
	 * at the top of the file in the correct order, with any user content below.
	 * 
	 * WHY: This approach preserves user customizations while enforcing structure. By moving
	 * plugin sections to the top, we ensure consistency across all MOCs while allowing users
	 * to add custom content below without interference.
	 * 
	 * @param moc The MOC file to modify
	 * @param section The section to add the link to (must be one of SECTION_ORDER)
	 * @param newFile The file to link to (will use its basename for the link)
	 */
	async addToMOCSection(moc: TFile, section: SectionType, newFile: TFile) {
		let content = await this.app.vault.read(moc);
		let lines = content.split('\n');
		
		// Identify where frontmatter ends to avoid modifying it
		let frontmatterEnd = 0;
		if (lines[0] === '---') {
			// Find the closing '---' after the opening one
			// WHY: slice(1) skips the first '---' to find the closing one
			frontmatterEnd = lines.slice(1).indexOf('---') + 2;
		}
		
		const { reorganizedLines, sectionIndices } = this.reorganizeContentForPluginSections(lines, frontmatterEnd);
		
		let sectionLineIndex = sectionIndices.get(section);
		
		if (sectionLineIndex === undefined) {
			// Section doesn't exist, create it in the correct order.
			let insertIndex = frontmatterEnd;
			const currentSectionOrderIndex = SECTION_ORDER.indexOf(section);

			// Find the next existing section to insert before.
			// WHY: We insert new sections before later sections to maintain the standard order.
			// This ensures MOCs always comes before Notes, which comes before Resources, etc.
			for (let i = currentSectionOrderIndex + 1; i < SECTION_ORDER.length; i++) {
				const nextSection = SECTION_ORDER[i];
				if (sectionIndices.has(nextSection)) {
					insertIndex = sectionIndices.get(nextSection)!;
					break;
				}
			}

			// If no later sections exist, append after the last known plugin section.
			// WHY: This keeps all plugin sections grouped together before user content.
			if (insertIndex === frontmatterEnd && sectionIndices.size > 0) {
				const lastSectionIndex = Math.max(...Array.from(sectionIndices.values()));
				insertIndex = this.findSectionEnd(reorganizedLines, lastSectionIndex);
			}

			// WHY: Empty lines before and after provide visual separation between sections
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
	 * 
	 * This method maintains the integrity of the MOC structure by:
	 * 1. Identifying all plugin-managed sections (MOCs, Notes, Resources, Prompts)
	 * 2. Extracting them with their content
	 * 3. Placing them at the top of the file in the standard order
	 * 4. Moving any other user content to the end of the file
	 * 
	 * This ensures consistent MOC structure while preserving user customizations.
	 * 
	 * WHY: This complex reorganization is necessary because users might manually edit MOCs
	 * and disorder sections. By enforcing order only for plugin sections, we maintain
	 * structure without destroying user customizations.
	 * 
	 * @param lines The lines of the MOC file split by newlines
	 * @param frontmatterEnd The index of the line after the closing '---' of frontmatter
	 * @returns An object containing the reorganized lines and a map of section start indices
	 */
	private reorganizeContentForPluginSections(lines: string[], frontmatterEnd: number): { reorganizedLines: string[], sectionIndices: Map<SectionType, number> } {
		const pluginSections: { name: SectionType, content: string[] }[] = [];
		const otherContentLines: string[] = [];
		const sectionIndices = new Map<SectionType, number>();

		// Track which lines belong to plugin sections to avoid duplicating them
		const consumedLineIndices = new Set<number>();

		// 1. Extract all known plugin sections
		// WHY: We iterate in SECTION_ORDER to maintain the desired sequence even during extraction
		for (const sectionName of SECTION_ORDER) {
			const header = `## ${sectionName}`;
			// Start searching after frontmatter to avoid matching content within it
			const startIndex = lines.findIndex((line, i) => i >= frontmatterEnd && line.trim() === header);

			if (startIndex !== -1) {
				const endIndex = this.findSectionEnd(lines, startIndex);
				const sectionContent = lines.slice(startIndex, endIndex);
				pluginSections.push({ name: sectionName, content: sectionContent });

				// Mark these lines as "consumed"
				// WHY: This prevents the same lines from being included in otherContentLines,
				// avoiding duplication when we rebuild the file
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
	 * 
	 * Used to determine where one section ends and another begins.
	 * Sections are delimited by H2 headings (lines starting with '## ').
	 * 
	 * @param lines The array of file lines
	 * @param sectionStartIndex The index where the current section starts
	 * @returns The index where the section ends (exclusive)
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
	 * 
	 * This method:
	 * 1. Parses the current version from the filename (e.g., "v2" from "Prompt v2.md")
	 * 2. Finds the highest version number among all iterations
	 * 3. Creates a new iteration with the next version number
	 * 4. Optionally adds a description to the filename
	 * 5. Updates the prompt hub to include the new iteration
	 * 
	 * WHY: Version numbers provide clear evolution tracking for prompts. Finding the max version
	 * ensures we don't accidentally overwrite existing iterations if versions were created out of order.
	 * 
	 * @param file The prompt iteration file to duplicate (must match pattern "*v\d+*")
	 */
	async duplicatePromptIteration(file: TFile) {
		// Extract base name and version from filename
		// WHY: The regex handles optional emoji prefix and captures name + version separately
		const match = file.basename.match(/^(?:🤖\s+)?(.+?)\s*v(\d+)/);
		if (!match) return;
		
		const [, baseName] = match;
		const promptsFolder = file.parent;
		if (!promptsFolder) return;
		
		// Find all sibling files that are iterations of the same prompt
		const siblings = promptsFolder.children.filter(f => f instanceof TFile && f.name.includes(baseName) && f.name.match(/v(\d+)/)) as TFile[];
		
		// Find highest existing version to determine next version
		// WHY: We scan all siblings rather than just incrementing from current file's version
		// to handle cases where versions might have been created out of order
		let maxVersion = 0;
		for (const pFile of siblings) {
			const vMatch = pFile.basename.match(/v(\d+)/);
			if (vMatch) maxVersion = Math.max(maxVersion, parseInt(vMatch[1]));
		}
		const nextVersion = maxVersion + 1;
		
		new PromptDescriptionModal(this.app, async (description: string) => {
			const descPart = description ? ` - ${description}` : '';
			const newName = `${NOTE_TYPES.Prompts.emoji} ${baseName} v${nextVersion}${descPart}`;
			
			const promptSubfolder = promptsFolder.path;
			const newPath = `${promptSubfolder}/${newName}.md`;
			const originalContent = await this.app.vault.read(file);
			const contentWithFrontmatter = originalContent.startsWith('---') ? originalContent : `---\nnote-type: prompt\n---\n\n${originalContent}`;
			
			const newFile = await this.app.vault.create(normalizePath(newPath), contentWithFrontmatter);
			
			await this.updatePromptHub(baseName, newFile, promptSubfolder);
			await this.app.workspace.getLeaf().openFile(newFile);
			new Notice(`Created iteration: ${newName}`);
		}).open();
	}
	
	/**
	 * Adds a link to a new prompt iteration to its corresponding hub file.
	 * 
	 * The hub file maintains a list of all iterations in its "## Iterations" section.
	 * This method finds that section and appends the new iteration link.
	 * Now works with the new subfolder structure where hubs are in dedicated subfolders.
	 * 
	 * @param baseName The base name of the prompt (without emoji or version)
	 * @param newIteration The newly created iteration file to link
	 * @param promptSubfolderPath The path to the prompt's dedicated subfolder
	 */
	async updatePromptHub(baseName: string, newIteration: TFile, promptSubfolderPath: string) {
		const hubPath = `${promptSubfolderPath}/${NOTE_TYPES.Prompts.emoji} ${baseName}.md`;
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
	 * 
	 * Searches for a code block with the following format:
	 * ```llm-links
	 * https://example.com/chat1
	 * https://example.com/chat2
	 * ```
	 * 
	 * Each URL is opened in a new browser tab.
	 * 
	 * @param file The prompt hub file to search for LLM links
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
	 * 
	 * The modal options depend on whether the MOC is:
	 * - A root MOC: Can be moved under a parent
	 * - A sub-MOC: Can be promoted to root or moved to a different parent
	 * 
	 * @param moc The MOC file to reorganize
	 */
	async reorganizeMOC(moc: TFile) {
		new ReorganizeMOCModal(this.app, moc, this).open();
	}

	/**
	 * Converts a root MOC into a sub-MOC by moving its folder under a parent MOC.
	 * 
	 * This operation:
	 * 1. Creates a new parent MOC if needed (when parentMOCName is provided)
	 * 2. Moves the entire MOC folder to be a subfolder of the parent
	 * 3. Updates the parent MOC to include a link to the moved MOC
	 * 4. Obsidian automatically updates all internal links
	 * 
	 * @param moc The root MOC to move
	 * @param parentMOCName The name for a new parent MOC to be created (if existingParent is null)
	 * @param existingParent An existing MOC to use as the parent (if provided, parentMOCName is ignored)
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
	 * 
	 * This operation:
	 * 1. Removes all links to this MOC from any parent MOCs
	 * 2. Moves the MOC folder to the vault root
	 * 3. Opens the promoted MOC in the workspace
	 * 
	 * WHY: Promotion allows users to elevate a sub-topic to a main topic as their knowledge
	 * structure evolves. Removing parent links first prevents broken references.
	 * 
	 * @param moc The sub-MOC to promote to root level
	 */
	async promoteSubMOCToRoot(moc: TFile) {
		try {
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found.');

			// The new path is just the folder's name at the vault root.
			// WHY: No path prefix means vault root in Obsidian's file system
			const newFolderPath = mocFolder.name;
			
			// WHY: Remove links first to prevent broken references after the move
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
	 * 
	 * This operation:
	 * 1. Removes links to this MOC from all current parent MOCs
	 * 2. Moves the MOC folder to be under the new parent's folder
	 * 3. Adds a link to the moved MOC in the new parent's MOCs section
	 * 
	 * @param moc The sub-MOC to move
	 * @param newParent The new parent MOC (must not create circular dependency)
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
	 * 
	 * Used when moving or promoting MOCs to clean up old parent relationships.
	 * Searches all MOCs in the vault and removes any links matching the pattern:
	 * `- [[MOC Name]]`
	 * 
	 * @param moc The MOC file whose links should be removed from all parents
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
	 * 
	 * This comprehensive modernization tool:
	 * 1. Scans all markdown files in the vault
	 * 2. Identifies files that need updates (missing metadata, old structure, etc.)
	 * 3. Presents a preview of all planned changes
	 * 4. Executes updates upon user confirmation
	 * 
	 * Common updates include:
	 * - Adding missing note-type frontmatter
	 * - Migrating to hierarchical folder structure
	 * - Adding required emoji prefixes
	 * - Adding MOC suffix to MOC filenames
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
	 * 
	 * Examines each markdown file to determine if it:
	 * - Is a plugin-managed file (has note-type or looks like one)
	 * - Needs any updates to conform to current standards
	 * 
	 * @returns A comprehensive plan detailing all files and their required updates
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
	 * 
	 * Checks for:
	 * 1. Missing note-type metadata
	 * 2. Files that need migration to hierarchical folder structure
	 * 3. MOCs missing required suffix or emoji prefix
	 * 4. Other file types missing their emoji prefixes
	 * 
	 * WHY: This comprehensive checking allows us to modernize vaults created with older
	 * versions of the plugin or manually created files that follow the naming convention
	 * but lack proper metadata.
	 * 
	 * @param file The file to analyze
	 * @returns Array of human-readable update descriptions
	 */
	async detectRequiredUpdates(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		const noteType = cache?.frontmatter?.['note-type'];
		
		const isPluginFile = noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
		// A file is a potential plugin file if it looks like one, even without metadata
		// WHY: We check both metadata and path/naming patterns to catch files created manually
		// or with older plugin versions that might not have complete metadata
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
			
			// Check for emoji prefix using Unicode ranges
			// WHY: We check multiple Unicode ranges to catch any emoji, not just specific ones.
			// The 'u' flag enables proper Unicode matching for emoji characters.
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
	 * 
	 * Applies all planned updates to each file in sequence.
	 * Tracks success/failure for each file and reports overall results.
	 * 
	 * @param plan The update plan generated by analyzeVaultForUpdates
	 * @returns Array of results for each file update attempt
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
	 * 
	 * Processes each update in sequence:
	 * - Frontmatter updates are applied via processFrontMatter
	 * - File moves/renames update the currentFile reference
	 * - All updates are tracked for reporting
	 * 
	 * @param file The file to update
	 * @param updates Array of update descriptions to apply
	 * @returns Result object indicating success and any errors
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
	 * 
	 * Currently only handles root MOCs that need their own folders.
	 * Other files require manual reorganization via the "Reorganize MOC" command
	 * because the plugin cannot determine their intended parent MOC.
	 * 
	 * @param file The file to migrate
	 * @returns The file at its new location (or original if not migrated)
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
	 * 
	 * Handles:
	 * - Adding emoji prefixes based on file type
	 * - Adding 'MOC' suffix to MOC files
	 * - Preserving the file extension and path
	 * 
	 * @param file The file to rename
	 * @param update The update description (used to determine what to add)
	 * @returns The file at its new location after renaming
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
	 * 
	 * Identifies all files with note-type frontmatter (moc, note, resource, prompt)
	 * and presents them for deletion. This is a destructive operation that
	 * cannot be undone, so user confirmation is required.
	 * 
	 * Note: Only deletes files, not folders. Empty folders remain.
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
					// WHY: Individual file deletion failures shouldn't stop the cleanup process.
					// We log the error for debugging but continue with remaining files.
					console.error(`Failed to delete ${file.path}:`, error);
				}
			}
			new Notice(`Cleanup complete! Deleted ${deletedCount} files.`);
		}).open();
	}
	
	/**
	 * Removes broken links from all files when a file is deleted.
	 * 
	 * Automatically triggered when any file is deleted.
	 * Searches all markdown files for links to the deleted file
	 * and removes those link lines to prevent broken references.
	 * 
	 * @param deletedFile The file that was just deleted
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

	/**
	 * Checks if a file is a MOC based on its frontmatter tag.
	 * 
	 * A file is considered a MOC if it has 'moc' in its tags array.
	 * This is the primary way to identify MOCs regardless of filename.
	 * 
	 * @param file The file to check
	 * @returns true if the file is tagged as a MOC
	 */
	isMOC(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.tags?.includes('moc') ?? false;
	}
	
	/**
	 * Checks if a MOC is a root MOC (i.e., its folder is at the top level of the vault).
	 * 
	 * Root MOCs have their folders directly in the vault root.
	 * Sub-MOCs have their folders nested within other MOC folders.
	 * 
	 * @param file The file to check
	 * @returns true if the MOC's folder is at the vault root level
	 */
	isRootMOC(file: TFile): boolean {
		if (!this.isMOC(file)) return false;
		const folderPath = file.parent?.path || '';
		// A root MOC's folder is directly in the vault root.
		return !folderPath.includes('/');
	}

	/**
	 * Checks if a file is a prompt iteration (e.g., contains 'v1', 'v2').
	 * 
	 * Prompt iterations are versioned files with patterns like:
	 * - "Prompt v1.md"
	 * - "Prompt v2 - description.md"
	 * 
	 * @param file The file to check
	 * @returns true if the file is a prompt iteration with version number
	 */
	isPromptIteration(file: TFile): boolean {
		const noteType = this.app.metadataCache.getFileCache(file)?.frontmatter?.['note-type'];
		return noteType === 'prompt' && /v\d+/.test(file.basename);
	}

	/**
	 * Checks if a file is a prompt hub (a prompt that isn't an iteration).
	 * 
	 * Prompt hubs are the main prompt files that track all iterations.
	 * They don't have version numbers in their names.
	 * 
	 * @param file The file to check
	 * @returns true if the file is a prompt hub (not an iteration)
	 */
	isPromptHub(file: TFile): boolean {
		const noteType = this.app.metadataCache.getFileCache(file)?.frontmatter?.['note-type'];
		return noteType === 'prompt' && !this.isPromptIteration(file);
	}

	/**
	 * Detects if a file needs to be migrated to the hierarchical folder structure.
	 * 
	 * Currently only detects root MOCs that are files in the vault root
	 * instead of having their own folders.
	 * 
	 * @param file The file to check
	 * @returns true if the file needs folder migration
	 */
	private needsFolderMigration(file: TFile): boolean {
		// A root MOC that is a file in the vault root needs a folder.
		if (this.isMOC(file) && this.isRootMOC(file) && file.parent?.isRoot()) {
			return true;
		}
		return false;
	}

	/**
	 * Detects a file's type based on its path or name.
	 * 
	 * Uses various heuristics:
	 * - MOCs are detected by tag
	 * - Other types are inferred from their folder location
	 * 
	 * @param file The file to analyze
	 * @returns The detected note-type or null if not a plugin file
	 */
	private detectFileType(file: TFile): string | null {
		if (this.isMOC(file)) return 'moc';
		if (file.path.includes(`/${FOLDERS.Notes}/`)) return 'note';
		if (file.path.includes(`/${FOLDERS.Resources}/`)) return 'resource';
		if (file.path.includes(`/${FOLDERS.Prompts}/`)) return 'prompt';
		return null;
	}

	/**
	 * Gets all MOC files in the vault.
	 * 
	 * Scans all markdown files and returns those tagged as MOCs.
	 * Used for reorganization operations and relationship management.
	 * 
	 * @returns Array of all MOC files in the vault
	 */
	async getAllMOCs(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
	}

	/**
	 * Checks if making a MOC a parent of another would create a circular dependency.
	 * 
	 * Prevents invalid hierarchies where:
	 * - A MOC would become its own ancestor
	 * - Two MOCs would be each other's parent/child
	 * 
	 * Uses breadth-first search through the link graph starting from the MOC.
	 * 
	 * WHY: Circular dependencies would break navigation and could cause infinite loops
	 * in traversal algorithms. BFS is used because it finds cycles efficiently without
	 * needing to traverse the entire graph.
	 * 
	 * @param moc The MOC that would become a child
	 * @param potentialParent The MOC that would become the parent
	 * @returns true if this relationship would create a cycle
	 */
	detectCircularDependency(moc: TFile, potentialParent: TFile): boolean {
		const visited = new Set<string>();
		const queue: TFile[] = [moc];
		
		// WHY: BFS traversal starting from the child MOC to see if we can reach the potential parent
		// If we can reach it, making it the parent would create a cycle
		while (queue.length > 0) {
			const currentFile = queue.shift()!;
			if (visited.has(currentFile.path)) continue;
			visited.add(currentFile.path);
			
			if (currentFile.path === potentialParent.path) return true; // Cycle detected!
			
			// Only follow links to other MOCs to build the hierarchy graph
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
	// RANDOM GENERATION UTILITIES
	// =================================================================================

	/**
	 * Selects a random emoji from a wide range of Unicode blocks.
	 * Used to provide visual identification for MOCs.
	 * 
	 * Emoji ranges include:
	 * - Emoticons (smileys and emotion)
	 * - Miscellaneous Symbols and Pictographs
	 * - Transport and Map Symbols
	 * - Supplemental Symbols and Pictographs
	 * 
	 * WHY: These specific ranges were chosen because they contain colorful, distinctive
	 * emojis that work well as visual markers. We avoid ranges with less recognizable
	 * symbols or those that might not render properly on all systems.
	 * 
	 * @returns A single random emoji character
	 */
	private getRandomEmoji(): string {
		const emojiRanges = [
			[0x1F600, 0x1F64F], // Emoticons
			[0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
			[0x1F680, 0x1F6FF], // Transport and Map Symbols
			[0x1F900, 0x1F9FF], // Supplemental Symbols and Pictographs
		];
		
		// WHY: First select a range randomly, then a code point within that range
		// This ensures even distribution across all emoji categories
		const range = emojiRanges[Math.floor(Math.random() * emojiRanges.length)];
		const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
		return String.fromCodePoint(codePoint);
	}
}


// =================================================================================
// MODAL DIALOGS
// =================================================================================

/**
 * Modal for displaying vault update plans and confirming execution.
 * 
 * Shows:
 * - Total number of files to update
 * - Detailed list of files and their required changes
 * - Warning about file modifications
 * - Confirm/Cancel buttons
 */
class VaultUpdateModal extends Modal {
	constructor(
		app: App,
		private updatePlan: VaultUpdatePlan,
		private onConfirm: () => void
	) {
		super(app);
	}

	/**
	 * Renders the vault update modal content.
	 * 
	 * Creates a detailed view of all pending updates with
	 * file paths and specific changes listed for each file.
	 */
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

	/**
	 * Cleanup method called when modal is closed.
	 */
	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Enhanced modal for creating a new root MOC with optional prompt creation.
 * 
 * Features:
 * - Text input for MOC name
 * - Checkbox to create a prompt alongside the MOC
 * - Optional prompt name input (inherits from MOC name if empty)
 * - Enter key submission support
 */
class CreateMOCModal extends Modal {
	constructor(
		app: App, 
		private plugin: MOCSystemPlugin,
		private onSubmit: (name: string) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Create new MOC' });

		// MOC name input
		const mocNameEl = contentEl.createEl('input', { type: 'text', placeholder: 'MOC name...' });
		mocNameEl.style.width = '100%';
		mocNameEl.style.marginBottom = '15px';
		mocNameEl.focus();

		// Prompt creation section
		const promptSection = contentEl.createDiv({ cls: 'moc-creation-prompt-section' });
		promptSection.style.cssText = 'border-top: 1px solid var(--background-modifier-border); padding-top: 15px; margin-top: 15px;';

		const checkboxContainer = promptSection.createDiv();
		checkboxContainer.style.cssText = 'display: flex; align-items: center; margin-bottom: 10px;';

		const createPromptCheckbox = checkboxContainer.createEl('input', { type: 'checkbox' });
		createPromptCheckbox.style.marginRight = '8px';
		
		const checkboxLabel = checkboxContainer.createEl('label', { text: 'Also create a prompt' });
		checkboxLabel.style.cursor = 'pointer';
		checkboxLabel.addEventListener('click', () => {
			createPromptCheckbox.checked = !createPromptCheckbox.checked;
			togglePromptNameInput();
		});

		// Prompt name input (initially hidden)
		const promptNameEl = promptSection.createEl('input', { 
			type: 'text', 
			placeholder: 'Prompt name (leave empty to use MOC name)...' 
		});
		promptNameEl.style.width = '100%';
		promptNameEl.style.display = 'none';

		const togglePromptNameInput = () => {
			promptNameEl.style.display = createPromptCheckbox.checked ? 'block' : 'none';
		};

		createPromptCheckbox.addEventListener('change', togglePromptNameInput);

		const submit = async () => {
			const mocName = mocNameEl.value.trim();
			if (!mocName) return;

			// Create the MOC first
			const mocFile = await this.plugin.createMOC(mocName);

			// Create prompt if requested
			if (createPromptCheckbox.checked) {
				const promptName = promptNameEl.value.trim() || mocName.replace(/\s+MOC$/i, '').trim() || mocName;
				await this.plugin.createPrompt(mocFile, promptName);
			}

			this.onSubmit(mocName);
			this.close();
		};

		// Button container
		const buttonContainer = contentEl.createDiv({ cls: 'moc-system-modal-buttons' });
		buttonContainer.style.cssText = 'display: flex; gap: 10px; margin-top: 20px;';

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const createBtn = buttonContainer.createEl('button', { text: 'Create', cls: 'mod-cta' });
		createBtn.addEventListener('click', submit);

		// Enter key handling
		const handleEnter = (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		};

		mocNameEl.addEventListener('keypress', handleEnter);
		promptNameEl.addEventListener('keypress', handleEnter);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/**
 * Modal for adding content to an existing MOC.
 * 
 * Presents buttons for creating:
 * - Sub-MOC
 * - Note  
 * - Resource
 * - Prompt
 * 
 * Each button opens a secondary modal for naming the new item.
 */
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

/**
 * Generic modal for creating any type of item (note, resource, etc.).
 * 
 * Reusable component that:
 * - Shows appropriate label based on item type
 * - Handles text input and validation
 * - Supports Enter key submission
 */
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

/**
 * Modal for adding optional descriptions to prompt iterations.
 * 
 * Features:
 * - Optional description input
 * - Skip button for no description
 * - Description becomes part of filename (e.g., "v2 - description")
 */
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

/**
 * Modal for confirming deletion of all plugin-managed files.
 * 
 * Shows:
 * - Number of files to delete
 * - List of file paths (truncated if too many)
 * - Warning about permanent deletion
 * - Styled delete button to indicate danger
 */
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

/**
 * Context-aware modal for MOC reorganization options.
 * 
 * Shows different options based on MOC type:
 * - Root MOCs: Can be moved under a parent
 * - Sub-MOCs: Can be promoted to root or moved to different parent
 * 
 * Prevents circular dependencies in MOC relationships.
 */
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

/**
 * Modal for creating a new parent MOC during reorganization.
 * 
 * Used when moving a root MOC under a new parent that doesn't exist yet.
 * Creates the parent MOC and immediately moves the child under it.
 */
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

/**
 * Modal for selecting an existing MOC as a parent during reorganization.
 * 
 * Features:
 * - Scrollable list of available MOCs
 * - Filters out MOCs that would create circular dependencies
 * - Sorted alphabetically by path
 * - Different behavior for moving root vs sub MOCs
 */
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