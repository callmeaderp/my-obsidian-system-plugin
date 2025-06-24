import { App, Modal, Notice, Plugin, TFile, TFolder, normalizePath } from 'obsidian';

// =================================================================================
// PLUGIN CONSTANTS AND TYPES
// =================================================================================

type PluginSettings = Record<string, never>;
const DEFAULT_SETTINGS: PluginSettings = {};

const CONFIG = {
	FOLDERS: {
		Notes: 'Notes',
		Resources: 'Resources',
		Prompts: 'Prompts'
	} as const,
	SECTION_ORDER: ['MOCs', 'Notes', 'Resources', 'Prompts'] as const,
	NOTE_TYPES: {
		MOCs: { emoji: '🔵' },
		Notes: { emoji: '📝' },
		Resources: { emoji: '📁' },
		Prompts: { emoji: '🤖' }
	} as const,
	EMOJI_RANGES: [
		[0x1F600, 0x1F64F], // Emoticons
		[0x1F300, 0x1F5FF], // Misc Symbols and Pictographs
		[0x1F680, 0x1F6FF], // Transport and Map Symbols
		[0x1F900, 0x1F9FF]  // Supplemental Symbols and Pictographs
	],
	COLOR: {
		SATURATION_RANGE: [60, 90],
		LIGHTNESS_RANGE: [45, 65],
		DARK_BOOST: 10
	},
	STYLE_DELAYS: {
		INITIAL: 1000,
		LAYOUT_READY: 500,
		UPDATE: 100
	}
} as const;

type SectionType = typeof CONFIG.SECTION_ORDER[number];
type NoteType = 'moc' | 'note' | 'resource' | 'prompt';

interface FileConfig {
	type: NoteType;
	emoji: string;
	folder: string;
	suffix?: string;
	createSubfolder?: boolean;
}


// =================================================================================
// INTERFACES
// =================================================================================

interface UpdateResult { file: TFile; changes: string[]; success: boolean; error?: string; }
interface VaultUpdatePlan { filesToUpdate: TFile[]; updateSummary: Map<TFile, string[]>; totalChanges: number; }
interface ColorInfo { hue: number; saturation: number; lightness: number; lightColor: string; darkColor: string; }
interface CreateConfig { name: string; parentMOC?: TFile; type: NoteType; description?: string; }


// =================================================================================
// MAIN PLUGIN CLASS
// =================================================================================

/**
 * Main plugin class implementing a hierarchical MOC-based note-taking system.
 * Provides context-aware creation, organization, and maintenance tools.
 */
export default class MOCSystemPlugin extends Plugin {
	settings: PluginSettings;
	private styleElement: HTMLStyleElement | null = null;

	/**
	 * Plugin initialization - loads settings, registers commands, and sets up event listeners.
	 * Sets up style loading with appropriate delays for Obsidian's initialization sequence.
	 */
	async onload() {
		await this.loadSettings();
		this.initializeStyles();
		this.registerCommands();
		this.registerEventListeners();
	}

