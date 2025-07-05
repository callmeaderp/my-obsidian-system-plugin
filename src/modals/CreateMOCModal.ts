import { App } from 'obsidian';
import { BaseModal } from './BaseModal';
import { CSS_CLASSES } from '../constants';
import type MOCSystemPlugin from '../main';

/**
 * Modal for creating new root MOCs with optional prompt creation
 * 
 * @deprecated Phase 2 - Use Quick Create command (Cmd+Shift+M) instead for better workflow
 * 
 * Provides a streamlined interface for creating both MOCs and initial prompts
 * in a single action, reducing the steps needed to start a new project area.
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
		// Separated visually to indicate it's an additional feature
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
			placeholder: 'Prompt name...' 
		});
		promptNameEl.style.width = '100%';
		promptNameEl.style.display = 'none';

		/**
		 * Toggles prompt name input visibility and focuses it when shown
		 * Provides better UX by automatically focusing the field when user opts in
		 */
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
				// Visual feedback is less disruptive than an error notice
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
					// This provides a sensible default when user doesn't specify
					const promptName = promptNameEl.value.trim() || 
						mocName.replace(/\s+MOC$/i, '').trim() || 
						mocName;
					
					await this.plugin.createPrompt(mocFile, promptName);
					
					// Small delay to ensure styles are updated after both operations
					// DOM updates need time to propagate before style recalculation
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