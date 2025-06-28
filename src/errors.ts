// =================================================================================
// CUSTOM ERROR CLASSES
// =================================================================================

/**
 * Base error class for all plugin-specific errors
 * Provides consistent error handling and messaging throughout the plugin
 */
export abstract class MOCSystemError extends Error {
	constructor(message: string, public readonly code: string) {
		super(message);
		this.name = this.constructor.name;
		// Maintains proper prototype chain for instanceof checks
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Thrown when file name validation fails
 * Provides specific feedback about what made the name invalid
 */
export class ValidationError extends MOCSystemError {
	constructor(message: string, public readonly invalidValue?: string) {
		super(message, 'VALIDATION_ERROR');
	}
}

/**
 * Thrown when file system operations fail
 * Wraps lower-level errors with context about the operation
 */
export class FileSystemError extends MOCSystemError {
	constructor(
		message: string, 
		public readonly operation: 'create' | 'read' | 'update' | 'delete' | 'rename',
		public readonly path?: string
	) {
		super(message, 'FILE_SYSTEM_ERROR');
	}
}

/**
 * Thrown when attempting operations that would create circular dependencies
 * Prevents infinite loops in MOC hierarchies
 */
export class CircularDependencyError extends MOCSystemError {
	constructor(
		public readonly sourceMOC: string,
		public readonly targetMOC: string
	) {
		super(
			`Cannot create circular dependency: "${sourceMOC}" would become both parent and child of "${targetMOC}"`,
			'CIRCULAR_DEPENDENCY'
		);
	}
}

/**
 * Thrown when required MOC structure is missing or corrupted
 * Helps identify and fix structural issues in the vault
 */
export class MOCStructureError extends MOCSystemError {
	constructor(message: string, public readonly mocPath?: string) {
		super(message, 'MOC_STRUCTURE_ERROR');
	}
}

/**
 * Thrown when frontmatter parsing or manipulation fails
 * Indicates issues with note metadata
 */
export class FrontmatterError extends MOCSystemError {
	constructor(message: string, public readonly filePath?: string) {
		super(message, 'FRONTMATTER_ERROR');
	}
}

/**
 * Thrown when style generation or application fails
 * Non-critical errors that affect appearance but not functionality
 */
export class StyleError extends MOCSystemError {
	constructor(message: string) {
		super(message, 'STYLE_ERROR');
	}
}

/**
 * Type guard to check if an error is a MOCSystemError
 * Useful for error handling in catch blocks
 */
export function isMOCSystemError(error: unknown): error is MOCSystemError {
	return error instanceof MOCSystemError;
}

/**
 * Type guard for specific error types
 * Enables type-safe error handling
 */
export function isErrorType<T extends MOCSystemError>(
	error: unknown,
	errorClass: new (...args: any[]) => T
): error is T {
	return error instanceof errorClass;
}