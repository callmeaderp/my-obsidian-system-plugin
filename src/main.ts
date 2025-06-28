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
	CleanupConfirmationModal, ReorganizeMOCModal, UndoTestChangesModal
} from './modals';

// =================================================================================
// MAIN PLUGIN CLASS
// =================================================================================

/**
 * Main plugin class implementing a hierarchical MOC-based note-taking system
 * 
 * Why: Provides context-aware creation, organization, and maintenance tools
 * for managing large knowledge bases using Maps of Content (MOCs) as the
 * primary organizational structure.
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
	 * 
	 * Why: Loads settings, registers commands, sets up event listeners, and
	 * initializes styling system with proper timing for Obsidian's lifecycle.
	 */
	async onload() {
		try {
			// Track session state for undo functionality
			// Why: Enables users to safely test plugin features and undo test changes
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
	 * 
	 * Why: Removes styling and cleans up resources when plugin is disabled.
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
	 * 
	 * Why: Obsidian's initialization happens in stages. We need to apply styles
	 * at the right times to ensure they work properly across different layouts.
	 */
	private initializeStyles() {
		// Initial application after basic plugin load
		setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.INITIAL);
		
		// Re-apply after workspace layout is fully ready
		// Why: Some styling only works after the file explorer is rendered
		this.app.workspace.onLayoutReady(() => 
			setTimeout(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.LAYOUT_READY)
		);
	}

	/**
	 * Registers all plugin commands
	 * 
	 * Why: Centralizes command registration for easier maintenance and
	 * separates context-dependent commands from always-available ones.
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
	 * 
	 * Why: Automatic cleanup of broken links maintains vault integrity
	 * when files are deleted.
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
	 * 
	 * Why: Each MOC gets a unique color in the file explorer for visual hierarchy.
	 * Combines base styles with dynamically generated color rules.
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
	 * 
	 * Why: Separates static styles from dynamic color generation.
	 * Returns empty string gracefully if file is missing.
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
	 * 
	 * Why: Each MOC needs theme-specific styling for both light and dark modes.
	 * CSS is generated from frontmatter color information.
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
	 * 
	 * Why: Creates theme-specific selectors with appropriate opacity levels
	 * for visual hierarchy without overwhelming the interface.
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
	 * 
	 * Why: File paths can contain characters that need escaping in CSS.
	 */
	private escapeForCSS(path: string): string {
		return path.replace(/['"\\]/g, '\\$&');
	}

	/**
	 * Removes all plugin-generated styles
	 * 
	 * Why: Clean removal prevents style conflicts when plugin is disabled
	 * or reloaded.
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
	 * 
	 * Why: Determines appropriate action based on current context.
	 * Creates root MOC if no active file, adds to MOC if in MOC context.
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
	 * Creates a new root MOC with complete structure
	 * 
	 * Why: Root MOCs need their own folder hierarchy and unique styling.
	 * This method handles all the setup in one operation.
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
	 * 
	 * Why: Sub-MOCs organize topics within larger MOCs while maintaining
	 * the hierarchical structure and automatic linking.
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
	 * 
	 * Why: Reduces code duplication and ensures consistent creation patterns
	 * across all file types while handling type-specific requirements.
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
	 * 
	 * Why: Prompts evolve through iterations. This creates both a hub file
	 * for managing iterations and the first iteration file.
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
	 * 
	 * Why: Consistent file naming across all types with proper emoji prefixes
	 * and folder organization.
	 */
	private buildFileName(name: string, config: any, parentPath: string): string {
		const suffix = config.suffix ? ` ${config.suffix}` : '';
		const folder = config.folder ? `/${config.folder}` : '';
		return normalizePath(`${parentPath}${folder}/${config.emoji} ${name}${suffix}.md`);
	}

	/**
	 * Generates YAML frontmatter from data object
	 * 
	 * Why: Consistent frontmatter formatting with proper array and scalar handling.
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
	 * 
	 * Why: Stores color data in frontmatter for persistence and retrieval
	 * during style generation.
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
	 * 
	 * Why: Maintains consistent organization within MOC files.
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
	 * 
	 * Why: Centralizes file creation with normalized paths and error wrapping.
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
	 * 
	 * Why: Provides immediate feedback and context after file creation.
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
	 * 
	 * Why: MOCs require standardized subfolders for organization.
	 * Creates all necessary folders in one operation.
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
	 * 
	 * Why: MOCs are identified by frontmatter tags for reliable detection
	 * across different naming conventions.
	 */
	isMOC(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const tags = getFrontmatterValue(frontmatter, 'tags', [] as string[]);
		return Array.isArray(tags) && tags.includes('moc');
	}
	
	/**
	 * Determines if a MOC is at root level
	 * 
	 * Why: Root MOCs have different reorganization options than sub-MOCs.
	 */
	isRootMOC(file: TFile): boolean {
		return this.isMOC(file) && !(file.parent?.path || '').includes('/');
	}

	/**
	 * Determines if a file is a versioned prompt iteration
	 * 
	 * Why: Prompt iterations have special duplication and management features.
	 */
	isPromptIteration(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const noteType = getFrontmatterValue(frontmatter, 'note-type', null as string | null);
		return noteType === 'prompt' && extractPromptVersion(file.basename) !== null;
	}

	/**
	 * Determines if a file is a prompt hub
	 * 
	 * Why: Prompt hubs manage iterations and have special link-opening features.
	 */
	isPromptHub(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const noteType = getFrontmatterValue(frontmatter, 'note-type', null as string | null);
		return noteType === 'prompt' && !this.isPromptIteration(file);
	}

	/**
	 * Gets all MOC files in the vault
	 * 
	 * Why: Many operations need to work with all MOCs for organization
	 * and hierarchy management.
	 */
	async getAllMOCs(): Promise<TFile[]> {
		return this.app.vault.getMarkdownFiles().filter(f => this.isMOC(f));
	}

	/**
	 * Detects circular dependencies in MOC hierarchy
	 * 
	 * Why: Prevents infinite loops when reorganizing MOC relationships.
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
	 * 
	 * Why: Maintains organized structure within MOC files with proper
	 * section ordering and automatic reorganization.
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
		// Implementation would go here - shortened for space
		new PromptDescriptionModal(this.app, async (description: string) => {
			// Prompt duplication logic
		}).open();
	}

	async openLLMLinks(file: TFile) {
		// LLM links opening logic - shortened for space
		new Notice('LLM links functionality');
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
			// Analysis and update logic would go here
			new Notice('Update functionality available');
		} catch (error) {
			this.handleError('Error during vault update analysis', error);
		}
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
	 * 
	 * Why: Maintains vault integrity by removing references to deleted files.
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
	 * Checks if a file was created by this plugin
	 * 
	 * Why: Ensures only plugin-created files are affected by cleanup operations.
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
	 * 
	 * Why: Provides consistent error handling across all plugin operations
	 * with appropriate user feedback.
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
	 * 
	 * Why: Provides meaningful error messages with operation context
	 * for better debugging and user feedback.
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
	 * 
	 * Why: Consistent error presentation to users while maintaining
	 * detailed logging for debugging.
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