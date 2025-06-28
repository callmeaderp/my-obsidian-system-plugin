import { App } from 'obsidian';
import { BaseModal } from './BaseModal';
import { sanitizeInput } from '../utils/validation';
import { ValidationError } from '../errors';

/**
 * Generic modal for creating any type of content item
 * 
 * Why: Different content types (Note, Resource, Prompt, Sub-MOC) all need
 * similar creation UI. This generic modal reduces code duplication while
 * providing type-specific prompts.
 */
export class CreateItemModal extends BaseModal {
	constructor(
		app: App,
		private itemType: string,
		private onSubmit: (name: string) => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: `Create ${this.itemType}` });
		
		// Type-specific placeholder text for better UX
		const placeholders: Record<string, string> = {
			'Sub-MOC': 'Sub-MOC name (e.g., "Frontend Development")',
			'Note': 'Note title (e.g., "Meeting Notes 2024-01-15")',
			'Resource': 'Resource name (e.g., "API Documentation")',
			'Prompt': 'Prompt name (e.g., "Code Review Assistant")'
		};
		
		const placeholder = placeholders[this.itemType] || `${this.itemType} name...`;
		const inputEl = this.createInput(placeholder);
		
		// Add helper text for user guidance
		const helperText = this.contentEl.createEl('small', {
			text: 'Tip: Use descriptive names to make items easy to find later'
		});
		helperText.style.cssText = 'display: block; color: var(--text-muted); margin-top: 5px;';

		const submit = async () => {
			const rawName = inputEl.value.trim();
			
			if (!rawName) {
				// Visual feedback for empty input
				inputEl.style.borderColor = 'var(--text-error)';
				inputEl.placeholder = 'Name is required!';
				setTimeout(() => {
					inputEl.style.borderColor = '';
					inputEl.placeholder = placeholder;
				}, 2000);
				return;
			}
			
			try {
				// Validate and sanitize the input
				// Why: File names have OS-specific restrictions that could cause
				// creation to fail. Better to catch and fix these early.
				const sanitizedName = sanitizeInput(rawName, this.itemType);
				
				// Show sanitization feedback if name was changed
				if (sanitizedName !== rawName) {
					const feedbackEl = this.contentEl.createEl('p', {
						text: `Name adjusted to: "${sanitizedName}"`,
						cls: 'mod-warning'
					});
					feedbackEl.style.cssText = 'margin-top: 10px; font-size: 0.9em;';
					
					// Brief pause to let user see the adjustment
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
				
				// Execute the creation callback
				await Promise.resolve(this.onSubmit(sanitizedName));
				
				// Modal will close automatically via base class
			} catch (error) {
				if (error instanceof ValidationError) {
					// Show validation error to user
					const errorEl = this.contentEl.querySelector('.validation-error') || 
						this.contentEl.createEl('p', { cls: 'validation-error mod-warning' });
					errorEl.setText(`Invalid name: ${error.message}`);
					(errorEl as HTMLElement).style.cssText = 'margin-top: 10px; color: var(--text-error);';
					
					// Keep modal open for user to fix
					return;
				}
				
				// Re-throw other errors for base class handling
				throw error;
			}
		};
		
		// Enable Enter key submission
		this.handleEnterKey(submit, inputEl);
		
		// Single create button since this is a simple input modal
		this.createButtons([
			{ text: 'Create', action: submit, primary: true }
		]);
		
		// Add cancel hint
		const cancelHint = this.contentEl.createEl('small', {
			text: 'Press Esc to cancel'
		});
		cancelHint.style.cssText = 'display: block; text-align: center; color: var(--text-muted); margin-top: 10px;';
	}
}