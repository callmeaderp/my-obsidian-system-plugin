import { App, TFile, Notice } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CreateParentMOCModal } from './CreateParentMOCModal';
import { SelectParentMOCModal } from './SelectParentMOCModal';
import type MOCSystemPlugin from '../main';

/**
 * Modal for reorganizing MOC hierarchy
 * 
 * Why: MOC hierarchies evolve over time. This modal provides tools to
 * restructure MOCs - promoting sub-MOCs to root level, moving MOCs
 * between parents, or demoting root MOCs under new parents.
 */
export class ReorganizeMOCModal extends BaseModal {
	constructor(
		app: App,
		private moc: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	async onOpen() {
		const isRootMOC = this.plugin.isRootMOC(this.moc);
		this.contentEl.createEl('h2', { text: `Reorganize "${this.moc.basename}"` });
		
		// Dynamic options based on MOC type
		if (isRootMOC) {
			await this.showRootMOCOptions();
		} else {
			await this.showSubMOCOptions();
		}
	}

	/**
	 * Shows reorganization options for root MOCs
	 * 
	 * Why: Root MOCs can only be moved under other MOCs (demoted),
	 * they cannot be promoted further.
	 */
	private async showRootMOCOptions() {
		this.contentEl.createEl('p', { 
			text: 'This is a root MOC. You can move it under another MOC.' 
		});
		
		// Option 1: Create new parent
		const newParentBtn = this.createOptionButton(
			'Move under a NEW parent MOC',
			'Create a new MOC and move this one under it',
			() => {
				setTimeout(() => {
					new CreateParentMOCModal(this.app, this.moc, this.plugin).open();
				}, 50);
			},
			true
		);
		
		// Option 2: Move under existing MOC
		const existingParentBtn = this.createOptionButton(
			'Move under an EXISTING parent MOC',
			'Choose from existing MOCs in your vault',
			async () => {
				const availableParents = await this.getAvailableParents();
				if (availableParents.length === 0) {
					new Notice('No suitable parent MOCs available.');
					return;
				}
				setTimeout(() => {
					new SelectParentMOCModal(
						this.app, 
						this.moc, 
						availableParents, 
						this.plugin, 
						false
					).open();
				}, 50);
			}
		);
		
		// Add warning about effects
		this.contentEl.createEl('p', {
			text: '⚠️ Moving a MOC will also move all its content (sub-MOCs, notes, resources, prompts).',
			cls: 'mod-warning'
		}).style.cssText = 'margin-top: 20px; font-size: 0.9em;';
	}

	/**
	 * Shows reorganization options for sub-MOCs
	 * 
	 * Why: Sub-MOCs have more flexibility - they can be promoted to root
	 * level or moved to different parent MOCs.
	 */
	private async showSubMOCOptions() {
		this.contentEl.createEl('p', { 
			text: 'This is a sub-MOC. You can promote it or move it.' 
		});
		
		// Option 1: Promote to root
		const promoteBtn = this.createOptionButton(
			'Promote to a root MOC',
			'Make this MOC independent at the vault root level',
			() => this.plugin.promoteSubMOCToRoot(this.moc),
			true
		);
		
		// Option 2: Move to different parent
		const moveBtn = this.createOptionButton(
			'Move to a different parent MOC',
			'Transfer this MOC to another parent',
			async () => {
				const availableParents = await this.getAvailableParents();
				if (availableParents.length === 0) {
					new Notice('No suitable parent MOCs available.');
					return;
				}
				setTimeout(() => {
					new SelectParentMOCModal(
						this.app, 
						this.moc, 
						availableParents, 
						this.plugin, 
						true
					).open();
				}, 50);
			}
		);
		
		// Current location info
		const currentParent = this.moc.parent?.parent?.name || 'Unknown';
		const locationInfo = this.contentEl.createEl('p', {
			text: `Currently located under: ${currentParent}`
		});
		locationInfo.style.cssText = 'margin-top: 20px; font-size: 0.9em; color: var(--text-muted);';
	}

	/**
	 * Creates a styled option button with description
	 * 
	 * Why: Consistent button styling with descriptions helps users
	 * understand what each action will do before clicking.
	 */
	private createOptionButton(
		text: string,
		description: string,
		onClick: () => void,
		isPrimary: boolean = false
	): HTMLButtonElement {
		const container = this.contentEl.createDiv();
		container.style.marginBottom = '15px';
		
		const button = container.createEl('button', { 
			text, 
			cls: isPrimary ? 'mod-cta' : '' 
		});
		button.style.cssText = 'display: block; width: 100%; margin-bottom: 5px;';
		button.addEventListener('click', () => {
			onClick();
			this.close();
		});
		
		const desc = container.createEl('small', { text: description });
		desc.style.cssText = 'display: block; color: var(--text-muted); padding-left: 10px;';
		
		return button;
	}

	/**
	 * Gets list of MOCs that can serve as parents
	 * 
	 * Why: Prevents circular dependencies by filtering out MOCs that
	 * would create loops in the hierarchy.
	 */
	private async getAvailableParents(): Promise<TFile[]> {
		const allMOCs = await this.plugin.getAllMOCs();
		
		// Filter out:
		// 1. The current MOC itself
		// 2. Any MOCs that would create circular dependencies
		return allMOCs.filter(m => 
			m.path !== this.moc.path && 
			!this.plugin.detectCircularDependency(this.moc, m)
		);
	}
}