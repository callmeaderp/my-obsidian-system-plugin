import { CONFIG } from '../constants';
import { ValidationResult } from '../types';
import { ValidationError } from '../errors';

// =================================================================================
// INPUT VALIDATION UTILITIES
// =================================================================================

/**
 * Validates and sanitizes file/folder names for cross-platform compatibility
 * 
 * @param name - The proposed file or folder name
 * @param isFolder - Whether validating a folder name (slightly different rules)
 * @returns Validation result with sanitized name or error message
 */
export function validateFileName(name: string, isFolder: boolean = false): ValidationResult {
	// Reject empty names immediately
	if (!name || name.trim().length === 0) {
		return {
			isValid: false,
			error: 'Name cannot be empty'
		};
	}

	// Start with basic sanitization
	let sanitized = name
		.replace(CONFIG.VALIDATION.TRIM_PATTERN, '') // Remove leading/trailing spaces
		.replace(CONFIG.VALIDATION.MULTIPLE_SPACES, ' '); // Collapse multiple spaces

	// Check length before other validations to give specific feedback
	if (sanitized.length > CONFIG.VALIDATION.MAX_NAME_LENGTH) {
		return {
			isValid: false,
			error: `Name is too long (${sanitized.length} characters). Maximum allowed: ${CONFIG.VALIDATION.MAX_NAME_LENGTH}`
		};
	}

	// Remove forbidden characters that could cause file system errors
	const beforeForbidden = sanitized;
	sanitized = sanitized.replace(CONFIG.VALIDATION.FORBIDDEN_CHARS, '');
	
	// If characters were removed, inform the user
	if (beforeForbidden !== sanitized) {
		const removedChars = beforeForbidden
			.split('')
			.filter(char => !sanitized.includes(char))
			.filter((char, index, self) => self.indexOf(char) === index) // unique only
			.join('", "');
		
		return {
			isValid: true,
			error: `Removed forbidden characters: "${removedChars}"`,
			sanitized
		};
	}

	// Check for Windows reserved names (case-insensitive)
	const upperName = sanitized.toUpperCase();
	const baseName = upperName.split('.')[0]; // Check name without extension
	
	if (CONFIG.VALIDATION.RESERVED_NAMES.includes(baseName as any)) {
		return {
			isValid: false,
			error: `"${baseName}" is a reserved system name. Please choose a different name.`
		};
	}

	// Additional checks for specific problem patterns
	if (sanitized.endsWith('.')) {
		sanitized = sanitized.slice(0, -1);
		return {
			isValid: true,
			error: 'Removed trailing period (can cause issues on some systems)',
			sanitized
		};
	}

	// Final validation passed
	return {
		isValid: true,
		sanitized
	};
}

/**
 * Validates a complete file path including parent directories
 * 
 * @param path - The complete file path to validate
 * @returns Validation result
 */
export function validateFilePath(path: string): ValidationResult {
	const parts = path.split('/');
	const fileName = parts.pop() || '';
	
	// Validate each directory in the path
	for (const part of parts) {
		const dirResult = validateFileName(part, true);
		if (!dirResult.isValid) {
			return {
				isValid: false,
				error: `Invalid directory name "${part}": ${dirResult.error}`
			};
		}
	}

	// Validate the file name
	return validateFileName(fileName, false);
}

/**
 * Validates and sanitizes user input with specific context
 * Throws ValidationError for invalid input that cannot be sanitized
 * 
 * @param input - User-provided input
 * @param context - What the input is for (e.g., "MOC name", "Note title")
 * @param isFolder - Whether this will be a folder name
 * @returns Sanitized input
 * @throws {ValidationError} If input cannot be made valid
 */
export function sanitizeInput(input: string, context: string, isFolder: boolean = false): string {
	const result = validateFileName(input, isFolder);
	
	if (!result.isValid && !result.sanitized) {
		throw new ValidationError(`Invalid ${context}: ${result.error}`, input);
	}
	
	// Log warning if sanitization was needed
	if (result.error && result.sanitized) {
		console.warn(`MOC System: ${context} was sanitized: ${result.error}`);
	}
	
	return result.sanitized || input;
}

/**
 * Ensures a MOC name ends with ' MOC' suffix
 * 
 * @param name - The proposed MOC name
 * @returns Name with ' MOC' suffix if not already present
 */
export function ensureMOCSuffix(name: string): string {
	const trimmed = name.trim();
	if (!trimmed.endsWith(' MOC')) {
		return `${trimmed} MOC`;
	}
	return trimmed;
}

/**
 * Validates prompt version format
 * 
 * @param basename - The file basename to check
 * @returns Version number if valid, null otherwise
 */
export function extractPromptVersion(basename: string): number | null {
	// Look for version pattern anywhere in the basename, not just at the end
	// Pattern: v followed by digits, optionally followed by space and description
	const match = basename.match(/v(\d+)(?:\s|$)/);
	if (match) {
		const version = parseInt(match[1], 10);
		// Ensure version is a reasonable number
		if (version > 0 && version < 10000) {
			return version;
		}
	}
	return null;
}