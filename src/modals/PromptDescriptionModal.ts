import { App } from 'obsidian';
import { BaseModal } from './BaseModal';

/**
 * Modal for adding optional descriptions to prompt iterations
 * 
 * Why: Prompt iterations benefit from descriptive names that indicate
 * what changed. This modal makes it easy to add those descriptions
 * while keeping them optional for quick iterations.
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
		
		// Explanation for the user
		const explanation = this.contentEl.createEl('p', {
			text: 'Add a brief description of what changed in this iteration. This helps track the evolution of your prompts.'
		});
		explanation.style.cssText = 'color: var(--text-muted); margin-bottom: 15px;';
		
		// Examples to guide the user
		const examples = [
			'Added error handling',
			'Improved context awareness',
			'Fixed formatting issues',
			'Enhanced for technical writing',
			'Simplified instructions'
		];
		
		const exampleText = this.contentEl.createEl('small', {
			text: `Examples: ${examples.join(', ')}`
		});
		exampleText.style.cssText = 'display: block; color: var(--text-muted); margin-bottom: 10px;';
		
		// Description input
		const inputEl = this.createInput('Description...');
		inputEl.style.marginBottom = '20px';
		
		// Character limit indicator
		// Why: Descriptions become part of filenames, so they need to be
		// reasonably short to avoid filesystem issues.
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
		// Why: Two distinct actions - skip for quick iterations,
		// add description for documented changes.
		this.createButtons([
			{ text: 'Skip', action: submitWithoutDescription },
			{ text: 'Add Description', action: submitWithDescription, primary: true }
		]);
		
		// Keyboard shortcuts hint
		const shortcutHint = this.contentEl.createEl('small', {
			text: 'Tip: Press Enter to add description, or click Skip for no description'
		});
		shortcutHint.style.cssText = 'display: block; text-align: center; color: var(--text-muted); margin-top: 10px;';
	}
}