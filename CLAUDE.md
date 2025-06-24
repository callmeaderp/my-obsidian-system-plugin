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
- **`main.ts`** - Refactored implementation (~1,300 lines) with optimized architecture and comprehensive documentation
- **`styles.css`** - Base styling for MOC folders in file explorer with dynamic color system
- **`manifest.json`** - Plugin metadata and compatibility
- **`package.json`** - Dependencies and build scripts
- **Other**: TypeScript config, build config, documentation files

## System Design

### Hierarchical File Structure
Each MOC has its own folder containing the MOC file and subfolders for Notes/, Resources/, and Prompts/. Sub-MOCs nest within parent folders.

### Visual System
- **MOCs**: Random Unicode emoji prefix with unique color-coded folder styling
- **Notes**: 📝 prefix
- **Resources**: 📁 prefix
- **Prompts**: 🤖 prefix

All files use `note-type` frontmatter for identification.

#### File Explorer Color Coding
- **Each MOC folder**: Gets a unique HSL color stored in frontmatter (moc-hue, moc-saturation, moc-lightness)
- **Dynamic CSS**: Individual color rules generated for each MOC folder path
- **Theme variants**: Separate light-color and dark-color values for optimal theme compatibility
- **Plugin subfolders** (Notes/Resources/Prompts): Subtle colored borders for organization
- **Automatic updates**: Colors regenerate when MOCs are moved or reorganized

### Configuration
- **Plugin ID**: `moc-system-plugin`
- **Min Obsidian Version**: 0.15.0
- **Build Scripts**: `npm run dev` (watch mode), `npm run build` (production)
- **Key Dependencies**: TypeScript 4.7.4, esbuild 0.17.3, Obsidian API

### MOC Structure
MOCs use `#moc` frontmatter tag and display only populated sections in order: MOCs → Notes → Resources → Prompts.

### Prompt System
- **Hierarchical Structure**: Each prompt has a hub in the MOC's Prompts folder and iterations organized in a dedicated subfolder
- **Hub**: Main prompt note located directly in `MOC/Prompts/` with iteration links and `llm-links` code block
- **Iterations**: Versioned files (v1, v2, etc.) with optional descriptions, organized in a dedicated subfolder named after the prompt
- **Structure**: `MOC/Prompts/🤖 PromptName.md` (hub) and `MOC/Prompts/PromptName/🤖 PromptName v1.md` (iterations)

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

The plugin extends Obsidian's Plugin class with a refactored, modular architecture:

```typescript
export default class MOCSystemPlugin extends Plugin {
    // Refactored main plugin class with:
    // - Unified file creation system
    // - Centralized configuration (CONFIG object)
    // - BaseModal class hierarchy
    // - Streamlined utility methods
}
```

### Refactoring Improvements (2024)

**Code Consolidation**:
- **Unified File Creation**: Single `createFile()` method replaces 4 separate creation methods
- **BaseModal Class**: Shared modal functionality reduces duplication by 60-70%
- **Centralized Config**: All constants organized in structured `CONFIG` object
- **Streamlined Utilities**: Consolidated helper methods and error handling

**Architecture Benefits**:
- **30-35% code reduction** (from ~1,926 to ~1,300 lines)
- **Improved maintainability** with DRY principles
- **Consistent patterns** throughout codebase
- **Enhanced readability** with simplified method signatures

### Key Methods (Refactored Implementation)

#### Core Creation Methods
- `handleContextCreate()`: Main entry point for context-aware creation
- `createFile()`: **NEW** - Unified file creation factory method with config-driven approach
- `createMOC()`: Creates root MOC with folder structure and random emoji
- `createSubMOC()`: Creates sub-MOC within parent folder (uses unified `createFile()`)
- `createNote()`: Creates note in MOC's Notes subfolder (uses unified `createFile()`)
- `createResource()`: Creates resource in MOC's Resources subfolder (uses unified `createFile()`)
- `createPrompt()`: Creates prompt hub and first iteration (uses unified `createFile()`)
- `ensureMOCFolderStructure()`: Creates complete folder hierarchy
- **Helper Methods**: `buildFileName()`, `buildFrontmatter()`, `colorToFrontmatter()`, `createFileWithContent()`

#### MOC Section Management
- `addToMOCSection()`: Adds links to appropriate MOC sections
- `reorganizeContentForPluginSections()`: Reorders MOC content sections
- `findSectionEnd()`: Locates section boundaries in markdown

