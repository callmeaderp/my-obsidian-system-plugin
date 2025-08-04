# MOC System Plugin - Claude Memory

## Project Overview
This is an Obsidian plugin that implements a hierarchical Map of Contents (MOC) system for note organization. The plugin is currently stable and fully functional.

## Current State
- **Status**: Stable and fully functional with both folder and tab coloring
- **Architecture**: Keyboard-first workflow with minimal modals
- **Performance**: Optimized with metadata caching and efficient DOM updates
- **Build status**: Successfully built with npm dependencies installed
- **Archive feature**: MOCs can be archived/unarchived with Cmd+Shift+A
- **MOC Emojis**: Random emojis for each MOC (not standardized)
- **Tab Coloring**: Tabs show background colors matching their MOC folders
- **Styling System**: CSS escaping properly handles spaces in folder paths

## File Inventory

### Core Files
- `src/main.ts` - Main plugin class with all core functionality
- `src/types.ts` - TypeScript type definitions
- `src/constants.ts` - Configuration constants and defaults
- `src/errors.ts` - Custom error classes for specific error handling

### Documentation
- `docs/COMPREHENSIVE_TESTING_GUIDE.md` - Complete testing plan for all plugin features
- `docs/PLUGIN_REDESIGN_PLAN.md` - Implementation planning documentation

### Utilities
- `src/utils/helpers.ts` - General utility functions (emoji, color, frontmatter)
- `src/utils/validation.ts` - Input validation and sanitization

### Modals
- `src/modals/BaseModal.ts` - Base class for all modals
- `src/modals/QuickInputModal.ts` - Lightweight modal for quick text input (Phase 2)
- `src/modals/CreateMOCModal.ts` - Create new MOCs (deprecated - use Quick Create)
- `src/modals/AddToMOCModal.ts` - Add content to MOCs (deprecated - use Quick Add)
- `src/modals/CreateItemModal.ts` - Create items (deprecated - use Quick Add)
- `src/modals/DeleteMOCContentModal.ts` - Context-aware deletion
- `src/modals/VaultUpdateModal.ts` - Update vault to latest system
- `src/modals/ReorganizeMOCModal.ts` - Move MOCs in hierarchy
- `src/modals/PromptDescriptionModal.ts` - Add descriptions to prompt iterations
- `src/modals/CleanupConfirmationModal.ts` - Confirm system cleanup
- `src/modals/UndoTestChangesModal.ts` - Undo session changes
- `src/modals/SelectParentMOCModal.ts` - Select parent for sub-MOCs
- `src/modals/CreateParentMOCModal.ts` - Create parent during reorganization

## Key Functions and Locations

### Quick Commands (Phase 2-3)
- `quickCreateMOC()` - src/main.ts:520 - Quick MOC creation with default content (Cmd+Shift+M)
- `quickAdd()` - src/main.ts:543 - Context-aware content addition (Cmd+M)
- `quickIterate()` - src/main.ts:612 - Quick prompt iteration with frontmatter sync (Cmd+I)
- `toggleArchiveMOC()` - src/main.ts:2336 - Archive/unarchive MOC (Cmd+Shift+A)
- `findParentMOC()` - src/main.ts:588 - Finds parent MOC from file location

### MOC Creation
- `createMOC()` - src/main.ts:431 - Creates root MOCs with random emoji (uses getRandomEmoji())
- `createSubMOC()` - src/main.ts:478 - Creates sub-MOCs with random emoji (uses getRandomEmoji())
- `ensureMOCFolderStructure()` - src/main.ts:871 - Creates MOC folder only (no subfolders)

### File Creation
- `createFile()` - src/main.ts:718 - Unified factory for all file types (Phase 3 updated)
- `createResource()` - src/main.ts:707 - Creates resource files
- `createPrompt()` - src/main.ts:711 - Creates prompt v1 directly (no hub files)

### MOC Management
- `addToMOCSection()` - src/main.ts:1014 - Adds links to MOC sections
- `reorganizeContentForPluginSections()` - src/main.ts:1085 - Maintains section order
- `moveRootMOCToSub()` - src/main.ts:1510 - Converts root to sub-MOC
- `promoteSubMOCToRoot()` - src/main.ts:1536 - Converts sub-MOC to root
- `archiveMOC()` - src/main.ts:2246 - Archives MOC to archived folder
- `unarchiveMOC()` - src/main.ts:2291 - Restores MOC from archive
- `markMOCFilesAsArchived()` - src/main.ts:2358 - Updates frontmatter for archive state

### Prompt Features
- `duplicatePromptIteration()` - src/main.ts:1301 - Creates new prompt versions (Phase 3 - no hub files)
- `openLLMLinks()` - src/main.ts:1425 - Opens URLs from iteration frontmatter (handles both array and concatenated string formats)
- `extractPromptVersion()` - src/utils/validation.ts:155 - Parses version numbers
- `addPromptToMOC()` - src/main.ts:1162 - Adds prompts with nested iteration structure
- `findNextAvailableVersion()` - src/main.ts:1385 - Finds highest version + 1 for prompt group

### Vault Maintenance
- `updateVaultToLatestSystem()` - src/main.ts:1600 - Updates all plugin files
- `cleanupMOCSystem()` - src/main.ts:2037 - Removes all plugin files
- `undoTestChanges()` - src/main.ts:2068 - Removes files created in session
- `cleanupBrokenLinks()` - src/main.ts:2102 - Removes links to deleted files

