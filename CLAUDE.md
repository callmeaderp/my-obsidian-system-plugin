# MOC System Plugin

## Overview

This is a custom Obsidian plugin designed to automate and streamline a MOC (Map of Content) based note-taking system. The plugin focuses on efficiency by providing context-aware commands and automatic organization of notes into a hierarchical structure.

## Goals

The primary goal of this plugin is to automate the user's MOC-based system for organizing notes in Obsidian, with these specific objectives:

1. **Single-command note creation** - One keyboard shortcut handles all note creation needs based on context
2. **Dynamic content organization** - MOCs only show sections that contain content, maintaining clean and minimal structure
3. **Efficient prompt management** - Specialized system for managing LLM prompts with versioning and multi-chat link support
4. **Automated maintenance** - Auto-cleanup of broken links and automatic folder structure creation

## System Design

### File Organization Structure

- **Top-level MOCs**: Created in vault root directory with random colored emoji prefix and "MOC" suffix
- **Sub-MOCs**: Stored in `MOCs/` folder with 🔵 emoji prefix and "MOC" suffix
- **Notes**: Stored in `Notes/` folder with 📝 emoji prefix  
- **Resources**: Stored in `Resources/` folder with 📁 emoji prefix
- **Prompts**: Stored in `Prompts/` folder with 🤖 emoji prefix (includes both hubs and iterations)

All files include frontmatter with `note-type` metadata for CSS targeting and backwards compatibility.

### MOC Structure

MOCs are identified by the `#moc` tag in their frontmatter. They start empty and dynamically display only the sections that contain content, in this fixed order:

1. MOCs (sub-MOCs)
2. Notes
3. Resources  
4. Prompts

### Prompt System

The prompt system is designed for iterative LLM conversations:

- **Prompt Hub**: Main note for a prompt topic (e.g., `AI Assistant.md`)
  - Contains links to all iterations
  - Includes `llm-links` code block for storing chat URLs
- **Iterations**: Individual versions (e.g., `AI Assistant v1.md`, `AI Assistant v2 - Added error handling.md`)
  - Can be duplicated from any version
  - Automatically increments to next available version number
  - Optional description can be added to title

## Features

### 1. Context-Aware Creation Command
**Command**: "Create MOC or add content"

- When not in a MOC: Creates a new top-level MOC
- When in a MOC: Shows modal with options to create:
  - Sub-MOC
  - Note
  - Resource
  - Prompt

### 2. Prompt Iteration Duplication
**Command**: "Duplicate prompt iteration"

- Works when viewing any prompt iteration file
- Creates copy with next version number
- Shows modal for optional description
- Updates the prompt hub automatically

### 3. Multi-Link Opening
**Command**: "Open all LLM links"

- Works when viewing a prompt hub
- Parses `llm-links` code block
- Opens all URLs in new browser tabs

### 4. Note Type Styling System
**New Feature**: Visual distinction for note types

- **Emoji Prefixes**: All created notes include type-specific emojis:
  - Root MOCs: Completely random emoji from entire Unicode ranges (unlimited variety)
  - Sub-MOCs: 🔵 (Blue circle)
  - Notes: 📝 (Memo emoji)
  - Resources: 📁 (Folder emoji)  
  - Prompts: 🤖 (Robot emoji)

