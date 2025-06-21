# MOC System Plugin

## Overview
Custom Obsidian plugin for automating a MOC (Map of Content) based note-taking system with context-aware commands and hierarchical organization.

## Goals
- **Single-command note creation** - Context-aware creation based on current location
- **Dynamic content organization** - MOCs show only populated sections
- **Efficient prompt management** - LLM prompt versioning and multi-chat links
- **Automated maintenance** - Auto-cleanup and folder structure management

## Project Structure

### Core Files
- **`main.ts`** - Full implementation (~1540 lines) with comprehensive documentation
- **`styles.css`** - Visual styling for MOC folders in file explorer
- **`manifest.json`** - Plugin metadata and compatibility
- **`package.json`** - Dependencies and build scripts
- **Other**: TypeScript config, build config, documentation files

## System Design

### Hierarchical File Structure
Each MOC has its own folder containing the MOC file and subfolders for Notes/, Resources/, and Prompts/. Sub-MOCs nest within parent folders.

### Visual System
- **MOCs**: Random Unicode emoji prefix with color-coded folder styling
- **Notes**: 📝 prefix
- **Resources**: 📁 prefix
- **Prompts**: 🤖 prefix

All files use `note-type` frontmatter for identification.

#### File Explorer Color Coding
- **Root MOC folders**: Blue/purple gradient background with blue left border
- **Sub-MOC folders**: Green gradient background with green left border
- **Plugin subfolders** (Notes/Resources/Prompts): Subtle colored borders
- **Dark theme support**: Automatically adjusted opacity and colors

### Configuration
- **Plugin ID**: `moc-system-plugin`
- **Min Obsidian Version**: 0.15.0
- **Build Scripts**: `npm run dev` (watch mode), `npm run build` (production)
- **Key Dependencies**: TypeScript 4.7.4, esbuild 0.17.3, Obsidian API

### MOC Structure
MOCs use `#moc` frontmatter tag and display only populated sections in order: MOCs → Notes → Resources → Prompts.

### Prompt System
- **Hierarchical Structure**: Each prompt gets its own dedicated subfolder within MOC/Prompts/
- **Hub**: Main prompt note with iteration links and `llm-links` code block
- **Iterations**: Versioned files (v1, v2, etc.) with optional descriptions, all contained within the prompt's subfolder
- **Structure**: `MOC/Prompts/PromptName/🤖 PromptName.md` (hub) and `🤖 PromptName v1.md` (iterations)

## Features

### Commands (Full Feature Set)
1. **Create MOC or add content** - Context-aware creation with optional prompt creation (root MOC vs sub-items)
2. **Reorganize MOC** - Move MOCs between root/sub levels and different parents
3. **Duplicate prompt iteration** - Version control for prompt iterations with hierarchical subfolder support
4. **Open all LLM links** - Batch open URLs from prompt hub
5. **Update vault to latest system** - Automated modernization of existing files
6. **Cleanup MOC system files** - Safe removal of plugin-created files

### Core Systems
- **Random Generation**: Random Unicode emojis for MOCs
- **Type Identification**: Fixed emoji prefixes for each file type
- **Visual Enhancement**: CSS-based color coding for MOC folders in file explorer
- **Modal System**: Multiple specialized modals for different operations
- **Hierarchical Organization**: Each MOC gets its own folder with subfolders; prompts get dedicated subfolders
- **Enhanced MOC Creation**: Integrated workflow for creating MOCs with optional prompts
- **Reorganization Engine**: Full MOC hierarchy management with circular dependency detection
- **Vault Modernization**: Automated updates for legacy file structures

## Command Reference

### Primary Commands (6)
- `moc-context-create` - Context-aware creation
- `reorganize-moc` - Move/promote/demote MOCs
- `duplicate-prompt-iteration` - Version prompts
- `open-llm-links` - Open prompt URLs
- `update-vault-system` - Modernize vault files
- `cleanup-moc-system` - Remove plugin files

