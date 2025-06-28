import { App, TFile } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CreateItemModal } from './CreateItemModal';
import type MOCSystemPlugin from '../main';

/**
 * Modal for adding content to an existing MOC
 * 
 * Why: When the user is in a MOC context, they need quick access to create
 * related content. This modal provides that context-aware creation interface.
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
		// Why: Each content type has different organizational patterns and behaviors,
		// so we present them as distinct options for clarity.
		const options = [
			{ 
				label: 'Sub-MOC', 
				action: async (name: string) => { await this.plugin.createSubMOC(this.moc, name); },
				description: 'Create a child MOC for organizing sub-topics'
			},
			{ 
				label: 'Note', 
				action: async (name: string) => { await this.plugin.createNote(this.moc, name); },
				description: 'Create a regular note for content'
			},
			{ 
				label: 'Resource', 
				action: async (name: string) => { await this.plugin.createResource(this.moc, name); },
				description: 'Create a resource for reference materials'
			},
			{ 
				label: 'Prompt', 
				action: async (name: string) => { await this.plugin.createPrompt(this.moc, name); },
				description: 'Create a prompt hub with version tracking'
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
				
				// Small delay ensures proper modal cleanup before opening new one
				// Why: Immediate modal opening can cause rendering issues or
				// event handler conflicts in some Obsidian versions.
				setTimeout(() => {
					new CreateItemModal(this.app, option.label, option.action).open();
				}, 50);
			});
			
			// Add keyboard shortcut (1-4)
			// Why: Power users appreciate keyboard shortcuts for common actions
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