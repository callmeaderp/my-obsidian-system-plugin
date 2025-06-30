import { App, Plugin, TFile, TFolder, normalizePath, Notice } from 'obsidian';

// Plugin modules
import { PluginSettings, SectionType, NoteType, CreateConfig, ColorInfo, UpdateResult, VaultUpdatePlan } from './types';
import { CONFIG, DEFAULT_SETTINGS, THEME_CONFIGS } from './constants';
import { 
	ValidationError, FileSystemError, MOCStructureError, FrontmatterError, 
	StyleError, isMOCSystemError 
} from './errors';
import { 
	validateFileName, sanitizeInput, ensureMOCSuffix, extractPromptVersion 
} from './utils/validation';
import { 
	getRandomEmoji, generateRandomColor, adjustColorOpacity, hasEmojiPrefix,
	getFrontmatterValue, debounce, delay 
} from './utils/helpers';
import {
	CreateMOCModal, AddToMOCModal, VaultUpdateModal, PromptDescriptionModal,
	CleanupConfirmationModal, ReorganizeMOCModal, UndoTestChangesModal, DeleteMOCContentModal
} from './modals';

// =================================================================================
// MAIN PLUGIN CLASS
// =================================================================================

/**
 * Main plugin class implementing a hierarchical MOC-based note-taking system
 */
export default class MOCSystemPlugin extends Plugin {
	settings: PluginSettings;
	private styleElement: HTMLStyleElement | null = null;
	private sessionStartTime: number;
	private initialFileSet: Set<string>;
	
	// Debounced style update to prevent excessive DOM manipulation
	private debouncedStyleUpdate = debounce(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.UPDATE);

	/**
	 * Plugin initialization sequence
	 */
	async onload() {
		try {
			// Track session state for undo functionality
			this.sessionStartTime = Date.now();
			this.initialFileSet = new Set(this.app.vault.getMarkdownFiles().map(f => f.path));
			
			await this.loadSettings();
			this.initializeStyles();
			this.registerCommands();
			this.registerEventListeners();
			
			console.log('MOC System Plugin loaded successfully');
		} catch (error) {
			console.error('Failed to load MOC System Plugin:', error);
			new Notice('MOC System Plugin failed to load. Check console for details.');
		}
	}

	/**
	 * Plugin cleanup
	 */
	onunload() {
		this.removeStyles();
		console.log('MOC System Plugin unloaded');
	}

	// =================================================================================
	// INITIALIZATION METHODS
	// =================================================================================

	/**
	 * Initializes the styling system with proper timing
	 */
	private initializeStyles() {
		// Initial application after basic plugin load
		setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.INITIAL);
		