## Key Constants
- **Folders**: MOCs, Notes, Resources, Prompts
- **Section Order**: MOCs → Notes → Resources → Prompts
- **Note Types**: Each type has fixed emoji prefix
- **Unicode Ranges**: 6 blocks for random emoji selection

## Implementation Details

### Core Architecture

The plugin extends Obsidian's Plugin class with these key components:

```typescript
export default class MOCSystemPlugin extends Plugin {
    // Main plugin class
}
```

### Key Methods (Full Implementation)

#### Core Creation Methods
- `handleContextCreate()`: Main entry point for context-aware creation
- `createMOC()`: Creates root MOC with folder structure and random emoji
- `createSubMOC()`: Creates sub-MOC within parent folder
- `createNote()`: Creates note in MOC's Notes subfolder
- `createResource()`: Creates resource in MOC's Resources subfolder
- `createPrompt()`: Creates prompt hub and first iteration in dedicated subfolder
- `ensureMOCFolderStructure()`: Creates complete folder hierarchy

#### MOC Section Management
- `addToMOCSection()`: Adds links to appropriate MOC sections
- `reorganizeContentForPluginSections()`: Reorders MOC content sections
- `findSectionEnd()`: Locates section boundaries in markdown

#### Prompt Management
- `duplicatePromptIteration()`: Creates new versioned iteration in prompt's subfolder
- `updatePromptHub()`: Updates hub with new iteration links (works with subfolder structure)
- `openLLMLinks()`: Opens all URLs from llm-links code blocks

#### MOC Reorganization System
- `reorganizeMOC()`: Initiates reorganization workflow
- `moveRootMOCToSub()`: Converts root MOC to sub-MOC
- `promoteSubMOCToRoot()`: Promotes sub-MOC to root level
- `moveSubMOCToNewParent()`: Moves sub-MOC between parents
- `removeFromParentMOCs()`: Removes MOC links from parent files
- `detectCircularDependency()`: Prevents invalid MOC relationships

#### Vault Update & Maintenance
- `updateVaultToLatestSystem()`: Initiates vault modernization
- `analyzeVaultForUpdates()`: Scans vault for needed updates
- `detectRequiredUpdates()`: Identifies specific file updates needed
- `executeUpdatePlan()`: Applies all planned updates
- `updateFile()`: Applies specific updates to individual files
- `migrateToHierarchicalStructure()`: Moves files to new structure
- `updateFileName()`: Adds required prefixes/suffixes
- `cleanupMOCSystem()`: Removes all plugin files
- `cleanupBrokenLinks()`: Removes broken links after file deletion

#### Helper & Utility Methods
- `isMOC()`: Checks for MOC frontmatter tag
- `isRootMOC()`: Determines if MOC is at root level
- `isPromptIteration()`: Identifies versioned prompt files
- `isPromptHub()`: Identifies non-versioned prompt files
- `needsFolderMigration()`: Checks if file needs structure update
- `detectFileType()`: Determines file type from path/name
- `getAllMOCs()`: Returns all MOC files in vault
- `loadStyles()`: Loads and injects CSS for visual enhancements
- `removeStyles()`: Removes injected CSS on plugin unload

### Random Generation System
- `getRandomEmoji()`: Selects from 4 Unicode emoji ranges

### Modal System

The plugin uses multiple specialized modal classes:

#### VaultUpdateModal (lines 1028-1077)
- **Purpose**: Displays vault update plan and confirms execution
- **Features**: Update summary, file list, confirmation workflow

#### CreateMOCModal (lines 1453-1545)
- **Purpose**: Creates new root MOCs with optional prompt creation
- **Features**: MOC name input, checkbox for prompt creation, optional prompt name input with smart defaults

#### AddToMOCModal (lines 1108-1141)
- **Purpose**: Context-aware content addition to existing MOCs
- **Features**: Button-based selection of content type (Sub-MOC, Note, Resource, Prompt)

#### CreateItemModal (lines 1143-1174)
- **Purpose**: Generic item creation with name input
- **Features**: Customizable for different item types

#### PromptDescriptionModal (lines 1176-1210)
- **Purpose**: Optional description input for prompt iterations
- **Features**: Skip option, Enter key support

