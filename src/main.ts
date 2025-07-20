import { App, Plugin, TFile, TFolder, normalizePath, Notice, Modifier, MarkdownView } from 'obsidian';

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
	CleanupConfirmationModal, ReorganizeMOCModal, UndoTestChangesModal, DeleteMOCContentModal,
	QuickInputModal
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
	
	// Performance optimization: Cache MOC metadata
	private mocMetadataCache: Map<string, { lightColor: string | null; darkColor: string | null }> = new Map();
	private lastMOCUpdate: number = 0;
	
	// Debounced style update to prevent excessive DOM manipulation
	private debouncedStyleUpdate = debounce(() => this.updateMOCStyles(), CONFIG.STYLE_DELAYS.UPDATE);
	
	// Tab observer to detect new tabs being added to the DOM
	private tabObserver: MutationObserver | null = null;

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
		// Clean up mutation observer
		if (this.tabObserver) {
			this.tabObserver.disconnect();
			this.tabObserver = null;
		}
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
		setTimeout(() => {
			this.updateMOCStyles();
			this.updateTabAttributes();
		}, CONFIG.STYLE_DELAYS.INITIAL);
		
		// Re-apply after workspace layout is fully ready
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => {
				this.updateMOCStyles();
				this.updateTabAttributes();
			}, CONFIG.STYLE_DELAYS.LAYOUT_READY);
			
			// Set up tab observer for dynamic updates
			this.setupTabObserver();
		});
	}

	/**
	 * Registers all plugin commands
	 */
	private registerCommands() {
		// Phase 2: Quick commands with keyboard shortcuts
		const quickCommands = [
			{
				id: 'quick-create-moc',
				name: 'Quick Create MOC',
				callback: () => this.quickCreateMOC(),
				hotkeys: [{ modifiers: ['Mod', 'Shift'] as Modifier[], key: 'M' }]
			},
			{
				id: 'quick-add',
				name: 'Quick Add to MOC',
				callback: () => this.quickAdd(),
				hotkeys: [{ modifiers: ['Mod'] as Modifier[], key: 'M' }]
			},
			{
				id: 'quick-iterate',
				name: 'Quick Iterate Prompt',
				callback: () => this.quickIterate(),
				hotkeys: [{ modifiers: ['Mod'] as Modifier[], key: 'I' }]
			},
			{
				id: 'toggle-archive-moc',
				name: 'Archive/Unarchive MOC',
				callback: () => this.toggleArchiveMOC(),
				hotkeys: [{ modifiers: ['Mod', 'Shift'] as Modifier[], key: 'A' }]
			}
		];
		
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
			},
			{
				id: 'debug-moc-styling',
				name: 'Debug MOC Styling',
				callback: () => this.debugMOCStyling()
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
				condition: (f: TFile) => this.isPromptIteration(f), 
				action: (f: TFile) => this.openLLMLinks(f) 
			}
		];

		// Register quick commands with keyboard shortcuts
		quickCommands.forEach(cmd => this.addCommand({
			id: cmd.id,
			name: cmd.name,
			callback: cmd.callback,
			hotkeys: cmd.hotkeys
		}));
		
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
		
		// Update tab attributes when active leaf changes
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				// Update tab attributes when switching tabs
				this.updateTabAttributes();
			})
		);
		
		// Update tab attributes when layout changes (tabs opened/closed)
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				// Update tab attributes when tabs are opened/closed
				setTimeout(() => this.updateTabAttributes(), 100);
			})
		);

		// Smart emoji detection for automatic file type determination
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					await this.handleSmartEmojiDetection(file);
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
	 * Updates CSS styles for MOC folder coloring with optimized DOM updates
	 */
	async updateMOCStyles() {
		try {
			const baseCss = await this.loadBaseCss();
			const mocStyles = await this.generateMOCColorStyles();
			const combinedStyles = `${baseCss}\n\n/* ===== DYNAMIC MOC COLORS ===== */\n${mocStyles}`;

			// Performance optimization: Update existing style element if possible
			if (this.styleElement && this.styleElement.parentNode) {
				// Update existing element content
				this.styleElement.textContent = combinedStyles;
			} else {
				// Create new element only if needed
				this.removeStyles();
				this.styleElement = document.createElement('style');
				this.styleElement.id = 'moc-system-plugin-styles';
				this.styleElement.textContent = combinedStyles;
				document.head.appendChild(this.styleElement);
			}
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
	 * Generates CSS for individual MOC folder colors with caching
	 */
	private async generateMOCColorStyles(): Promise<string> {
		// Performance optimization: Only refresh cache if MOCs have changed
		const allMOCs = await this.getAllMOCs();
		console.log('Generating styles for', allMOCs.length, 'MOCs');
		
		const currentTime = Date.now();
		const needsCacheRefresh = currentTime - this.lastMOCUpdate > 5000; // Refresh every 5 seconds
		
		if (needsCacheRefresh) {
			// Clear and rebuild cache
			this.mocMetadataCache.clear();
			this.lastMOCUpdate = currentTime;
		}

		const colorStyles: string[] = [];
		const tabStyles: string[] = [];
		
		// Batch process all MOCs
		const processPromises = allMOCs.map(async (moc) => {
			try {
				// Check cache first
				let metadata = this.mocMetadataCache.get(moc.path);
				
				if (!metadata) {
					// Fetch and cache metadata
					const frontmatter = this.app.metadataCache.getFileCache(moc)?.frontmatter;
					metadata = {
						lightColor: getFrontmatterValue(frontmatter, 'light-color', null),
						darkColor: getFrontmatterValue(frontmatter, 'dark-color', null)
					};
					this.mocMetadataCache.set(moc.path, metadata);
				}
				
				if (metadata.lightColor && metadata.darkColor && moc.parent) {
					const escapedPath = this.escapeForCSS(moc.parent.path);
					console.log(`Generating styles for MOC: ${moc.parent.path} -> ${escapedPath}`);
					
					// Generate folder styles
					const folderStyles = [
						this.generateThemeCSS(escapedPath, metadata.lightColor, 'light'),
						this.generateThemeCSS(escapedPath, metadata.darkColor, 'dark')
					];
					
					// Generate tab styles for all files in this MOC
					const tabCss = await this.generateTabStylesForMOC(moc.parent, metadata.lightColor, metadata.darkColor);
					
					return {
						folderStyles,
						tabStyles: tabCss
					};
				}
			} catch (error) {
				console.warn(`Failed to generate styles for MOC: ${moc.path}`, error);
			}
			return null;
		});
		
		// Wait for all processing to complete
		const results = await Promise.all(processPromises);
		
		// Flatten results and filter out nulls
		results.forEach(result => {
			if (result) {
				colorStyles.push(...result.folderStyles);
				if (result.tabStyles) {
					tabStyles.push(result.tabStyles);
				}
			}
		});
		
		// Combine folder and tab styles
		return `${colorStyles.join('\n')}\n\n/* ===== TAB COLORS ===== */\n${tabStyles.join('\n')}`;
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
	 * Generates CSS rules for tab coloring for all files in a MOC folder
	 */
	private async generateTabStylesForMOC(mocFolder: TFolder, lightColor: string, darkColor: string): Promise<string> {
		const escapedPath = this.escapeForCSS(mocFolder.path);
		console.log(`Generating tab styles for MOC folder: ${mocFolder.path}`);
		
		// Generate CSS using our custom data-moc-path attribute
		return `
/* Tab colors for MOC: ${mocFolder.path} */
/* Light theme */
.workspace-tab-header[data-moc-path="${escapedPath}"] .workspace-tab-header-inner {
    background-color: ${adjustColorOpacity(lightColor, 0.15)} !important;
}
.workspace-tab-header[data-moc-path="${escapedPath}"].is-active .workspace-tab-header-inner {
    background-color: ${adjustColorOpacity(lightColor, 0.3)} !important;
}
.is-focused .workspace-tab-header[data-moc-path="${escapedPath}"].is-active .workspace-tab-header-inner {
    background-color: ${adjustColorOpacity(lightColor, 0.4)} !important;
}

/* Dark theme */
.theme-dark .workspace-tab-header[data-moc-path="${escapedPath}"] .workspace-tab-header-inner {
    background-color: ${adjustColorOpacity(darkColor, 0.15)} !important;
}
.theme-dark .workspace-tab-header[data-moc-path="${escapedPath}"].is-active .workspace-tab-header-inner {
    background-color: ${adjustColorOpacity(darkColor, 0.3)} !important;
}
.theme-dark.is-focused .workspace-tab-header[data-moc-path="${escapedPath}"].is-active .workspace-tab-header-inner {
    background-color: ${adjustColorOpacity(darkColor, 0.4)} !important;
}

/* Also color the border for better visibility */
.workspace-tab-header[data-moc-path="${escapedPath}"] {
    border-bottom: 2px solid ${lightColor} !important;
}
.theme-dark .workspace-tab-header[data-moc-path="${escapedPath}"] {
    border-bottom: 2px solid ${darkColor} !important;
}`;
	}

	/**
	 * Escapes special characters for CSS selectors
	 * Properly handles spaces and other special characters
	 */
	private escapeForCSS(path: string): string {
		// Escape special CSS characters including spaces
		return path
			.replace(/['"\\\/\[\](){}]/g, '\\$&')  // Escape special chars
			.replace(/\s/g, '\\ ');  // Escape spaces with backslash
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
	 * @param name - Name of the MOC to create
	 * @param createResource - Whether to create a default resource (defaults to true)
	 */
	async createMOC(name: string, createResource: boolean = true): Promise<TFile> {
		try {
			// Validate and sanitize the name
			const sanitizedName = sanitizeInput(name, 'MOC name');
			const mocName = ensureMOCSuffix(sanitizedName);
			
			// Generate visual identifier and color
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
			
			// Create default resource with same name as MOC if requested
			if (createResource) {
				await this.createResource(file, sanitizedName);
			}
			
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
	 * @param parentMOC - Parent MOC file to create sub-MOC under
	 * @param name - Name of the sub-MOC to create
	 * @param createResource - Whether to create a default resource (defaults to true)
	 */
	async createSubMOC(parentMOC: TFile, name: string, createResource: boolean = true): Promise<TFile> {
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
			
			// Create default resource with same name as sub-MOC if requested
			if (createResource) {
				await this.createResource(file, sanitizedName);
			}
			
			await this.addToMOCSection(parentMOC, 'MOCs', file);
			new Notice(`Created sub-MOC: ${mocName}`);
			this.debouncedStyleUpdate();
			
			return file;
		} catch (error) {
			throw this.wrapError(error, 'Failed to create sub-MOC', 'create', name);
		}
	}

	/**
	 * Quick MOC creation with minimal UI and default content
	 * Part of Phase 2: Modal reduction for improved workflow
	 */
	async quickCreateMOC(): Promise<void> {
		const modal = new QuickInputModal(
			this.app,
			'Create new MOC',
			'Enter MOC name...',
			async (name: string) => {
				try {
					// Create the MOC (default content now created automatically)
					await this.createMOC(name);
				} catch (error) {
					console.error('Quick create MOC error:', error);
					new Notice(`Failed to create MOC: ${error.message}`);
				}
			}
		);
		
		modal.open();
	}

	/**
	 * Quick Add command - context-aware content addition
	 * Part of Phase 2: Modal reduction
	 */
	async quickAdd(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		let targetMOC: TFile | null = null;
		
		// First, check if current file is a MOC
		if (activeFile && this.isMOC(activeFile)) {
			targetMOC = activeFile;
		} else if (activeFile) {
			// Find parent MOC by traversing up the folder structure
			targetMOC = this.findParentMOC(activeFile);
		}
		
		if (targetMOC) {
			// We're in a MOC context, show quick options
			const modal = new QuickInputModal(
				this.app,
				`Add to ${targetMOC.basename}`,
				'Enter name (prefix with 📚 for resource, 🤖 for prompt)...',
				async (input: string) => {
					try {
						// Detect type based on emoji prefix or default to resource
						if (input.startsWith('🤖')) {
							const name = input.substring(2).trim();
							await this.createPrompt(targetMOC!, name);
						} else {
							// Default to resource, strip emoji if present
							const name = input.startsWith('📚') ? input.substring(2).trim() : input;
							await this.createResource(targetMOC!, name);
						}
					} catch (error) {
						console.error('Quick add error:', error);
						new Notice(`Failed to add content: ${error.message}`);
					}
				}
			);
			modal.open();
		} else {
			// Not in MOC context, fall back to MOC selector
			new Notice('Not in a MOC context. Use Quick Create (Cmd+Shift+M) to create a new MOC.');
		}
	}
	
	/**
	 * Finds the parent MOC by traversing up the folder hierarchy
	 */
	private findParentMOC(file: TFile): TFile | null {
		let currentFolder = file.parent;
		
		while (currentFolder) {
			// Check if this folder contains a MOC file
			const mocFile = currentFolder.children.find(
				child => child instanceof TFile && this.isMOC(child)
			);
			
			if (mocFile instanceof TFile) {
				return mocFile;
			}
			
			// Move up one level
			currentFolder = currentFolder.parent;
		}
		
		return null;
	}

	/**
	 * Quick Iterate command - duplicates current prompt iteration
	 * Part of Phase 2: Modal reduction
	 */
	async quickIterate(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		
		// Check if current file is a prompt iteration
		if (!activeFile || !this.isPromptIteration(activeFile)) {
			new Notice('Current file is not a prompt iteration.');
			return;
		}
		
		// Extract current version
		const currentVersion = extractPromptVersion(activeFile.basename);
		if (!currentVersion) {
			new Notice('Could not determine version number from file name.');
			return;
		}
		
		// Get metadata from current iteration
		const metadata = this.app.metadataCache.getFileCache(activeFile);
		const frontmatter = metadata?.frontmatter;
		
		if (!frontmatter || !frontmatter['prompt-group']) {
			new Notice('Could not find prompt-group in frontmatter. Please ensure the file has proper prompt metadata.');
			return;
		}
		
		const promptGroup = frontmatter['prompt-group'];
		const llmLinks = frontmatter['llm-links'] || [];
		
		// Quick input for optional description
		const modal = new QuickInputModal(
			this.app,
			`Create v${currentVersion + 1}`,
			'Optional description (or press Enter to skip)...',
			async (description: string) => {
				try {
					const mocFolder = activeFile.parent;
					if (!mocFolder) {
						throw new Error('Could not find MOC folder.');
					}
					
					// Build new iteration filename
					let newIterationName = `${CONFIG.NOTE_TYPES.Prompts.emoji} ${promptGroup} v${currentVersion + 1}`;
					if (description.trim()) {
						const sanitizedDescription = sanitizeInput(description, 'iteration description');
						newIterationName += ` - ${sanitizedDescription}`;
					}
					
					// Read current content (without frontmatter)
					const currentContent = await this.app.vault.read(activeFile);
					const contentWithoutFrontmatter = this.stripFrontmatter(currentContent);
					
					// Build new frontmatter with updated iteration number and synced llm-links
					const newFrontmatter = this.buildFrontmatter({
						'note-type': 'prompt',
						'prompt-group': promptGroup,
						'iteration': currentVersion + 1,
						'llm-links': llmLinks
					});
					
					// Create new iteration file
					const newIterationPath = `${mocFolder.path}/${newIterationName}.md`;
					const newFile = await this.createFileWithContent(
						newIterationPath, 
						newFrontmatter + contentWithoutFrontmatter
					);
					
					// Find the MOC file and update it
					const mocFile = mocFolder.children?.find(
						child => child instanceof TFile && this.isMOC(child)
					) as TFile;
					
					if (mocFile) {
						await this.addPromptToMOC(mocFile, promptGroup, newFile);
					}
					
					// Open the new iteration
					await this.app.workspace.getLeaf().openFile(newFile);
					new Notice(`Created v${currentVersion + 1}${description ? ` - ${description}` : ''}`);
					
				} catch (error) {
					console.error('Quick iterate error:', error);
					new Notice(`Failed to create iteration: ${error.message}`);
				}
			}
		);
		
		// Configure modal to allow empty input
		modal.open();
	}

	// =================================================================================
	// CONTENT CREATION METHODS (SIMPLIFIED INTERFACE)
	// =================================================================================

	// Convenience methods for specific file types
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
					emoji: CONFIG.NOTE_TYPES.MOCs.emoji, 
					folder: '', 
					suffix: 'MOC', 
					createSubfolder: true 
				},
				resource: { 
					type: 'resource' as const, 
					emoji: CONFIG.NOTE_TYPES.Resources.emoji, 
					folder: '', // Flat structure - no subfolder
					createSubfolder: false
				},
				prompt: { 
					type: 'prompt' as const, 
					emoji: CONFIG.NOTE_TYPES.Prompts.emoji, 
					folder: '', // Flat structure - no subfolder
					createSubfolder: false // Changed to false for flat structure
				}
			};

			const fileConfig = fileConfigs[config.type];
			const parentPath = config.parentMOC?.parent?.path || '';
			
			// Phase 3: Handle prompts specially - create v1 directly
			if (config.type === 'prompt') {
				const promptName = `${CONFIG.NOTE_TYPES.Prompts.emoji} ${sanitizedName} v1`;
				const promptPath = normalizePath(`${parentPath}/${promptName}.md`);
				const promptFrontmatter = this.buildFrontmatter({
					'note-type': 'prompt',
					'prompt-group': sanitizedName,
					'iteration': 1,
					'llm-links': []
				});
				
				const file = await this.createFileWithContent(promptPath, promptFrontmatter);
				
				if (config.parentMOC) {
					// Add to MOC with new nested structure
					await this.addPromptToMOC(config.parentMOC, sanitizedName, file);
				}
				
				new Notice(`Created prompt: ${sanitizedName} v1`);
				return file;
			}
			
			// Regular file creation for MOCs and resources
			const fileName = this.buildFileName(sanitizedName, fileConfig, parentPath);
			const frontmatter = this.buildFrontmatter({ 'note-type': config.type });
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
	 * Ensures MOC folder exists
	 */
	async ensureMOCFolderStructure(mocFolderPath: string) {
		try {
			// Create main MOC folder
			if (!this.app.vault.getAbstractFileByPath(mocFolderPath)) {
				await this.app.vault.createFolder(mocFolderPath);
			}
			// No subfolders in flat structure
		} catch (error) {
			throw new FileSystemError(
				`Failed to create MOC folder: ${mocFolderPath}`, 
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
		
		// Performance optimization: Build section map in single pass
		const sectionMap = new Map<string, { start: number, end: number }>();
		
		// Single pass to find all sections
		for (let i = frontmatterEnd; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith('## ')) {
				const sectionName = line.substring(3);
				const nextSectionIndex = lines.findIndex((l, idx) => 
					idx > i && l.trim().startsWith('## ')
				);
				sectionMap.set(sectionName, {
					start: i,
					end: nextSectionIndex === -1 ? lines.length : nextSectionIndex
				});
			}
		}
		
		// Extract plugin sections using the map
		const consumedRanges: [number, number][] = [];
		
		for (const sectionName of CONFIG.SECTION_ORDER) {
			const sectionInfo = sectionMap.get(sectionName);
			if (sectionInfo) {
				const sectionContent = lines.slice(sectionInfo.start, sectionInfo.end);
				pluginSections.push({ name: sectionName, content: sectionContent });
				consumedRanges.push([sectionInfo.start, sectionInfo.end]);
			}
		}

		// Collect other content - optimized to check ranges instead of individual indices
		for (let i = frontmatterEnd; i < lines.length; i++) {
			const isConsumed = consumedRanges.some(([start, end]) => i >= start && i < end);
			if (!isConsumed) {
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

	/**
	 * Adds a prompt to MOC with nested iteration structure (Phase 3)
	 */
	async addPromptToMOC(moc: TFile, promptGroup: string, iterationFile: TFile) {
		try {
			let content = await this.app.vault.read(moc);
			let lines = content.split('\n');
			
			// Find frontmatter end
			const frontmatterEnd = this.findFrontmatterEnd(lines);
			
			// Reorganize content and get section indices
			const { reorganizedLines, sectionIndices } = this.reorganizeContentForPluginSections(
				lines, 
				frontmatterEnd
			);
			
			let promptsSectionIndex = sectionIndices.get('Prompts');
			
			if (promptsSectionIndex === undefined) {
				// Create Prompts section if it doesn't exist
				this.insertNewPromptsSection(reorganizedLines, promptGroup, iterationFile, frontmatterEnd, sectionIndices);
			} else {
				// Add to existing Prompts section with nested structure
				this.insertPromptInSection(reorganizedLines, promptsSectionIndex, promptGroup, iterationFile);
			}
			
			await this.app.vault.modify(moc, reorganizedLines.join('\n'));
		} catch (error) {
			throw this.wrapError(error, 'Failed to add prompt to MOC', 'update', moc.path);
		}
	}

	/**
	 * Inserts a new Prompts section with the first prompt group
	 */
	private insertNewPromptsSection(
		lines: string[], 
		promptGroup: string,
		iterationFile: TFile,
		frontmatterEnd: number,
		sectionIndices: Map<SectionType, number>
	) {
		let insertIndex = frontmatterEnd;
		const promptsOrderIndex = CONFIG.SECTION_ORDER.indexOf('Prompts');
		
		// Find where to insert based on section order
		for (let i = promptsOrderIndex + 1; i < CONFIG.SECTION_ORDER.length; i++) {
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
		
		const newSectionContent = [
			`## Prompts`,
			``,
			`- ${CONFIG.NOTE_TYPES.Prompts.emoji} ${promptGroup}`,
			`  - [[${iterationFile.basename}]]`,
			``
		];
		lines.splice(insertIndex, 0, ...newSectionContent);
	}

	/**
	 * Inserts a prompt iteration in the existing Prompts section
	 */
	private insertPromptInSection(
		lines: string[], 
		sectionIndex: number,
		promptGroup: string,
		iterationFile: TFile
	) {
		// Find where this prompt group exists or where to add it
		let groupLineIndex = -1;
		let insertIndex = sectionIndex + 1;
		
		// Skip empty lines after section header
		while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
			insertIndex++;
		}
		
		// Search for existing prompt group
		for (let i = insertIndex; i < lines.length; i++) {
			const line = lines[i].trim();
			
			// Stop at next section
			if (line.startsWith('## ')) break;
			
			// Check if this is our prompt group
			if (line === `- ${CONFIG.NOTE_TYPES.Prompts.emoji} ${promptGroup}`) {
				groupLineIndex = i;
				break;
			}
		}
		
		if (groupLineIndex === -1) {
			// Prompt group doesn't exist, add it
			lines.splice(insertIndex, 0, 
				`- ${CONFIG.NOTE_TYPES.Prompts.emoji} ${promptGroup}`,
				`  - [[${iterationFile.basename}]]`
			);
		} else {
			// Prompt group exists, find where to add the iteration
			let iterationInsertIndex = groupLineIndex + 1;
			
			// Find the last iteration of this group
			while (iterationInsertIndex < lines.length) {
				const line = lines[iterationInsertIndex];
				
				// Stop if we hit a non-indented line or next section
				if (line.trim() && !line.startsWith('  ')) break;
				
				// If it's an iteration line, move past it
				if (line.trim().startsWith('- [[')) {
					iterationInsertIndex++;
				} else {
					break;
				}
			}
			
			// Insert the new iteration
			lines.splice(iterationInsertIndex, 0, `  - [[${iterationFile.basename}]]`);
		}
	}

	// =================================================================================
	// PROMPT MANAGEMENT SYSTEM (Phase 3 - No Hub Files)
	// =================================================================================

	async duplicatePromptIteration(file: TFile) {
		try {
			// Extract current version number from file basename
			const currentVersion = extractPromptVersion(file.basename);
			if (!currentVersion) {
				new Notice('Could not determine version number from file name.');
				return;
			}

			const mocFolder = file.parent;
			if (!mocFolder) {
				new Notice('Could not find MOC folder.');
				return;
			}

			// Get metadata from current iteration
			const metadata = this.app.metadataCache.getFileCache(file);
			const frontmatter = metadata?.frontmatter;
			
			if (!frontmatter || !frontmatter['prompt-group']) {
				new Notice('Could not find prompt-group in frontmatter. Please ensure the file has proper prompt metadata.');
				return;
			}

			const promptGroup = frontmatter['prompt-group'];
			const llmLinks = frontmatter['llm-links'] || [];

			new PromptDescriptionModal(this.app, async (description: string) => {
				try {
					// Find the highest existing version number for this prompt group
					const nextVersion = await this.findNextAvailableVersion(promptGroup, mocFolder);
					
					// Build new iteration filename with optional description
					let newIterationName = `${CONFIG.NOTE_TYPES.Prompts.emoji} ${promptGroup} v${nextVersion}`;
					if (description.trim()) {
						const sanitizedDescription = sanitizeInput(description, 'iteration description');
						newIterationName += ` - ${sanitizedDescription}`;
					}
					
					// Read current iteration content (without frontmatter)
					const currentContent = await this.app.vault.read(file);
					const contentWithoutFrontmatter = this.stripFrontmatter(currentContent);
					
					// Build new frontmatter with updated iteration number and synced llm-links
					const newFrontmatter = this.buildFrontmatter({
						'note-type': 'prompt',
						'prompt-group': promptGroup,
						'iteration': nextVersion,
						'llm-links': llmLinks
					});
					
					// Create new iteration file
					const newIterationPath = `${mocFolder.path}/${newIterationName}.md`;
					const newFile = await this.createFileWithContent(
						newIterationPath, 
						newFrontmatter + contentWithoutFrontmatter
					);
					
					// Find the MOC file and update it
					const mocFile = mocFolder.children?.find(
						child => child instanceof TFile && this.isMOC(child)
					) as TFile;
					
					if (mocFile) {
						await this.addPromptToMOC(mocFile, promptGroup, newFile);
					}
					
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
	 * Find the next available version number for a prompt group
	 */
	private async findNextAvailableVersion(promptGroup: string, mocFolder: TFolder): Promise<number> {
		let highestVersion = 0;
		
		// Scan all files in the MOC folder
		for (const child of mocFolder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				// Check if this is a prompt file for the same group
				const metadata = this.app.metadataCache.getFileCache(child);
				const frontmatter = metadata?.frontmatter;
				
				if (frontmatter && 
					frontmatter['note-type'] === 'prompt' && 
					frontmatter['prompt-group'] === promptGroup) {
					// Extract version from basename
					const version = extractPromptVersion(child.basename);
					if (version && version > highestVersion) {
						highestVersion = version;
					}
				}
			}
		}
		
		// Return the next available version
		return highestVersion + 1;
	}

	/**
	 * Strips frontmatter from content
	 */
	private stripFrontmatter(content: string): string {
		const lines = content.split('\n');
		if (lines[0] !== '---') return content;
		
		const closingIndex = lines.slice(1).indexOf('---');
		if (closingIndex === -1) return content;
		
		return lines.slice(closingIndex + 2).join('\n');
	}


	async openLLMLinks(file: TFile) {
		try {
			// Phase 3: Read LLM links from frontmatter instead of hub file
			const metadata = this.app.metadataCache.getFileCache(file);
			const frontmatter = metadata?.frontmatter;
			
			if (!frontmatter || !frontmatter['llm-links']) {
				new Notice('No LLM links found in frontmatter.');
				return;
			}
			
			let llmLinks: string[] = [];
			const llmLinksField = frontmatter['llm-links'];
			
			// Handle both array format and concatenated string format
			if (Array.isArray(llmLinksField)) {
				llmLinks = llmLinksField;
			} else if (typeof llmLinksField === 'string') {
				// Parse concatenated URLs from string
				// Split string at each occurrence of http:// or https://
				// This handles cases where URLs are concatenated without separators
				const urlStarts = [];
				let searchIndex = 0;
				
				// Find all positions where URLs start
				while (true) {
					const httpIndex = llmLinksField.indexOf('http://', searchIndex);
					const httpsIndex = llmLinksField.indexOf('https://', searchIndex);
					
					let nextIndex = -1;
					if (httpIndex !== -1 && httpsIndex !== -1) {
						nextIndex = Math.min(httpIndex, httpsIndex);
					} else if (httpIndex !== -1) {
						nextIndex = httpIndex;
					} else if (httpsIndex !== -1) {
						nextIndex = httpsIndex;
					} else {
						break;
					}
					
					urlStarts.push(nextIndex);
					searchIndex = nextIndex + 1;
				}
				
				// Extract URLs based on the start positions
				for (let i = 0; i < urlStarts.length; i++) {
					const start = urlStarts[i];
					const end = i < urlStarts.length - 1 ? urlStarts[i + 1] : llmLinksField.length;
					const url = llmLinksField.substring(start, end).trim();
					if (url) {
						llmLinks.push(url);
					}
				}
			}
			
			if (llmLinks.length === 0) {
				new Notice('No LLM links found in frontmatter.');
				return;
			}
			
			// Open each URL in the default browser
			const { shell } = window.require('electron');
			let openedCount = 0;
			
			for (const url of llmLinks) {
				if (typeof url === 'string' && this.isValidUrl(url)) {
					try {
						await shell.openExternal(url);
						openedCount++;
						// Small delay between opens to prevent overwhelming the system
						await delay(200);
					} catch (error) {
						console.warn(`Failed to open URL: ${url}`, error);
					}
				}
			}
			
			if (openedCount === 0) {
				new Notice('No valid URLs found to open.');
				return;
			}
			
			const message = openedCount === llmLinks.length 
				? `Opened ${openedCount} LLM conversation${openedCount === 1 ? '' : 's'}`
				: `Opened ${openedCount} of ${llmLinks.length} LLM conversations (some failed)`;
			
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
		if (noteType === 'moc') emoji = CONFIG.NOTE_TYPES.MOCs.emoji;
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
	 * Detects the note type based on file characteristics
	 */
	private detectNoteType(file: TFile): string {
		// Check if it's a MOC by existing logic
		if (this.isMOC(file)) return 'moc';
		
		// Check by file characteristics (flat structure - no folder checking)
		if (file.basename.endsWith(' MOC')) return 'moc';
		if (file.name.startsWith(CONFIG.NOTE_TYPES.Resources.emoji)) return 'resource';
		if (file.name.startsWith(CONFIG.NOTE_TYPES.Prompts.emoji)) return 'prompt';
		
		// Default fallback
		return 'resource';
	}
	
	/**
	 * Updates tab DOM elements with MOC path attributes for styling
	 */
	private async updateTabAttributes() {
		// Get all tab headers in the workspace
		const tabHeaders = document.querySelectorAll('.workspace-tab-header');
		
		// Get all open markdown files and create a mapping
		const leaves = this.app.workspace.getLeavesOfType('markdown');
		const openFiles = new Map<string, TFile>();
		
		// Build a map of file basenames to TFile objects
		for (const leaf of leaves) {
			const view = leaf.view as any;
			const file = view?.file || view?.getFile?.();
			if (file instanceof TFile) {
				openFiles.set(file.basename, file);
			}
		}
		
		// Process each tab header
		tabHeaders.forEach((tab: HTMLElement) => {
			// Find the title element within the tab
			const titleEl = tab.querySelector('.workspace-tab-header-inner-title');
			if (!titleEl) return;
			
			const tabTitle = titleEl.textContent || '';
			const file = openFiles.get(tabTitle);
			
			if (!file) {
				// No file found for this tab - remove any MOC styling
				tab.removeAttribute('data-moc-path');
				tab.classList.remove('moc-colored-tab');
				return;
			}
			
			// Find the MOC this file belongs to
			const parentMOC = this.findParentMOC(file);
			
			if (!parentMOC || !parentMOC.parent) {
				// File is not in a MOC - remove any MOC styling
				tab.removeAttribute('data-moc-path');
				tab.classList.remove('moc-colored-tab');
				return;
			}
			
			// File is in a MOC - set or update the attribute
			const mocPath = parentMOC.parent.path;
			tab.setAttribute('data-moc-path', mocPath);
			tab.classList.add('moc-colored-tab');
		});
	}
	
	/**
	 * Sets up a MutationObserver to watch for new tabs being added
	 */
	private setupTabObserver() {
		// Find the workspace tabs container
		const tabContainer = document.querySelector('.workspace-tabs');
		if (!tabContainer) {
			console.warn('MOC System: Tab container not found, retrying...');
			setTimeout(() => this.setupTabObserver(), 1000);
			return;
		}
		
		// Create observer to watch for new tabs
		this.tabObserver = new MutationObserver((mutations) => {
			let shouldUpdate = false;
			
			// Check if any new tab headers were added
			mutations.forEach(mutation => {
				mutation.addedNodes.forEach(node => {
					if (node instanceof HTMLElement && 
						(node.classList.contains('workspace-tab-header') || 
						 node.querySelector('.workspace-tab-header'))) {
						shouldUpdate = true;
					}
				});
			});
			
			// Update attributes if needed
			if (shouldUpdate) {
				// Small delay to ensure DOM is settled
				setTimeout(() => {
					this.updateTabAttributes();
				}, 50);
			}
		});
		
		// Start observing the workspace for changes
		this.tabObserver.observe(tabContainer, {
			childList: true,
			subtree: true
		});
		
		console.log('MOC System: Tab observer initialized');
	}

	/**
	 * Debug function to check MOC styling issues
	 */
	private async debugMOCStyling() {
		console.log('=== MOC STYLING DEBUG ===');
		
		// Check if style element exists
		const styleElement = document.getElementById('moc-system-plugin-styles');
		console.log('Style element exists:', !!styleElement);
		
		// Check folder elements
		const folderElements = document.querySelectorAll('.nav-folder-title');
		console.log(`Found ${folderElements.length} folder elements`);
		
		// Log folders with MOC in the name
		let mocFolderCount = 0;
		folderElements.forEach((el, index) => {
			const path = el.getAttribute('data-path');
			if (path && path.includes(' MOC')) {
				console.log(`MOC Folder: data-path="${path}"`);
				mocFolderCount++;
				
				// Check computed styles
				const computed = window.getComputedStyle(el as HTMLElement);
				console.log(`  Background: ${computed.background}`);
				console.log(`  Border-left: ${computed.borderLeft}`);
			}
		});
		console.log(`Total MOC folders found: ${mocFolderCount}`);
		
		// Check MOC files
		const allMOCs = await this.getAllMOCs();
		console.log(`\nFound ${allMOCs.length} MOC files:`);
		for (const moc of allMOCs.slice(0, 3)) {
			const cache = this.app.metadataCache.getFileCache(moc);
			const frontmatter = cache?.frontmatter;
			console.log(`- ${moc.path}`, {
				parent: moc.parent?.path,
				lightColor: frontmatter?.['light-color'],
				darkColor: frontmatter?.['dark-color']
			});
		}
		
		// Force style update
		console.log('\nForcing style update...');
		await this.updateMOCStyles();
		
		new Notice('Check console for debug info');
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
			// No prompt subfolders to check in flat structure
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

	/**
	 * Smart emoji detection for automatic file type determination
	 * Part of Phase 4: Polish & Enhancement
	 */
	private async handleSmartEmojiDetection(file: TFile): Promise<void> {
		try {
			const fileName = file.basename;
			
			// Check if file is in a MOC folder
			const parentFolder = file.parent;
			if (!parentFolder) {
				return;
			}
			
			// Find the parent MOC
			const parentMOC = await this.findParentMOC(file);
			if (!parentMOC) {
				return;
			}
			
			// Check for resource emoji
			if (fileName.startsWith('📚')) {
				// Add resource frontmatter
				const frontmatter = this.buildFrontmatter({
					'note-type': 'resource'
				});
				
				// Read current content
				const content = await this.app.vault.read(file);
				
				// Only update if no frontmatter exists
				if (!content.startsWith('---')) {
					await this.app.vault.modify(file, frontmatter + '\n' + content);
					
					// Add to MOC's Resources section
					await this.addToMOCSection(parentMOC, 'Resources', file);
					new Notice(`Auto-detected resource: ${fileName}`);
				}
			}
			// Check for prompt emoji
			else if (fileName.startsWith('🤖')) {
				// Extract version number if present
				const versionMatch = fileName.match(/v(\d+)/);
				const iteration = versionMatch ? parseInt(versionMatch[1]) : 1;
				const promptName = fileName.replace(/🤖\s*/, '').replace(/\s*v\d+.*$/, '').trim();
				
				// Add prompt frontmatter
				const frontmatter = this.buildFrontmatter({
					'note-type': 'prompt',
					'prompt-group': promptName,
					'iteration': iteration,
					'llm-links': []
				});
				
				// Read current content
				const content = await this.app.vault.read(file);
				
				// Only update if no frontmatter exists
				if (!content.startsWith('---')) {
					await this.app.vault.modify(file, frontmatter + '\n' + content);
					
					// Add to MOC's Prompts section
					await this.addPromptToMOC(parentMOC, promptName, file);
					new Notice(`Auto-detected prompt: ${fileName}`);
				}
			}
		} catch (error) {
			console.error('Smart emoji detection error:', error);
			// Don't show notice for auto-detection errors to avoid spam
		}
	}

	// =================================================================================
	// MOC ARCHIVING FUNCTIONALITY
	// =================================================================================

	/**
	 * Archives a MOC by moving it to the archived folder and marking its files
	 * @param file Any file within the MOC to archive
	 */
	async archiveMOC(file: TFile): Promise<void> {
		try {
			// Find the MOC file - could be the file itself or parent MOC
			let mocFile: TFile | null = null;
			let mocFolder: TFolder | null = null;
			
			if (this.isMOC(file)) {
				mocFile = file;
				mocFolder = file.parent;
			} else {
				// Find parent MOC
				mocFile = this.findParentMOC(file);
				mocFolder = mocFile?.parent || null;
			}
			
			if (!mocFile || !mocFolder) {
				throw new Error('No MOC found to archive');
			}
			
			// Create archived folder if it doesn't exist
			const archivedPath = 'archived';
			if (!this.app.vault.getAbstractFileByPath(archivedPath)) {
				await this.app.vault.createFolder(archivedPath);
			}
			
			// Move the MOC folder to archived
			const newPath = normalizePath(`${archivedPath}/${mocFolder.name}`);
			await this.app.vault.rename(mocFolder, newPath);
			
			// Update frontmatter for all files in the archived MOC
			const archivedFolder = this.app.vault.getAbstractFileByPath(newPath) as TFolder;
			if (archivedFolder) {
				await this.markMOCFilesAsArchived(archivedFolder, true);
			}
			
			new Notice(`Archived MOC: ${mocFile.basename}`);
		} catch (error) {
			this.handleError('Error archiving MOC', error);
		}
	}
	
	/**
	 * Unarchives a MOC by moving it back to root and restoring its files
	 * @param file Any file within the archived MOC to restore
	 */
	async unarchiveMOC(file: TFile): Promise<void> {
		try {
			// Find the MOC file
			let mocFile: TFile | null = null;
			let mocFolder: TFolder | null = null;
			
			if (this.isMOC(file)) {
				mocFile = file;
				mocFolder = file.parent;
			} else {
				// Find parent MOC
				mocFile = this.findParentMOC(file);
				mocFolder = mocFile?.parent || null;
			}
			
			if (!mocFile || !mocFolder) {
				throw new Error('No MOC found to unarchive');
			}
			
			// Check if it's actually in the archived folder
			if (!mocFolder.path.startsWith('archived/')) {
				throw new Error('MOC is not archived');
			}
			
			// Move the MOC folder back to root
			const folderName = mocFolder.name;
			const newPath = normalizePath(folderName);
			await this.app.vault.rename(mocFolder, newPath);
			
			// Restore frontmatter for all files
			const restoredFolder = this.app.vault.getAbstractFileByPath(newPath) as TFolder;
			if (restoredFolder) {
				await this.markMOCFilesAsArchived(restoredFolder, false);
			}
			
			new Notice(`Unarchived MOC: ${mocFile.basename}`);
		} catch (error) {
			this.handleError('Error unarchiving MOC', error);
		}
	}
	
	/**
	 * Toggles the archive state of a MOC
	 * @param file Any file within the MOC
	 */
	async toggleArchiveMOC(file?: TFile): Promise<void> {
		const activeFile = file || this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return;
		}
		
		// Determine if MOC is archived based on path
		const isArchived = activeFile.path.includes('archived/');
		
		if (isArchived) {
			await this.unarchiveMOC(activeFile);
		} else {
			await this.archiveMOC(activeFile);
		}
	}
	
	/**
	 * Updates the note-type frontmatter for all files in a MOC folder
	 * @param folder The MOC folder containing files to update
	 * @param markAsArchived Whether to mark as archived or restore original
	 */
	private async markMOCFilesAsArchived(folder: TFolder, markAsArchived: boolean): Promise<void> {
		const files = this.getAllFilesInFolder(folder);
		
		for (const file of files) {
			if (file instanceof TFile && file.extension === 'md') {
				await this.app.vault.process(file, (content) => {
					const lines = content.split('\n');
					
					// Find frontmatter boundaries
					if (lines[0] === '---') {
						const closingIndex = lines.slice(1).findIndex(line => line === '---') + 1;
						
						if (closingIndex > 0) {
							// Look for note-type field
							let noteTypeIndex = -1;
							for (let i = 1; i < closingIndex; i++) {
								if (lines[i].startsWith('note-type:')) {
									noteTypeIndex = i;
									break;
								}
							}
							
							if (noteTypeIndex > -1) {
								if (markAsArchived) {
									// Prefix with archived- if not already
									const currentType = lines[noteTypeIndex].split(':')[1].trim();
									if (!currentType.startsWith('archived-')) {
										lines[noteTypeIndex] = `note-type: archived-${currentType}`;
									}
								} else {
									// Remove archived- prefix
									lines[noteTypeIndex] = lines[noteTypeIndex].replace('archived-', '');
								}
							}
						}
					}
					
					return lines.join('\n');
				});
			}
		}
	}
	
	/**
	 * Recursively gets all files in a folder and its subfolders
	 * @param folder The folder to search
	 * @returns Array of all files found
	 */
	private getAllFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		
		for (const child of folder.children) {
			if (child instanceof TFile) {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.getAllFilesInFolder(child));
			}
		}
		
		return files;
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