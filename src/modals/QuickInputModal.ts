import { App } from 'obsidian';
import { BaseModal } from './BaseModal';

// =================================================================================
// QUICK INPUT MODAL
// =================================================================================

/**
 * Lightweight modal for quick text input with minimal UI
 * 
 * Why: Reduces modal fatigue by providing a simple, focused input experience.
 * Used for Phase 2 quick commands that need minimal user input.
 */
export class QuickInputModal extends BaseModal {
	private result: string | null = null;
	
	constructor(
		app: App,
		private prompt: string,
		private placeholder: string,
		private onSubmit: (value: string) => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		
		// Simple prompt text
		contentEl.createEl('h3', { text: this.prompt });
		
		// Create input with auto-focus
		const input = this.createInput(this.placeholder, true);
		
		// Handle submission
		const submit = async () => {
			const value = input.value.trim();
			if (value) {
				this.result = value;
				try {
					await Promise.resolve(this.onSubmit(value));
					this.close();
				} catch (error) {
					// Keep modal open on error so user can correct
					console.error('Quick input error:', error);
				}
			}
		};
		
		// Enter key submits
		this.handleEnterKey(submit, input);
		
		// Escape key cancels (built into Obsidian modals)
		
		// Simple button bar
		this.createButtons([
			{
				text: 'Create',
				action: submit,
				primary: true
			},
			{
				text: 'Cancel',
				action: () => this.close()
			}
		]);
		
		// Select all text for easy replacement
		input.select();
	}
	
	/**
	 * Gets the submitted value (null if cancelled)
	 */
	getResult(): string | null {
		return this.result;
	}
}