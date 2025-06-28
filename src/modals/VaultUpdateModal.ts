import { App } from 'obsidian';
import { BaseModal } from './BaseModal';
import { VaultUpdatePlan } from '../types';
import { CSS_CLASSES } from '../constants';

/**
 * Modal for displaying and confirming vault-wide update operations
 * 
 * Why: Bulk updates can modify many files. Users need to see exactly what
 * will change before confirming such a potentially disruptive operation.
 */
export class VaultUpdateModal extends BaseModal {
	constructor(
		app: App,
		private updatePlan: VaultUpdatePlan,
		private onConfirm: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Update Vault to Latest System' });
		
		// Summary of changes
		this.contentEl.createEl('p', { 
			text: `Found ${this.updatePlan.totalChanges} updates needed across ${this.updatePlan.filesToUpdate.length} files.`
		});

		// Only show details if there are files to update
		if (this.updatePlan.filesToUpdate.length > 0) {
			this.contentEl.createEl('h3', { text: 'Files to be updated:' });
			
			// Scrollable list for many files
			// Why: Update lists can be very long. Scrollable container prevents
			// the modal from becoming too tall to fit on screen.
			const updateList = this.contentEl.createEl('div', { cls: CSS_CLASSES.UPDATE_LIST });
			updateList.style.cssText = 'max-height: 300px; overflow-y: auto; border: 1px solid var(--background-modifier-border); padding: 10px; border-radius: 5px;';

			// Group updates by directory for better organization
			const filesByDir = this.groupFilesByDirectory();
			
			for (const [dir, files] of filesByDir) {
				if (filesByDir.size > 1) {
					// Show directory headers only if multiple directories
					const dirHeader = updateList.createEl('div', { 
						text: dir || 'Vault Root',
						cls: 'tree-item-self is-clickable'
					});
					dirHeader.style.cssText = 'font-weight: bold; margin-top: 10px;';
				}
				
				for (const file of files) {
					const updates = this.updatePlan.updateSummary.get(file) || [];
					const fileItem = updateList.createEl('div');
					fileItem.style.marginLeft = filesByDir.size > 1 ? '20px' : '0';
					
					// File path with icon
					const filePath = fileItem.createEl('div', { 
						text: file.name,
						cls: CSS_CLASSES.UPDATE_FILEPATH 
					});
					filePath.style.cssText = 'font-weight: 500; margin-top: 5px;';
					
					// List of updates for this file
					const updatesList = fileItem.createEl('ul');
					updatesList.style.cssText = 'margin: 5px 0 10px 20px; font-size: 0.9em; color: var(--text-muted);';
					
					updates.forEach(update => {
						updatesList.createEl('li', { text: update });
					});
				}
			}
		}

		// Warning about backups
		// Why: Bulk updates can't be easily undone. Users should understand
		// the importance of having backups before proceeding.
		this.createWarning('This will modify files to match the latest system requirements. It is recommended to have a backup.');
		
		// Additional warning for large updates
		if (this.updatePlan.totalChanges > 50) {
			this.createWarning(`⚠️ Large update: ${this.updatePlan.totalChanges} changes will be made. This may take a moment.`);
		}

		// Action buttons
		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ 
				text: `Update ${this.updatePlan.filesToUpdate.length} Files`, 
				action: this.onConfirm, 
				primary: true 
			}
		]);
	}

	/**
	 * Groups files by their parent directory for organized display
	 * 
	 * Why: Showing files grouped by directory helps users understand
	 * the scope of changes and identify patterns.
	 */
	private groupFilesByDirectory(): Map<string, typeof this.updatePlan.filesToUpdate> {
		const groups = new Map<string, typeof this.updatePlan.filesToUpdate>();
		
		for (const file of this.updatePlan.filesToUpdate) {
			const dir = file.parent?.path || '';
			if (!groups.has(dir)) {
				groups.set(dir, []);
			}
			groups.get(dir)!.push(file);
		}
		
		// Sort directories and files within each directory
		const sortedGroups = new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
		for (const files of sortedGroups.values()) {
			files.sort((a, b) => a.name.localeCompare(b.name));
		}
		
		return sortedGroups;
	}
}