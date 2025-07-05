# MOC System Plugin - Claude Memory

## Project Overview
This is an Obsidian plugin that implements a hierarchical Map of Contents (MOC) system for note organization. The plugin is currently stable and fully functional.

## Current State
- **Status**: Redesign in progress - Phase 1 complete
- **Last update**: Phase 1 - Flat folder structure and merged note types
- **Active development**: Phase 2 starting - Command & keyboard shortcuts
- **See**: PLUGIN_REDESIGN_PLAN.md for full roadmap, TESTING_PLAN.md for test procedures

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
- `src/modals/CreateMOCModal.ts` - Create new MOCs with optional prompts
- `src/modals/AddToMOCModal.ts` - Add content to existing MOCs
- `src/modals/DeleteMOCContentModal.ts` - Context-aware deletion
- `src/modals/VaultUpdateModal.ts` - Update vault to latest system
- `src/modals/ReorganizeMOCModal.ts` - Move MOCs in hierarchy
- `src/modals/PromptDescriptionModal.ts` - Add descriptions to prompt iterations
- `src/modals/CleanupConfirmationModal.ts` - Confirm system cleanup
- `src/modals/UndoTestChangesModal.ts` - Undo session changes
- `src/modals/SelectParentMOCModal.ts` - Select parent for sub-MOCs
- `src/modals/CreateParentMOCModal.ts` - Create parent during reorganization
- `src/modals/CreateItemModal.ts` - Create notes/resources/prompts

## Key Functions and Locations

### MOC Creation
- `createMOC()` - src/main.ts:346 - Creates root MOCs with flat structure
- `createSubMOC()` - src/main.ts:387 - Creates sub-MOCs under parents
- `ensureMOCFolderStructure()` - src/main.ts:612 - Creates MOC folder only (no subfolders)

### File Creation
- `createFile()` - src/main.ts:436 - Unified factory for all file types
- `createResource/Prompt()` - src/main.ts:425-431 - Type-specific helpers (Note type removed)
- `createPromptWithIterations()` - src/main.ts:488 - Creates prompt hub + v1 in flat structure

### MOC Management
- `addToMOCSection()` - src/main.ts:779 - Adds links to MOC sections
- `reorganizeContentForPluginSections()` - src/main.ts:850 - Maintains section order
- `moveRootMOCToSub()` - src/main.ts:1123 - Converts root to sub-MOC
- `promoteSubMOCToRoot()` - src/main.ts:1149 - Converts sub-MOC to root

### Prompt Features
- `duplicatePromptIteration()` - src/main.ts:885 - Creates new prompt versions (updated for flat structure)
- `openLLMLinks()` - src/main.ts:1025 - Opens all URLs in prompt hub
- `extractPromptVersion()` - src/utils/validation.ts:155 - Parses version numbers

### Vault Maintenance
- `updateVaultToLatestSystem()` - src/main.ts:1213 - Updates all plugin files
- `cleanupMOCSystem()` - src/main.ts:1657 - Removes all plugin files
- `undoTestChanges()` - src/main.ts:1688 - Removes files created in session
- `cleanupBrokenLinks()` - src/main.ts:1722 - Removes links to deleted files

### Styling
- `updateMOCStyles()` - src/main.ts:201 - Generates dynamic CSS for MOC colors
- `generateMOCColorStyles()` - src/main.ts:238 - Creates folder color rules
- `generateRandomColor()` - src/utils/helpers.ts:28 - Generates HSL colors

## Important Data Structures

### Frontmatter Fields
- `note-type`: 'moc' | 'resource' | 'prompt' (note type removed)
- `tags`: Array, includes 'moc' for MOC files
- `moc-hue/saturation/lightness`: Color values
- `light-color/dark-color`: Computed theme colors
- `root-moc-color`: Boolean flag for root MOCs

### File Naming Patterns (After Phase 1)
- MOCs: `🎯 [name] MOC.md` (standardized emoji)
- Resources: `📚 [name].md` (merged notes + resources)
- Prompts: `🤖 [name].md` (hub) / `🤖 [name] v[N].md` (iterations)

### File Naming Patterns (Planned Redesign)
- MOCs: `🎯 [name] MOC.md` (standardized emoji)
- Resources: `📚 [name].md` (merges notes + resources)
- Prompts: `🤖 [name] v[N].md` (no separate hub file)

### Folder Structure (After Phase 1)
```
🎯 [MOC Name] MOC/
├── 🎯 [MOC Name] MOC.md
├── 📚 [Resource Name].md
├── 📚 [Another Resource].md
├── 🤖 [Prompt Name].md (hub - temporary)
├── 🤖 [Prompt Name] v1.md
└── 🤖 [Prompt Name] v2 - description.md
```
Note: Flat structure implemented, no subfolders

### Folder Structure (Planned Redesign)
```
[emoji] [MOC Name] MOC/
├── 🎯 [MOC Name] MOC.md
├── 📚 Quick Notes.md (default resource)
├── 📚 [Resource Name].md
├── 🤖 General Questions v1.md (default prompt)
├── 🤖 [Prompt Name] v1.md
└── 🤖 [Prompt Name] v2 - description.md
```
Note: Flat structure, no subfolders, prompt hubs eliminated

## Technical Context

### Plugin Architecture
- Uses Obsidian's Plugin API with TypeScript
- Event-driven with modal-based UI
- Debounced style updates for performance
- Comprehensive error handling with custom error classes
- Phase 1 complete: Flat folder structure, merged note types

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
- ⏳ Phase 2: Modal fatigue from 11 different modals
- ⏳ Phase 2: Workflow rigidity requiring too many clicks
- ⏳ Phase 3: Prompt hub pattern adds unnecessary complexity

See PLUGIN_REDESIGN_PLAN.md for implementation progress.

## Temporary Workarounds
None currently in place.