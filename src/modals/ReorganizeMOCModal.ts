import { App, TFile, Notice } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CreateParentMOCModal } from './CreateParentMOCModal';
import { SelectParentMOCModal } from './SelectParentMOCModal';
import type MOCSystemPlugin from '../main';

/**
 * Modal for reorganizing MOC hierarchy
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
	 */
	private async showRootMOCOptions() {
		this.contentEl.createEl('p', { 
			text: 'This is a root MOC. You can move it under another MOC.' 
		});
		
		// Option 1: Create new parent
		const newParentBtn = this.createOptionButton(
			'Move under a NEW parent MOC',
			'Create new parent MOC',
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
			'Select existing parent MOC',
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
	 */
	private async showSubMOCOptions() {
		this.contentEl.createEl('p', { 
			text: 'This is a sub-MOC. You can promote it or move it.' 
		});
		
		// Option 1: Promote to root
		const promoteBtn = this.createOptionButton(
			'Promote to a root MOC',
			'Make independent at root level',
			() => this.plugin.promoteSubMOCToRoot(this.moc),
			true
		);
		
		// Option 2: Move to different parent
		const moveBtn = this.createOptionButton(
			'Move to a different parent MOC',
			'Move to different parent',
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