import { App } from 'obsidian';
import { BaseModal } from './BaseModal';

/**
 * Modal for adding optional descriptions to prompt iterations
 */
export class PromptDescriptionModal extends BaseModal {
	constructor(
		app: App,
		private onSubmit: (description: string) => void
	) {
		super(app);
	}

	onOpen() {
		this.contentEl.createEl('h2', { text: 'Add iteration description (optional)' });
		
		
		
		// Description input
		const inputEl = this.createInput('Description...');
		inputEl.style.marginBottom = '20px';
		
		// Character limit indicator
		const charLimit = 50;
		const charCounter = this.contentEl.createEl('small', {
			text: `0/${charLimit} characters`
		});
		charCounter.style.cssText = 'display: block; text-align: right; color: var(--text-muted); margin-top: -15px; margin-bottom: 15px;';
		
		// Update character counter and enforce limit
		inputEl.addEventListener('input', () => {
			const length = inputEl.value.length;
			charCounter.setText(`${length}/${charLimit} characters`);
			
			if (length > charLimit) {
				charCounter.style.color = 'var(--text-error)';
				inputEl.value = inputEl.value.substring(0, charLimit);
			} else {
				charCounter.style.color = 'var(--text-muted)';
			}
		});

		// Submit handlers
		const submitWithDescription = () => {
			this.onSubmit(inputEl.value.trim());
		};
		
		const submitWithoutDescription = () => {
			this.onSubmit('');
		};
		
		// Enable Enter key to submit with description
		this.handleEnterKey(submitWithDescription, inputEl);
		
		// Action buttons
		this.createButtons([
			{ text: 'Skip', action: submitWithoutDescription },
			{ text: 'Add Description', action: submitWithDescription, primary: true }
		]);
		
	}
}