	private initializeStyles() {
		setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.INITIAL);
		this.app.workspace.onLayoutReady(() => 
			setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.LAYOUT_READY)
		);
	}

	private registerCommands() {

		const commands = [
			{ id: 'moc-context-create', name: 'Create MOC or add content', callback: () => this.handleContextCreate() },
			{ id: 'update-vault-system', name: 'Update vault to latest system', callback: () => this.updateVaultToLatestSystem() },
			{ id: 'cleanup-moc-system', name: 'Cleanup MOC system files', callback: () => this.cleanupMOCSystem() }
		];

		const conditionalCommands = [
			{ id: 'reorganize-moc', name: 'Reorganize MOC', condition: (f: TFile) => this.isMOC(f), action: (f: TFile) => this.reorganizeMOC(f) },
			{ id: 'duplicate-prompt-iteration', name: 'Duplicate prompt iteration', condition: (f: TFile) => this.isPromptIteration(f), action: (f: TFile) => this.duplicatePromptIteration(f) },
			{ id: 'open-llm-links', name: 'Open all LLM links', condition: (f: TFile) => this.isPromptHub(f), action: (f: TFile) => this.openLLMLinks(f) }
		];

		commands.forEach(cmd => this.addCommand(cmd));
		conditionalCommands.forEach(cmd => this.addCommand({
			id: cmd.id,
			name: cmd.name,
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && cmd.condition(activeFile)) {
					if (!checking) cmd.action(activeFile);
					return true;
				}
				return false;
			}
		}));
	}

	private registerEventListeners() {
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) this.cleanupBrokenLinks(file);
			})
		);
	}

	onunload() { this.removeStyles(); }

	async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
	async saveSettings() { await this.saveData(this.settings); }

	removeStyles() {
		if (this.styleElement) {
			this.styleElement.remove();
			this.styleElement = null;
		}
	}

	/**
	 * Updates CSS styles to apply unique colors to MOC folders.
	 * Combines base styles with dynamically generated color rules for each MOC.
	 * @throws {Error} If style loading or generation fails
	 */
	async updateMOCStyles() {
		try {
			const baseCss = await this.loadBaseCss();
			const mocStyles = await this.generateMOCColorStyles();
			const combinedStyles = `${baseCss}\n\n/* ===== DYNAMIC MOC COLORS ===== */\n${mocStyles}`;

			this.removeStyles();
			this.styleElement = document.createElement('style');
			this.styleElement.id = 'moc-system-plugin-styles';
			this.styleElement.textContent = combinedStyles;
			document.head.appendChild(this.styleElement);
		} catch (error) {
			console.error('MOC System Plugin: Error updating MOC styles', error);
		}
	}

	/**
	 * Loads the base CSS file from the plugin directory.
	 * @returns Promise resolving to CSS content as string, empty string if file not found
	 */
	private async loadBaseCss(): Promise<string> {
		try {
			const cssPath = normalizePath(`${this.app.vault.configDir}/plugins/my-obsidian-system-plugin/styles.css`);
			return await this.app.vault.adapter.read(cssPath);
		} catch (error) {
			console.warn('MOC System Plugin: Could not load base styles.css', error);
			return '';
		}
	}

	/**
	 * Generates CSS rules for individual MOC folder colors based on frontmatter.
	 * Creates theme-specific styles for both light and dark modes.
	 * @returns Promise resolving to generated CSS string
	 */
	private async generateMOCColorStyles(): Promise<string> {
		const allMOCs = await this.getAllMOCs();
		const colorStyles: string[] = [];

		for (const moc of allMOCs) {
			const frontmatter = this.app.metadataCache.getFileCache(moc)?.frontmatter;
			if (frontmatter?.['light-color'] && frontmatter?.['dark-color'] && moc.parent) {
				const lightColor = frontmatter['light-color'];
				const darkColor = frontmatter['dark-color'];
				const escapedPath = moc.parent.path.replace(/['"\\]/g, '\\$&');
				
				colorStyles.push(
					this.generateThemeCSS(escapedPath, lightColor, 'light'),
					this.generateThemeCSS(escapedPath, darkColor, 'dark')
				);
			}
		}
		return colorStyles.join('\n');
	}

	/**
	 * Generates CSS rules for a specific MOC folder path and theme.
	 * @param path - Escaped folder path for CSS selector
	 * @param color - HSL color string
	 * @param theme - Theme variant ('light' or 'dark')
	 * @returns CSS rule string with gradients and hover effects
	 */
	private generateThemeCSS(path: string, color: string, theme: 'light' | 'dark'): string {
		const selector = theme === 'dark' ? `.theme-dark .nav-folder-title[data-path="${path}"]` : `.nav-folder-title[data-path="${path}"]`;
		const opacities = theme === 'dark' ? [0.15, 0.2, 0.25, 0.3] : [0.1, 0.15, 0.2, 0.25];
		
		return `
/* ${path} - ${theme} Theme */
${selector} {
    background: linear-gradient(135deg, ${this.adjustColorOpacity(color, opacities[0])} 0%, ${this.adjustColorOpacity(color, opacities[1])} 100%) !important;
    border-left: 3px solid ${color} !important;
}
${selector}:hover {
    background: linear-gradient(135deg, ${this.adjustColorOpacity(color, opacities[2])} 0%, ${this.adjustColorOpacity(color, opacities[3])} 100%) !important;
}
${selector} .nav-folder-collapse-indicator { color: ${color} !important; }`;
	}

	/**
	 * Converts HSL color to HSLA with specified opacity.
	 * @param hslColor - HSL color string (e.g., 'hsl(240, 100%, 50%)')
	 * @param opacity - Opacity value between 0 and 1
	 * @returns HSLA color string
	 */
	private adjustColorOpacity(hslColor: string, opacity: number): string {
		return hslColor.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
	}

	// =================================================================================
	// CORE CREATION LOGIC
	// =================================================================================

	/**
	 * Context-aware creation handler - creates root MOC or adds content to existing MOC.
	 * Determines action based on whether active file is a MOC or not.
	 */
	async handleContextCreate() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || !this.isMOC(activeFile)) {
			new CreateMOCModal(this.app, this, () => {}).open();
		} else {
			new AddToMOCModal(this.app, activeFile, this).open();
		}
	}

	/**
	 * Creates a new root MOC with complete folder structure and random styling.
	 * @param name - Name for the MOC (will be prefixed with random emoji)
	 * @returns Promise resolving to the created MOC file
	 */
	async createMOC(name: string): Promise<TFile> {
		const emoji = this.getRandomEmoji();
		const colorInfo = this.generateRandomColor();
		const folderName = `${emoji} ${name} MOC`;
		
		await this.ensureMOCFolderStructure(folderName);
		
		const content = this.buildFrontmatter({
			tags: ['moc'],
			'note-type': 'moc',
			'root-moc-color': true,
			...this.colorToFrontmatter(colorInfo)
		});
		
		const file = await this.createFileWithContent(`${folderName}/${folderName}.md`, content);
		await this.openFileAndNotify(file, `Created MOC: ${name}`);
		setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.UPDATE);
		return file;
	}

	/**
	 * Creates a sub-MOC within an existing MOC's folder structure.
	 * @param parentMOC - Parent MOC file to create sub-MOC under
	 * @param name - Name for the sub-MOC
	 * @returns Promise resolving to the created sub-MOC file
	 */
	async createSubMOC(parentMOC: TFile, name: string): Promise<TFile> {
		const emoji = this.getRandomEmoji();
		const colorInfo = this.generateRandomColor();
		const parentPath = parentMOC.parent?.path || '';
		const folderName = `${parentPath}/${emoji} ${name} MOC`;
		
		await this.ensureMOCFolderStructure(folderName);
		
		const content = this.buildFrontmatter({
			tags: ['moc'],
			'note-type': 'moc',
			...this.colorToFrontmatter(colorInfo)
		});
		
		const file = await this.createFileWithContent(`${folderName}/${emoji} ${name} MOC.md`, content);
		await this.addToMOCSection(parentMOC, 'MOCs', file);
		new Notice(`Created sub-MOC: ${name}`);
		setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.UPDATE);
		return file;
	}

	/**
	 * Unified factory method for creating different file types with consistent patterns.
	 * @param config - Configuration object specifying name, type, parent MOC, and description
	 * @returns Promise resolving to the created file
	 */
	async createFile(config: CreateConfig): Promise<TFile> {
		const fileConfigs: Record<NoteType, FileConfig> = {
			moc: { type: 'moc', emoji: this.getRandomEmoji(), folder: '', suffix: 'MOC', createSubfolder: true },
			note: { type: 'note', emoji: CONFIG.NOTE_TYPES.Notes.emoji, folder: CONFIG.FOLDERS.Notes },
			resource: { type: 'resource', emoji: CONFIG.NOTE_TYPES.Resources.emoji, folder: CONFIG.FOLDERS.Resources },
			prompt: { type: 'prompt', emoji: CONFIG.NOTE_TYPES.Prompts.emoji, folder: CONFIG.FOLDERS.Prompts, createSubfolder: true }
		};

		const fileConfig = fileConfigs[config.type];
		const parentPath = config.parentMOC?.parent?.path || '';
		const fileName = this.buildFileName(config.name, fileConfig, parentPath);
		const content = this.buildFrontmatter({ 'note-type': config.type });

		if (fileConfig.createSubfolder && config.type === 'prompt') {
			return this.createPromptWithIterations(config, fileName, content);
		}

		const file = await this.createFileWithContent(fileName, content);
		if (config.parentMOC) {
			await this.addToMOCSection(config.parentMOC, this.typeToSection(config.type), file);
		}
		new Notice(`Created ${config.type}: ${config.name}`);
		return file;
	}

	async createNote(parentMOC: TFile, name: string): Promise<TFile> {
		return this.createFile({ name, parentMOC, type: 'note' });
	}

	async createResource(parentMOC: TFile, name: string): Promise<TFile> {
		return this.createFile({ name, parentMOC, type: 'resource' });
	}

	async createPrompt(parentMOC: TFile, name: string): Promise<TFile> {
		return this.createFile({ name, parentMOC, type: 'prompt' });
	}

	/**
	 * Creates prompt hub and first iteration with hierarchical folder structure.
	 * @param config - Creation configuration
	 * @param hubFileName - File path for the prompt hub
	 * @param content - Base content for files
	 * @returns Promise resolving to the created hub file
	 */
	private async createPromptWithIterations(config: CreateConfig, hubFileName: string, content: string): Promise<TFile> {
		const parentPath = config.parentMOC?.parent?.path || '';
		const promptsFolder = `${parentPath}/${CONFIG.FOLDERS.Prompts}`;
		const promptSubfolder = `${promptsFolder}/${config.name}`;
		const iterationName = `${CONFIG.NOTE_TYPES.Prompts.emoji} ${config.name} v1`;

		// Ensure subfolder exists
		if (!this.app.vault.getAbstractFileByPath(promptSubfolder)) {
			await this.app.vault.createFolder(promptSubfolder);
		}

		// Create hub with iteration link
		const hubContent = `${content}\n# ${config.name}\n\n## Iterations\n\n- [[${iterationName}]]\n\n## LLM Links\n\n\`\`\`llm-links\n\n\`\`\`\n`;
		const hubFile = await this.createFileWithContent(`${promptsFolder}/${CONFIG.NOTE_TYPES.Prompts.emoji} ${config.name}.md`, hubContent);
		
		// Create first iteration
		await this.createFileWithContent(`${promptSubfolder}/${iterationName}.md`, content);
		
		if (config.parentMOC) {
			await this.addToMOCSection(config.parentMOC, 'Prompts', hubFile);
		}
		new Notice(`Created prompt: ${config.name}`);
		setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.UPDATE);
		return hubFile;
	}

	/**
	 * Builds complete file path with emoji prefix, name, and optional suffix.
	 * @param name - Base name for the file
	 * @param config - File configuration with emoji and folder information
	 * @param parentPath - Parent directory path
	 * @returns Complete normalized file path
	 */
	private buildFileName(name: string, config: FileConfig, parentPath: string): string {
		const suffix = config.suffix ? ` ${config.suffix}` : '';
		const folder = config.folder ? `/${config.folder}` : '';
		return normalizePath(`${parentPath}${folder}/${config.emoji} ${name}${suffix}.md`);
	}

	/**
	 * Generates YAML frontmatter string from data object.
	 * @param data - Key-value pairs for frontmatter
	 * @returns Formatted YAML frontmatter with surrounding delimiters
	 */
	private buildFrontmatter(data: Record<string, any>): string {
		const lines = ['---'];
		for (const [key, value] of Object.entries(data)) {
			if (Array.isArray(value)) {
				lines.push(`${key}:`, ...value.map(v => `  - ${v}`));
			} else {
				lines.push(`${key}: ${value}`);
			}
		}
		lines.push('---', '');
		return lines.join('\n');
	}

	/**
	 * Converts color information to frontmatter properties.
	 * @param color - Color information object with HSL values and theme variants
	 * @returns Object with color properties for frontmatter
	 */
	private colorToFrontmatter(color: ColorInfo): Record<string, any> {
		return {
			'moc-hue': color.hue,
			'moc-saturation': color.saturation,
			'moc-lightness': color.lightness,
			'light-color': color.lightColor,
			'dark-color': color.darkColor
		};
	}

	/**
	 * Maps file types to their corresponding MOC section names.
	 * @param type - File type (moc, note, resource, prompt)
	 * @returns Section name for organizing content in MOCs
	 */
	private typeToSection(type: NoteType): SectionType {
		const mapping: Record<NoteType, SectionType> = {
			moc: 'MOCs', note: 'Notes', resource: 'Resources', prompt: 'Prompts'
		};
		return mapping[type];
	}

	private async createFileWithContent(path: string, content: string): Promise<TFile> {
		return this.app.vault.create(normalizePath(path), content);
	}

	private async openFileAndNotify(file: TFile, message: string): Promise<void> {
		await this.app.workspace.getLeaf().openFile(file);
		new Notice(message);
	}

	/**
	 * Creates complete folder hierarchy for a MOC (Notes, Resources, Prompts subfolders).
	 * @param mocFolderPath - Path where MOC folder should be created
	 */
	async ensureMOCFolderStructure(mocFolderPath: string) {
		if (!this.app.vault.getAbstractFileByPath(mocFolderPath)) {
			await this.app.vault.createFolder(mocFolderPath);
		}
		
		for (const folder of Object.values(CONFIG.FOLDERS)) {
			const subfolderPath = `${mocFolderPath}/${folder}`;
			if (!this.app.vault.getAbstractFileByPath(subfolderPath)) {
				await this.app.vault.createFolder(subfolderPath).catch(err => {
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
	 * @param moc The MOC file to update
	 * @param section The section to add the link to
	 * @param newFile The file to link to
	 */
	async addToMOCSection(moc: TFile, section: SectionType, newFile: TFile) {
		let content = await this.app.vault.read(moc);
		let lines = content.split('\n');
		
		// Identify where frontmatter ends to avoid modifying it
		let frontmatterEnd = 0;
		if (lines[0] === '---') {
			// Find the closing '---' after the opening one
			// Skip first '---' to find the closing one
			frontmatterEnd = lines.slice(1).indexOf('---') + 2;
		}
		
		const { reorganizedLines, sectionIndices } = this.reorganizeContentForPluginSections(lines, frontmatterEnd);
		
		let sectionLineIndex = sectionIndices.get(section);
		
		if (sectionLineIndex === undefined) {
			// Section doesn't exist, create it in the correct order.
			let insertIndex = frontmatterEnd;
			const currentSectionOrderIndex = CONFIG.SECTION_ORDER.indexOf(section);

			// Find the next existing section to insert before.
			// Insert new sections before later sections to maintain standard order
			for (let i = currentSectionOrderIndex + 1; i < CONFIG.SECTION_ORDER.length; i++) {
				const nextSection = CONFIG.SECTION_ORDER[i];
				if (sectionIndices.has(nextSection)) {
					insertIndex = sectionIndices.get(nextSection)!;
					break;
				}
			}

			// If no later sections exist, append after the last known plugin section.
			// Keep plugin sections grouped together before user content
			if (insertIndex === frontmatterEnd && sectionIndices.size > 0) {
				const lastSectionIndex = Math.max(...Array.from(sectionIndices.values()));
				insertIndex = this.findSectionEnd(reorganizedLines, lastSectionIndex);
			}

			// Empty lines provide visual separation between sections
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
		// Iterate in SECTION_ORDER to maintain desired sequence
		for (const sectionName of CONFIG.SECTION_ORDER) {
			const header = `## ${sectionName}`;
			// Start searching after frontmatter to avoid matching content within it
			const startIndex = lines.findIndex((line, i) => i >= frontmatterEnd && line.trim() === header);

			if (startIndex !== -1) {
				const endIndex = this.findSectionEnd(lines, startIndex);
				const sectionContent = lines.slice(startIndex, endIndex);
				pluginSections.push({ name: sectionName, content: sectionContent });

				// Mark these lines as "consumed"
				// Prevent duplication when rebuilding the file
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
	 * Creates a new versioned iteration of an existing prompt.
	 * @param file - The prompt iteration file to duplicate
	 */
	async duplicatePromptIteration(file: TFile) {
		const match = file.basename.match(/^(?:🤖\s+)?(.+?)\s*v(\d+)/);
		if (!match || !file.parent) return;
		
		const [, baseName] = match;
		const siblings = file.parent.children.filter(f => 
			f instanceof TFile && f.name.includes(baseName) && f.name.match(/v(\d+)/)
		) as TFile[];
		
		const maxVersion = Math.max(0, ...siblings.map(f => {
			const vMatch = f.basename.match(/v(\d+)/);
			return vMatch ? parseInt(vMatch[1]) : 0;
		}));
		
		new PromptDescriptionModal(this.app, async (description: string) => {
			const nextVersion = maxVersion + 1;
			const descPart = description ? ` - ${description}` : '';
			const newName = `${CONFIG.NOTE_TYPES.Prompts.emoji} ${baseName} v${nextVersion}${descPart}`;
			
			const originalContent = await this.app.vault.read(file);
			const contentWithFrontmatter = originalContent.startsWith('---') ? 
				originalContent : `---\nnote-type: prompt\n---\n\n${originalContent}`;
			
			const newFile = await this.createFileWithContent(`${file.parent!.path}/${newName}.md`, contentWithFrontmatter);
			await this.updatePromptHub(baseName, newFile, file.parent!.path);
			await this.openFileAndNotify(newFile, `Created iteration: ${newName}`);
		}).open();
	}
	
	/**
	 * Updates the prompt hub with a link to the new iteration.
	 * @param baseName - Base name of the prompt (without version)
	 * @param newIteration - The newly created iteration file
	 * @param promptSubfolderPath - Path to the prompt's subfolder
	 */
	async updatePromptHub(baseName: string, newIteration: TFile, promptSubfolderPath: string) {
		const promptsFolder = promptSubfolderPath.substring(0, promptSubfolderPath.lastIndexOf('/'));
		const hubPath = `${promptsFolder}/${CONFIG.NOTE_TYPES.Prompts.emoji} ${baseName}.md`;
		const hubFile = this.app.vault.getAbstractFileByPath(normalizePath(hubPath));
		
		if (hubFile instanceof TFile) {
			await this.app.vault.process(hubFile, (content) => {
				const lines = content.split('\n');
				const iterIndex = lines.findIndex(line => line.trim() === '## Iterations');
				if (iterIndex !== -1) {
					let insertIndex = iterIndex + 1;
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
	 * Opens all URLs from the llm-links code block in the prompt hub.
	 * @param file - Prompt hub file containing llm-links block
	 */
	async openLLMLinks(file: TFile) {
		const content = await this.app.vault.read(file);
		const linkBlockMatch = content.match(/```llm-links\n([\s\S]*?)\n```/);
		
		if (!linkBlockMatch) {
			new Notice('No llm-links block found');
			return;
		}

		const links = linkBlockMatch[1].split('\n')
			.map(line => line.trim())
			.filter(line => line.startsWith('http'));
			
		if (links.length === 0) {
			new Notice('No links found in llm-links block');
			return;
		}
		
		links.forEach(link => window.open(link, '_blank'));
		new Notice(`Opened ${links.length} links`);
	}


	// =================================================================================
	// MOC REORGANIZATION SYSTEM
	// =================================================================================

	/**
	 * Opens modal for reorganizing MOC hierarchy (promote, demote, move).
	 * @param moc - The MOC file to reorganize
	 */
	async reorganizeMOC(moc: TFile) {
		new ReorganizeMOCModal(this.app, moc, this).open();
	}

	/**
	 * Moves a root MOC to become a sub-MOC under a parent.
	 * @param moc - Root MOC to move
	 * @param parentMOCName - Name for new parent MOC (if creating new)
	 * @param existingParent - Existing parent MOC (if using existing)
	 */
	async moveRootMOCToSub(moc: TFile, parentMOCName: string | null, existingParent: TFile | null) {
		try {
			const parentMOC = existingParent || (parentMOCName ? await this.createMOC(parentMOCName) : null);
			if (!parentMOC) throw new Error('Parent MOC name is required.');

			const mocFolder = moc.parent;
			const parentMOCFolder = parentMOC.parent;
			if (!mocFolder || !parentMOCFolder) throw new Error('Could not find required folders.');

			const newFolderPath = normalizePath(`${parentMOCFolder.path}/${mocFolder.name}`);
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			const movedMOC = this.app.vault.getAbstractFileByPath(`${newFolderPath}/${moc.name}`) as TFile;
			if (!movedMOC) throw new Error('Failed to find moved MOC file after rename.');

			await this.addToMOCSection(parentMOC, 'MOCs', movedMOC);
			await this.updateMOCStyles();
			await this.openFileAndNotify(parentMOC, `Moved ${moc.basename} to be under ${parentMOC.basename}`);
		} catch (error) {
			this.handleError('Error moving MOC', error);
		}
	}

	/**
	 * Promotes a sub-MOC to become a root MOC.
	 * @param moc - Sub-MOC to promote
	 */
	async promoteSubMOCToRoot(moc: TFile) {
		try {
			const mocFolder = moc.parent;
			if (!mocFolder) throw new Error('MOC folder not found.');

			await this.removeFromParentMOCs(moc);
			await this.app.vault.rename(mocFolder, mocFolder.name);
			
			const movedMOC = this.app.vault.getAbstractFileByPath(`${mocFolder.name}/${moc.name}`) as TFile;
			if (!movedMOC) throw new Error('Failed to find promoted MOC file.');

			await this.updateMOCStyles();
			await this.openFileAndNotify(movedMOC, `Promoted ${moc.basename} to a root MOC.`);
		} catch (error) {
			this.handleError('Error promoting MOC', error);
		}
	}

	/**
	 * Moves a sub-MOC from one parent to another.
	 * @param moc - Sub-MOC to move
	 * @param newParent - New parent MOC
	 */
	async moveSubMOCToNewParent(moc: TFile, newParent: TFile) {
		try {
			const mocFolder = moc.parent;
			const newParentFolder = newParent.parent;
			if (!mocFolder || !newParentFolder) throw new Error('Required folders not found.');

			await this.removeFromParentMOCs(moc);
			const newFolderPath = normalizePath(`${newParentFolder.path}/${mocFolder.name}`);
			await this.app.vault.rename(mocFolder, newFolderPath);
			
			const movedMOC = this.app.vault.getAbstractFileByPath(`${newFolderPath}/${moc.name}`) as TFile;
			if (!movedMOC) throw new Error('Failed to find moved MOC file.');

			await this.addToMOCSection(newParent, 'MOCs', movedMOC);
			await this.updateMOCStyles();
			await this.openFileAndNotify(newParent, `Moved ${moc.basename} to ${newParent.basename}`);
		} catch (error) {
			this.handleError('Error moving MOC', error);
		}
	}

	/**
	 * Removes all references to a MOC from parent MOCs during reorganization.
	 * @param moc - MOC whose links should be removed
	 */
	async removeFromParentMOCs(moc: TFile) {
		const allMOCs = await this.getAllMOCs();
		const linkPattern = new RegExp(`^-\\s*\\[\\[${moc.basename}\\]\\]\\s*$`);
		
		for (const parentMOC of allMOCs) {
			if (parentMOC.path !== moc.path) {
				await this.app.vault.process(parentMOC, (content) => {
					return content.split('\n')
						.filter(line => !linkPattern.test(line.trim()))
						.join('\n');
				});
			}
		}
	}


	// =================================================================================
	// VAULT UPDATE & MAINTENANCE
	// =================================================================================

	/**
	 * Analyzes vault and presents update plan for modernizing to current system.
	 */
	async updateVaultToLatestSystem() {
		new Notice('Analyzing vault for updates...');
		
		try {
			const updatePlan = await this.analyzeVaultForUpdates();
			if (updatePlan.totalChanges === 0) {
				new Notice('Vault is already up to date!');
				return;
			}
			new VaultUpdateModal(this.app, updatePlan, () => this.executeUpdatePlan(updatePlan)).open();
		} catch (error) {
			this.handleError('Error during vault update analysis', error);
		}
	}

	/**
	 * Scans all markdown files to identify those needing system updates.
	 * @returns Update plan with files to modify and required changes
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
	 * Analyzes a single file to determine what updates it needs.
	 * @param file - File to analyze
	 * @returns Array of update descriptions needed for the file
	 */
	async detectRequiredUpdates(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		const noteType = cache?.frontmatter?.['note-type'];
		
		const isPluginFile = noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
		const isLegacyFile = file.basename.includes('MOC') || 
			[CONFIG.FOLDERS.Notes, CONFIG.FOLDERS.Resources, CONFIG.FOLDERS.Prompts]
				.some(folder => file.path.includes(folder));

		if (!isPluginFile && !isLegacyFile) return [];

		// Missing metadata
		if (!noteType) {
			const detectedType = this.detectFileType(file);
			if (detectedType) updates.push(`Add missing note-type: ${detectedType}`);
		}

		// Folder migration
		if (this.needsFolderMigration(file)) {
			updates.push('Migrate to new hierarchical folder structure');
		}

		// MOC-specific checks
		if (this.isMOC(file)) {
			if (!file.basename.endsWith(' MOC')) updates.push('Add "MOC" suffix to filename');
			if (!this.hasEmojiPrefix(file.basename)) updates.push('Add random emoji prefix to filename');
			if (!this.hasColorInfo(cache?.frontmatter)) updates.push('Add unique color information for folder styling');
		} else {
			// Other file type emoji checks
			const emojiChecks = {
				note: CONFIG.NOTE_TYPES.Notes.emoji,
				resource: CONFIG.NOTE_TYPES.Resources.emoji,
				prompt: CONFIG.NOTE_TYPES.Prompts.emoji
			};
			
			if (noteType && emojiChecks[noteType as keyof typeof emojiChecks] && 
				!file.basename.startsWith(emojiChecks[noteType as keyof typeof emojiChecks])) {
				updates.push(`Add ${emojiChecks[noteType as keyof typeof emojiChecks]} emoji prefix`);
			}
		}
		
		// Prompt hub migration
		if (noteType === 'prompt' && this.needsPromptHubMigration(file)) {
			updates.push('Migrate prompt hub to new location in Prompts folder');
		}
		
		return updates;
	}

	/**
	 * Applies all updates from the vault update plan.
	 * @param plan - Update plan containing files and required changes
	 * @returns Array of results indicating success/failure for each file
	 */
	async executeUpdatePlan(plan: VaultUpdatePlan): Promise<UpdateResult[]> {
		new Notice(`Updating ${plan.filesToUpdate.length} files...`);
		
		const results: UpdateResult[] = [];
		for (const file of plan.filesToUpdate) {
			const updates = plan.updateSummary.get(file) || [];
			results.push(await this.updateFile(file, updates));
		}
		
		await this.updateMOCStyles();
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
	 * - Color assignment generates and stores unique color information
	 * - All updates are tracked for reporting
	 * 
	 * @param file The file to update
	 * @param updates Array of update descriptions to apply
	 * @returns Result object indicating success and any errors
	 */
	async updateFile(file: TFile, updates: string[]): Promise<UpdateResult> {
		let currentFile = file;
		let needsStyleUpdate = false;
		
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
				} else if (update.includes('prompt hub to new location')) {
					currentFile = await this.migratePromptHub(currentFile);
				} else if (update.includes('color information')) {
					// Generate and assign unique color information to the MOC
					// Provide existing MOCs with same color treatment as new ones
					const colorInfo = this.generateRandomColor();
					const isRootMOC = this.isRootMOC(currentFile);
					
					await this.app.fileManager.processFrontMatter(currentFile, (fm) => {
						fm['moc-hue'] = colorInfo.hue;
						fm['moc-saturation'] = colorInfo.saturation;
						fm['moc-lightness'] = colorInfo.lightness;
						fm['light-color'] = colorInfo.lightColor;
						fm['dark-color'] = colorInfo.darkColor;
						if (isRootMOC) {
							fm['root-moc-color'] = true;
						}
					});
					
					needsStyleUpdate = true;
				}
			}
			
			// Update styles if any color changes were made
			// Defer style update until after all changes to batch updates
			if (needsStyleUpdate) {
				await this.updateMOCStyles();
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
	 * Migrates a prompt hub from a subfolder to the Prompts folder.
	 * @param file The prompt hub file to migrate
	 * @returns The file at its new location
	 */
	private async migratePromptHub(file: TFile): Promise<TFile> {
		// Get the current location info
		const currentFolder = file.parent;
		if (!currentFolder) return file;
		
		// The grandparent should be the Prompts folder
		const promptsFolder = currentFolder.parent;
		if (!promptsFolder || promptsFolder.name !== CONFIG.FOLDERS.Prompts) {
			console.warn(`Cannot migrate prompt hub ${file.path}: expected to be in Prompts subfolder`);
			return file;
		}
		
		// Move the hub file to the Prompts folder
		const newPath = normalizePath(`${promptsFolder.path}/${file.name}`);
		
		try {
			await this.app.vault.rename(file, newPath);
			new Notice(`Migrated prompt hub: ${file.basename}`);
			return this.app.vault.getAbstractFileByPath(newPath) as TFile;
		} catch (error) {
			console.error(`Failed to migrate prompt hub ${file.path}:`, error);
			new Notice(`Failed to migrate prompt hub: ${file.basename}`);
			return file;
		}
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
					// Continue cleanup even if individual files fail to delete
					console.error(`Failed to delete ${file.path}:`, error);
				}
			}
			new Notice(`Cleanup complete! Deleted ${deletedCount} files.`);
		}).open();
	}
	
	/**
	 * Removes broken links from all files when a file is deleted.
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

	// =================================================================================
	// UTILITY METHODS
	// =================================================================================

	/**
	 * Determines if a file is a MOC based on frontmatter tags.
	 * @param file - File to check
	 * @returns True if file has 'moc' tag in frontmatter
	 */
	isMOC(file: TFile): boolean {
		return this.app.metadataCache.getFileCache(file)?.frontmatter?.tags?.includes('moc') ?? false;
	}
	
	/**
	 * Determines if a MOC is at the root level (not nested under another MOC).
	 * @param file - MOC file to check
	 * @returns True if MOC is at vault root level
	 */
	isRootMOC(file: TFile): boolean {
		return this.isMOC(file) && !(file.parent?.path || '').includes('/');
	}

	/**
	 * Determines if a file is a versioned prompt iteration.
	 * @param file - File to check
	 * @returns True if file is a prompt with version number in name
	 */
	isPromptIteration(file: TFile): boolean {
		const noteType = this.app.metadataCache.getFileCache(file)?.frontmatter?.['note-type'];
		return noteType === 'prompt' && /v\d+/.test(file.basename);
	}

	/**
	 * Determines if a file is a prompt hub (manages iterations).
	 * @param file - File to check
	 * @returns True if file is a prompt without version number
	 */
	isPromptHub(file: TFile): boolean {
		const noteType = this.app.metadataCache.getFileCache(file)?.frontmatter?.['note-type'];
		return noteType === 'prompt' && !this.isPromptIteration(file);
	}

	private hasEmojiPrefix(basename: string): boolean {
		return /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(basename);
	}

	private hasColorInfo(frontmatter: any): boolean {
		return frontmatter?.['light-color'] && frontmatter?.['dark-color'];
	}

	private handleError(message: string, error: any): void {
		console.error(message, error);
		new Notice(`${message}: ${error.message}`);
	}

	/**
	 * Retrieves all MOC files in the vault.
	 * @returns Promise resolving to array of MOC files
	 */
	async getAllMOCs(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
	}

	private needsFolderMigration(file: TFile): boolean {
		return this.isMOC(file) && this.isRootMOC(file) && (file.parent?.isRoot() ?? false);
	}

	private needsPromptHubMigration(file: TFile): boolean {
		if (!this.isPromptHub(file) || !file.parent) return false;
		if (file.parent.name === CONFIG.FOLDERS.Prompts) return false;
		return file.parent.parent?.name === CONFIG.FOLDERS.Prompts;
	}

	private detectFileType(file: TFile): string | null {
		if (this.isMOC(file)) return 'moc';
		const pathChecks = {
			note: CONFIG.FOLDERS.Notes,
			resource: CONFIG.FOLDERS.Resources,
			prompt: CONFIG.FOLDERS.Prompts
		};
		
		for (const [type, folder] of Object.entries(pathChecks)) {
			if (file.path.includes(`/${folder}/`)) return type;
		}
		return null;
	}

	/**
	 * Prevents circular dependencies when reorganizing MOC hierarchy.
	 * @param moc - MOC that would become a child
	 * @param potentialParent - MOC that would become the parent
	 * @returns True if this would create a circular dependency
	 */
	detectCircularDependency(moc: TFile, potentialParent: TFile): boolean {
		const visited = new Set<string>();
		const queue: TFile[] = [moc];
		
		while (queue.length > 0) {
			const currentFile = queue.shift()!;
			if (visited.has(currentFile.path)) continue;
			visited.add(currentFile.path);
			
			if (currentFile.path === potentialParent.path) return true;
			
			const links = this.app.metadataCache.getFileCache(currentFile)?.links ?? [];
			for (const link of links) {
				const linkedFile = this.app.metadataCache.getFirstLinkpathDest(link.link, currentFile.path);
				if (linkedFile && this.isMOC(linkedFile)) queue.push(linkedFile);
			}
		}
		return false;
	}

	// =================================================================================
	// RANDOM GENERATION UTILITIES
	// =================================================================================

	/**
	 * Generates a random emoji from predefined Unicode ranges for MOC identification.
	 * @returns Random emoji string
	 */
	private getRandomEmoji(): string {
		const range = CONFIG.EMOJI_RANGES[Math.floor(Math.random() * CONFIG.EMOJI_RANGES.length)];
		const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
		return String.fromCodePoint(codePoint);
	}

	/**
	 * Generates random HSL color information for MOC folder styling.
	 * @returns Color object with HSL values and theme variants
	 */
	private generateRandomColor(): ColorInfo {
		const hue = Math.floor(Math.random() * 360);
		const saturation = CONFIG.COLOR.SATURATION_RANGE[0] + 
			Math.floor(Math.random() * (CONFIG.COLOR.SATURATION_RANGE[1] - CONFIG.COLOR.SATURATION_RANGE[0]));
		const lightness = CONFIG.COLOR.LIGHTNESS_RANGE[0] + 
			Math.floor(Math.random() * (CONFIG.COLOR.LIGHTNESS_RANGE[1] - CONFIG.COLOR.LIGHTNESS_RANGE[0]));
		
		const lightColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
		const darkColor = `hsl(${hue}, ${saturation}%, ${Math.min(lightness + CONFIG.COLOR.DARK_BOOST, 75)}%)`;
		
		return { hue, saturation, lightness, lightColor, darkColor };
	}
}


// =================================================================================
// MODAL DIALOGS
// =================================================================================

/**
 * Base modal class providing common functionality for all plugin modals.
 * Includes standardized button creation, input handling, and keyboard shortcuts.
 */
abstract class BaseModal extends Modal {
	protected createButtons(buttons: Array<{text: string, action: () => void, primary?: boolean}>) {
		const container = this.contentEl.createDiv({ cls: 'moc-system-modal-buttons' });
		buttons.forEach(btn => {
			const element = container.createEl('button', { 
				text: btn.text, 
				cls: btn.primary ? 'mod-cta' : '' 
			});
			element.addEventListener('click', () => {
				btn.action();
				this.close();
			});
		});
	}

	protected createInput(placeholder: string, focus = true): HTMLInputElement {
		const input = this.contentEl.createEl('input', { type: 'text', placeholder });
		input.style.width = '100%';
		if (focus) input.focus();
		return input;
	}

	protected handleEnterKey(callback: () => void, ...inputs: HTMLInputElement[]) {
		inputs.forEach(input => {
			input.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					callback();
				}
			});
		});
	}

	onClose() { this.contentEl.empty(); }
}

/**
 * Modal for displaying and confirming vault update operations.
 */
class VaultUpdateModal extends BaseModal {
	constructor(app: App, private updatePlan: VaultUpdatePlan, private onConfirm: () => void) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Update Vault to Latest System' });
		this.contentEl.createEl('p', { 
			text: `Found ${this.updatePlan.totalChanges} updates needed across ${this.updatePlan.filesToUpdate.length} files.`
		});

		if (this.updatePlan.filesToUpdate.length > 0) {
			this.contentEl.createEl('h3', { text: 'Files to be updated:' });
			const updateList = this.contentEl.createEl('div', { cls: 'moc-system-update-list' });

			for (const file of this.updatePlan.filesToUpdate) {
				const updates = this.updatePlan.updateSummary.get(file) || [];
				const fileItem = updateList.createEl('div');
				fileItem.createEl('div', { text: file.path, cls: 'moc-system-update-filepath' });
				const updatesList = fileItem.createEl('ul');
				updates.forEach(update => updatesList.createEl('li', { text: update }));
			}
		}

		this.contentEl.createEl('p', { 
			text: 'This will modify files to match the latest system requirements. It is recommended to have a backup.',
			cls: 'mod-warning'
		});

		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ text: `Update ${this.updatePlan.filesToUpdate.length} Files`, action: this.onConfirm, primary: true }
		]);
	}
}

/** Modal for creating new MOC */
class CreateMOCModal extends BaseModal {
	constructor(app: App, private plugin: MOCSystemPlugin, private onSubmit: (name: string) => void) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Create new MOC' });
		const mocNameEl = this.createInput('MOC name...');
		mocNameEl.style.marginBottom = '15px';

		// Prompt creation section
		const promptSection = this.contentEl.createDiv({ cls: 'moc-creation-prompt-section' });
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

			const mocFile = await this.plugin.createMOC(mocName);
			if (createPromptCheckbox.checked) {
				const promptName = promptNameEl.value.trim() || mocName.replace(/\s+MOC$/i, '').trim() || mocName;
				await this.plugin.createPrompt(mocFile, promptName);
				setTimeout(() => this.plugin.updateMOCStyles(), 150);
			}
			this.onSubmit(mocName);
		};

		this.handleEnterKey(submit, mocNameEl, promptNameEl);
		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ text: 'Create', action: submit, primary: true }
		]);
	}
}

