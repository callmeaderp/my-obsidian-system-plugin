# MOC System Plugin - Claude Memory

## Project Overview
This is an Obsidian plugin that implements a hierarchical Map of Contents (MOC) system for note organization. The plugin is currently stable and fully functional.

## Current State
- **Status**: Redesign in progress - Phase 3 complete
- **Last update**: Phase 3 - Prompt system overhauled, hub files eliminated
- **Active development**: Phase 4 pending - Polish & enhancement
- **See**: PLUGIN_REDESIGN_PLAN.md for full roadmap, PHASE3_TEST_PLAN.md for Phase 3 details

## File Inventory

### Core Files
- `src/main.ts` - Main plugin class with all core functionality
- `src/types.ts` - TypeScript type definitions
- `src/constants.ts` - Configuration constants and defaults
- `src/errors.ts` - Custom error classes for specific error handling

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
- `quickCreateMOC()` - src/main.ts:457 - Quick MOC creation with default content (Cmd+Shift+M)
- `quickAdd()` - src/main.ts:491 - Context-aware content addition (Cmd+M)
- `quickIterate()` - src/main.ts:560 - Quick prompt iteration with frontmatter sync (Cmd+I)
- `findParentMOC()` - src/main.ts:536 - Finds parent MOC from file location

### MOC Creation
- `createMOC()` - src/main.ts:379 - Creates root MOCs with flat structure
- `createSubMOC()` - src/main.ts:420 - Creates sub-MOCs under parents
- `ensureMOCFolderStructure()` - src/main.ts:353 - Creates MOC folder only (no subfolders)

### File Creation
- `createFile()` - src/main.ts:643 - Unified factory for all file types (Phase 3 updated)
- `createResource()` - src/main.ts:654 - Creates resource files
- `createPrompt()` - src/main.ts:658 - Creates prompt v1 directly (no hub files)

### MOC Management
- `addToMOCSection()` - src/main.ts:955 - Adds links to MOC sections
- `reorganizeContentForPluginSections()` - src/main.ts:1010 - Maintains section order
- `moveRootMOCToSub()` - src/main.ts:1459 - Converts root to sub-MOC
- `promoteSubMOCToRoot()` - src/main.ts:1485 - Converts sub-MOC to root

### Prompt Features
- `duplicatePromptIteration()` - src/main.ts:1208 - Creates new prompt versions (Phase 3 - no hub files)
- `openLLMLinks()` - src/main.ts:1302 - Opens URLs from iteration frontmatter
- `extractPromptVersion()` - src/utils/validation.ts:155 - Parses version numbers
- `addPromptToMOC()` - src/main.ts:1075 - Adds prompts with nested iteration structure

### Vault Maintenance
- `updateVaultToLatestSystem()` - src/main.ts:1549 - Updates all plugin files
- `cleanupMOCSystem()` - src/main.ts:1993 - Removes all plugin files
- `undoTestChanges()` - src/main.ts:2024 - Removes files created in session
- `cleanupBrokenLinks()` - src/main.ts:2058 - Removes links to deleted files

### Styling
- `updateMOCStyles()` - src/main.ts:201 - Generates dynamic CSS for MOC colors
- `generateMOCColorStyles()` - src/main.ts:238 - Creates folder color rules
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
- Phase 1 complete: Flat folder structure, merged note types
- Phase 2 complete: Quick commands reduce modal fatigue
- Phase 3 complete: Prompt hub pattern eliminated, direct iteration system

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

## Environment Requirements
- Obsidian 0.15.0 or higher
- styles.css file in plugin directory for base styles
- No other special requirements

## Current Issues (Being Addressed)
- ✅ Phase 1: Artificial distinctions between notes and resources (RESOLVED)
- ✅ Phase 1: Subfolder structure creates barriers (RESOLVED)  
- ✅ Phase 2: Modal fatigue from 11 different modals (RESOLVED - quick commands)
- ✅ Phase 2: Workflow rigidity requiring too many clicks (RESOLVED - keyboard shortcuts)
- ✅ Phase 3: Prompt hub pattern adds unnecessary complexity (RESOLVED - direct iterations)
- ⏳ Phase 4: Default content creation and polish needed

See PLUGIN_REDESIGN_PLAN.md for implementation progress.

## Temporary Workarounds
None currently in place.