import { App, TFile } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CreateItemModal } from './CreateItemModal';
import type MOCSystemPlugin from '../main';

/**
 * Modal for adding content to an existing MOC
 */
export class AddToMOCModal extends BaseModal {
	constructor(
		app: App,
		private moc: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Add to MOC' });
		
		// Content creation options
		const options = [
			{ 
				label: 'Sub-MOC', 
				action: async (name: string) => { await this.plugin.createSubMOC(this.moc, name); },
				description: 'Child MOC for sub-topics'
			},
			{ 
				label: 'Note', 
				action: async (name: string) => { await this.plugin.createNote(this.moc, name); },
				description: 'Regular content note'
			},
			{ 
				label: 'Resource', 
				action: async (name: string) => { await this.plugin.createResource(this.moc, name); },
				description: 'Reference materials'
			},
			{ 
				label: 'Prompt', 
				action: async (name: string) => { await this.plugin.createPrompt(this.moc, name); },
				description: 'Prompt hub with versions'
			}
		];

		options.forEach((option, index) => {
			const container = this.contentEl.createDiv();
			container.style.marginBottom = '15px';
			
			const button = container.createEl('button', { 
				text: `Create ${option.label}`, 
				cls: 'mod-cta' 
			});
			button.style.cssText = 'display: block; width: 100%; margin-bottom: 5px;';
			
			// Add description for clarity
			const description = container.createEl('small', { 
				text: option.description 
			});
			description.style.cssText = 'display: block; color: var(--text-muted); padding-left: 10px;';
			
			button.addEventListener('click', () => {
				this.close();
				
				// Small delay ensures proper modal cleanup
				setTimeout(() => {
					new CreateItemModal(this.app, option.label, option.action).open();
				}, 50);
			});
			
			// Add keyboard shortcut (1-4)
			if (index < 9) {
				this.scope.register([], (index + 1).toString(), () => {
					button.click();
					return false;
				});
			}
		});
		
		// Cancel with Escape is handled by Obsidian's modal system
		const cancelButton = this.contentEl.createEl('button', { text: 'Cancel' });
		cancelButton.style.cssText = 'display: block; width: 100%; margin-top: 20px;';
		cancelButton.addEventListener('click', () => this.close());
	}
}