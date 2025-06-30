import { App, TFile } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CSS_CLASSES } from '../constants';

/**
 * Modal for confirming undo of test changes made during current session
 */
export class UndoTestChangesModal extends BaseModal {
	constructor(
		app: App,
		private filesToDelete: TFile[],
		private onConfirm: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Undo Test Changes' });
		
		// Session-specific explanation
		this.contentEl.createEl('p', { 
			text: `This will delete ${this.filesToDelete.length} files created since Obsidian started.` 
		});
		
		// Safety assurance
		this.contentEl.createEl('p', { 
			text: 'Only plugin-created files (MOCs, Notes, Resources, Prompts) will be deleted.',
			cls: 'mod-warning'
		});
		
		// Additional context for developers
		if (this.filesToDelete.length > 10) {
			const developmentNote = this.contentEl.createEl('p', {
				text: `⚠️ Large number of test files (${this.filesToDelete.length}). This suggests active plugin development or testing.`
			});
			developmentNote.style.cssText = 'color: var(--text-accent); font-size: 0.9em; margin: 10px 0;';
		}

		// Show files to be deleted
		if (this.filesToDelete.length > 0) {
			this.contentEl.createEl('h3', { text: 'Files to be deleted:' });
			
			// Scrollable list with reasonable height limit
			const fileListContainer = this.contentEl.createEl('div');
			fileListContainer.style.cssText = 'max-height: 200px; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px; margin-bottom: 15px;';
			
			const fileList = fileListContainer.createEl('ul', { cls: CSS_CLASSES.FILE_LIST });
			
			// Show first batch of files with more detail
			const maxDetailed = 15;
			const detailedFiles = this.filesToDelete.slice(0, maxDetailed);
			const remainingFiles = this.filesToDelete.slice(maxDetailed);
			
			// Group files by type for organized display
			const groupedFiles = this.groupFilesByType(detailedFiles);
			
			for (const [type, files] of groupedFiles) {
				// Type header
				if (groupedFiles.size > 1) {
					const typeHeader = fileList.createEl('li', { 
						text: `${type} (${files.length})`,
						cls: 'tree-item-self'
					});
					typeHeader.style.cssText = 'font-weight: bold; list-style: none; margin-top: 8px; color: var(--text-normal);';
				}
				
				// Individual files
				files.forEach(file => {
					const item = fileList.createEl('li', { text: file.path });
					item.style.cssText = `margin-left: ${groupedFiles.size > 1 ? '20px' : '0'}; font-size: 0.9em; color: var(--text-muted); margin-bottom: 2px;`;
				});
			}
			
			// Show count of remaining files if many
			if (remainingFiles.length > 0) {
				const remaining = fileList.createEl('li', { 
					text: `... and ${remainingFiles.length} more files`
				});
				remaining.style.cssText = 'font-style: italic; color: var(--text-muted); list-style: none; margin-top: 10px;';
			}
		}

		// Time-based context
		const timeContext = this.contentEl.createEl('small', {
			text: 'These files were created during your current Obsidian session and are safe to remove for testing purposes.'
		});
		timeContext.style.cssText = 'display: block; color: var(--text-muted); margin: 15px 0; text-align: center;';

		// Action buttons
		this.createButtons([
			{ text: 'Cancel', action: () => {}, primary: true },
			{ text: `Undo ${this.filesToDelete.length} Test Files`, action: this.onConfirm }
		]);
		
	}

	/**
	 * Groups files by their note type for organized display
	 */
	private groupFilesByType(files: TFile[]): Map<string, TFile[]> {
		const groups = new Map<string, TFile[]>();
		
		for (const file of files) {
			// Extract type from frontmatter
			const cache = this.app.metadataCache.getFileCache(file);
			const noteType = cache?.frontmatter?.['note-type'] || 'unknown';
			
			// Friendly display names
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
		
		// Sort files within each group by creation time (newest first)
		for (const files of groups.values()) {
			files.sort((a, b) => b.stat.ctime - a.stat.ctime);
		}
		
		return groups;
	}
}