#### CleanupConfirmationModal (lines 1212-1244)
- **Purpose**: Confirms deletion of all plugin files
- **Features**: File list display, safety warnings

#### ReorganizeMOCModal (lines 1246-1297)
- **Purpose**: MOC reorganization options based on context
- **Features**: Different options for root vs sub-MOCs

#### CreateParentMOCModal (lines 1299-1334)
- **Purpose**: Creates new parent MOC for reorganization
- **Features**: Name input with action confirmation

#### SelectParentMOCModal (lines 1336-1372)
- **Purpose**: Selects existing parent for MOC reorganization
- **Features**: Scrollable list, circular dependency prevention

## Technical Decisions (Full Implementation)

1. **Comprehensive feature set**: ~1540 lines with complete functionality
2. **Multiple specialized modals**: Different modals for each operation type
3. **Context-aware interfaces**: Smart modal selection based on current state
4. **Visual enhancement system**: CSS-based file explorer styling with automatic loading/unloading
5. **Enhanced prompt organization**: Hierarchical subfolder structure for better prompt management
6. **Integrated MOC creation workflow**: Optional prompt creation during MOC creation
7. **Full reorganization system**: Complete MOC hierarchy management
8. **Vault modernization**: Automated updates for legacy structures
9. **Circular dependency detection**: Prevents invalid MOC relationships
10. **Event-driven cleanup**: Automatic broken link removal on file deletion
11. **Complete command set**: All creation, organization, and maintenance features

## Current Status

**Full-Featured Implementation** - Complete system with all advanced features:
- Context-aware creation (root MOC, sub-MOC, note, resource, prompt)
- Enhanced MOC creation with optional prompt integration
- Hierarchical folder structure (each MOC has own folder; prompts get dedicated subfolders)
- Visual color-coding system for MOC folders in file explorer
- Random emojis for all MOCs
- Prompt iteration duplication with hierarchical subfolder support
- LLM links batch opening
- MOC reorganization system (promote/demote, move between parents)
- Vault update system (automatic modernization of existing files)
- System cleanup (delete all plugin files)
- Circular dependency detection
- Broken link cleanup on file deletion

**Architecture**: Full-featured implementation (~1540 lines) with comprehensive modal system, visual enhancements, reorganization capabilities, and vault maintenance tools.

## History

### Key Milestones

1. **Initial Implementation** - Core plugin with all basic features

2. **Documentation Enhancement** - Complete CLAUDE.md overhaul with technical details

3. **Vault Update System** - Automated modernization tool for entire vaults

4. **MOC Reorganization** - Flexible hierarchy management with automatic updates

5. **Bug Fixes** - Frontmatter corruption, broken links resolved

6. **Hierarchical Folder Structure** - Major architectural change where each MOC gets its own folder with subfolders, providing better organization and scalability

7. **Lean Rewrite** - Massive code reduction from ~2800 lines to ~220 lines, removing legacy systems, complex modals, reorganization features, and vault update system while retaining all core functionality

8. **Full Implementation Restore** - Reverted to complete feature set with all advanced capabilities restored

9. **Color System Removal & Documentation Update** - Removed all color/styling functionality and added comprehensive code documentation

### Latest Major Change
**Enhanced User Experience Update (2025-06-21)**: Added three major improvements to enhance the MOC system workflow (~1540 lines):

1. **MOC Creation with Optional Prompt**: Enhanced the CreateMOCModal to include a checkbox for creating a prompt alongside the MOC. The prompt name intelligently defaults to the MOC name (without "MOC" suffix) if not specified, streamlining the creation workflow.

2. **Visual File Explorer Enhancement**: Implemented comprehensive CSS-based color coding system for MOC folders in the file explorer. Root MOCs get blue/purple styling, sub-MOCs get green styling, and plugin subfolders have subtle colored borders. Includes full dark theme support with automatic style loading/unloading.

3. **Hierarchical Prompt Organization**: Redesigned the prompt system so each prompt gets its own dedicated subfolder within the Prompts folder. Structure changed from flat `MOC/Prompts/files` to hierarchical `MOC/Prompts/PromptName/files`, providing better organization and preventing naming conflicts between different prompts and their iterations.

