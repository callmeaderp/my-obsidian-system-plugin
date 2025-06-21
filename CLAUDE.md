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
- **`main.ts`** - Lean implementation (~220 lines) with core features only
- **`manifest.json`** - Plugin metadata and compatibility
- **`package.json`** - Dependencies and build scripts
- **Other**: TypeScript config, build config, documentation files

## System Design

### Hierarchical File Structure
Each MOC has its own folder containing the MOC file and subfolders for Notes/, Resources/, and Prompts/. Sub-MOCs nest within parent folders.

### Visual System
- **MOCs**: Random Unicode emoji prefix
- **Notes**: 📝 prefix
- **Resources**: 📁 prefix
- **Prompts**: 🤖 prefix

All files use `note-type` frontmatter for identification. Colors are stored in frontmatter but not actively styled.

### Configuration
- **Plugin ID**: `moc-system-plugin`
- **Min Obsidian Version**: 0.15.0
- **Build Scripts**: `npm run dev` (watch mode), `npm run build` (production)
- **Key Dependencies**: TypeScript 4.7.4, esbuild 0.17.3, Obsidian API

### MOC Structure
MOCs use `#moc` frontmatter tag and display only populated sections in order: MOCs → Notes → Resources → Prompts.

### Prompt System
- **Hub**: Main prompt note with iteration links and `llm-links` code block
- **Iterations**: Versioned files (v1, v2, etc.) with optional descriptions

## Features

### Commands (Full Feature Set)
1. **Create MOC or add content** - Context-aware creation (root MOC vs sub-items)
2. **Reorganize MOC** - Move MOCs between root/sub levels and different parents
3. **Duplicate prompt iteration** - Version control for prompt iterations  
4. **Open all LLM links** - Batch open URLs from prompt hub
5. **Update vault to latest system** - Automated modernization of existing files
6. **Cleanup MOC system files** - Safe removal of plugin-created files

### Core Systems
- **Random Generation**: Random Unicode emojis and RGB colors for MOCs
- **Type Identification**: Fixed emoji prefixes for each file type
- **Modal System**: Multiple specialized modals for different operations
- **Hierarchical Organization**: Each MOC gets its own folder with subfolders
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
- `createMOC()`: Creates root MOC with folder structure and random properties
- `createSubMOC()`: Creates sub-MOC within parent folder
- `createNote()`: Creates note in MOC's Notes subfolder
- `createResource()`: Creates resource in MOC's Resources subfolder
- `createPrompt()`: Creates prompt hub and first iteration
- `ensureMOCFolderStructure()`: Creates complete folder hierarchy

#### MOC Section Management
- `addToMOCSection()`: Adds links to appropriate MOC sections
- `reorganizeContentForPluginSections()`: Reorders MOC content sections
- `findSectionEnd()`: Locates section boundaries in markdown

#### Prompt Management
- `duplicatePromptIteration()`: Creates new versioned iteration
- `updatePromptHub()`: Updates hub with new iteration links
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

### Random Generation System
- `generateRandomColor()`: Creates RGB color with light/dark variants
- `getRandomEmoji()`: Selects from 4 Unicode emoji ranges

### Modal System

The plugin uses multiple specialized modal classes:

#### VaultUpdateModal (lines 1028-1077)
- **Purpose**: Displays vault update plan and confirms execution
- **Features**: Update summary, file list, confirmation workflow

#### CreateMOCModal (lines 1079-1106)
- **Purpose**: Creates new root MOCs
- **Features**: Simple text input with validation

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

1. **Comprehensive feature set**: ~1370 lines with complete functionality
2. **Multiple specialized modals**: Different modals for each operation type
3. **Context-aware interfaces**: Smart modal selection based on current state
4. **Full reorganization system**: Complete MOC hierarchy management
5. **Vault modernization**: Automated updates for legacy structures
6. **Circular dependency detection**: Prevents invalid MOC relationships
7. **Event-driven cleanup**: Automatic broken link removal on file deletion
8. **Complete command set**: All creation, organization, and maintenance features

## Current Status

**Full-Featured Implementation** - Complete system with all advanced features:
- Context-aware creation (root MOC, sub-MOC, note, resource, prompt)
- Hierarchical folder structure (each MOC has own folder)
- Unlimited random colors/emojis for all MOCs
- Prompt iteration duplication with hub auto-update
- LLM links batch opening
- MOC reorganization system (promote/demote, move between parents)
- Vault update system (automatic modernization of existing files)
- System cleanup (delete all plugin files)
- Circular dependency detection
- Broken link cleanup on file deletion

**Architecture**: Full-featured implementation (~1370 lines) with comprehensive modal system, reorganization capabilities, and vault maintenance tools.

## History

### Key Milestones

1. **Initial Implementation** - Core plugin with all basic features

2. **Unlimited Random Color System** - Full RGB spectrum for MOCs instead of 9 predefined colors

3. **Tab Styling Fix** - Fixed random colors not appearing in tab titles

4. **Documentation Enhancement** - Complete CLAUDE.md overhaul with technical details

5. **Vault Update System** - Automated modernization tool for entire vaults

6. **MOC Reorganization** - Flexible hierarchy management with automatic updates

7. **Bug Fixes** - Frontmatter corruption, broken links, CSS conflicts resolved

8. **File Explorer Fix** - Random colors now display correctly in sidebar

9. **Hierarchical Folder Structure** - Major architectural change where each MOC gets its own folder with subfolders, providing better organization and scalability

10. **Lean Rewrite** - Massive code reduction from ~2800 lines to ~220 lines, removing legacy systems, complex modals, reorganization features, and vault update system while retaining all core functionality

11. **Full Implementation Restore** - Reverted to complete feature set with all advanced capabilities restored

### Latest Major Change
**Full Implementation Restore (2025-06-21)**: Restored the complete feature set with all advanced capabilities (~1370 lines). Includes full MOC reorganization system, comprehensive vault update capabilities, multiple specialized modals, circular dependency detection, and complete maintenance tools. Plugin now provides the full workflow: context-aware creation, complete reorganization system, prompt iteration management, vault modernization, LLM link handling, and comprehensive cleanup.

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