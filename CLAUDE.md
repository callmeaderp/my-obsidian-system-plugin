# MOC System Plugin - Claude Memory

## Project Overview
This is an Obsidian plugin that implements a hierarchical Map of Contents (MOC) system for note organization. The plugin is currently stable and fully functional.

## Current State
- **Status**: Production-ready, undergoing redesign to reduce friction
- **Last major refactor**: Comprehensive code cleanup completed
- **Active development**: Major redesign planned - see PLUGIN_REDESIGN_PLAN.md
- **Known issues**: Modal fatigue and workflow rigidity (being addressed in redesign)

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
- `createMOC()` - src/main.ts:382 - Creates root MOCs with folder structure
- `createSubMOC()` - src/main.ts:417 - Creates sub-MOCs under parents
- `ensureMOCFolderStructure()` - src/main.ts:622 - Creates Notes/Resources/Prompts folders

### File Creation
- `createFile()` - src/main.ts:440 - Unified factory for all file types
- `createNote/Resource/Prompt()` - src/main.ts:424-435 - Type-specific helpers
- `createPromptWithIterations()` - src/main.ts:498 - Creates prompt hub + v1 iteration

### MOC Management
- `addToMOCSection()` - src/main.ts:779 - Adds links to MOC sections
- `reorganizeContentForPluginSections()` - src/main.ts:850 - Maintains section order
- `moveRootMOCToSub()` - src/main.ts:1123 - Converts root to sub-MOC
- `promoteSubMOCToRoot()` - src/main.ts:1149 - Converts sub-MOC to root

### Prompt Features
- `duplicatePromptIteration()` - src/main.ts:916 - Creates new prompt versions
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
- `note-type`: 'moc' | 'note' | 'resource' | 'prompt'
- `tags`: Array, includes 'moc' for MOC files
- `moc-hue/saturation/lightness`: Color values
- `light-color/dark-color`: Computed theme colors
- `root-moc-color`: Boolean flag for root MOCs

### File Naming Patterns (Current)
- MOCs: `[emoji] [name] MOC.md`
- Notes: `📝 [name].md`
- Resources: `📁 [name].md`
- Prompts: `🤖 [name].md` (hub) / `🤖 [name] v[N].md` (iterations)

### File Naming Patterns (Planned Redesign)
- MOCs: `🎯 [name] MOC.md` (standardized emoji)
- Resources: `📚 [name].md` (merges notes + resources)
- Prompts: `🤖 [name] v[N].md` (no separate hub file)

### Folder Structure (Current)
```
[emoji] [MOC Name] MOC/
├── [emoji] [MOC Name] MOC.md
├── Notes/
├── Resources/
└── Prompts/
    ├── 🤖 [Prompt Name].md (hub)
    └── [Prompt Name]/
        ├── 🤖 [Prompt Name] v1.md
        └── 🤖 [Prompt Name] v2 - description.md
```

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

### Dependencies
- Obsidian API only, no external dependencies
- Uses Electron's shell API for opening URLs

### Key Design Decisions
- Emojis as visual identifiers for instant recognition
- HSL color generation for theme compatibility
- Frontmatter-based metadata for flexibility
- Section ordering enforced for consistency
- Atomic file operations with rollback capability

## Environment Requirements
- Obsidian 0.15.0 or higher
- styles.css file in plugin directory for base styles
- No other special requirements

## Current Issues
- Modal fatigue from 11 different modals
- Workflow rigidity requiring too many clicks
- Artificial distinctions between notes and resources
- Prompt hub pattern adds unnecessary complexity
- Subfolder structure creates barriers to content

See PLUGIN_REDESIGN_PLAN.md for detailed solutions.

## Temporary Workarounds
None currently in place.