### Styling
- `updateMOCStyles()` - src/main.ts:245 - Generates dynamic CSS for MOC colors
- `generateMOCColorStyles()` - src/main.ts:300 - Creates folder and tab color rules
- `generateTabStylesForMOC()` - src/main.ts:404 - Generates CSS for tab coloring
- `updateTabAttributes()` - src/main.ts:2148 - Sets data-moc-path attributes on tabs
- `visitAllTabs()` - src/main.ts:2272 - Cycles through tabs to trigger CSS styling
- `setupTabObserver()` - src/main.ts:2210 - Watches for new tabs being added
- `escapeForCSS()` - src/main.ts:446 - Properly escapes CSS selectors including spaces
- `generateRandomColor()` - src/utils/helpers.ts:28 - Generates HSL colors
- `getRandomEmoji()` - src/utils/helpers.ts:13 - Generates random emojis from configured ranges

## Important Data Structures

### Frontmatter Fields
- `note-type`: 'moc' | 'resource' | 'prompt' | 'archived-*' (archived prefix for filtering)
- `tags`: Array, includes 'moc' for MOC files
- `moc-hue/saturation/lightness`: Color values
- `light-color/dark-color`: Computed theme colors
- `root-moc-color`: Boolean flag for root MOCs
- `prompt-group`: String, groups related prompt iterations (Phase 3)
- `iteration`: Number, prompt version number (Phase 3)
- `llm-links`: Array or concatenated string, URLs to LLM conversations (Phase 3)

### File Naming Patterns (Current)
- MOCs: `[emoji] [name] MOC.md` (random emoji for each MOC)
- Resources: `📚 [name].md` (merged notes + resources)
- Prompts: `🤖 [name] v[N].md` (no hub files, direct iterations)

### Folder Structure (Current Default)
```
[emoji] [MOC Name] MOC/
├── [emoji] [MOC Name] MOC.md
└── 📚 [MOC Name].md  (default resource, shares MOC name)
```
Note: Flat structure, no subfolders, no default prompts, random emoji per MOC

### MOC Prompts Section Structure (Phase 3)
```markdown
## Prompts
- 🤖 API Design
  - [[🤖 API Design v1]]
  - [[🤖 API Design v2 - Added error handling]]
- 🤖 Database Schema
  - [[🤖 Database Schema v1]]
```
Note: Nested structure groups iterations by prompt name

## Technical Context

### Plugin Architecture
- Uses Obsidian's Plugin API with TypeScript
- Event-driven with keyboard-first quick commands (Phase 2)
- Debounced style updates for performance
- Comprehensive error handling with custom error classes
- Performance optimizations:
  - Metadata caching with 5-second TTL for MOC colors
  - Single-pass section detection algorithm (O(n) complexity)
  - In-place DOM updates for style changes
  - Parallel processing for MOC style generation
  - Range-based line tracking for efficient content reorganization

### Dependencies
- Obsidian API only, no external dependencies
- Uses Electron's shell API for opening URLs

### Key Design Decisions
- Random emojis for MOC visual distinction (uses getRandomEmoji() from emoji ranges)
- HSL color generation for theme compatibility
- Frontmatter-based metadata for flexibility
- Section ordering enforced for consistency
- Atomic file operations with rollback capability
- Flat folder structure for reduced friction (Phase 1)
- Keyboard-first design with minimal modals (Phase 2)
- Direct prompt iterations without hub files (Phase 3)
- Auto-creation of default resource with MOC name for immediate usability
- Smart emoji detection for automatic file typing (Phase 4)

### Emoji Configuration
- `getRandomEmoji()` function in src/utils/helpers.ts generates random emojis
- Uses Unicode ranges defined in CONFIG.EMOJI_RANGES:
  - Emoticons (0x1F600-0x1F64F)
  - Misc Symbols (0x1F300-0x1F5FF)
  - Transport symbols (0x1F680-0x1F6FF)
  - Supplemental symbols (0x1F900-0x1F9FF)
- MOCs get unique random emoji on creation (not standardized 🎯)
- Resources use 📚 emoji
- Prompts use 🤖 emoji

## Environment Requirements
- Obsidian 0.15.0 or higher
- styles.css file in plugin directory for base styles
- No other special requirements

## Current Features
- **Random MOC Emojis**: Each MOC gets a unique random emoji for memorable visual identification
- **MOC Archiving**: Archive/unarchive functionality (Cmd+Shift+A). Moves entire MOC folders to "archived" folder and prefixes note-type with "archived-" for graph filtering. Works from any file within a MOC.
- **LLM Links**: Handles both array format and concatenated string format in frontmatter. Parses individual URLs from concatenated strings by detecting each http:// or https:// occurrence.
- **Optional Resource Creation**: MOC creation can skip default resource. Both `createMOC()` and `createSubMOC()` accept optional `createResource` parameter (defaults to true). CreateMOCModal includes checkbox to control resource creation (unchecked by default).
- **Default Prompt Creation**: CreateMOCModal now defaults to creating a prompt alongside the MOC (checkbox checked by default). This aligns with typical workflow where prompts are more commonly needed than resources.
- **Smart Version Numbering**: Prompt iterations scan all existing versions for the prompt group and use the highest version + 1, preventing duplicate version numbers.
- **Tab Coloring**: Workspace tabs display background colors matching their MOC folder colors. Uses data-moc-path attributes and CSS targeting. Includes automatic tab visiting on startup to ensure styling applies to all open tabs.
- **Enhanced CSS Escaping**: Properly handles spaces and special characters in folder paths for reliable CSS selector generation.

## Temporary Workarounds
None currently in place.