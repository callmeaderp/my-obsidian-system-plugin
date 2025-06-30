import { App, TFile } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CSS_CLASSES } from '../constants';

/**
 * Modal for confirming MOC system file cleanup
 */
export class CleanupConfirmationModal extends BaseModal {
	constructor(
		app: App,
		private filesToDelete: TFile[],
		private onConfirm: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Cleanup MOC System Files' });
		
		// Clear description of what will happen
		this.contentEl.createEl('p', { 
			text: `This will permanently delete ${this.filesToDelete.length} files created by this plugin.` 
		});
		
		// Primary warning
		this.createWarning('This action cannot be undone.');
		
		// Additional warning for large deletions
		if (this.filesToDelete.length > 20) {
			this.createWarning(`⚠️ Large deletion: ${this.filesToDelete.length} files will be removed. Please ensure you have backups.`);
		}

		// Show files to be deleted
		if (this.filesToDelete.length > 0) {
			this.contentEl.createEl('h3', { text: 'Files to be deleted:' });
			
			// Scrollable list for many files
			const fileListContainer = this.contentEl.createEl('div');
			fileListContainer.style.cssText = 'max-height: 250px; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px; margin-bottom: 15px;';
			
			const fileList = fileListContainer.createEl('ul', { cls: CSS_CLASSES.FILE_LIST });
			
			// Group files by type for better overview
			const filesByType = this.groupFilesByType();
			
			for (const [type, files] of filesByType) {
				// Type header
				const typeHeader = fileList.createEl('li', { 
					text: `${type} (${files.length} files)`,
					cls: 'tree-item-self'
				});
				typeHeader.style.cssText = 'font-weight: bold; list-style: none; margin-top: 10px;';
				
				// Show first few files of each type
				const maxFilesToShow = 5;
				const filesToShow = files.slice(0, maxFilesToShow);
				
				filesToShow.forEach(file => {
					const item = fileList.createEl('li', { text: file.path });
					item.style.cssText = 'margin-left: 20px; font-size: 0.9em; color: var(--text-muted);';
				});
				
				// Show count of remaining files
				if (files.length > maxFilesToShow) {
					const remaining = fileList.createEl('li', { 
						text: `... and ${files.length - maxFilesToShow} more ${type.toLowerCase()}`
					});
					remaining.style.cssText = 'margin-left: 20px; font-style: italic; color: var(--text-muted); list-style: none;';
				}
			}
		}

		// Confirmation message
		const confirmText = this.contentEl.createEl('p', {
			text: 'Are you sure you want to delete these files? This will remove all MOCs, Notes, Resources, and Prompts created by this plugin.'
		});
		confirmText.style.cssText = 'margin-top: 15px; font-weight: 500;';

		// Action buttons
		this.createButtons([
			{ text: 'Cancel', action: () => {}, primary: true },
			{ text: 'Delete All Files', action: this.onConfirm }
		]);
		
	}

	/**
	 * Groups files by their note type for organized display
	 */
	private groupFilesByType(): Map<string, TFile[]> {
		const groups = new Map<string, TFile[]>();
		
		for (const file of this.filesToDelete) {
			// Get note type from frontmatter
			const cache = this.app.metadataCache.getFileCache(file);
			const noteType = cache?.frontmatter?.['note-type'] || 'unknown';
			
			// Map to display names
			const typeNames: Record<string, string> = {
				'moc': 'MOCs',
				'note': 'Notes',
				'resource': 'Resources',
				'prompt': 'Prompts',
				'unknown': 'Other Files'
			};
			
			const displayType = typeNames[noteType] || 'Other Files';
			
			if (!groups.has(displayType)) {
				groups.set(displayType, []);
			}
			groups.get(displayType)!.push(file);
		}
		
		// Sort files within each group
		for (const files of groups.values()) {
			files.sort((a, b) => a.path.localeCompare(b.path));
		}
		
		return groups;
	}
}