/** Modal for adding content to existing MOC */
class AddToMOCModal extends BaseModal {
	constructor(app: App, private moc: TFile, private plugin: MOCSystemPlugin) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Add to MOC' });

		const options = [
			{ label: 'Sub-MOC', action: (name: string) => this.plugin.createSubMOC(this.moc, name) },
			{ label: 'Note', action: (name: string) => this.plugin.createNote(this.moc, name) },
			{ label: 'Resource', action: (name: string) => this.plugin.createResource(this.moc, name) },
			{ label: 'Prompt', action: (name: string) => this.plugin.createPrompt(this.moc, name) }
		];

		options.forEach(option => {
			const button = this.contentEl.createEl('button', { text: `Create ${option.label}`, cls: 'mod-cta' });
			button.style.cssText = 'display: block; width: 100%; margin-bottom: 10px;';
			button.addEventListener('click', () => {
				this.close();
				new CreateItemModal(this.app, option.label, option.action).open();
			});
		});
	}
}

/** Generic item creation modal */
class CreateItemModal extends BaseModal {
	constructor(app: App, private itemType: string, private onSubmit: (name: string) => void) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: `Create ${this.itemType}` });
		const inputEl = this.createInput(`${this.itemType} name...`);

		const submit = () => {
			if (inputEl.value.trim()) this.onSubmit(inputEl.value.trim());
		};
		
		this.handleEnterKey(submit, inputEl);
		this.createButtons([{ text: 'Create', action: submit, primary: true }]);
	}
}