#### Prompt Management
- `duplicatePromptIteration()`: Creates new versioned iteration in prompt's subfolder
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
- `migratePromptHub()`: Moves prompt hubs from subfolders to Prompts folder
- `needsPromptHubMigration()`: Detects prompt hubs needing migration to new structure
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
- `updateMOCStyles()`: Updates dynamic CSS with individual MOC colors
- `generateMOCColorStyles()`: Creates CSS rules for each MOC folder
- `generateRandomColor()`: Generates unique HSL colors with theme variants
- `adjustColorOpacity()`: Modifies HSL colors for different opacities

### Random Generation System
- `getRandomEmoji()`: Selects from 4 Unicode emoji ranges

### Modal System (Refactored)

The plugin uses a hierarchical modal system with shared base class:

#### BaseModal (NEW)
- **Purpose**: Shared functionality for all modals
- **Features**: 
  - Standardized button creation with automatic close handling
  - Consistent input creation with focus management
  - Enter key event handling for multiple inputs
  - Common cleanup methods

#### Specialized Modal Classes (Refactored)
All modal classes now extend `BaseModal` and use shared methods:

- **VaultUpdateModal**: Displays vault update plan and confirms execution
- **CreateMOCModal**: Creates new root MOCs with optional prompt creation  
- **AddToMOCModal**: Context-aware content addition to existing MOCs
- **CreateItemModal**: Generic item creation with name input
- **PromptDescriptionModal**: Optional description input for prompt iterations
- **CleanupConfirmationModal**: Confirms deletion of all plugin files
- **ReorganizeMOCModal**: MOC reorganization options based on context
- **SelectParentMOCModal**: Selects existing parent for MOC reorganization

**Benefits**: 60-70% reduction in modal code duplication, consistent UX patterns

## Technical Decisions (Refactored Implementation)

### Current Architecture (2024)
1. **Refactored codebase**: ~1,300 lines with 30-35% reduction while maintaining full functionality
2. **Unified creation system**: Single factory method with config-driven approach
3. **BaseModal hierarchy**: Shared modal functionality with consistent patterns
4. **Centralized configuration**: Structured CONFIG object for all constants and settings
5. **Streamlined utilities**: Consolidated helper methods and error handling
6. **Enhanced maintainability**: DRY principles and consistent code patterns

### Core Features (Maintained)
7. **Dynamic color system**: Individual HSL color assignment for each MOC with CSS generation
8. **Enhanced prompt organization**: Hierarchical subfolder structure for better prompt management
9. **Integrated MOC creation workflow**: Optional prompt creation during MOC creation
10. **Full reorganization system**: Complete MOC hierarchy management
11. **Vault modernization**: Automated updates for legacy structures
12. **Circular dependency detection**: Prevents invalid MOC relationships
13. **Event-driven cleanup**: Automatic broken link removal on file deletion
14. **Complete command set**: All creation, organization, and maintenance features

## System Capabilities

**Core Features**:
- Context-aware creation (root MOC, sub-MOC, note, resource, prompt)
- Enhanced MOC creation with optional prompt integration
- Hierarchical folder structure (each MOC has own folder; prompts get dedicated subfolders)
- Unique color system for each MOC folder with dynamic CSS generation
- Random emojis for all MOCs
- Prompt iteration duplication with hierarchical subfolder support
- LLM links batch opening
- MOC reorganization system (promote/demote, move between parents)
- Vault update system (automatic modernization of existing files)
- System cleanup (delete all plugin files)
- Circular dependency detection
- Broken link cleanup on file deletion

## Development Notes

**Architecture**: Refactored full-featured implementation with optimized modal system, centralized configuration, unified creation patterns, and comprehensive maintenance tools.

**Code Quality**: 
- **Refactored 2024**: 30-35% code reduction with improved maintainability
- **TypeScript standards** with comprehensive JSDoc documentation throughout
- **DRY principles** applied with shared base classes and utility methods
- **Consistent patterns** across all plugin components

**Key Capabilities**:
- **Unified file creation system** with config-driven factory method
- **BaseModal hierarchy** with shared functionality and consistent UX
- **Centralized CONFIG object** for all constants and settings
- **Dynamic color system** with unique HSL colors for each MOC folder
- **Complete hierarchical folder structure** with automated management
- **Vault modernization system** for updating legacy structures
- **Full reorganization features** (promote/demote MOCs, move between parents)
- **Prompt iteration system** with hub-based organization
- **Circular dependency detection** and prevention
- **Automated cleanup and maintenance tools**