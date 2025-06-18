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
- **`main.ts`** - Main plugin implementation (all logic, modals, functionality)
- **`styles.css`** - Note type styling and color theming
- **`manifest.json`** - Plugin metadata and compatibility
- **`package.json`** - Dependencies and build scripts
- **Other**: TypeScript config, build config, documentation files

## System Design

### Hierarchical File Structure
Each MOC has its own folder containing the MOC file and subfolders for Notes/, Resources/, and Prompts/. Sub-MOCs nest within parent folders.

### Visual System
- **Root/Sub-MOCs**: Random Unicode emoji + random RGB color
- **Notes**: 📝 prefix, green (#16a34a)
- **Resources**: 📁 prefix, orange (#ea580c)
- **Prompts**: 🤖 prefix, purple (hub: #9333ea, iterations: #c084fc)

All files use `note-type` frontmatter for styling and identification.

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

### Commands
1. **Create MOC or add content** - Context-aware creation (root MOC vs sub-items)
2. **Reorganize MOC** - Move MOCs between root/sub levels with automatic updates
3. **Duplicate prompt iteration** - Version control for prompt iterations
4. **Open all LLM links** - Batch open URLs from prompt hub
5. **Cleanup MOC system files** - Safe removal of plugin-created files
6. **Update vault to latest system** - Modernize vault to latest requirements

### Core Systems
- **Unlimited Random System**: Random Unicode emojis + RGB colors for MOCs
- **Visual Styling**: Type-specific emojis and colors across all UI elements
- **Automatic Maintenance**: Folder creation, section management, link cleanup
- **Hierarchical Organization**: Each MOC gets its own folder with subfolders

## Command Reference

### Primary Commands (6)
- `moc-context-create` - Context-aware creation
- `duplicate-prompt-iteration` - Version prompts
- `reorganize-moc` - Move MOCs in hierarchy
- `open-llm-links` - Open prompt URLs
- `cleanup-moc-system` - Remove plugin files
- `update-vault-system` - Modernize vault

### Development Command
- `test-random-system` - Test color/emoji generation

## Key Constants
- **Folders**: MOCs, Notes, Resources, Prompts
- **Section Order**: MOCs → Notes → Resources → Prompts
- **Note Types**: Each type has emoji and CSS class
- **Unicode Ranges**: 6 blocks for random emoji selection
- **Legacy Support**: Color mappings for backward compatibility

## Implementation Details

### Core Architecture

The plugin extends Obsidian's Plugin class with these key components:

```typescript
export default class MOCSystemPlugin extends Plugin {
    // Main plugin class
}
```

### Key Methods

#### Content Creation Methods
- `createMOC()`: Creates top-level MOC with its own folder structure, unlimited random emoji and RGB color, "MOC" suffix, frontmatter tags, and note-type metadata
- `createSubMOC()`: Creates sub-MOC with its own folder structure within parent MOC folder, random emoji prefix, "MOC" suffix, random colors, and links from parent
- `createNote()`: Creates note in parent MOC's Notes/ subfolder with emoji prefix and links from parent MOC
- `createResource()`: Creates resource in parent MOC's Resources/ subfolder with emoji prefix and links from parent
- `createPrompt()`: Creates prompt hub and iteration in parent MOC's Prompts/ subfolder with emoji prefixes, metadata, and LLM links block
- `ensureMOCFolderStructure()`: Creates complete folder hierarchy for a MOC including Notes/, Resources/, and Prompts/ subfolders

#### Section Management
- `addToMOCSection()`: Intelligently manages MOC sections with content reorganization
  - Reorganizes content to place all plugin sections at the top (after frontmatter)
  - Moves any user content above plugin sections to below them
  - Maintains proper section ordering (MOCs → Notes → Resources → Prompts)
  - Preserves all user content within and below plugin sections
  - Creates sections if they don't exist in proper order
- `reorganizeContentForPluginSections()`: Handles content extraction and reordering
- `findSectionEnd()`: Utility to detect section boundaries

#### Prompt System
- `duplicatePromptIteration()`: 
  - Parses filename to extract base name and version
  - Finds highest existing version number
  - Creates new file with incremented version
  - Updates prompt hub with new iteration link
- `updatePromptHub()`: Adds new iteration links to hub file
- `openLLMLinks()`: Extracts URLs from code block and opens in browser

#### Styling System
- `getNoteType()`: Determines note type from frontmatter metadata
- `getFileDisplayType()`: Differentiates between prompt hubs and iterations for styling
- `updateStylingClasses()`: Updates body classes based on active file for CSS targeting, includes root MOC color classes
- `updateFileExplorerStyling()`: Adds data attributes to file explorer items, including root MOC color attributes
- `updateTabStyling()`: Adds classes and data attributes to tab headers, including root MOC color attributes

#### Unlimited Random System
- `generateRandomColor()`: Creates completely random RGB colors with light/dark variants
- `getRandomEmoji()`: Selects random emoji from entire Unicode emoji ranges
- `getRootMOCColor()`: Returns color configuration for root MOC, supporting both unlimited random and legacy systems
- `injectRandomColorCSS()`: Dynamically injects CSS rules for each unique random color
- `isRootMOC()`: Determines if a MOC is a root-level MOC (not in subfolder)
- `hashString()`: Legacy method for backward compatibility with old hash-based colors

#### MOC Reorganization System (Updated for Hierarchical Structure)
- `reorganizeMOC()`: Entry point that shows context-aware reorganization modal
- `moveRootMOCToSub()`: Moves entire root MOC folder structure under specified parent MOC folder
- `promoteSubMOCToRoot()`: Moves entire sub-MOC folder structure to vault root level
- `moveSubMOCToNewParent()`: Moves complete sub-MOC folder hierarchy between parent MOCs
- `removeFromParentMOCs()`: Removes MOC links from all parent MOCs
- `updateAllReferences()`: Updates all vault-wide references after MOC move
- `updateAllFolderReferences()`: Updates all file references when entire folders are moved
- `getAllMOCs()`: Returns all MOC files in the vault
- `detectCircularDependency()`: Prevents creating circular MOC hierarchies

#### Vault Update System (Updated for Hierarchical Structure)
- `updateVaultToLatestSystem()`: Main entry point for vault updates, orchestrates analysis and execution
- `analyzeVaultForUpdates()`: Scans all files and creates comprehensive update plan
- `detectRequiredUpdates()`: Analyzes individual files to determine what updates are needed, including hierarchical migration
- `executeUpdatePlan()`: Applies all planned updates with progress tracking and error handling
- `updateFile()`: Handles individual file updates with safe file operations
- `addMissingNoteType()`: Adds note-type metadata to frontmatter
- `addRandomColorSystem()`: Injects random color properties to MOC frontmatter
- `migrateToHierarchicalStructure()`: Migrates files from old flat structure to new hierarchical folder system
- `needsFolderMigration()`: Detects files that need migration to hierarchical structure
- `updateFileName()`: Safely renames files with emoji prefixes and suffixes
- `moveFileToCorrectLocation()`: Moves files to appropriate plugin folders
- `updatePromptHubStructure()`: Adds missing Iterations and LLM Links sections

#### Maintenance
- `cleanupBrokenLinks()`: Removes references to deleted files and cleans up orphaned blank lines
- `cleanupOrphanedBlankLines()`: Helper method to remove blank lines left after link deletion in plugin sections
- `ensureFolderStructure()`: Legacy method, no longer used with hierarchical structure
- `ensureMOCFolderStructure()`: Creates complete folder hierarchy for individual MOCs
- `cleanupMOCSystem()`: Removes all plugin-created files based on note-type metadata
- `cleanupEmptyPluginFolders()`: Removes empty plugin folders after cleanup

### File Detection Methods
- `isMOC()`: Checks for `#moc` tag in frontmatter
- `isRootMOC()`: Updated to work with hierarchical structure - determines if MOC folder is at vault root
- `isPromptIteration()`: Detects files with version pattern (v1, v2, etc.)
- `isPromptHub()`: Identifies prompt files that aren't iterations

### Interface Definitions

The plugin includes TypeScript interfaces for the vault update system:

#### UpdateResult Interface (lines 55-60)
- **Purpose**: Track individual file update results
- **Properties**: `file`, `changes`, `success`, `error`
- **Usage**: Return value from `updateFile()` method

#### VaultUpdatePlan Interface (lines 62-66)
- **Purpose**: Structure for vault-wide update planning
- **Properties**: `filesToUpdate`, `updateSummary`, `totalChanges`
- **Usage**: Passed between analysis and execution phases

### Modal Dialogs

The plugin includes several custom modals extending Obsidian's `Modal` class:

#### 1. CreateMOCModal (lines 1268-1304)
- **Purpose**: Create new top-level MOCs
- **Features**: Text input with validation, Enter key support, auto-focus
- **Triggers**: Used when `handleContextCreate()` detects user is outside a MOC

#### 2. AddToMOCModal (lines 1306-1361) 
- **Purpose**: Shows creation options when inside a MOC
- **Features**: Four buttons for different content types (Sub-MOC, Note, Resource, Prompt)
- **Chaining**: Each button opens a `CreateItemModal` for name input

#### 3. CreateItemModal (lines 1363-1403)
- **Purpose**: Generic text input for item creation
- **Features**: Dynamic title based on item type, validation, keyboard shortcuts
- **Usage**: Called from `AddToMOCModal` with appropriate callbacks

#### 4. PromptDescriptionModal (lines 1405-1454)
- **Purpose**: Optional description input when duplicating prompt iterations
- **Features**: Skip option, flexible input (description optional), dual buttons
- **Special**: Allows empty input for version-only duplicates

#### 5. CleanupConfirmationModal (lines 1456-1516)
- **Purpose**: Confirmation dialog for bulk file deletion
- **Features**: File list display, scrollable container, warning styling
- **Safety**: Shows exactly which files will be deleted before action

#### 6. VaultUpdateModal (lines 1638-1721)
- **Purpose**: Preview and confirmation dialog for vault updates
- **Features**: Detailed file-by-file update preview, scrollable update list, styled file groupings
- **Safety**: Shows exactly what changes will be made before execution

#### 7. ReorganizeMOCModal (lines 2180-2283)
- **Purpose**: Context-aware reorganization options for MOCs
- **Features**: Different options for root vs sub-MOCs, circular dependency checking
- **Flow**: Main entry point that leads to other reorganization modals

#### 8. CreateParentMOCModal (lines 2285-2341)
- **Purpose**: Create new parent MOC when moving root MOC to sub-MOC
- **Features**: Text input for parent name, creates parent and moves child in one operation
- **Usage**: Triggered from ReorganizeMOCModal for "Move under new parent" option

#### 9. SelectParentMOCModal (lines 2343-2406)
- **Purpose**: Select existing MOC as parent when reorganizing
- **Features**: Scrollable list of available MOCs, filters out circular dependencies
- **Usage**: Works for both root→sub and sub→sub MOC movements

### Event Handling System

The plugin implements comprehensive event handling for real-time UI updates:

#### File System Events
- **`vault.on('delete')`** (line 117): Auto-cleanup broken links when files are deleted
- **Callback**: `cleanupBrokenLinks()` removes references and orphaned blank lines

#### Workspace Events  
- **`workspace.on('active-leaf-change')`** (line 126): Updates body classes when switching files
- **`workspace.on('file-open')`** (line 150): Triggers tab styling updates
- **`workspace.on('layout-change')`** (line 143): Updates file explorer and tab styling
- **Timing**: All styling updates use `setTimeout()` to ensure DOM is ready

#### MutationObserver for Tab Styling (lines 171-185)
- **Purpose**: Catches tab DOM changes that workspace events might miss
- **Target**: `.mod-root .workspace` container
- **Options**: Monitors `childList`, `subtree`, `attributes`, and `aria-label` changes
- **Cleanup**: Properly disconnected in `onunload()` to prevent memory leaks

#### Modal Keyboard Handling
- **Enter Key**: All modals support Enter key for quick submission
- **Auto-focus**: Input fields automatically receive focus when modals open
- **Validation**: Prevents submission with empty required fields

#### Command Context Checking
- **`checkCallback`**: Used for conditional command availability
- **Context-aware**: Commands only appear when applicable (e.g., prompt commands only in prompt files)
- **Real-time**: Availability updates as user navigates between files

## Technical Decisions

1. **Frontend-only approach**: All logic in main.ts, no settings or complex state management
2. **Tag-based MOC identification**: Uses frontmatter tags instead of naming conventions for flexibility
3. **Dynamic sections**: Sections only appear when needed, keeping MOCs clean
4. **Regex-based parsing**: For version detection and link patterns
5. **Batch link opening**: Uses window.open() in a loop for multi-link functionality
6. **Unlimited randomization**: Pure random generation for both emojis and colors with no constraints
7. **Dynamic CSS injection**: Each unique color gets its own CSS rules for optimal performance
8. **Multi-layer compatibility**: Supports unlimited random, legacy hash-based, and emoji-based color systems
9. **Hierarchical folder structure**: Each MOC gets its own folder for better organization and scalability
10. **Folder-based operations**: All reorganization commands work with complete folder structures
11. **Unified color system**: Both root and sub-MOCs use the same unlimited random color system

## Current Status

**Fully Implemented** - All features complete and tested:
- Hierarchical folder structure (each MOC has own folder)
- Context-aware creation and reorganization
- Unlimited random colors/emojis for all MOCs
- Prompt versioning with LLM link management
- Automatic maintenance and cleanup
- Vault modernization system
- Full backward compatibility

**Key Achievement**: Complete architectural transformation to hierarchical structure with seamless migration support and enhanced visual system.

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

### Latest Major Change
**Hierarchical Folder Structure**: Complete transformation from flat folder system to nested hierarchy where each MOC has its own folder containing Notes/, Resources/, and Prompts/ subfolders. Sub-MOCs nest within parent folders, creating intuitive organization that scales with vault growth.