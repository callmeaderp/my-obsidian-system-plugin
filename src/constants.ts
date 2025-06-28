import { SectionType, ThemeConfig } from './types';

// =================================================================================
// PLUGIN CONFIGURATION CONSTANTS
// =================================================================================

/**
 * Default plugin settings
 * Empty object allows for future extensions without breaking existing vaults
 */
export const DEFAULT_SETTINGS = {};

/**
 * Core plugin configuration
 * Centralizes all magic numbers and strings for easy maintenance
 */
export const CONFIG = {
	/**
	 * Folder names for MOC organization
	 * These folders are automatically created within each MOC
	 */
	FOLDERS: {
		Notes: 'Notes',
		Resources: 'Resources',
		Prompts: 'Prompts'
	} as const,

	/**
	 * Order in which sections appear in MOC files
	 * Ensures consistent organization across all MOCs
	 */
	SECTION_ORDER: ['MOCs', 'Notes', 'Resources', 'Prompts'] as const,

	/**
	 * Configuration for each note type
	 * Defines visual identifiers and organizational rules
	 */
	NOTE_TYPES: {
		MOCs: { emoji: '🔵' },
		Notes: { emoji: '📝' },
		Resources: { emoji: '📁' },
		Prompts: { emoji: '🤖' }
	} as const,

	/**
	 * Unicode ranges for random emoji selection
	 * Used to generate unique identifiers for MOCs
	 */
	EMOJI_RANGES: [
		[0x1F600, 0x1F64F], // Emoticons (faces, gestures)
		[0x1F300, 0x1F5FF], // Misc Symbols and Pictographs (nature, objects)
		[0x1F680, 0x1F6FF], // Transport and Map Symbols
		[0x1F900, 0x1F9FF]  // Supplemental Symbols and Pictographs
	] as const,

	/**
	 * Color generation parameters for MOC folders
	 * Ensures generated colors are visible and pleasant in both themes
	 */
	COLOR: {
		/** Saturation range for vibrant but not overwhelming colors */
		SATURATION_RANGE: [60, 90] as const,
		/** Lightness range for good contrast in light theme */
		LIGHTNESS_RANGE: [45, 65] as const,
		/** Additional lightness for dark theme visibility */
		DARK_BOOST: 10
	} as const,

	/**
	 * Timing delays for style updates
	 * Accounts for Obsidian's initialization sequence
	 */
	STYLE_DELAYS: {
		/** Initial delay after plugin load */
		INITIAL: 1000,
		/** Delay after layout is ready */
		LAYOUT_READY: 500,
		/** Delay for dynamic updates */
		UPDATE: 100
	} as const,

	/**
	 * File name validation rules
	 * Prevents creation of files with invalid names
	 */
	VALIDATION: {
		/** Maximum length for file/folder names (OS-safe limit) */
		MAX_NAME_LENGTH: 255,
		/** Characters forbidden in file names across major operating systems */
		FORBIDDEN_CHARS: /[<>:"/\\|?*\x00-\x1F]/g,
		/** Pattern for detecting multiple consecutive spaces */
		MULTIPLE_SPACES: /\s{2,}/g,
		/** Pattern for leading/trailing whitespace */
		TRIM_PATTERN: /^\s+|\s+$/g,
		/** Reserved filenames on Windows */
		RESERVED_NAMES: [
			'CON', 'PRN', 'AUX', 'NUL',
			'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
			'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
		] as const
	} as const
} as const;

/**
 * Theme-specific opacity configurations
 * Provides different visual weights for light and dark themes
 */
export const THEME_CONFIGS: Record<'light' | 'dark', ThemeConfig> = {
	light: {
		baseOpacity: 0.1,
		gradientOpacity: 0.15,
		hoverOpacity: 0.2,
		hoverGradientOpacity: 0.25
	},
	dark: {
		baseOpacity: 0.15,
		gradientOpacity: 0.2,
		hoverOpacity: 0.25,
		hoverGradientOpacity: 0.3
	}
} as const;

/**
 * CSS class names used by the plugin
 * Centralizes styling hooks for consistent theming
 */
export const CSS_CLASSES = {
	MODAL_BUTTONS: 'moc-system-modal-buttons',
	UPDATE_LIST: 'moc-system-update-list',
	UPDATE_FILEPATH: 'moc-system-update-filepath',
	FILE_LIST: 'moc-system-file-list',
	SCROLL_LIST: 'moc-system-scroll-list',
	LIST_ITEM: 'moc-system-list-item',
	CREATION_PROMPT_SECTION: 'moc-creation-prompt-section'
} as const;