/** Modal for prompt iteration descriptions */
class PromptDescriptionModal extends BaseModal {
	constructor(app: App, private onSubmit: (description: string) => void) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Add iteration description (optional)' });
		const inputEl = this.createInput('Description...');

		const submit = () => this.onSubmit(inputEl.value);
		this.handleEnterKey(submit, inputEl);
		this.createButtons([
			{ text: 'Skip', action: () => this.onSubmit('') },
			{ text: 'Add Description', action: submit, primary: true }
		]);
	}
}

/** Modal for cleanup confirmation */
class CleanupConfirmationModal extends BaseModal {
	constructor(app: App, private filesToDelete: TFile[], private onConfirm: () => void) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Cleanup MOC System Files' });
		this.contentEl.createEl('p', { text: `This will permanently delete ${this.filesToDelete.length} files created by this plugin.` });
		this.contentEl.createEl('p', { text: 'This action cannot be undone.', cls: 'mod-warning' });

		if (this.filesToDelete.length > 0) {
			const fileList = this.contentEl.createEl('ul', { cls: 'moc-system-file-list' });
			this.filesToDelete.slice(0, 20).forEach(file => fileList.createEl('li', { text: file.path }));
			if (this.filesToDelete.length > 20) {
				fileList.createEl('li', { text: `... and ${this.filesToDelete.length - 20} more.`});
			}
		}

		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ text: 'Delete All Files', action: this.onConfirm }
		]);
	}
}

