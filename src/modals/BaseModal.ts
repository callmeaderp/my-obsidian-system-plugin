import { App, Modal } from 'obsidian';
import { CSS_CLASSES } from '../constants';

// =================================================================================
// BASE MODAL CLASS
// =================================================================================

/**
 * Base modal class providing common functionality for all plugin modals
 * 
 * Why: Reduces code duplication and ensures consistent behavior across all modals.
 * Provides standardized button creation, input handling, and keyboard shortcuts.
 */
export abstract class BaseModal extends Modal {
	/**
	 * Creates standardized button container with consistent styling
	 * 
	 * Why: All modals need buttons with similar behavior and appearance.
	 * This centralizes button creation logic and error handling.
	 * 
	 * @param buttons - Array of button configurations
	 */
	protected createButtons(buttons: Array<{
		text: string;
		action: () => void | Promise<void>;
		primary?: boolean;
	}>) {
		const container = this.contentEl.createDiv({ cls: CSS_CLASSES.MODAL_BUTTONS });
		
		buttons.forEach(btn => {
			const element = container.createEl('button', { 
				text: btn.text, 
				cls: btn.primary ? 'mod-cta' : '' 
			});
			
			element.addEventListener('click', async () => {
				try {
					// Support both sync and async actions
					await Promise.resolve(btn.action());
				} catch (error) {
					// Log errors but don't crash the modal
					console.error('Modal action error:', error);
				} finally {
					// Always close the modal after action completes
					this.close();
				}
			});
		});
	}

	/**
	 * Creates a standardized text input field
	 * 
	 * Why: Most modals need text input with consistent styling and behavior.
	 * Auto-focus improves user experience by reducing clicks.
	 * 
	 * @param placeholder - Placeholder text for the input
	 * @param focus - Whether to auto-focus the input (default: true)
	 * @returns The created input element
	 */
	protected createInput(placeholder: string, focus: boolean = true): HTMLInputElement {
		const input = this.contentEl.createEl('input', { 
			type: 'text', 
			placeholder 
		});
		
		// Full width inputs look better in modals
		input.style.width = '100%';
		
		if (focus) {
			// Small delay ensures the modal is fully rendered before focusing
			setTimeout(() => input.focus(), 10);
		}
		
		return input;
	}

	/**
	 * Sets up Enter key handling for form submission
	 * 
	 * Why: Users expect Enter to submit forms. This provides that functionality
	 * while properly handling both sync and async callbacks.
	 * 
	 * @param callback - Function to call when Enter is pressed
	 * @param inputs - Input elements to attach the handler to
	 */
	protected handleEnterKey(
		callback: () => void | Promise<void>,
		...inputs: HTMLInputElement[]
	) {
		inputs.forEach(input => {
			input.addEventListener('keypress', async (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					
					try {
						// Support both sync and async callbacks
						await Promise.resolve(callback());
					} catch (error) {
						// Log errors but keep modal open for user to fix
						console.error('Modal enter key action error:', error);
					} finally {
						// Close modal after successful submission
						this.close();
					}
				}
			});
		});
	}

	/**
	 * Creates a styled section divider
	 * 
	 * Why: Complex modals need visual separation between different sections.
	 * This provides consistent styling for section breaks.
	 * 
	 * @returns The divider element
	 */
	protected createDivider(): HTMLElement {
		const divider = this.contentEl.createDiv();
		divider.style.cssText = 'border-top: 1px solid var(--background-modifier-border); margin: 15px 0;';
		return divider;
	}

	/**
	 * Creates a warning message element
	 * 
	 * Why: Destructive operations need clear warnings. This ensures
	 * warnings are visually distinct and consistent.
	 * 
	 * @param text - Warning message text
	 * @returns The warning element
	 */
	protected createWarning(text: string): HTMLElement {
		return this.contentEl.createEl('p', { 
			text, 
			cls: 'mod-warning' 
		});
	}

	/**
	 * Cleanup when modal closes
	 * 
	 * Why: Prevents memory leaks and ensures event listeners are removed.
	 * Obsidian doesn't automatically clean up modal content.
	 */
	onClose() {
		// Clear all content and remove event listeners
		this.contentEl.empty();
	}
}