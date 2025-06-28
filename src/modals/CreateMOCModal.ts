import { App } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CSS_CLASSES } from '../constants';
import type MOCSystemPlugin from '../main';

/**
 * Modal for creating new root MOCs with optional prompt creation
 * 
 * Why: Root MOC creation is a primary plugin action that needs a dedicated UI.
 * The optional prompt creation streamlines common workflow of creating both together.
 */
export class CreateMOCModal extends BaseModal {
	constructor(
		app: App,
		private plugin: MOCSystemPlugin,
		private onSubmit: (name: string) => void
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Create new MOC' });
		
		// Main MOC name input
		const mocNameEl = this.createInput('MOC name...');
		mocNameEl.style.marginBottom = '15px';

		// Optional prompt creation section
		// Why: Users often create a MOC and immediately want a prompt for it.
		// This saves them from having to create the prompt separately.
		const promptSection = this.contentEl.createDiv({ cls: CSS_CLASSES.CREATION_PROMPT_SECTION });
		promptSection.style.cssText = 'border-top: 1px solid var(--background-modifier-border); padding-top: 15px; margin-top: 15px;';

		const checkboxContainer = promptSection.createDiv();
		checkboxContainer.style.cssText = 'display: flex; align-items: center; margin-bottom: 10px;';

		const createPromptCheckbox = checkboxContainer.createEl('input', { type: 'checkbox' });
		createPromptCheckbox.id = 'create-prompt-checkbox';
		createPromptCheckbox.style.marginRight = '8px';
		
		const checkboxLabel = checkboxContainer.createEl('label', { text: 'Also create a prompt' });
		checkboxLabel.setAttribute('for', 'create-prompt-checkbox');
		checkboxLabel.style.cursor = 'pointer';
		
		// Toggle prompt name input visibility based on checkbox
		const promptNameEl = promptSection.createEl('input', { 
			type: 'text', 
			placeholder: 'Prompt name (leave empty to use MOC name)...' 
		});
		promptNameEl.style.width = '100%';
		promptNameEl.style.display = 'none';

		const togglePromptNameInput = () => {
			promptNameEl.style.display = createPromptCheckbox.checked ? 'block' : 'none';
			if (createPromptCheckbox.checked && promptNameEl.style.display === 'block') {
				promptNameEl.focus();
			}
		};

		// Handle both checkbox click and label click
		createPromptCheckbox.addEventListener('change', togglePromptNameInput);
		checkboxLabel.addEventListener('click', (e) => {
			e.preventDefault(); // Prevent double-toggle
			createPromptCheckbox.checked = !createPromptCheckbox.checked;
			togglePromptNameInput();
		});

		// Submit handler
		const submit = async () => {
			const mocName = mocNameEl.value.trim();
			if (!mocName) {
				// Flash the input to indicate it's required
				mocNameEl.style.borderColor = 'var(--text-error)';
				setTimeout(() => {
					mocNameEl.style.borderColor = '';
				}, 1000);
				return;
			}

			try {
				const mocFile = await this.plugin.createMOC(mocName);
				
				// Create prompt if requested
				if (createPromptCheckbox.checked) {
					// Use MOC name without 'MOC' suffix as default prompt name
					const promptName = promptNameEl.value.trim() || 
						mocName.replace(/\s+MOC$/i, '').trim() || 
						mocName;
					
					await this.plugin.createPrompt(mocFile, promptName);
					
					// Small delay to ensure styles are updated after both operations
					setTimeout(() => this.plugin.updateMOCStyles(), 150);
				}
				
				this.onSubmit(mocName);
			} catch (error) {
				console.error('Error creating MOC:', error);
				// Keep modal open on error so user can try again
				return;
			}
		};

		// Enable Enter key submission from both inputs
		this.handleEnterKey(submit, mocNameEl, promptNameEl);
		
		// Action buttons
		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ text: 'Create', action: submit, primary: true }
		]);
	}
}