		// Re-apply after workspace layout is fully ready
		this.app.workspace.onLayoutReady(() => 
			setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.LAYOUT_READY)
		);
	}

	/**
	 * Registers all plugin commands
	 */
	private registerCommands() {
		// Always-available commands
		const globalCommands = [
			{ 
				id: 'moc-context-create', 
				name: 'Create MOC or add content', 
				callback: () => this.handleContextCreate() 
			},
			{ 
				id: 'delete-moc-content', 
				name: 'Delete MOC content', 
				callback: () => this.handleContextDelete() 
			},
			{ 
				id: 'update-vault-system', 
				name: 'Update vault to latest system', 
				callback: () => this.updateVaultToLatestSystem() 
			},
			{ 
				id: 'cleanup-moc-system', 
				name: 'Cleanup MOC system files', 
				callback: () => this.cleanupMOCSystem() 
			},
			{ 
				id: 'undo-test-changes', 
				name: 'Undo test changes (since session start)', 
				callback: () => this.undoTestChanges() 
			}
		];

		// Context-dependent commands (only show when applicable)
		const conditionalCommands = [
			{ 
				id: 'reorganize-moc', 
				name: 'Reorganize MOC', 
				condition: (f: TFile) => this.isMOC(f), 
				action: (f: TFile) => this.reorganizeMOC(f) 
			},
			{ 
				id: 'duplicate-prompt-iteration', 
				name: 'Duplicate prompt iteration', 
				condition: (f: TFile) => this.isPromptIteration(f), 
				action: (f: TFile) => this.duplicatePromptIteration(f) 
			},
			{ 
				id: 'open-llm-links', 
				name: 'Open all LLM links', 
				condition: (f: TFile) => this.isPromptHub(f), 
				action: (f: TFile) => this.openLLMLinks(f) 
			}
		];

		// Register global commands
		globalCommands.forEach(cmd => this.addCommand(cmd));

		// Register conditional commands with proper checking
		conditionalCommands.forEach(cmd => this.addCommand({
			id: cmd.id,
			name: cmd.name,
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && cmd.condition(activeFile)) {
					if (!checking) {
						this.executeWithErrorHandling(() => cmd.action(activeFile));
					}
					return true;
				}
				return false;
			}
		}));
	}

	/**
	 * Registers event listeners for plugin functionality
	 */
	private registerEventListeners() {
		// Clean up broken links when files are deleted
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.executeWithErrorHandling(() => this.cleanupBrokenLinks(file));
				}
			})
		);

		// Update styles when files are renamed (MOC colors might need updates)
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && this.isMOC(file)) {
					this.debouncedStyleUpdate();
				}
			})
		);
	}

	// =================================================================================
	// SETTINGS MANAGEMENT
	// =================================================================================

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// =================================================================================
	// STYLE MANAGEMENT
	// =================================================================================

	/**
	 * Updates CSS styles for MOC folder coloring
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
			// Style errors are non-critical - log but don't disrupt functionality
			if (isMOCSystemError(error)) {
				console.warn('MOC System Plugin: Style update failed:', error.message);
			} else {
				console.error('MOC System Plugin: Unexpected error updating styles:', error);
			}
		}
	}

	/**
	 * Loads base CSS from the plugin directory
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
	 * Generates CSS for individual MOC folder colors
	 */
	private async generateMOCColorStyles(): Promise<string> {
		const allMOCs = await this.getAllMOCs();
		const colorStyles: string[] = [];

		for (const moc of allMOCs) {
			try {
				const frontmatter = this.app.metadataCache.getFileCache(moc)?.frontmatter;
				const lightColor = getFrontmatterValue(frontmatter, 'light-color', null);
				const darkColor = getFrontmatterValue(frontmatter, 'dark-color', null);
				
				if (lightColor && darkColor && moc.parent) {
					const escapedPath = this.escapeForCSS(moc.parent.path);
					
					colorStyles.push(
						this.generateThemeCSS(escapedPath, lightColor, 'light'),
						this.generateThemeCSS(escapedPath, darkColor, 'dark')
					);
				}
			} catch (error) {
				console.warn(`Failed to generate styles for MOC: ${moc.path}`, error);
			}
		}
		
		return colorStyles.join('\n');
	}

	/**
	 * Generates CSS rules for a specific MOC folder and theme
	 */
	private generateThemeCSS(escapedPath: string, color: string, theme: 'light' | 'dark'): string {
		const themeConfig = THEME_CONFIGS[theme];
		const selector = theme === 'dark' 
			? `.theme-dark .nav-folder-title[data-path="${escapedPath}"]` 
			: `.nav-folder-title[data-path="${escapedPath}"]`;
		
		return `
/* ${escapedPath} - ${theme} Theme */
${selector} {
    background: linear-gradient(135deg, 
        ${adjustColorOpacity(color, themeConfig.baseOpacity)} 0%, 
        ${adjustColorOpacity(color, themeConfig.gradientOpacity)} 100%) !important;
    border-left: 3px solid ${color} !important;
}
${selector}:hover {
    background: linear-gradient(135deg, 
        ${adjustColorOpacity(color, themeConfig.hoverOpacity)} 0%, 
        ${adjustColorOpacity(color, themeConfig.hoverGradientOpacity)} 100%) !important;
}
${selector} .nav-folder-collapse-indicator { 
    color: ${color} !important; 
}`;
	}

	/**
	 * Escapes special characters for CSS selectors
	 */
	private escapeForCSS(path: string): string {
		return path.replace(/['"\\]/g, '\\$&');
	}

	/**
	 * Removes all plugin-generated styles
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
	 * Context-aware creation handler
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
	 * Context-aware deletion handler
	 */
	async handleContextDelete() {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			new Notice('No active file to delete content from.');
			return;
		}

		// Only allow deletion in plugin-managed contexts
		if (!this.isPluginManagedContext(activeFile)) {
			new Notice('Delete MOC content is only available for MOCs, prompt hubs, and plugin-created notes.');
			return;
		}

		new DeleteMOCContentModal(this.app, activeFile, this).open();
	}

	/**
	 * Creates a new root MOC with complete structure
	 */
	async createMOC(name: string): Promise<TFile> {
		try {
			// Validate and sanitize the name
			const sanitizedName = sanitizeInput(name, 'MOC name');
			const mocName = ensureMOCSuffix(sanitizedName);
			
			// Generate unique visual identifier and color
			const emoji = getRandomEmoji();
			const colorInfo = generateRandomColor();
			const folderName = `${emoji} ${mocName}`;
			
			// Create complete folder structure
			await this.ensureMOCFolderStructure(folderName);
			
			// Build frontmatter with all required metadata
			const frontmatter = this.buildFrontmatter({
				tags: ['moc'],
				'note-type': 'moc',
				'root-moc-color': true,
				...this.colorToFrontmatter(colorInfo)
			});
			
			// Create the MOC file
			const filePath = `${folderName}/${folderName}.md`;
			const file = await this.createFileWithContent(filePath, frontmatter);
			
			// Open file and update styles
			await this.openFileAndNotify(file, `Created MOC: ${mocName}`);
			this.debouncedStyleUpdate();
			
			return file;
		} catch (error) {
			throw this.wrapError(error, 'Failed to create MOC', 'create', name);
		}
	}

	/**
	 * Creates a sub-MOC within an existing MOC structure
	 */
	async createSubMOC(parentMOC: TFile, name: string): Promise<TFile> {
		try {
			const sanitizedName = sanitizeInput(name, 'Sub-MOC name');
			const mocName = ensureMOCSuffix(sanitizedName);
			
			const emoji = getRandomEmoji();
			const colorInfo = generateRandomColor();
			const parentPath = parentMOC.parent?.path || '';
			const folderName = `${parentPath}/${emoji} ${mocName}`;
			
			await this.ensureMOCFolderStructure(folderName);
			
			const frontmatter = this.buildFrontmatter({
				tags: ['moc'],
				'note-type': 'moc',
				...this.colorToFrontmatter(colorInfo)
			});
			
			const file = await this.createFileWithContent(
				`${folderName}/${emoji} ${mocName}.md`, 
				frontmatter
			);
			
			await this.addToMOCSection(parentMOC, 'MOCs', file);
			new Notice(`Created sub-MOC: ${mocName}`);
			this.debouncedStyleUpdate();
			
			return file;
		} catch (error) {
			throw this.wrapError(error, 'Failed to create sub-MOC', 'create', name);
		}
	}

	// =================================================================================
	// CONTENT CREATION METHODS (SIMPLIFIED INTERFACE)
	// =================================================================================

	// Convenience methods for specific file types
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
	 * Unified factory method for creating different file types
	 */
	async createFile(config: CreateConfig): Promise<TFile> {
		try {
			const sanitizedName = sanitizeInput(config.name, `${config.type} name`);
			
			const fileConfigs = {
				moc: { 
					type: 'moc' as const, 
					emoji: getRandomEmoji(), 
					folder: '', 
					suffix: 'MOC', 
					createSubfolder: true 
				},
				note: { 
					type: 'note' as const, 
					emoji: CONFIG.NOTE_TYPES.Notes.emoji, 
					folder: CONFIG.FOLDERS.Notes,
					createSubfolder: false
				},
				resource: { 
					type: 'resource' as const, 
					emoji: CONFIG.NOTE_TYPES.Resources.emoji, 
					folder: CONFIG.FOLDERS.Resources,
					createSubfolder: false
				},
				prompt: { 
					type: 'prompt' as const, 
					emoji: CONFIG.NOTE_TYPES.Prompts.emoji, 
					folder: CONFIG.FOLDERS.Prompts, 
					createSubfolder: true 
				}
			};

			const fileConfig = fileConfigs[config.type];
			const parentPath = config.parentMOC?.parent?.path || '';
			const fileName = this.buildFileName(sanitizedName, fileConfig, parentPath);
			const frontmatter = this.buildFrontmatter({ 'note-type': config.type });

			// Handle special case for prompts (creates hub + iteration)
			if (fileConfig.createSubfolder && config.type === 'prompt') {
				return this.createPromptWithIterations(config, fileName, frontmatter);
			}

			const file = await this.createFileWithContent(fileName, frontmatter);
			
			if (config.parentMOC) {
				await this.addToMOCSection(config.parentMOC, this.typeToSection(config.type), file);
			}
			
			new Notice(`Created ${config.type}: ${sanitizedName}`);
			return file;
		} catch (error) {
			throw this.wrapError(error, `Failed to create ${config.type}`, 'create', config.name);
		}
	}

	/**
	 * Creates prompt hub with iteration tracking
	 */
	private async createPromptWithIterations(
		config: CreateConfig, 
		hubFileName: string, 
		baseFrontmatter: string
	): Promise<TFile> {
		try {
			const parentPath = config.parentMOC?.parent?.path || '';
			const promptsFolder = `${parentPath}/${CONFIG.FOLDERS.Prompts}`;
			const promptSubfolder = `${promptsFolder}/${config.name}`;
			const iterationName = `${CONFIG.NOTE_TYPES.Prompts.emoji} ${config.name} v1`;

			// Ensure iteration subfolder exists
			if (!this.app.vault.getAbstractFileByPath(promptSubfolder)) {
				await this.app.vault.createFolder(promptSubfolder);
			}

			// Create hub with standard structure
			const hubContent = `${baseFrontmatter}\n# ${config.name}\n\n## Iterations\n\n- [[${iterationName}]]\n\n## LLM Links\n\n\`\`\`llm-links\n\n\`\`\`\n`;
			const hubFile = await this.createFileWithContent(
				`${promptsFolder}/${CONFIG.NOTE_TYPES.Prompts.emoji} ${config.name}.md`, 
				hubContent
			);
			
			// Create first iteration
			await this.createFileWithContent(`${promptSubfolder}/${iterationName}.md`, baseFrontmatter);
			
			if (config.parentMOC) {
				await this.addToMOCSection(config.parentMOC, 'Prompts', hubFile);
			}
			
			new Notice(`Created prompt: ${config.name}`);
			this.debouncedStyleUpdate();
			return hubFile;
		} catch (error) {
			throw this.wrapError(error, 'Failed to create prompt with iterations', 'create', config.name || '');
		}
	}

	// =================================================================================
	// UTILITY METHODS FOR FILE CREATION
	// =================================================================================

	/**
	 * Builds complete file path with proper naming conventions
	 */
	private buildFileName(name: string, config: any, parentPath: string): string {
		const suffix = config.suffix ? ` ${config.suffix}` : '';
		const folder = config.folder ? `/${config.folder}` : '';
		return normalizePath(`${parentPath}${folder}/${config.emoji} ${name}${suffix}.md`);
	}

	/**
	 * Generates YAML frontmatter from data object
	 */
	private buildFrontmatter(data: Record<string, any>): string {
		const lines = ['---'];
		
		for (const [key, value] of Object.entries(data)) {
			if (Array.isArray(value)) {
				lines.push(`${key}:`);
				value.forEach(v => lines.push(`  - ${v}`));
			} else {
				lines.push(`${key}: ${value}`);
			}
		}
		
		lines.push('---', '');
		return lines.join('\n');
	}

	/**
	 * Converts color information to frontmatter properties
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
	 * Maps file types to MOC section names
	 */
	private typeToSection(type: NoteType): SectionType {
		const mapping: Record<NoteType, SectionType> = {
			moc: 'MOCs', 
			note: 'Notes', 
			resource: 'Resources', 
			prompt: 'Prompts'
		};
		return mapping[type];
	}

	/**
	 * Creates file with content and proper error handling
	 */
	private async createFileWithContent(path: string, content: string): Promise<TFile> {
		try {
			return await this.app.vault.create(normalizePath(path), content);
		} catch (error) {
			throw new FileSystemError(`Failed to create file: ${path}`, 'create', path);
		}
	}

	/**
	 * Opens file and shows success notification
	 */
	private async openFileAndNotify(file: TFile, message: string): Promise<void> {
		try {
			await this.app.workspace.getLeaf().openFile(file);
			new Notice(message);
		} catch (error) {
			// File creation succeeded but opening failed - not critical
			console.warn('Failed to open created file:', error);
			new Notice(`${message} (File created but could not be opened)`);
		}
	}

	/**
	 * Ensures complete MOC folder structure exists
	 */
	async ensureMOCFolderStructure(mocFolderPath: string) {
		try {
			// Create main MOC folder
			if (!this.app.vault.getAbstractFileByPath(mocFolderPath)) {
				await this.app.vault.createFolder(mocFolderPath);
			}
			
			// Create standard subfolders
			for (const folder of Object.values(CONFIG.FOLDERS)) {
				const subfolderPath = `${mocFolderPath}/${folder}`;
				if (!this.app.vault.getAbstractFileByPath(subfolderPath)) {
					try {
						await this.app.vault.createFolder(subfolderPath);
					} catch (err: any) {
						// Ignore "already exists" errors that can happen in race conditions
						if (!err.message?.includes('Folder already exists')) {
							throw err;
						}
					}
				}
			}
		} catch (error) {
			throw new FileSystemError(
				`Failed to create MOC folder structure: ${mocFolderPath}`, 
				'create', 
				mocFolderPath
			);
		}
	}

	// =================================================================================
	// UTILITY METHODS
	// =================================================================================

	/**
	 * Determines if a file is a MOC
	 */
	isMOC(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const tags = getFrontmatterValue(frontmatter, 'tags', [] as string[]);
		return Array.isArray(tags) && tags.includes('moc');
	}
	
	/**
	 * Determines if a MOC is at root level
	 */
	isRootMOC(file: TFile): boolean {
		return this.isMOC(file) && !(file.parent?.path || '').includes('/');
	}

	/**
	 * Determines if a file is a versioned prompt iteration
	 */
	isPromptIteration(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const noteType = getFrontmatterValue(frontmatter, 'note-type', null as string | null);
		const version = extractPromptVersion(file.basename);
		
		
		return noteType === 'prompt' && version !== null;
	}

	/**
	 * Determines if a file is a prompt hub
	 */
	isPromptHub(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const noteType = getFrontmatterValue(frontmatter, 'note-type', null as string | null);
		return noteType === 'prompt' && !this.isPromptIteration(file);
	}

	/**
	 * Determines if a file is in a plugin-managed context for deletion
	 */
	isPluginManagedContext(file: TFile): boolean {
		// Allow deletion for MOCs (they contain plugin-managed content)
		if (this.isMOC(file)) {
			return true;
		}

		// Allow deletion for prompt hubs (they manage iterations)
		if (this.isPromptHub(file)) {
			return true;
		}

		// Allow deletion for plugin-created files
		if (this.isPluginCreatedFile(file)) {
			return true;
		}

		// Check if the file is within a MOC structure
		return this.isWithinMOCStructure(file);
	}

	/**
	 * Checks if a file is within a MOC structure
	 */
	private isWithinMOCStructure(file: TFile): boolean {
		let currentFolder = file.parent;
		
		while (currentFolder) {
			// Check if this folder contains a MOC file
			const mocFile = currentFolder.children?.find(
				child => child instanceof TFile && this.isMOC(child)
			);
			
			if (mocFile) {
				return true;
			}
			
			// Move up one level
			currentFolder = currentFolder.parent;
		}
		
		return false;
	}

	/**
	 * Gets all MOC files in the vault
	 */
	async getAllMOCs(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
	}

	/**
	 * Detects circular dependencies in MOC hierarchy
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
				if (linkedFile && this.isMOC(linkedFile)) {
					queue.push(linkedFile);
				}
			}
		}
		
		return false;
	}

	// =================================================================================
	// MOC SECTION MANAGEMENT (Simplified)
	// =================================================================================

	/**
	 * Adds a link to a new file in the correct MOC section
	 */
	async addToMOCSection(moc: TFile, section: SectionType, newFile: TFile) {
		try {
			let content = await this.app.vault.read(moc);
			let lines = content.split('\n');
			
			// Find frontmatter end to avoid modifying metadata
			const frontmatterEnd = this.findFrontmatterEnd(lines);
			
			const { reorganizedLines, sectionIndices } = this.reorganizeContentForPluginSections(
				lines, 
				frontmatterEnd
			);
			
			let sectionLineIndex = sectionIndices.get(section);
			
			if (sectionLineIndex === undefined) {
				// Section doesn't exist, create it in proper order
				this.insertNewSection(reorganizedLines, section, newFile, frontmatterEnd, sectionIndices);
			} else {
				// Section exists, add link to it
				this.insertLinkInExistingSection(reorganizedLines, sectionLineIndex, newFile);
			}
			
			await this.app.vault.modify(moc, reorganizedLines.join('\n'));
		} catch (error) {
			throw this.wrapError(error, 'Failed to add file to MOC section', 'update', moc.path);
		}
	}

	// Helper methods for MOC section management
	private findFrontmatterEnd(lines: string[]): number {
		if (lines[0] !== '---') return 0;
		const closingIndex = lines.slice(1).indexOf('---');
		return closingIndex === -1 ? 0 : closingIndex + 2;
	}

	private insertNewSection(
		lines: string[], 
		section: SectionType, 
		newFile: TFile, 
		frontmatterEnd: number,
		sectionIndices: Map<SectionType, number>
	) {
		let insertIndex = frontmatterEnd;
		const currentSectionOrderIndex = CONFIG.SECTION_ORDER.indexOf(section);

		for (let i = currentSectionOrderIndex + 1; i < CONFIG.SECTION_ORDER.length; i++) {
			const nextSection = CONFIG.SECTION_ORDER[i];
			if (sectionIndices.has(nextSection)) {
				insertIndex = sectionIndices.get(nextSection)!;
				break;
			}
		}

		if (insertIndex === frontmatterEnd && sectionIndices.size > 0) {
			const lastSectionIndex = Math.max(...Array.from(sectionIndices.values()));
			insertIndex = this.findSectionEnd(lines, lastSectionIndex);
		}

		const newSectionContent = [`## ${section}`, ``, `- [[${newFile.basename}]]`, ``];
		lines.splice(insertIndex, 0, ...newSectionContent);
	}

	private insertLinkInExistingSection(lines: string[], sectionIndex: number, newFile: TFile) {
		let insertIndex = sectionIndex + 1;
		while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
			insertIndex++;
		}
		lines.splice(insertIndex, 0, `- [[${newFile.basename}]]`);
	}

	private reorganizeContentForPluginSections(
		lines: string[], 
		frontmatterEnd: number
	): { reorganizedLines: string[], sectionIndices: Map<SectionType, number> } {
		const pluginSections: { name: SectionType, content: string[] }[] = [];
		const otherContentLines: string[] = [];
		const sectionIndices = new Map<SectionType, number>();
		const consumedLineIndices = new Set<number>();

		// Extract all known plugin sections in order
		for (const sectionName of CONFIG.SECTION_ORDER) {
			const header = `## ${sectionName}`;
			const startIndex = lines.findIndex((line, i) => 
				i >= frontmatterEnd && line.trim() === header
			);

			if (startIndex !== -1) {
				const endIndex = this.findSectionEnd(lines, startIndex);
				const sectionContent = lines.slice(startIndex, endIndex);
				pluginSections.push({ name: sectionName, content: sectionContent });

				for (let i = startIndex; i < endIndex; i++) {
					consumedLineIndices.add(i);
				}
			}
		}

		// Collect other content
		for (let i = frontmatterEnd; i < lines.length; i++) {
			if (!consumedLineIndices.has(i)) {
				otherContentLines.push(lines[i]);
			}
		}

		// Rebuild file structure
		const reorganizedLines: string[] = [...lines.slice(0, frontmatterEnd)];
		
		for (const section of pluginSections) {
			sectionIndices.set(section.name, reorganizedLines.length);
			reorganizedLines.push(...section.content);
		}

		if (otherContentLines.length > 0) {
			if (reorganizedLines.length > frontmatterEnd && 
				reorganizedLines[reorganizedLines.length - 1].trim() !== '') {
				reorganizedLines.push('');
			}
			reorganizedLines.push(...otherContentLines);
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

	// =================================================================================
	// PROMPT MANAGEMENT SYSTEM (Simplified)
	// =================================================================================

	async duplicatePromptIteration(file: TFile) {
		try {
			// Extract current version number from file basename
			const currentVersion = extractPromptVersion(file.basename);
			if (!currentVersion) {
				new Notice('Could not determine version number from file name.');
				return;
			}

			// Find the hub file and iteration folder structure
			const iterationFolder = file.parent;
			const promptsFolder = iterationFolder?.parent;
			const mocFolder = promptsFolder?.parent;
			
			if (!iterationFolder || !promptsFolder || !mocFolder) {
				new Notice('Could not find prompt structure. File must be in a prompt iteration folder.');
				return;
			}

			// Extract the prompt base name from the iteration file name
			// For file "🤖 Prompt Name v1.md" or "🤖 Prompt Name v2 - description.md"
			// We want to find hub file "🤖 Prompt Name.md"
			const iterationBaseName = file.basename.replace(/ v\d+.*$/, ''); // Remove version and everything after
			const hubFileName = `${iterationBaseName}.md`;
			
			
			const hubFile = promptsFolder.children?.find(child => 
				child instanceof TFile && 
				child.name === hubFileName &&
				child.parent?.path === promptsFolder.path // Ensure it's directly in Prompts folder, not a subfolder
			) as TFile;

			if (!hubFile) {
				new Notice(`Could not find prompt hub file "${hubFileName}" in ${promptsFolder.path}`);
				return;
			}

			new PromptDescriptionModal(this.app, async (description: string) => {
				try {
					const nextVersion = currentVersion + 1;
					const baseIterationName = file.basename.replace(/ v\d+$/, '');
					
					// Build new iteration filename with optional description
					let newIterationName = `${baseIterationName} v${nextVersion}`;
					if (description.trim()) {
						const sanitizedDescription = sanitizeInput(description, 'iteration description');
						newIterationName += ` - ${sanitizedDescription}`;
					}
					
					// Read current iteration content
					const currentContent = await this.app.vault.read(file);
					
					// Create new iteration file in the same folder
					const newIterationPath = `${iterationFolder.path}/${newIterationName}.md`;
					const newFile = await this.createFileWithContent(newIterationPath, currentContent);
					
					// Update hub file to include new iteration
					await this.addIterationToHub(hubFile, newFile);
					
					// Open the new iteration file
					await this.app.workspace.getLeaf().openFile(newFile);
					new Notice(`Created iteration v${nextVersion}${description ? ` - ${description}` : ''}`);
					
				} catch (error) {
					this.handleError('Failed to duplicate prompt iteration', error);
				}
			}).open();
			
		} catch (error) {
			this.handleError('Failed to prepare prompt iteration duplication', error);
		}
	}

	/**
	 * Adds a new iteration link to the prompt hub file
	 */
	private async addIterationToHub(hubFile: TFile, newIterationFile: TFile) {
		try {
			let content = await this.app.vault.read(hubFile);
			let lines = content.split('\n');
			
			// Find the Iterations section
			const iterationsIndex = lines.findIndex(line => line.trim() === '## Iterations');
			if (iterationsIndex === -1) {
				// If no Iterations section exists, create it after frontmatter
				const frontmatterEnd = this.findFrontmatterEnd(lines);
				const titleIndex = lines.findIndex((line, i) => i >= frontmatterEnd && line.startsWith('# '));
				const insertIndex = titleIndex !== -1 ? titleIndex + 1 : frontmatterEnd;
				
				lines.splice(insertIndex, 0, '', '## Iterations', '', `- [[${newIterationFile.basename}]]`, '');
			} else {
				// Find where to insert the new iteration (after the section header)
				let insertIndex = iterationsIndex + 1;
				
				// Skip empty lines after section header
				while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
					insertIndex++;
				}
				
				// Insert the new iteration link
				lines.splice(insertIndex, 0, `- [[${newIterationFile.basename}]]`);
			}
			
			await this.app.vault.modify(hubFile, lines.join('\n'));
		} catch (error) {
			throw this.wrapError(error, 'Failed to update hub file with new iteration', 'update', hubFile.path);
		}
	}

	async openLLMLinks(file: TFile) {
		try {
			// Read the hub file content
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			// Find the LLM Links section
			const llmLinksIndex = lines.findIndex(line => line.trim() === '## LLM Links');
			if (llmLinksIndex === -1) {
				new Notice('No LLM Links section found in this prompt hub.');
				return;
			}
			
			// Find the llm-links code block
			let codeBlockStart = -1;
			let codeBlockEnd = -1;
			
			for (let i = llmLinksIndex + 1; i < lines.length; i++) {
				const line = lines[i].trim();
				
				if (line === '```llm-links' || line === '```llm-links' || line.startsWith('```llm-links')) {
					codeBlockStart = i + 1;
				} else if (codeBlockStart !== -1 && line === '```') {
					codeBlockEnd = i;
					break;
				} else if (line.startsWith('## ') && codeBlockStart === -1) {
					// Hit another section without finding code block
					break;
				}
			}
			
			if (codeBlockStart === -1) {
				new Notice('No llm-links code block found. Add URLs in a ```llm-links code block.');
				return;
			}
			
			// Extract URLs from the code block
			const urlLines = lines.slice(codeBlockStart, codeBlockEnd === -1 ? lines.length : codeBlockEnd);
			const urls = urlLines
				.map(line => line.trim())
				.filter(line => line.length > 0)
				.filter(line => this.isValidUrl(line));
			
			if (urls.length === 0) {
				new Notice('No valid URLs found in LLM Links section.');
				return;
			}
			
			// Open each URL in the default browser
			const { shell } = window.require('electron');
			let openedCount = 0;
			
			for (const url of urls) {
				try {
					await shell.openExternal(url);
					openedCount++;
					// Small delay between opens to prevent overwhelming the system
					await delay(200);
				} catch (error) {
					console.warn(`Failed to open URL: ${url}`, error);
				}
			}
			
			const message = openedCount === urls.length 
				? `Opened ${openedCount} LLM conversation${openedCount === 1 ? '' : 's'}`
				: `Opened ${openedCount} of ${urls.length} LLM conversations (some failed)`;
			
			new Notice(message);
			
		} catch (error) {
			this.handleError('Failed to open LLM links', error);
		}
	}

	/**
	 * Validates if a string is a properly formatted URL
	 */
	private isValidUrl(urlString: string): boolean {
		try {
			const url = new URL(urlString);
			// Only allow http and https protocols for security
			return url.protocol === 'http:' || url.protocol === 'https:';
		} catch {
			return false;
		}
	}

	// =================================================================================
	// MOC REORGANIZATION SYSTEM (Simplified)
	// =================================================================================

	async reorganizeMOC(moc: TFile) {
		new ReorganizeMOCModal(this.app, moc, this).open();
	}

	/**
	 * Moves a root MOC to become a sub-MOC under a parent
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
	 * Promotes a sub-MOC to become a root MOC
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
	 * Moves a sub-MOC from one parent to another
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
	 * Removes all references to a MOC from parent MOCs during reorganization
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
	// VAULT UPDATE & MAINTENANCE (Simplified)
	// =================================================================================

	async updateVaultToLatestSystem() {
		try {
			new Notice('Analyzing vault for updates...');
			
			// Generate update plan by analyzing all plugin files
			const updatePlan = await this.generateVaultUpdatePlan();
			
			if (updatePlan.totalChanges === 0) {
				new Notice('Vault is already up to date! No changes needed.');
				return;
			}
			
			// Show update plan to user for confirmation
			new VaultUpdateModal(this.app, updatePlan, async () => {
				await this.executeVaultUpdates(updatePlan);
			}).open();
			
		} catch (error) {
			this.handleError('Error during vault update analysis', error);
		}
	}

	/**
	 * Analyzes all plugin files and generates a comprehensive update plan
	 */
	private async generateVaultUpdatePlan(): Promise<VaultUpdatePlan> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const filesToUpdate: TFile[] = [];
		const updateSummary = new Map<TFile, string[]>();
		let totalChanges = 0;

		for (const file of allFiles) {
			// Only analyze plugin-created files
			if (!this.isPluginCreatedFile(file)) continue;

			const updates = await this.analyzeFileForUpdates(file);
			if (updates.length > 0) {
				filesToUpdate.push(file);
				updateSummary.set(file, updates);
				totalChanges += updates.length;
			}
		}

		return { filesToUpdate, updateSummary, totalChanges };
	}

	/**
	 * Analyzes a single file for potential updates
	 */
	private async analyzeFileForUpdates(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		const noteType = getFrontmatterValue(frontmatter, 'note-type', null as string | null);

		// Analyze frontmatter completeness
		if (!frontmatter) {
			updates.push('Add missing frontmatter section');
		} else {
			if (!noteType) {
				updates.push('Add missing note-type field');
			}

			// MOC-specific checks
			if (noteType === 'moc' || this.isMOC(file)) {
				const tags = getFrontmatterValue(frontmatter, 'tags', [] as string[]);
				if (!Array.isArray(tags) || !tags.includes('moc')) {
					updates.push('Add missing "moc" tag');
				}

				// Check for color information in root MOCs
				if (this.isRootMOC(file)) {
					const lightColor = getFrontmatterValue(frontmatter, 'light-color', null);
					const darkColor = getFrontmatterValue(frontmatter, 'dark-color', null);
					if (!lightColor || !darkColor) {
						updates.push('Add missing MOC color information');
					}
				}
			}
		}

		// Analyze file structure and content
		if (noteType === 'moc') {
			const structureUpdates = await this.analyzeMOCStructure(file);
			updates.push(...structureUpdates);
		} else if (noteType === 'prompt' && this.isPromptHub(file)) {
			const promptUpdates = await this.analyzePromptHubStructure(file);
			updates.push(...promptUpdates);
		}

		// Check naming conventions
		const namingUpdates = this.analyzeNamingConventions(file, noteType);
		updates.push(...namingUpdates);

		return updates;
	}

	/**
	 * Analyzes MOC file structure for compliance with current standards
	 */
	private async analyzeMOCStructure(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			const frontmatterEnd = this.findFrontmatterEnd(lines);

			// Check for proper section organization
			const sectionIndices = new Map<SectionType, number>();
			let hasAnySection = false;

			for (const section of CONFIG.SECTION_ORDER) {
				const index = lines.findIndex((line, i) => 
					i >= frontmatterEnd && line.trim() === `## ${section}`
				);
				if (index !== -1) {
					sectionIndices.set(section, index);
					hasAnySection = true;
				}
			}

			// Check section order
			const foundSections = Array.from(sectionIndices.entries()).sort(([,a], [,b]) => a - b);
			const expectedOrder = CONFIG.SECTION_ORDER.filter(section => sectionIndices.has(section));
			
			if (foundSections.map(([section]) => section).join(',') !== expectedOrder.join(',')) {
				updates.push('Reorganize sections to standard order (MOCs, Notes, Resources, Prompts)');
			}

			// For MOCs with content, ensure they have at least basic structure
			if (hasAnySection) {
				const hasTitle = lines.some((line, i) => i >= frontmatterEnd && line.startsWith('# '));
				if (!hasTitle) {
					updates.push('Add missing title header');
				}
			}

		} catch (error) {
			console.warn(`Failed to analyze MOC structure for ${file.path}:`, error);
		}

		return updates;
	}

	/**
	 * Analyzes prompt hub structure for compliance with current standards
	 */
	private async analyzePromptHubStructure(file: TFile): Promise<string[]> {
		const updates: string[] = [];
		
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');

			const hasIterationsSection = lines.some(line => line.trim() === '## Iterations');
			const hasLLMLinksSection = lines.some(line => line.trim() === '## LLM Links');

			if (!hasIterationsSection) {
				updates.push('Add missing Iterations section');
			}

			if (!hasLLMLinksSection) {
				updates.push('Add missing LLM Links section with code block');
			}

		} catch (error) {
			console.warn(`Failed to analyze prompt hub structure for ${file.path}:`, error);
		}

		return updates;
	}

	/**
	 * Analyzes file naming conventions
	 */
	private analyzeNamingConventions(file: TFile, noteType: string | null): string[] {
		const updates: string[] = [];

		// Check emoji prefixes
		if (!hasEmojiPrefix(file.name)) {
			if (noteType && ['moc', 'note', 'resource', 'prompt'].includes(noteType)) {
				updates.push('Add missing emoji prefix');
			}
		}

		// Check MOC suffix
		if (noteType === 'moc' && !file.basename.endsWith(' MOC')) {
			updates.push('Add missing " MOC" suffix');
		}

		return updates;
	}

	/**
	 * Executes the planned vault updates
	 */
	private async executeVaultUpdates(updatePlan: VaultUpdatePlan): Promise<void> {
		try {
			new Notice('Starting vault updates...');
			let updatedCount = 0;
			const results: UpdateResult[] = [];

			for (const file of updatePlan.filesToUpdate) {
				const plannedChanges = updatePlan.updateSummary.get(file) || [];
				
				try {
					await this.executeFileUpdates(file, plannedChanges);
					updatedCount++;
					
					results.push({
						file,
						changes: plannedChanges,
						success: true
					});
					
				} catch (error) {
					console.error(`Failed to update ${file.path}:`, error);
					results.push({
						file,
						changes: plannedChanges,
						success: false,
						error: error instanceof Error ? error.message : String(error)
					});
				}
			}

			// Update styles after all changes
			await this.updateMOCStyles();

			// Show completion summary
			const failedCount = results.filter(r => !r.success).length;
			if (failedCount === 0) {
				new Notice(`✅ Vault update complete! Updated ${updatedCount} files.`);
			} else {
				new Notice(`⚠️ Vault update completed with ${failedCount} errors. Updated ${updatedCount - failedCount} of ${updatedCount} files.`);
			}

		} catch (error) {
			this.handleError('Failed to execute vault updates', error);
		}
	}

	/**
	 * Executes updates for a single file
	 */
	private async executeFileUpdates(file: TFile, plannedChanges: string[]): Promise<void> {
		for (const change of plannedChanges) {
			switch (change) {
				case 'Add missing frontmatter section':
					await this.addMissingFrontmatter(file);
					break;
				case 'Add missing note-type field':
					await this.addNoteTypeField(file);
					break;
				case 'Add missing "moc" tag':
					await this.addMOCTag(file);
					break;
				case 'Add missing MOC color information':
					await this.addMOCColorInfo(file);
					break;
				case 'Add missing emoji prefix':
					await this.addEmojiPrefix(file);
					break;
				case 'Add missing " MOC" suffix':
					await this.addMOCSuffix(file);
					break;
				case 'Add missing Iterations section':
					await this.addIterationsSection(file);
					break;
				case 'Add missing LLM Links section with code block':
					await this.addLLMLinksSection(file);
					break;
				case 'Reorganize sections to standard order (MOCs, Notes, Resources, Prompts)':
					await this.reorganizeMOCSections(file);
					break;
				case 'Add missing title header':
					await this.addTitleHeader(file);
					break;
				default:
					console.warn(`Unknown update: ${change} for file ${file.path}`);
			}
		}
	}

	// Individual update methods for specific changes
	private async addMissingFrontmatter(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		if (!content.startsWith('---')) {
			const noteType = this.detectNoteType(file);
			const frontmatter = this.buildFrontmatter({ 'note-type': noteType });
			await this.app.vault.modify(file, frontmatter + content);
		}
	}

	private async addNoteTypeField(file: TFile): Promise<void> {
		const noteType = this.detectNoteType(file);
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			if (lines[0] === '---') {
				const closingIndex = lines.slice(1).indexOf('---');
				if (closingIndex !== -1) {
					lines.splice(closingIndex + 1, 0, `note-type: ${noteType}`);
				}
			}
			return lines.join('\n');
		});
	}

	private async addMOCTag(file: TFile): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			if (lines[0] === '---') {
				const closingIndex = lines.slice(1).indexOf('---');
				if (closingIndex !== -1) {
					// Look for existing tags line
					const tagsIndex = lines.findIndex((line, i) => 
						i > 0 && i < closingIndex + 1 && line.startsWith('tags:')
					);
					
					if (tagsIndex !== -1) {
						// Update existing tags
						if (lines[tagsIndex].includes('[') && lines[tagsIndex].includes(']')) {
							lines[tagsIndex] = lines[tagsIndex].replace(']', ', moc]');
						} else {
							lines[tagsIndex] = 'tags: [moc]';
						}
					} else {
						// Add tags line
						lines.splice(closingIndex + 1, 0, 'tags: [moc]');
					}
				}
			}
			return lines.join('\n');
		});
	}

	private async addMOCColorInfo(file: TFile): Promise<void> {
		const colorInfo = generateRandomColor();
		const colorFrontmatter = this.colorToFrontmatter(colorInfo);
		
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			if (lines[0] === '---') {
				const closingIndex = lines.slice(1).indexOf('---');
				if (closingIndex !== -1) {
					// Add color fields
					Object.entries(colorFrontmatter).forEach(([key, value]) => {
						lines.splice(closingIndex + 1, 0, `${key}: ${value}`);
					});
				}
			}
			return lines.join('\n');
		});
	}

	private async addEmojiPrefix(file: TFile): Promise<void> {
		const noteType = this.detectNoteType(file);
		let emoji = getRandomEmoji();
		
		// Use standard emojis for known types
		if (noteType === 'note') emoji = CONFIG.NOTE_TYPES.Notes.emoji;
		else if (noteType === 'resource') emoji = CONFIG.NOTE_TYPES.Resources.emoji;
		else if (noteType === 'prompt') emoji = CONFIG.NOTE_TYPES.Prompts.emoji;
		
		const newName = `${emoji} ${file.name}`;
		await this.app.vault.rename(file, `${file.parent?.path || ''}/${newName}`);
	}

	private async addMOCSuffix(file: TFile): Promise<void> {
		const newName = file.name.replace('.md', ' MOC.md');
		await this.app.vault.rename(file, `${file.parent?.path || ''}/${newName}`);
	}

	private async addIterationsSection(file: TFile): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const frontmatterEnd = this.findFrontmatterEnd(lines);
			
			// Add after title or frontmatter
			const titleIndex = lines.findIndex((line, i) => i >= frontmatterEnd && line.startsWith('# '));
			const insertIndex = titleIndex !== -1 ? titleIndex + 1 : frontmatterEnd;
			
			lines.splice(insertIndex, 0, '', '## Iterations', '');
			return lines.join('\n');
		});
	}

	private async addLLMLinksSection(file: TFile): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const sectionContent = ['', '## LLM Links', '', '```llm-links', '', '```', ''];
			lines.push(...sectionContent);
			return lines.join('\n');
		});
	}

	private async reorganizeMOCSections(file: TFile): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const frontmatterEnd = this.findFrontmatterEnd(lines);
			const { reorganizedLines } = this.reorganizeContentForPluginSections(lines, frontmatterEnd);
			return reorganizedLines.join('\n');
		});
	}

	private async addTitleHeader(file: TFile): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const lines = content.split('\n');
			const frontmatterEnd = this.findFrontmatterEnd(lines);
			// Remove emoji prefix and MOC suffix using the existing hasEmojiPrefix utility
			let title = file.basename.replace(' MOC', '');
			if (hasEmojiPrefix(title)) {
				// Remove the first emoji character and any following whitespace
				title = title.replace(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '');
			}
			lines.splice(frontmatterEnd, 0, `# ${title}`, '');
			return lines.join('\n');
		});
	}

	/**
	 * Detects the note type based on file location and characteristics
	 */
	private detectNoteType(file: TFile): string {
		// Check if it's a MOC by existing logic
		if (this.isMOC(file)) return 'moc';
		
		// Check by folder location
		const path = file.path;
		if (path.includes('/Notes/')) return 'note';
		if (path.includes('/Resources/')) return 'resource';
		if (path.includes('/Prompts/')) return 'prompt';
		
		// Check by file characteristics
		if (file.basename.endsWith(' MOC')) return 'moc';
		if (file.name.startsWith(CONFIG.NOTE_TYPES.Notes.emoji)) return 'note';
		if (file.name.startsWith(CONFIG.NOTE_TYPES.Resources.emoji)) return 'resource';
		if (file.name.startsWith(CONFIG.NOTE_TYPES.Prompts.emoji)) return 'prompt';
		
		// Default fallback
		return 'note';
	}

	async cleanupMOCSystem() {
		try {
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
		} catch (error) {
			this.handleError('Failed to cleanup MOC system', error);
		}
	}

	async undoTestChanges() {
		try {
			const currentFiles = this.app.vault.getMarkdownFiles();
			const newFiles = currentFiles.filter(file => 
				!this.initialFileSet.has(file.path) && this.isPluginCreatedFile(file)
			);

			if (newFiles.length === 0) {
				new Notice('No test files to undo.');
				return;
			}

			new UndoTestChangesModal(this.app, newFiles, async () => {
				let deletedCount = 0;
				for (const file of newFiles) {
					try {
						await this.app.vault.delete(file);
						deletedCount++;
					} catch (error) {
						console.error(`Failed to delete test file ${file.path}:`, error);
					}
				}
				
				this.debouncedStyleUpdate();
				new Notice(`Undone test changes! Deleted ${deletedCount} files created this session.`);
			}).open();
		} catch (error) {
			this.handleError('Failed to undo test changes', error);
		}
	}

	/**
	 * Cleans up broken links when files are deleted
	 */
	async cleanupBrokenLinks(deletedFile: TFile) {
		try {
			const allFiles = this.app.vault.getMarkdownFiles();
			const linkPattern = new RegExp(`-\\s*\\[\\[${deletedFile.basename}\\]\\]`);
			
			for (const file of allFiles) {
				try {
					await this.app.vault.process(file, (content) => {
						if (linkPattern.test(content)) {
							return content.split('\n')
								.filter(line => !linkPattern.test(line.trim()))
								.join('\n');
						}
						return content;
					});
				} catch (error) {
					console.warn(`Failed to clean links in ${file.path}:`, error);
				}
			}
		} catch (error) {
			console.error('Failed to cleanup broken links:', error);
		}
	}

	/**
	 * Cleans up empty folders after file deletions
	 */
	async cleanupEmptyFolders(parentFolder: TFolder) {
		try {
			const standardFolders = Object.values(CONFIG.FOLDERS);
			
			// Check each standard folder (Notes, Resources, Prompts)
			for (const folderName of standardFolders) {
				const folder = parentFolder.children?.find(
					child => child instanceof TFolder && child.name === folderName
				) as TFolder;
				
				if (folder && this.isFolderEmpty(folder)) {
					await this.app.vault.delete(folder);
					console.log(`Cleaned up empty folder: ${folder.path}`);
				}
			}
			
			// Also check for empty prompt iteration folders
			const promptsFolder = parentFolder.children?.find(
				child => child instanceof TFolder && child.name === CONFIG.FOLDERS.Prompts
			) as TFolder;
			
			if (promptsFolder) {
				const iterationFolders = promptsFolder.children?.filter(
					child => child instanceof TFolder
				) as TFolder[];
				
				for (const iterFolder of iterationFolders || []) {
					if (this.isFolderEmpty(iterFolder)) {
						await this.app.vault.delete(iterFolder);
						console.log(`Cleaned up empty iteration folder: ${iterFolder.path}`);
					}
				}
				
				// Check if Prompts folder itself is now empty
				if (this.isFolderEmpty(promptsFolder)) {
					await this.app.vault.delete(promptsFolder);
					console.log(`Cleaned up empty prompts folder: ${promptsFolder.path}`);
				}
			}
		} catch (error) {
			console.error('Failed to cleanup empty folders:', error);
		}
	}

	/**
	 * Checks if a folder is empty (contains no files or folders)
	 */
	private isFolderEmpty(folder: TFolder): boolean {
		return !folder.children || folder.children.length === 0;
	}

	/**
	 * Checks if a file was created by this plugin
	 */
	private isPluginCreatedFile(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const noteType = getFrontmatterValue(frontmatter, 'note-type', null as string | null);
		return noteType !== null && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
	}

	// =================================================================================
	// ERROR HANDLING
	// =================================================================================

	/**
	 * Executes functions with comprehensive error handling
	 */
	private async executeWithErrorHandling(fn: () => Promise<void> | void) {
		try {
			await Promise.resolve(fn());
		} catch (error) {
			this.handleError('Operation failed', error);
		}
	}

	/**
	 * Wraps errors with additional context
	 */
	private wrapError(error: unknown, message: string, operation: string, path?: string): Error {
		if (isMOCSystemError(error)) {
			return error;
		}
		
		return new FileSystemError(
			`${message}: ${error instanceof Error ? error.message : String(error)}`,
			operation as any,
			path
		);
	}

	/**
	 * Centralized error handling with user feedback
	 */
	private handleError(message: string, error: any): void {
		if (isMOCSystemError(error)) {
			console.error(`MOC System Plugin: ${message}`, error);
			new Notice(`${message}: ${error.message}`);
		} else {
			console.error(`MOC System Plugin: ${message}`, error);
			new Notice(`${message}. Check console for details.`);
		}
	}
}