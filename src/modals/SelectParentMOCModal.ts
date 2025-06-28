import { App, TFile } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CSS_CLASSES } from '../constants';
import type MOCSystemPlugin from '../main';

/**
 * Modal for selecting an existing MOC as a parent
 * 
 * Why: When moving MOCs between parents, users need to see available
 * options and understand the hierarchy. This modal provides a clear
 * interface for parent selection with search and filtering.
 */
export class SelectParentMOCModal extends BaseModal {
	private filteredMOCs: TFile[];
	private listContainer: HTMLElement;
	
	constructor(
		app: App,
		private childMOC: TFile,
		private availableMOCs: TFile[],
		private plugin: MOCSystemPlugin,
		private isMovingSubMOC: boolean = false
	) {
		super(app);
		this.filteredMOCs = [...availableMOCs];
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Select Parent MOC' });
		
		// Context explanation
		const action = this.isMovingSubMOC ? 'move' : 'place';
		this.contentEl.createEl('p', { 
			text: `Choose where to ${action} "${this.childMOC.basename}":` 
		});
		
		// Search/filter input
		// Why: Large vaults can have many MOCs. Search helps users quickly
		// find the right parent without scrolling through long lists.
		if (this.availableMOCs.length > 5) {
			this.createSearchInput();
		}
		
		// Available MOCs count
		const countEl = this.contentEl.createEl('p', {
			text: `${this.availableMOCs.length} available parent MOCs`
		});
		countEl.style.cssText = 'color: var(--text-muted); font-size: 0.9em; margin-bottom: 10px;';
		
		// Scrollable list of MOCs
		this.listContainer = this.contentEl.createDiv({ cls: CSS_CLASSES.SCROLL_LIST });
		this.listContainer.style.cssText = 'max-height: 300px; overflow-y: auto; border: 1px solid var(--background-modifier-border); border-radius: 5px;';
		
		this.renderMOCList();
		
		// Helper text
		if (this.availableMOCs.length > 0) {
			const helperText = this.contentEl.createEl('small', {
				text: 'Click on a MOC to select it as the new parent'
			});
			helperText.style.cssText = 'display: block; color: var(--text-muted); margin-top: 10px; text-align: center;';
		}

		// Cancel button
		this.createButtons([
			{ text: 'Cancel', action: () => {} }
		]);
	}

	/**
	 * Creates search input for filtering MOCs
	 * 
	 * Why: Quick filtering improves usability when there are many MOCs.
	 * Real-time search provides immediate feedback.
	 */
	private createSearchInput() {
		const searchContainer = this.contentEl.createDiv();
		searchContainer.style.marginBottom = '15px';
		
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search MOCs...'
		});
		searchInput.style.width = '100%';
		
		// Real-time search
		searchInput.addEventListener('input', () => {
			const query = searchInput.value.toLowerCase().trim();
			
			if (query === '') {
				// Show all MOCs if search is empty
				this.filteredMOCs = [...this.availableMOCs];
			} else {
				// Filter by name and path
				this.filteredMOCs = this.availableMOCs.filter(moc => 
					moc.basename.toLowerCase().includes(query) || 
					moc.path.toLowerCase().includes(query)
				);
			}
			
			this.renderMOCList();
		});
	}

	/**
	 * Renders the list of selectable MOCs
	 * 
	 * Why: Dynamic rendering allows for search filtering and
	 * provides organized presentation of options.
	 */
	private renderMOCList() {
		// Clear existing list
		this.listContainer.empty();
		
		if (this.filteredMOCs.length === 0) {
			const emptyMessage = this.listContainer.createDiv({
				text: 'No matching MOCs found'
			});
			emptyMessage.style.cssText = 'padding: 20px; text-align: center; color: var(--text-muted);';
			return;
		}
		
		// Group MOCs by hierarchy level for better organization
		const rootMOCs: TFile[] = [];
		const subMOCs: TFile[] = [];
		
		this.filteredMOCs.forEach(moc => {
			if (this.plugin.isRootMOC(moc)) {
				rootMOCs.push(moc);
			} else {
				subMOCs.push(moc);
			}
		});
		
		// Sort each group alphabetically
		rootMOCs.sort((a, b) => a.basename.localeCompare(b.basename));
		subMOCs.sort((a, b) => a.path.localeCompare(b.path));
		
		// Render groups
		if (rootMOCs.length > 0) {
			this.renderMOCGroup('Root MOCs', rootMOCs, '🔵');
		}
		
		if (subMOCs.length > 0) {
			this.renderMOCGroup('Sub-MOCs', subMOCs, '  🔵');
		}
	}

	/**
	 * Renders a group of MOCs with a header
	 */
	private renderMOCGroup(title: string, mocs: TFile[], icon: string) {
		// Only show group headers if we have both root and sub MOCs
		if (this.filteredMOCs.length > mocs.length) {
			const groupHeader = this.listContainer.createEl('div', {
				text: title
			});
			groupHeader.style.cssText = 'font-weight: bold; padding: 10px; background: var(--background-secondary); border-bottom: 1px solid var(--background-modifier-border);';
		}
		
		mocs.forEach(moc => {
			const item = this.listContainer.createEl('div', { 
				cls: CSS_CLASSES.LIST_ITEM 
			});
			item.style.cssText = 'padding: 12px; cursor: pointer; border-bottom: 1px solid var(--background-modifier-border);';
			
			// MOC info display
			const nameDiv = item.createDiv();
			nameDiv.innerHTML = `${icon} <strong>${moc.basename}</strong>`;
			
			// Show path for context, especially useful for sub-MOCs
			if (!this.plugin.isRootMOC(moc)) {
				const pathDiv = item.createDiv({
					text: moc.path
				});
				pathDiv.style.cssText = 'font-size: 0.8em; color: var(--text-muted); margin-top: 3px;';
			}
			
			// Hover effects
			item.addEventListener('mouseenter', () => {
				item.style.background = 'var(--background-modifier-hover)';
			});
			
			item.addEventListener('mouseleave', () => {
				item.style.background = '';
			});
			
			// Selection handler
			item.addEventListener('click', () => {
				this.selectParent(moc);
			});
		});
	}

	/**
	 * Handles parent MOC selection and executes the move operation
	 */
	private async selectParent(parentMOC: TFile) {
		try {
			if (this.isMovingSubMOC) {
				await this.plugin.moveSubMOCToNewParent(this.childMOC, parentMOC);
			} else {
				await this.plugin.moveRootMOCToSub(this.childMOC, null, parentMOC);
			}
			
			this.close();
		} catch (error) {
			console.error('Error moving MOC:', error);
			// Keep modal open on error for user to try again
		}
	}
}