import { CONFIG } from '../constants';
import { ColorInfo } from '../types';

// =================================================================================
// GENERAL UTILITY FUNCTIONS
// =================================================================================

/**
 * Generates a random emoji from predefined Unicode ranges
 * 
 * @returns A single emoji character
 */
export function getRandomEmoji(): string {
	// Select a random range to ensure variety across emoji types
	const range = CONFIG.EMOJI_RANGES[Math.floor(Math.random() * CONFIG.EMOJI_RANGES.length)];
	
	// Generate random code point within the selected range
	const codePoint = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
	
	return String.fromCodePoint(codePoint);
}

/**
 * Generates random HSL color values optimized for UI visibility
 * 
 * @returns Color information with computed theme variants
 */
export function generateRandomColor(): ColorInfo {
	// Random hue gives variety across the color spectrum
	const hue = Math.floor(Math.random() * 360);
	
	// Controlled saturation range ensures colors are vibrant but not overwhelming
	const saturation = CONFIG.COLOR.SATURATION_RANGE[0] + 
		Math.floor(Math.random() * (CONFIG.COLOR.SATURATION_RANGE[1] - CONFIG.COLOR.SATURATION_RANGE[0]));
	
	// Controlled lightness ensures good contrast in light theme
	const lightness = CONFIG.COLOR.LIGHTNESS_RANGE[0] + 
		Math.floor(Math.random() * (CONFIG.COLOR.LIGHTNESS_RANGE[1] - CONFIG.COLOR.LIGHTNESS_RANGE[0]));
	
	// Pre-compute theme-specific colors
	const lightColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
	
	// Boost lightness for dark theme to maintain visibility
	// Cap at 75% to prevent colors from becoming too washed out
	const darkLightness = Math.min(lightness + CONFIG.COLOR.DARK_BOOST, 75);
	const darkColor = `hsl(${hue}, ${saturation}%, ${darkLightness}%)`;
	
	return { hue, saturation, lightness, lightColor, darkColor };
}

/**
 * Converts HSL color string to HSLA with specified opacity
 * 
 * @param hslColor - HSL color string (e.g., 'hsl(240, 100%, 50%)')
 * @param opacity - Opacity value between 0 and 1
 * @returns HSLA color string
 */
export function adjustColorOpacity(hslColor: string, opacity: number): string {
	// Validate opacity range
	const clampedOpacity = Math.max(0, Math.min(1, opacity));
	
	// Simple string replacement maintains the original color values
	return hslColor.replace('hsl(', 'hsla(').replace(')', `, ${clampedOpacity})`);
}

/**
 * Checks if a string starts with an emoji character
 * 
 * @param text - Text to check
 * @returns True if text starts with an emoji
 */
export function hasEmojiPrefix(text: string): boolean {
	// Comprehensive Unicode ranges for emoji detection
	// Covers most common emojis including those added in recent Unicode versions
	return /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(text);
}

/**
 * Safely extracts frontmatter value with type checking
 * 
 * @param frontmatter - Frontmatter object from metadata cache
 * @param key - Key to extract
 * @param defaultValue - Default value if key is missing
 * @returns The frontmatter value or default
 */
export function getFrontmatterValue<T>(
	frontmatter: any,
	key: string,
	defaultValue: T
): T {
	if (!frontmatter || !(key in frontmatter)) {
		return defaultValue;
	}
	
	const value = frontmatter[key];
	
	// Type check to ensure we return the expected type
	if (typeof defaultValue === 'boolean') {
		return (typeof value === 'boolean' ? value : defaultValue) as unknown as T;
	}
	if (typeof defaultValue === 'number') {
		return (typeof value === 'number' ? value : defaultValue) as unknown as T;
	}
	if (typeof defaultValue === 'string') {
		return (typeof value === 'string' ? value : defaultValue) as unknown as T;
	}
	if (Array.isArray(defaultValue)) {
		return (Array.isArray(value) ? value : defaultValue) as unknown as T;
	}
	
	return value !== undefined ? value : defaultValue;
}

/**
 * Debounces a function to limit execution frequency
 * 
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null;
	
	return function(this: any, ...args: Parameters<T>) {
		const context = this;
		
		if (timeout !== null) {
			clearTimeout(timeout);
		}
		
		timeout = setTimeout(() => {
			func.apply(context, args);
			timeout = null;
		}, wait);
	};
}

/**
 * Creates a delay using Promise
 * 
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safely parses a string to integer with validation
 * 
 * @param value - String to parse
 * @param defaultValue - Default if parsing fails
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Parsed integer or default
 */
export function safeParseInt(
	value: string,
	defaultValue: number,
	min?: number,
	max?: number
): number {
	const parsed = parseInt(value, 10);
	
	if (isNaN(parsed)) {
		return defaultValue;
	}
	
	if (min !== undefined && parsed < min) {
		return defaultValue;
	}
	
	if (max !== undefined && parsed > max) {
		return defaultValue;
	}
	
	return parsed;
}