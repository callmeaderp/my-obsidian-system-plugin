# MOC System Plugin - Claude Memory

## Project Overview
This is an Obsidian plugin that implements a hierarchical Map of Contents (MOC) system for note organization. The plugin is currently stable and fully functional.

## Current State
- **Status**: Stable - All redesign phases complete
- **Last update**: Phase 4 - Default content, smart emoji detection, performance optimizations
- **Architecture**: Keyboard-first workflow with minimal modals
- **Performance**: Optimized with metadata caching and efficient DOM updates
- **See**: PLUGIN_REDESIGN_PLAN.md for implementation history

## File Inventory

### Core Files
- `src/main.ts` - Main plugin class with all core functionality
- `src/types.ts` - TypeScript type definitions
- `src/constants.ts` - Configuration constants and defaults
- `src/errors.ts` - Custom error classes for specific error handling

### Documentation
- `COMPREHENSIVE_TESTING_GUIDE.md` - Complete testing plan for all plugin features
- `PLUGIN_REDESIGN_PLAN.md` - Historical record of redesign phases

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
- `quickCreateMOC()` - src/main.ts:513 - Quick MOC creation with default content (Cmd+Shift+M)
- `quickAdd()` - src/main.ts:536 - Context-aware content addition (Cmd+M)
- `quickIterate()` - src/main.ts:605 - Quick prompt iteration with frontmatter sync (Cmd+I)
- `findParentMOC()` - src/main.ts:581 - Finds parent MOC from file location

### MOC Creation
- `createMOC()` - src/main.ts:429 - Creates root MOCs with flat structure
- `createSubMOC()` - src/main.ts:472 - Creates sub-MOCs under parents
- `ensureMOCFolderStructure()` - src/main.ts:864 - Creates MOC folder only (no subfolders)

### File Creation
- `createFile()` - src/main.ts:711 - Unified factory for all file types (Phase 3 updated)
- `createResource()` - src/main.ts:700 - Creates resource files
- `createPrompt()` - src/main.ts:704 - Creates prompt v1 directly (no hub files)

### MOC Management
- `addToMOCSection()` - src/main.ts:1007 - Adds links to MOC sections
- `reorganizeContentForPluginSections()` - src/main.ts:1078 - Maintains section order
- `moveRootMOCToSub()` - src/main.ts:1456 - Converts root to sub-MOC
- `promoteSubMOCToRoot()` - src/main.ts:1482 - Converts sub-MOC to root

### Prompt Features
- `duplicatePromptIteration()` - src/main.ts:1288 - Creates new prompt versions (Phase 3 - no hub files)
- `openLLMLinks()` - src/main.ts:1382 - Opens URLs from iteration frontmatter
- `extractPromptVersion()` - src/utils/validation.ts:155 - Parses version numbers
- `addPromptToMOC()` - src/main.ts:1155 - Adds prompts with nested iteration structure

### Vault Maintenance
- `updateVaultToLatestSystem()` - src/main.ts:1546 - Updates all plugin files
- `cleanupMOCSystem()` - src/main.ts:1983 - Removes all plugin files
- `undoTestChanges()` - src/main.ts:2014 - Removes files created in session
- `cleanupBrokenLinks()` - src/main.ts:2048 - Removes links to deleted files

### Styling
- `updateMOCStyles()` - src/main.ts:245 - Generates dynamic CSS for MOC colors
- `generateMOCColorStyles()` - src/main.ts:289 - Creates folder color rules
- `generateRandomColor()` - src/utils/helpers.ts:28 - Generates HSL colors

## Important Data Structures

### Frontmatter Fields
- `note-type`: 'moc' | 'resource' | 'prompt'
- `tags`: Array, includes 'moc' for MOC files
- `moc-hue/saturation/lightness`: Color values
- `light-color/dark-color`: Computed theme colors
- `root-moc-color`: Boolean flag for root MOCs
- `prompt-group`: String, groups related prompt iterations (Phase 3)
- `iteration`: Number, prompt version number (Phase 3)
- `llm-links`: Array, URLs to LLM conversations (Phase 3)

### File Naming Patterns (Current)
- MOCs: `🎯 [name] MOC.md` (standardized emoji)
- Resources: `📚 [name].md` (merged notes + resources)
- Prompts: `🤖 [name] v[N].md` (no hub files, direct iterations)

### Folder Structure (After Phase 3)
```
🎯 [MOC Name] MOC/
├── 🎯 [MOC Name] MOC.md
├── 📚 [Resource Name].md
├── 📚 [Another Resource].md
├── 🤖 [Prompt Name] v1.md
└── 🤖 [Prompt Name] v2 - description.md
```
Note: Flat structure, no subfolders, no hub files

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
- Standardized emojis for consistency (🎯 MOCs, 📚 Resources, 🤖 Prompts)
- HSL color generation for theme compatibility
- Frontmatter-based metadata for flexibility
- Section ordering enforced for consistency
- Atomic file operations with rollback capability
- Flat folder structure for reduced friction (Phase 1)
- Keyboard-first design with minimal modals (Phase 2)
- Direct prompt iterations without hub files (Phase 3)
- Auto-creation of default content for immediate usability (Phase 4)
- Smart emoji detection for automatic file typing (Phase 4)

## Environment Requirements
- Obsidian 0.15.0 or higher
- styles.css file in plugin directory for base styles
- No other special requirements

## Redesign Achievements
- ✅ Phase 1: Merged note types and flattened folder structure
- ✅ Phase 2: Reduced modals from 11 to 3 core commands with keyboard shortcuts
- ✅ Phase 3: Eliminated prompt hub pattern for direct iteration system
- ✅ Phase 4: Added default content, smart emoji detection, and performance optimizations

All planned redesign phases have been successfully completed.

## Temporary Workarounds
None currently in place.