## Running Issue Log

### Duplicate Prompt Iteration Command (2025-06-18)
**Issue**: "Duplicate Prompt Iteration" hotkey stopped working after hierarchical folder structure implementation.
**Root Cause**: `isPromptIteration()` and `isPromptHub()` methods were still using old flat folder logic, checking if file paths started with "Prompts" folder.
**Fix**: Updated both methods to check if the file's parent folder name equals "Prompts" instead of checking the full path. This correctly identifies prompt files within the hierarchical structure where prompts are in nested folders like `MOCName/Prompts/...`.
**Resolution**: Changed from `file.path.startsWith(FOLDERS.Prompts)` to `file.parent?.name === FOLDERS.Prompts` in both methods.

### ESLint Code Quality Issues (2025-06-19)
**Issue**: Multiple ESLint errors in main.ts causing potential runtime issues and code quality problems.
**Root Cause**: Accumulation of 17 different ESLint violations including unused variables, unsafe non-null assertions, mixed indentation, and other code quality issues.
**Fix**: Comprehensive cleanup of all ESLint errors:
- Removed unused imports (`MarkdownView`) and variables (`currentVersion`, `mocFolder`, `originalMocPath`, `noteType`, `fileRenamed`)
- Changed empty interface to type alias (`interface PluginSettings {}` → `type PluginSettings = Record<string, never>`)
- Fixed mixed spaces/tabs indentation inconsistencies
- Changed `let` to `const` for variables that are never reassigned
- Added Unicode flag to regex pattern for proper emoji handling
- Replaced unsafe non-null assertions with proper null checks
**Resolution**: All 17 ESLint errors resolved, improving code stability and maintainability.

### Lean Rewrite Implementation (2025-06-19)
**Issue**: Plugin had grown to ~2800 lines with extensive legacy support, complex modal systems, and features that were rarely used.
**Decision**: Major code reduction focusing on core workflow only.
**Implementation**: Complete rewrite reducing codebase to ~220 lines:
- Removed all legacy compatibility systems (hash-based colors, old folder structures)
- Eliminated complex modal chains in favor of single InputModal
- Removed MOC reorganization features (moving between root/sub levels)
- Removed vault update system (automatic modernization)
- Removed event handling for UI updates and styling
- Kept only essential commands: context creation, prompt iteration, LLM links, cleanup
- Simplified all creation methods to use direct input parsing ("note Name", "prompt Helper", "sub Project")
**Result**: Dramatically cleaner codebase focused purely on the core MOC workflow, easier maintenance, and faster performance.

### Unused styles.css File Cleanup (2025-06-19)
**Issue**: Discovered leftover styles.css file in project directory that wasn't being used by the plugin.
**Root Cause**: File remained from earlier debugging/development phase but wasn't referenced or needed in the lean rewrite implementation.
**Fix**: Removed unused styles.css file and updated CLAUDE.md to reflect removal from Core Files section.
**Resolution**: File deleted and documentation updated to maintain accurate project structure documentation.

### Color System Removal & Code Documentation (2025-06-21)
**Issue**: Color/styling system didn't work as intended and needed removal. Code lacked comprehensive documentation per new coding standards.
**Root Cause**: Color styling system was partially implemented but non-functional. Code was written before documentation standards were established.
**Fix**: Complete removal of all color-related code and comprehensive documentation update:
- Removed `generateRandomColor()` method entirely
- Removed color properties from MOC frontmatter (root-moc-color, light-color, dark-color)
- Removed color-related update logic in vault modernization
- Removed CSS class references from NOTE_TYPES (kept emoji only)
- Added detailed JSDoc comments to all functions explaining purpose, parameters, and behavior
- Added class-level documentation for the main plugin class and all modal classes
- Added section headers with explanatory comments throughout the codebase
**Resolution**: Plugin now has clean, well-documented code without non-functional color system. All functions have comprehensive comments explaining their purpose and implementation details.