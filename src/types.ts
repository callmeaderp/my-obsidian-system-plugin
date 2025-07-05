import { TFile } from 'obsidian';

// =================================================================================
// CORE PLUGIN TYPES
// =================================================================================

/**
 * Plugin settings structure - currently empty but provides extension point
 * for future configuration options without breaking changes
 */
export type PluginSettings = Record<string, never>;

/**
 * Section types that organize content within MOCs
 * These sections appear in a specific order to maintain consistency
 */
export type SectionType = 'MOCs' | 'Resources' | 'Prompts';

/**
 * Note types supported by the plugin
 * Each type has specific behaviors and organizational patterns
 */
export type NoteType = 'moc' | 'resource' | 'prompt';

/**
 * Configuration for file creation
 * Defines how different file types should be created and organized
 */
export interface FileConfig {
	/** The note type being created */
	type: NoteType;
	/** Emoji prefix for visual identification */
	emoji: string;
	/** Subfolder within MOC structure where file should be created */
	folder: string;
	/** Optional suffix to append to filename (e.g., 'MOC' for MOC files) */
	suffix?: string;
	/** Whether to create a dedicated subfolder for this file type */
	createSubfolder?: boolean;
}

/**
 * Configuration for creating new files
 * Provides all necessary information for the creation process
 */
export interface CreateConfig {
	/** Name of the file to create (without emoji or extension) */
	name: string;
	/** Parent MOC to add the new file to (optional for root MOCs) */
	parentMOC?: TFile;
	/** Type of file being created */
	type: NoteType;
	/** Optional description for the file */
	description?: string;
}

/**
 * Color information for MOC folder styling
 * Generates unique colors for visual hierarchy in file explorer
 */
export interface ColorInfo {
	/** Hue value (0-360) for HSL color */
	hue: number;
	/** Saturation percentage (0-100) for vibrancy */
	saturation: number;
	/** Lightness percentage (0-100) for brightness */
	lightness: number;
	/** Pre-computed HSL string for light theme */
	lightColor: string;
	/** Pre-computed HSL string for dark theme */
	darkColor: string;
}

/**
 * Result of updating a single file during vault-wide updates
 * Tracks success/failure and specific changes made
 */
export interface UpdateResult {
	/** The file that was updated */
	file: TFile;
	/** List of changes applied to the file */
	changes: string[];
	/** Whether all updates succeeded */
	success: boolean;
	/** Error message if update failed */
	error?: string;
}

/**
 * Plan for updating multiple files to latest system standards
 * Generated during analysis phase before user confirmation
 */
export interface VaultUpdatePlan {
	/** Files that need updates */
	filesToUpdate: TFile[];
	/** Map of files to their required changes */
	updateSummary: Map<TFile, string[]>;
	/** Total number of changes across all files */
	totalChanges: number;
}

/**
 * Validation result for user input
 * Provides detailed feedback for invalid input
 */
export interface ValidationResult {
	/** Whether the input is valid */
	isValid: boolean;
	/** Error message if validation failed */
	error?: string;
	/** Sanitized version of the input */
	sanitized?: string;
}

/**
 * Theme configuration for MOC colors
 * Defines opacity values for different UI states
 */
export interface ThemeConfig {
	/** Base opacity for folder background */
	baseOpacity: number;
	/** Opacity for folder background gradient end */
	gradientOpacity: number;
	/** Opacity when hovering over folder */
	hoverOpacity: number;
	/** Opacity for hover gradient end */
	hoverGradientOpacity: number;
}