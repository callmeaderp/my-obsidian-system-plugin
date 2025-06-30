import { App, TFile } from 'obsidian';
import { BaseModal } from './BaseModal';
import { sanitizeInput, ensureMOCSuffix } from '../utils/validation';
import { ValidationError } from '../errors';
import type MOCSystemPlugin from '../main';

/**
 * Modal for creating a new parent MOC and moving another MOC under it
 */
export class CreateParentMOCModal extends BaseModal {
	constructor(
		app: App,
		private childMOC: TFile,
		private plugin: MOCSystemPlugin
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Create New Parent MOC' });
		
		// Explanation of what will happen
		const explanation = this.contentEl.createEl('p', {
			text: `This will create a new root MOC and move "${this.childMOC.basename}" under it.`
		});
		explanation.style.marginBottom = '20px';
		
		// Visual hierarchy preview
		this.createHierarchyPreview();
		
		// MOC name input
		const inputEl = this.createInput('Parent MOC name...');
		inputEl.style.marginBottom = '15px';
		
		

		// Submit handler
		const submit = async () => {
			const rawName = inputEl.value.trim();
			
			if (!rawName) {
				this.highlightEmptyInput(inputEl);
				return;
			}
			
			try {
				// Validate and sanitize the name
				const sanitizedName = sanitizeInput(rawName, 'Parent MOC name');
				
				// Ensure MOC suffix for consistency
				const finalName = ensureMOCSuffix(sanitizedName);
				
				// Show final name if it was modified
				if (finalName !== rawName) {
					await this.showNameAdjustment(rawName, finalName);
				}
				
				// Execute the move operation
				await this.plugin.moveRootMOCToSub(this.childMOC, finalName, null);
				
			} catch (error) {
				if (error instanceof ValidationError) {
					this.showValidationError(error.message);
					return;
				}
				
				// Re-throw other errors for base class handling
				throw error;
			}
		};

		// Enable Enter key submission
		this.handleEnterKey(submit, inputEl);

		// Action buttons
		this.createButtons([
			{ text: 'Cancel', action: () => {} },
			{ text: 'Create & Move', action: submit, primary: true }
		]);
	}

	/**
	 * Creates a visual preview of the hierarchy change
	 */
	private createHierarchyPreview() {
		const previewContainer = this.contentEl.createDiv();
		previewContainer.style.cssText = 'background: var(--background-secondary); padding: 15px; border-radius: 5px; margin-bottom: 20px;';
		
		const title = previewContainer.createEl('h4', { text: 'Structure Preview:' });
		title.style.marginBottom = '10px';
		
		// Before state
		const beforeDiv = previewContainer.createDiv();
		beforeDiv.createEl('strong', { text: 'Before:' });
		const beforeStructure = beforeDiv.createEl('div');
		beforeStructure.style.cssText = 'margin-left: 20px; font-family: monospace;';
		beforeStructure.innerHTML = `📁 Vault Root<br>├── 🔵 ${this.childMOC.basename}`;
		
		// Arrow
		const arrowDiv = previewContainer.createDiv();
		arrowDiv.style.cssText = 'text-align: center; margin: 10px 0; font-size: 1.2em;';
		arrowDiv.innerHTML = '⬇️';
		
		// After state
		const afterDiv = previewContainer.createDiv();
		afterDiv.createEl('strong', { text: 'After:' });
		const afterStructure = afterDiv.createEl('div');
		afterStructure.style.cssText = 'margin-left: 20px; font-family: monospace;';
		afterStructure.innerHTML = `📁 Vault Root<br>├── 🔵 [New Parent MOC]<br>│   └── 🔵 ${this.childMOC.basename}`;
	}

	/**
	 * Highlights input field for empty input feedback
	 */
	private highlightEmptyInput(input: HTMLInputElement) {
		input.style.borderColor = 'var(--text-error)';
		input.placeholder = 'Parent MOC name is required!';
		setTimeout(() => {
			input.style.borderColor = '';
			input.placeholder = 'Parent MOC name...';
		}, 2000);
	}

	/**
	 * Shows name adjustment notification
	 */
	private async showNameAdjustment(original: string, adjusted: string) {
		const notification = this.contentEl.createEl('p', {
			text: `Name adjusted: "${original}" → "${adjusted}"`,
			cls: 'mod-warning'
		});
		notification.style.cssText = 'margin: 10px 0; font-size: 0.9em;';
		
		// Brief pause to let user see the adjustment
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	/**
	 * Shows validation error to user
	 */
	private showValidationError(message: string) {
		const errorEl = this.contentEl.querySelector('.validation-error') || 
			this.contentEl.createEl('p', { cls: 'validation-error' });
		
		errorEl.setText(`Invalid name: ${message}`);
		errorEl.setAttribute('style', 'margin-top: 10px; color: var(--text-error); font-size: 0.9em;');
	}
}