/** Modal for MOC reorganization */
class ReorganizeMOCModal extends BaseModal {
	constructor(app: App, private moc: TFile, private plugin: MOCSystemPlugin) {
		super(app);
	}

	onOpen() {
		const isRootMOC = this.plugin.isRootMOC(this.moc);
		this.contentEl.createEl('h2', { text: `Reorganize "${this.moc.basename}"` });
		
		const createButton = (text: string, onClick: () => void, isCta = false) => {
			const btn = this.contentEl.createEl('button', { text, cls: isCta ? 'mod-cta' : '' });
			btn.style.cssText = 'display: block; width: 100%; margin-bottom: 10px;';
			btn.addEventListener('click', () => { onClick(); this.close(); });
		};

		if (isRootMOC) {
			this.contentEl.createEl('p', { text: 'This is a root MOC. You can move it under another MOC.' });
			createButton('Move under a NEW parent MOC', () => 
				new CreateParentMOCModal(this.app, this.moc, this.plugin).open(), true);
			createButton('Move under an EXISTING parent MOC', async () => {
				const availableParents = (await this.plugin.getAllMOCs())
					.filter(m => m.path !== this.moc.path && !this.plugin.detectCircularDependency(this.moc, m));
				if (availableParents.length === 0) return new Notice('No suitable parent MOCs available.');
				new SelectParentMOCModal(this.app, this.moc, availableParents, this.plugin, false).open();
			});
		} else {
			this.contentEl.createEl('p', { text: 'This is a sub-MOC. You can promote it or move it.' });
			createButton('Promote to a root MOC', () => this.plugin.promoteSubMOCToRoot(this.moc), true);
			createButton('Move to a different parent MOC', async () => {
				const availableParents = (await this.plugin.getAllMOCs())
					.filter(m => m.path !== this.moc.path && !this.plugin.detectCircularDependency(this.moc, m));
				if (availableParents.length === 0) return new Notice('No suitable parent MOCs available.');
				new SelectParentMOCModal(this.app, this.moc, availableParents, this.plugin, true).open();
			});
		}
	}
}

/** Modal for creating new parent MOC */
class CreateParentMOCModal extends BaseModal {
	constructor(app: App, private childMOC: TFile, private plugin: MOCSystemPlugin) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Create New Parent MOC' });
		this.contentEl.createEl('p', { text: `This will create a new root MOC and move "${this.childMOC.basename}" under it.` });
		const inputEl = this.createInput('Parent MOC name...');

		const submit = () => {
			const name = inputEl.value.trim();
			if (name) this.plugin.moveRootMOCToSub(this.childMOC, name, null);
		};

		this.handleEnterKey(submit, inputEl);
		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ text: 'Create & Move', action: submit, primary: true }
		]);
	}
}

/** Modal for selecting parent MOC */
class SelectParentMOCModal extends BaseModal {
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
		this.contentEl.createEl('h2', { text: 'Select Parent MOC' });
		this.contentEl.createEl('p', { text: `Choose where to move "${this.childMOC.basename}":` });

		const listContainer = this.contentEl.createDiv({ cls: 'moc-system-scroll-list' });
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

		this.createButtons([{ text: 'Cancel', action: () => {} }]);
	}
}