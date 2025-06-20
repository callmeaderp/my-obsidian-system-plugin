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

### Commands (Lean Core Set)
1. **Create MOC or add content** - Context-aware creation (root MOC vs sub-items)
2. **Duplicate prompt iteration** - Version control for prompt iterations  
3. **Open all LLM links** - Batch open URLs from prompt hub
4. **Cleanup MOC system files** - Safe removal of plugin-created files

### Core Systems
- **Random Generation**: Random Unicode emojis for MOCs
- **Type Identification**: Fixed emoji prefixes for each file type
- **Single Input Modal**: Unified creation interface with input parsing
- **Hierarchical Organization**: Each MOC gets its own folder with subfolders

## Command Reference

### Primary Commands (4)
- `moc-context-create` - Context-aware creation
- `duplicate-prompt-iteration` - Version prompts
- `open-llm-links` - Open prompt URLs
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

### Key Methods (Lean Implementation)

#### Core Methods
- `contextCreate()`: Single entry point that determines context and shows appropriate input modal
- `createRootMOC()`: Creates top-level MOC with folder structure and random emoji
- `createSubMOC()`: Creates sub-MOC within parent folder with input parsing
- `createTyped()`: Generic creation for notes, resources, and prompts based on type
- `addToSection()`: Adds links to appropriate MOC sections with auto-creation

#### Prompt Methods
- `duplicateIteration()`: Creates new version with incremented number
- `openLLMLinks()`: Extracts and opens all URLs from llm-links block
- `isPromptIteration()`: Checks if file is a versioned prompt
- `isPromptHub()`: Checks if file is a prompt hub (non-versioned)

#### Utilities
- `cleanup()`: Deletes all plugin files based on note-type metadata
- `isMOC()`: Checks for #moc tag in frontmatter
- `withActive()`: Helper for command callbacks with active file
- `ensureFolder()`: Creates folder if it doesn't exist
- `sectionEnd()`: Finds where a section ends in the file

#### Input System
- **Single Modal**: All creation uses one `InputModal` class
- **Input Parsing**: "note Name", "resource Spec", "prompt AI", "sub Project"
- **Context Aware**: Different behavior based on active file (MOC vs non-MOC)
- **Validation**: Basic trim and empty checks

### Random Generation
- `randomRGB()`: Generates random color with hex and light variants
- `randomEmoji()`: Picks from 6 Unicode blocks for variety

### Modal Dialog

The plugin uses a single modal class:

#### InputModal (lines 79-95)
- **Purpose**: Generic text input for all creation operations
- **Features**: Dynamic title/placeholder, Enter key support, validation
- **Usage**: Used for MOC names and parsed input ("note X", "sub Y", etc.)

## Technical Decisions (Lean Rewrite)

1. **Extreme minimalism**: ~220 lines total, no unnecessary features
2. **Single modal design**: One InputModal class handles all user input
3. **Input parsing**: Commands determined by parsing text ("note X", "sub Y")
4. **No visual styling**: Colors stored but not rendered (future-ready)
5. **No settings**: Zero configuration, works out of the box
6. **No reorganization**: Simplified to creation-only workflow
7. **No vault updates**: Users manage their own migrations
8. **Essential commands only**: Create, duplicate, open links, cleanup

## Current Status

**Lean Core Implementation** - Streamlined to essential features:
- Context-aware creation (root MOC, sub-MOC, note, resource, prompt)
- Hierarchical folder structure (each MOC has own folder)
- Unlimited random colors/emojis for all MOCs
- Prompt iteration duplication with hub auto-update
- LLM links batch opening
- System cleanup (delete all plugin files)

**Key Achievement**: Major code reduction from ~2800 lines to ~220 lines while retaining all core functionality. Removed legacy systems, complex modals, reorganization features, and vault update system to focus on essential workflow.

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

### Latest Major Change
**Lean Rewrite (2025-06-19)**: Complete code streamlining that reduced the plugin from ~2800 lines to ~220 lines. Removed all legacy compatibility code, complex modal systems, MOC reorganization features, and vault update systems. Retained only the essential workflow: context-aware creation, prompt iteration management, LLM link handling, and cleanup. Plugin now uses a single streamlined modal for all input and focuses purely on the core MOC workflow.

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