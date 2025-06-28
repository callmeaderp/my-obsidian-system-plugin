import { App, TFile, TFolder, Notice } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CSS_CLASSES, CONFIG } from '../constants';
import MOCSystemPlugin from '../main';

/**
 * Interface for deletable items with metadata
 * Provides all information needed for organized display and safe deletion
 */
interface DeletableItem {
	/** The file or folder to be deleted */
	file: TFile | TFolder;
	/** Display name for the item */
	name: string;
	/** Category for grouping (MOCs, Notes, Resources, Prompts, Iterations) */
	category: string;
	/** Full path for identification */
	path: string;
	/** Whether item is currently selected for deletion */
	selected: boolean;
	/** Additional context information */
	description?: string;
}

/**
 * Context-aware deletion modal for MOC system content
 * 
 * Why: Provides safe, organized deletion of plugin-created content with
 * multiple selection capability and context-aware options based on current location.
 */
export class DeleteMOCContentModal extends BaseModal {
	private deletableItems: DeletableItem[] = [];
	private checkboxElements: Map<string, HTMLInputElement> = new Map();

	constructor(
		app: App,
		private currentFile: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	async onOpen() {
		// Determine context and populate deletable items
		await this.loadDeletableItems();

		if (this.deletableItems.length === 0) {
			this.showNoItemsMessage();
			return;
		}

		this.createInterface();
	}

	/**
	 * Loads deletable items based on current context
	 * 
	 * Why: Different contexts (MOC, prompt hub, regular note) have different
	 * deletion options that need to be presented appropriately.
	 */
	private async loadDeletableItems() {
		if (this.plugin.isMOC(this.currentFile)) {
			await this.loadMOCDeletableItems();
		} else if (this.plugin.isPromptHub(this.currentFile)) {
			await this.loadPromptHubDeletableItems();
		} else {
			await this.loadRegularNoteDeletableItems();
		}
	}

	/**
	 * Loads deletable items when current file is a MOC
	 * 
	 * Why: MOCs contain organized content in subfolders that users may want
	 * to selectively delete while maintaining the overall structure.
	 */
	private async loadMOCDeletableItems() {
		const mocFolder = this.currentFile.parent;
		if (!mocFolder) return;

		// Add sub-MOCs
		await this.addSubMOCs(mocFolder);
		
		// Add content from standard folders
		await this.addFolderContent(mocFolder, 'Notes', 'Notes');
		await this.addFolderContent(mocFolder, 'Resources', 'Resources');
		await this.addFolderContent(mocFolder, 'Prompts', 'Prompts');

		// Add option to delete the MOC itself
		this.deletableItems.push({
			file: this.currentFile,
			name: this.currentFile.basename,
			category: 'MOC Structure',
			path: this.currentFile.path,
			selected: false,
			description: '⚠️ This will delete the entire MOC and all its content'
		});
	}

	/**
	 * Loads deletable items when current file is a prompt hub
	 * 
	 * Why: Prompt hubs manage multiple iterations that users may want to
	 * selectively delete or clean up old versions.
	 */
	private async loadPromptHubDeletableItems() {
		const promptsFolder = this.currentFile.parent;
		if (!promptsFolder) return;

		// Find iteration subfolder
		const basePromptName = this.currentFile.basename.replace(/^🤖\s/, '');
		const iterationFolder = promptsFolder.children?.find(
			child => child instanceof TFolder && child.name === basePromptName
		) as TFolder;

		if (iterationFolder) {
			// Add individual iterations
			const iterations = iterationFolder.children?.filter(
				child => child instanceof TFile && this.plugin.isPromptIteration(child)
			) as TFile[];

			iterations?.forEach(iteration => {
				this.deletableItems.push({
					file: iteration,
					name: iteration.basename,
					category: 'Iterations',
					path: iteration.path,
					selected: false
				});
			});
		}

		// Add option to delete entire prompt (hub + iterations)
		this.deletableItems.push({
			file: this.currentFile,
			name: `Entire Prompt: ${basePromptName}`,
			category: 'Prompt Structure',
			path: this.currentFile.path,
			selected: false,
			description: '⚠️ This will delete the hub file and all iterations'
		});
	}

	/**
	 * Loads deletable items when current file is a regular note
	 * 
	 * Why: Regular notes can be deleted individually, and if they're part of
	 * a MOC system, their links should be cleaned up automatically.
	 */
	private async loadRegularNoteDeletableItems() {
		this.deletableItems.push({
			file: this.currentFile,
			name: this.currentFile.basename,
			category: 'Current Note',
			path: this.currentFile.path,
			selected: false,
			description: 'Delete this note (links will be automatically cleaned up)'
		});
	}

	/**
	 * Adds sub-MOCs from the given MOC folder
	 * 
	 * Why: Sub-MOCs are organized hierarchically and users may want to
	 * reorganize or remove specific sub-topics.
	 */
	private async addSubMOCs(mocFolder: TFolder) {
		const standardFolderNames = Object.values(CONFIG.FOLDERS);
		const subfolders = mocFolder.children?.filter(
			child => child instanceof TFolder && 
			!standardFolderNames.includes(child.name as any)
		) as TFolder[];

		subfolders?.forEach(subfolder => {
			// Find the MOC file within the subfolder
			const mocFile = subfolder.children?.find(
				child => child instanceof TFile && this.plugin.isMOC(child)
			) as TFile;

			if (mocFile) {
				this.deletableItems.push({
					file: subfolder, // Delete the entire subfolder
					name: subfolder.name,
					category: 'Sub-MOCs',
					path: subfolder.path,
					selected: false,
					description: 'Entire sub-MOC folder with all content'
				});
			}
		});
	}

	/**
	 * Adds content from a specific folder within the MOC structure
	 * 
	 * Why: Users may want to clean up specific types of content while
	 * keeping the overall MOC structure intact.
	 */
	private async addFolderContent(mocFolder: TFolder, folderName: string, category: string) {
		const folder = mocFolder.children?.find(
			child => child instanceof TFolder && child.name === folderName
		) as TFolder;

		if (!folder) return;

		const files = folder.children?.filter(child => child instanceof TFile) as TFile[];
		
		files?.forEach(file => {
			// Only include plugin-created files
			if (this.isPluginCreatedFile(file)) {
				this.deletableItems.push({
					file,
					name: file.basename,
					category,
					path: file.path,
					selected: false
				});
			}
		});
	}

	/**
	 * Creates the main modal interface with grouped checkboxes
	 * 
	 * Why: Organized interface makes it easy to understand what will be
	 * deleted and allows for selective multiple deletion.
	 */
	private createInterface() {
		this.contentEl.createEl('h2', { text: 'Delete MOC Content' });

		// Show context information
		const contextInfo = this.contentEl.createEl('p', {
			text: `Deleting content from: ${this.currentFile.basename}`
		});
		contextInfo.style.cssText = 'color: var(--text-muted); margin-bottom: 20px;';

		// Group items by category
		const grouped = this.groupItemsByCategory();
		
		// Create sections for each category
		for (const [category, items] of grouped) {
			this.createCategorySection(category, items);
		}

		// Selection controls
		this.createSelectionControls();

		// Action buttons
		this.createActionButtons();

		// Safety warning
		this.createWarning('Deleted files cannot be recovered. Ensure you have backups if needed.');
	}

	/**
	 * Groups deletable items by category for organized display
	 * 
	 * Why: Logical grouping helps users understand what types of content
	 * they're deleting and makes selection more intuitive.
	 */
	private groupItemsByCategory(): Map<string, DeletableItem[]> {
		const grouped = new Map<string, DeletableItem[]>();
		
		for (const item of this.deletableItems) {
			if (!grouped.has(item.category)) {
				grouped.set(item.category, []);
			}
			grouped.get(item.category)!.push(item);
		}

		// Sort items within each category
		for (const items of grouped.values()) {
			items.sort((a, b) => a.name.localeCompare(b.name));
		}

		return grouped;
	}

	/**
	 * Creates a section for a specific category of deletable items
	 * 
	 * Why: Clear visual separation between different types of content
	 * makes the interface easier to navigate and understand.
	 */
	private createCategorySection(category: string, items: DeletableItem[]) {
		// Category header
		const header = this.contentEl.createEl('h3', { text: category });
		header.style.cssText = 'margin-top: 20px; margin-bottom: 10px; color: var(--text-normal);';

		// Items container
		const container = this.contentEl.createEl('div', { cls: CSS_CLASSES.SCROLL_LIST });
		container.style.cssText = 'max-height: 150px; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: 5px; padding: 10px; margin-bottom: 15px;';

		items.forEach(item => {
			const itemEl = container.createEl('div', { cls: CSS_CLASSES.LIST_ITEM });
			itemEl.style.cssText = 'display: flex; align-items: flex-start; margin-bottom: 8px; padding: 5px;';

			// Checkbox
			const checkbox = itemEl.createEl('input', { 
				type: 'checkbox',
				attr: { 'data-path': item.path }
			});
			checkbox.style.cssText = 'margin-right: 10px; margin-top: 2px;';
			checkbox.addEventListener('change', () => {
				item.selected = checkbox.checked;
			});
			this.checkboxElements.set(item.path, checkbox);

			// Item content
			const contentEl = itemEl.createEl('div');
			contentEl.style.cssText = 'flex: 1;';

			// Item name
			const nameEl = contentEl.createEl('div', { text: item.name });
			nameEl.style.cssText = 'font-weight: 500; margin-bottom: 2px;';

			// Item path
			const pathEl = contentEl.createEl('div', { text: item.path });
			pathEl.style.cssText = 'font-size: 0.85em; color: var(--text-muted); margin-bottom: 2px;';

			// Description if available
			if (item.description) {
				const descEl = contentEl.createEl('div', { text: item.description });
				descEl.style.cssText = 'font-size: 0.85em; color: var(--text-accent); font-weight: 500;';
			}
		});
	}

	/**
	 * Creates controls for bulk selection operations
	 * 
	 * Why: When dealing with many items, bulk selection controls significantly
	 * improve user experience and efficiency.
	 */
	private createSelectionControls() {
		const controlsContainer = this.contentEl.createEl('div');
		controlsContainer.style.cssText = 'margin: 15px 0; padding: 10px; background: var(--background-secondary); border-radius: 5px;';

		const controlsLabel = controlsContainer.createEl('span', { text: 'Selection: ' });
		controlsLabel.style.cssText = 'margin-right: 10px; font-weight: 500;';

		// Select All button
		const selectAllBtn = controlsContainer.createEl('button', { text: 'Select All' });
		selectAllBtn.style.cssText = 'margin-right: 10px; padding: 4px 8px; font-size: 0.85em;';
		selectAllBtn.addEventListener('click', () => {
			this.selectAll(true);
		});

		// Select None button
		const selectNoneBtn = controlsContainer.createEl('button', { text: 'Select None' });
		selectNoneBtn.style.cssText = 'margin-right: 10px; padding: 4px 8px; font-size: 0.85em;';
		selectNoneBtn.addEventListener('click', () => {
			this.selectAll(false);
		});

		// Selection count
		const countEl = controlsContainer.createEl('span');
		countEl.style.cssText = 'margin-left: 10px; color: var(--text-muted); font-size: 0.85em;';
		
		// Update count dynamically
		const updateCount = () => {
			const selectedCount = this.deletableItems.filter(item => item.selected).length;
			countEl.textContent = `${selectedCount} of ${this.deletableItems.length} selected`;
		};
		
		// Initial count
		updateCount();
		
		// Update count when checkboxes change
		this.checkboxElements.forEach(checkbox => {
			checkbox.addEventListener('change', updateCount);
		});
	}

	/**
	 * Creates action buttons for deletion and cancellation
	 * 
	 * Why: Clear action buttons with appropriate styling ensure users
	 * can easily complete or cancel the operation.
	 */
	private createActionButtons() {
		this.createButtons([
			{ 
				text: 'Cancel', 
				action: () => {}, 
				primary: true 
			},
			{ 
				text: 'Delete Selected', 
				action: () => this.executeDelection() 
			}
		]);
	}

	/**
	 * Selects or deselects all items
	 * 
	 * Why: Bulk selection improves efficiency when working with many items.
	 */
	private selectAll(selected: boolean) {
		this.deletableItems.forEach(item => {
			item.selected = selected;
			const checkbox = this.checkboxElements.get(item.path);
			if (checkbox) {
				checkbox.checked = selected;
			}
		});
	}

	/**
	 * Executes the deletion of selected items
	 * 
	 * Why: Performs the actual deletion with proper error handling and
	 * user feedback about the operation's progress and results.
	 */
	private async executeDelection() {
		const selectedItems = this.deletableItems.filter(item => item.selected);
		
		if (selectedItems.length === 0) {
			// Close modal without action if nothing selected
			return;
		}

		try {
			let deletedCount = 0;
			const errors: string[] = [];

			for (const item of selectedItems) {
				try {
					await this.deleteItem(item);
					deletedCount++;
				} catch (error) {
					const errorMsg = `Failed to delete ${item.name}: ${error instanceof Error ? error.message : String(error)}`;
					errors.push(errorMsg);
					console.error(errorMsg, error);
				}
			}

			// Provide feedback about results
			if (deletedCount > 0) {
				this.app.workspace.trigger('layout-change');
				
				if (errors.length === 0) {
					// All deletions successful
					new Notice(`Successfully deleted ${deletedCount} item${deletedCount === 1 ? '' : 's'}.`);
				} else {
					// Some failures
					new Notice(`Deleted ${deletedCount} items. ${errors.length} failed (check console for details).`);
				}
			}

			if (errors.length > 0 && deletedCount === 0) {
				// All deletions failed
				new Notice('Failed to delete items. Check console for details.');
			}

			// Update plugin styles if any MOCs were affected
			this.plugin.updateMOCStyles();

		} catch (error) {
			console.error('Error during deletion operation:', error);
			new Notice('Deletion operation failed. Check console for details.');
		}
	}

	/**
	 * Deletes a single item with appropriate handling for different types
	 * 
	 * Why: Different item types require different deletion strategies
	 * (files vs folders, with proper link cleanup).
	 */
	private async deleteItem(item: DeletableItem) {
		if (item.file instanceof TFile) {
			// Delete file and clean up links
			await this.app.vault.delete(item.file);
			
			// The plugin's cleanupBrokenLinks will be triggered automatically
			// by the vault's delete event, so we don't need to call it manually
		} else if (item.file instanceof TFolder) {
			// Delete entire folder (for sub-MOCs)
			await this.app.vault.delete(item.file);
		}
	}

	/**
	 * Shows message when no deletable items are found
	 * 
	 * Why: Provides clear feedback when the current context has no
	 * plugin-created content that can be deleted.
	 */
	private showNoItemsMessage() {
		this.contentEl.createEl('h2', { text: 'No Content to Delete' });
		
		const message = this.contentEl.createEl('p', {
			text: 'No plugin-created content found in the current context that can be deleted.'
		});
		message.style.cssText = 'text-align: center; color: var(--text-muted); margin: 20px 0;';

		this.createButtons([
			{ text: 'Close', action: () => {}, primary: true }
		]);
	}

	/**
	 * Checks if a file was created by this plugin
	 * 
	 * Why: Only plugin-created files should be offered for deletion
	 * to prevent accidental removal of user-created content.
	 */
	private isPluginCreatedFile(file: TFile): boolean {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const noteType = frontmatter?.['note-type'];
		return noteType !== null && ['moc', 'note', 'resource', 'prompt'].includes(noteType);
	}
}