- **CSS Color Coding**: Unique colors for each note type:
  - Root MOCs: Completely random RGB colors (unlimited variety) with bold styling
  - Sub-MOCs: Blue (#2563eb) with bold styling
  - Notes: Green (#16a34a)
  - Resources: Orange (#ea580c)
  - Prompt Hubs: Dark Purple (#9333ea) with bold styling
  - Prompt Iterations: Light Purple (#c084fc) with italic styling

- **Comprehensive Styling**: Applies to:
  - File explorer entries
  - Tab titles (all tabs, not just active)
  - Active file indicators
  - Graph view nodes with size differentiation
  - Both light and dark themes

### 5. System Cleanup Command
**Command**: "Cleanup MOC system files"

- Safely removes all files created by the plugin
- Identifies plugin files via `note-type` frontmatter metadata
- Shows confirmation modal with file list and count
- Preserves plugin folders (MOCs/, Notes/, Resources/, Prompts/) for reuse
- Preserves all pre-existing files without plugin metadata

### 6. Unlimited Random System for Root MOCs
**Latest Feature**: Truly unlimited visual customization for root-level MOCs

- **Unlimited Random Emojis**: Selects from entire Unicode emoji ranges (thousands of possibilities)
  - Covers 6 major emoji blocks: Emoticons, Symbols, Transport, Supplemental, Miscellaneous, Dingbats
  - Complete randomness with no predefined lists or restrictions
- **Unlimited Random Colors**: Pure RGB color generation (#000000 to #ffffff)
  - Every MOC gets a completely unique random color
  - Automatic light/dark theme variants for optimal contrast
  - No duplicate prevention - infinite variety
- **Dynamic CSS System**: Each unique color gets its own CSS rules injected dynamically
- **Enhanced Storage**: Colors stored in frontmatter with light/dark variants
- **Full Backward Compatibility**: Legacy emoji-based and named color systems still supported
- **Complete Visual Coverage**: Random colors apply to file explorer, tabs, active file indicators, and graph view

### 7. Automatic Features

- **Folder Structure**: Creates required folders on plugin load
- **Section Management**: Intelligently reorganizes MOC content to keep plugin sections at the top
- **Content Preservation**: Moves user content above plugin sections to below them while preserving all content
- **Link Cleanup**: Removes broken links when files are deleted
- **Dynamic Styling**: Updates CSS classes based on active file and file types

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
- `createMOC()`: Creates top-level MOC with unlimited random emoji and RGB color, "MOC" suffix, frontmatter tags, and note-type metadata
- `createSubMOC()`: Creates MOC in MOCs/ folder with blue emoji prefix, "MOC" suffix, and links from parent
- `createNote()`: Creates note in Notes/ folder with emoji prefix and links from parent MOC
- `createResource()`: Creates resource in Resources/ folder with emoji prefix and links from parent
- `createPrompt()`: Creates prompt hub and iteration with emoji prefixes, metadata, and LLM links block

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

#### Maintenance
- `cleanupBrokenLinks()`: Removes references to deleted files and cleans up orphaned blank lines
- `cleanupOrphanedBlankLines()`: Helper method to remove blank lines left after link deletion in plugin sections
- `ensureFolderStructure()`: Creates required folders if missing
- `cleanupMOCSystem()`: Removes all plugin-created files based on note-type metadata
- `cleanupEmptyPluginFolders()`: Removes empty plugin folders after cleanup

### File Detection Methods
- `isMOC()`: Checks for `#moc` tag in frontmatter
- `isPromptIteration()`: Detects files with version pattern (v1, v2, etc.)
- `isPromptHub()`: Identifies prompt files that aren't iterations

### Modal Dialogs

The plugin includes several custom modals for user input:

1. **CreateMOCModal**: For creating new top-level MOCs
2. **AddToMOCModal**: Shows options when adding content to existing MOC
3. **CreateItemModal**: Generic input for creating notes/resources/etc.
4. **PromptDescriptionModal**: Optional description when duplicating prompts
5. **CleanupConfirmationModal**: Confirmation dialog for system cleanup with file list

### Event Handling

- Registers file deletion event to trigger automatic link cleanup
- Uses command callbacks to check active file context
- Implements keyboard shortcuts (Enter key) in all modals

## Technical Decisions

1. **Frontend-only approach**: All logic in main.ts, no settings or complex state management
2. **Tag-based MOC identification**: Uses frontmatter tags instead of naming conventions for flexibility
3. **Dynamic sections**: Sections only appear when needed, keeping MOCs clean
4. **Regex-based parsing**: For version detection and link patterns
5. **Batch link opening**: Uses window.open() in a loop for multi-link functionality
6. **Unlimited randomization**: Pure random generation for both emojis and colors with no constraints
7. **Dynamic CSS injection**: Each unique color gets its own CSS rules for optimal performance
8. **Multi-layer compatibility**: Supports unlimited random, legacy hash-based, and emoji-based color systems

## Current Status

The plugin has been fully implemented with all requested features plus recent improvements:
- ✅ Context-aware creation command
- ✅ Prompt iteration system with versioning
- ✅ Multi-link opening for LLM chats
- ✅ Dynamic section management
- ✅ Automatic link cleanup
- ✅ Folder structure creation
- ✅ **NEW**: Emoji-prefixed note titles with type indicators and "MOC" suffix for MOCs
- ✅ **NEW**: Comprehensive CSS styling system with distinct colors for all note types
- ✅ **NEW**: Non-destructive MOC behavior (preserves existing content as "scratch pad")
- ✅ **NEW**: Tab title styling for all tabs (not just active files)
- ✅ **NEW**: Differentiated styling for prompt hubs vs iterations
- ✅ **NEW**: System cleanup command for safe removal of all plugin-created files
- ✅ **NEW**: Robust content reorganization that moves plugin sections to top while preserving user content
- ✅ **NEW**: Enhanced folder preservation during cleanup (folders are kept, only files removed)
- ✅ **FIXED**: Blank line preservation issue - plugin no longer preserves orphaned blank lines from deleted entries
- ✅ **LATEST**: Unlimited random system for root MOCs - truly random emojis and RGB colors with infinite variety
- ✅ **LATEST**: Dynamic CSS injection system for unlimited color customization
- ✅ **LATEST**: Multi-layer backward compatibility supporting all previous color systems
- ✅ **LATEST FIX**: Fixed CSS attribute selector matching issue that was limiting color variety
- ✅ **LATEST**: Enhanced random color generation with cryptographic randomness and better contrast
- ✅ **LATEST FIX**: Fixed tab styling persistence issue - root MOC tabs now maintain colors when inactive
- ✅ **LATEST**: Enhanced event handling and CSS specificity for reliable tab styling across all states
- ✅ **CRITICAL FIX**: Resolved CSS specificity conflict causing blue color override of random colors in tabs
- ✅ **LATEST**: Implemented maximum specificity CSS selectors to ensure random colors override all default styling
- ✅ **FINAL FIX**: Resolved tab file lookup failure preventing random color application
  - Fixed issue where `getAbstractFileByPath()` failed because aria-label contained display names without extensions
  - Implemented basename search fallback to properly match tab aria-labels to actual files  
  - Tab styling system now fully operational for both active and inactive tabs

The plugin has been built and tested successfully with all features implemented and working. The unlimited random color system now provides truly infinite color variety for root MOCs, with persistent styling across all UI elements. **The tab styling system is now fully functional** - random colors display correctly for both active and inactive root MOC tabs, resolving the final issue where colors worked in the sidebar but not in tabs.

## History

### Session 2 - Tab Styling Debug and Fix
**Issue**: Random colors were working in file explorer sidebar but not applying to tab titles, with tabs appearing blue instead of their assigned random colors.

**Investigation Process**:
1. Added comprehensive debugging throughout the tab styling system to trace execution
2. Discovered that file lookup was failing for every tab (`getAbstractFileByPath()` returning null)
3. Root cause identified: aria-label attributes contained display names like "🚕 testing one! MOC" but `getAbstractFileByPath()` needed full paths with extensions like "🚕 testing one! MOC.md"

**Solution Implemented**:
- Modified `updateTabStyling()` method (lines 922-930) to implement basename search fallback
- When exact path lookup fails, now searches through all markdown files to find matches by basename
- This allows proper file identification and color application to tabs

**Result**: Tab styling system now fully functional with random colors displaying correctly for both active and inactive root MOC tabs.

### Session 1 - Initial Implementation
*Initial implementation completed with all core features and unlimited random color system*