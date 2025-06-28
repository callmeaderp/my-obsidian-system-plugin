# MOC System Plugin

## Project Purpose/Goal

The MOC (Map of Contents) System Plugin is a comprehensive Obsidian plugin designed to revolutionize knowledge management through automated MOC-based note organization. The plugin implements a hierarchical system where Maps of Content serve as the primary organizational structure, enabling users to manage large knowledge bases with minimal manual maintenance.

The core philosophy centers around context-aware automation - the plugin intelligently adapts its behavior based on the user's current context, reducing cognitive overhead while maintaining strict organizational standards. Whether creating new MOCs, adding content to existing structures, or managing prompt iterations for LLM workflows, the plugin provides a unified interface that scales from simple note-taking to complex knowledge management systems.

Key innovations include dynamic visual hierarchy through unique folder coloring, session-based testing with comprehensive undo functionality, and an integrated prompt management system that tracks iterative conversations with AI models. The plugin is designed for power users who need robust organizational tools without sacrificing ease of use.

## Project Overview

### File Locations and Architecture

#### Core Plugin Files
- **`src/main.ts`** - Main plugin class (`MOCSystemPlugin`) with complete lifecycle management
- **`main.ts`** - Plugin entry point (imports from src/main.ts)
- **`manifest.json`** - Obsidian plugin manifest defining plugin metadata
- **`package.json`** - Node.js package configuration with build scripts and dependencies

#### Type System and Configuration
- **`src/types.ts`** - Comprehensive TypeScript type definitions for all plugin interfaces
- **`src/constants.ts`** - Centralized configuration constants and magic numbers
- **`src/errors.ts`** - Custom error class hierarchy for structured error handling

#### Utility Modules
- **`src/utils/validation.ts`** - Cross-platform file name validation and sanitization
- **`src/utils/helpers.ts`** - General utility functions for colors, emojis, and data manipulation

#### Modal System
- **`src/modals/index.ts`** - Centralized modal exports
- **`src/modals/BaseModal.ts`** - Abstract base class for all plugin modals
- **`src/modals/CreateMOCModal.ts`** - Modal for creating new root MOCs
- **`src/modals/AddToMOCModal.ts`** - Modal for adding content to existing MOCs
- **`src/modals/CreateItemModal.ts`** - Generic item creation modal
- **`src/modals/VaultUpdateModal.ts`** - Vault-wide update system modal
- **`src/modals/PromptDescriptionModal.ts`** - Prompt iteration description modal
- **`src/modals/CleanupConfirmationModal.ts`** - Destructive operation confirmation
- **`src/modals/ReorganizeMOCModal.ts`** - MOC hierarchy reorganization modal
- **`src/modals/CreateParentMOCModal.ts`** - Parent MOC creation modal
- **`src/modals/SelectParentMOCModal.ts`** - Parent MOC selection modal
- **`src/modals/UndoTestChangesModal.ts`** - Session-based change undo modal

#### Styling and Build System
- **`styles.css`** - CSS styling for file explorer enhancements and modal theming
- **`esbuild.config.mjs`** - ESBuild configuration for development and production builds
- **`tsconfig.json`** - TypeScript compiler configuration
- **`version-bump.mjs`** - Version management script
- **`versions.json`** - Version history tracking

### Key Variables and Functions

#### Main Plugin Class (`src/main.ts`)
**Primary Properties:**
- `settings: PluginSettings` - Plugin configuration (currently empty object for future expansion)
- `styleElement: HTMLStyleElement | null` - Dynamic CSS injection for MOC colors
- `sessionStartTime: number` - Session tracking for undo functionality
- `initialFileSet: Set<string>` - Files present at session start for change tracking
- `debouncedStyleUpdate: Function` - Debounced style update to prevent excessive DOM manipulation

**Core Creation Methods:**
- `handleContextCreate()` - Context-aware creation dispatcher (creates MOC or shows add-to-MOC options)
- `createMOC(name: string): Promise<TFile>` - Creates root MOC with complete folder structure
- `createSubMOC(parentMOC: TFile, name: string): Promise<TFile>` - Creates hierarchical sub-MOC
- `createFile(config: CreateConfig): Promise<TFile>` - Unified factory for all file types
- `createNote/Resource/Prompt(parentMOC: TFile, name: string)` - Type-specific creation shortcuts

**Organization and Management:**
- `addToMOCSection(moc: TFile, section: SectionType, newFile: TFile)` - Maintains organized MOC structure
- `reorganizeMOC(moc: TFile)` - Hierarchical MOC reorganization system
- `moveRootMOCToSub/promoteSubMOCToRoot/moveSubMOCToNewParent()` - MOC hierarchy manipulation
- `cleanupBrokenLinks(deletedFile: TFile)` - Automatic link maintenance on file deletion

**Styling System:**
- `updateMOCStyles()` - Dynamic CSS generation for unique MOC folder colors
- `generateMOCColorStyles()` - Creates theme-specific color rules from frontmatter
- `loadBaseCss()` - Loads static CSS foundation

**Utility and Validation:**
- `isMOC/isRootMOC/isPromptIteration/isPromptHub()` - File type detection methods
- `getAllMOCs()` - Vault-wide MOC discovery
- `detectCircularDependency()` - Prevents infinite loops in MOC hierarchies

#### Constants Configuration (`src/constants.ts`)
**Core Configuration Objects:**
- `CONFIG.FOLDERS` - Standard subfolder names (`Notes`, `Resources`, `Prompts`)
- `CONFIG.SECTION_ORDER` - MOC section ordering (`['MOCs', 'Notes', 'Resources', 'Prompts']`)
- `CONFIG.NOTE_TYPES` - Emoji identifiers for each content type
- `CONFIG.EMOJI_RANGES` - Unicode ranges for random emoji generation
- `CONFIG.COLOR` - HSL color generation parameters for optimal visibility
- `CONFIG.STYLE_DELAYS` - Timing for Obsidian initialization sequence
- `CONFIG.VALIDATION` - File name validation rules and forbidden characters

**Theme System:**
- `THEME_CONFIGS` - Light/dark theme opacity configurations
- `CSS_CLASSES` - Centralized CSS class name constants

#### Type Definitions (`src/types.ts`)
**Core Interfaces:**
- `PluginSettings` - Plugin configuration structure (extensible)
- `SectionType` - MOC section types (`'MOCs' | 'Notes' | 'Resources' | 'Prompts'`)
- `NoteType` - File types (`'moc' | 'note' | 'resource' | 'prompt'`)
- `CreateConfig` - File creation configuration with parent MOC and type
- `ColorInfo` - Complete color information for HSL generation and theme variants
- `ValidationResult` - Input validation with sanitization and error messaging

#### Validation Utilities (`src/utils/validation.ts`)
**Core Functions:**
- `validateFileName(name: string, isFolder?: boolean): ValidationResult` - Cross-platform name validation
- `sanitizeInput(input: string, context: string): string` - Input sanitization with context-aware errors
- `ensureMOCSuffix(name: string): string` - Enforces MOC naming conventions
- `extractPromptVersion(basename: string): number | null` - Prompt iteration version parsing

#### Helper Utilities (`src/utils/helpers.ts`)
**Color and Visual Functions:**
- `getRandomEmoji(): string` - Unicode-range emoji generation
- `generateRandomColor(): ColorInfo` - HSL color generation for optimal UI visibility
- `adjustColorOpacity(hslColor: string, opacity: number): string` - HSLA conversion for gradients

**Data and Performance Functions:**
- `getFrontmatterValue<T>(frontmatter: any, key: string, defaultValue: T): T` - Type-safe frontmatter extraction
- `debounce<T>(func: T, wait: number)` - Function execution throttling
- `delay(ms: number): Promise<void>` - Promise-based timing utility

### Dependencies and External Libraries

#### Runtime Dependencies (from `package.json`)
**Core Framework:**
- **`obsidian: latest`** - Primary Obsidian API for vault manipulation, UI components, and lifecycle management

#### Development Dependencies
**TypeScript Ecosystem:**
- **`typescript: 4.7.4`** - TypeScript compiler for type-safe development
- **`@types/node: ^16.11.6`** - Node.js type definitions
- **`tslib: 2.4.0`** - TypeScript runtime library

**Linting and Code Quality:**
- **`@typescript-eslint/eslint-plugin: 5.29.0`** - TypeScript-specific ESLint rules
- **`@typescript-eslint/parser: 5.29.0`** - TypeScript parser for ESLint

**Build System:**
- **`esbuild: 0.17.3`** - Fast JavaScript bundler and minifier
- **`builtin-modules: 3.3.0`** - Node.js built-in module detection for bundling

#### External API Dependencies (bundled as external)
**Obsidian Core APIs:**
- **`obsidian`** - Primary plugin API (App, Plugin, TFile, TFolder, Modal, Notice, etc.)
- **`electron`** - Desktop application framework (for file system operations)

**CodeMirror Integration (for future editor enhancements):**
- **`@codemirror/*`** - Text editor framework components (currently unused but configured)

### Plugin Command System

#### Always-Available Commands
1. **`moc-context-create`** - "Create MOC or add content" - Primary context-aware creation command
2. **`delete-moc-content`** - "Delete MOC content" - Context-aware deletion with multiple selection
3. **`update-vault-system`** - "Update vault to latest system" - Vault-wide modernization tool
4. **`cleanup-moc-system`** - "Cleanup MOC system files" - Removes all plugin-created files
5. **`undo-test-changes`** - "Undo test changes (since session start)" - Session-based safe testing

#### Context-Dependent Commands (conditional visibility)
1. **`reorganize-moc`** - "Reorganize MOC" - Available when active file is a MOC
2. **`duplicate-prompt-iteration`** - "Duplicate prompt iteration" - Available for prompt iteration files
3. **`open-llm-links`** - "Open all LLM links" - Available for prompt hub files

### File Organization System

#### Standard MOC Hierarchy
```
Root MOC Folder/
├── [Emoji] [Name] MOC.md (Main MOC file)
├── Notes/ (Content notes)
├── Resources/ (Reference materials)
├── Prompts/ (LLM prompt management)
└── [Emoji] Sub-MOC/ (Nested MOCs)
    ├── [Emoji] Sub-MOC MOC.md
    ├── Notes/
    ├── Resources/
    └── Prompts/
```

#### Prompt Management Structure
```
Prompts/
├── [🤖] Prompt Name.md (Hub file)
└── Prompt Name/ (Iteration folder)
    ├── [🤖] Prompt Name v1.md
    ├── [🤖] Prompt Name v2.md
    └── ...
```

### Error Handling Architecture

#### Custom Error Hierarchy (`src/errors.ts`)
- **`MOCSystemError`** - Base class for all plugin errors with error codes
- **`ValidationError`** - File name and input validation failures
- **`FileSystemError`** - File operations (create, read, update, delete, rename)
- **`CircularDependencyError`** - MOC hierarchy loop prevention
- **`MOCStructureError`** - Corrupted or missing MOC structure
- **`FrontmatterError`** - Metadata parsing and manipulation issues
- **`StyleError`** - Non-critical appearance-related failures

#### Error Handling Strategy
- **Graceful Degradation:** Style errors don't break functionality
- **User Feedback:** Meaningful error messages through Notice system
- **Debugging Support:** Comprehensive console logging with context
- **Type-Safe Checking:** `isMOCSystemError()` and `isErrorType()` guards

## Latest Change Status

### Successful Implementation: Context-Aware Delete MOC Content Functionality

**Implementation Details:**
Added comprehensive delete/remove functionality to the MOC System Plugin that provides context-aware deletion options with multiple selection capabilities. This feature enhances the plugin's content management capabilities by allowing users to safely and efficiently remove plugin-created content.

**Key Features Implemented:**

1. **Context-Aware Deletion:**
   - **In MOCs**: Shows options to delete sub-MOCs, notes, resources, prompts, and the MOC itself
   - **In Prompt Hubs**: Shows individual iterations and option to delete entire prompt structure
   - **In Plugin Notes**: Shows option to delete the current note with automatic link cleanup

2. **Multiple Selection Interface:**
   - Checkbox-based selection system for bulk operations
   - Grouped display by content type (Sub-MOCs, Notes, Resources, Prompts, Iterations)
   - Select All/Select None controls for efficient bulk selection
   - Real-time selection count display

3. **Safety Features:**
   - Only operates on plugin-created content to prevent accidental user file deletion
   - Context validation ensures command only appears in appropriate locations
   - Clear warnings for destructive operations (MOC deletion, entire prompt deletion)
   - Detailed file listings with paths and descriptions before deletion

4. **User Experience:**
   - Scrollable lists for handling large numbers of items
   - Visual grouping by content category for better organization
   - Clear file path display for identification
   - Progress feedback during deletion operations

5. **Technical Implementation:**
   - **New Modal**: `DeleteMOCContentModal` with comprehensive deletion interface
   - **New Command**: `delete-moc-content` available globally but context-aware
   - **Context Detection**: `isPluginManagedContext()` and `isWithinMOCStructure()` methods
   - **Safe Deletion**: Automatic link cleanup and proper error handling

**Files Created/Modified:**
- **NEW**: `src/modals/DeleteMOCContentModal.ts` - Complete deletion interface with context-aware options
- **MODIFIED**: `src/main.ts` - Added command registration and context detection methods
- **MODIFIED**: `src/modals/index.ts` - Added new modal to exports
- **MODIFIED**: `CLAUDE.md` - Updated command documentation

**Technical Verification:**
- All TypeScript compilation passes without errors
- Context detection properly identifies MOCs, prompt hubs, and plugin-created content
- Multiple selection interface handles edge cases (no items, large lists)
- Deletion operations properly clean up links and update plugin state
- Error handling prevents plugin crashes on deletion failures

**Current Status:** ✅ **COMPLETE AND VERIFIED**

The delete functionality has been successfully implemented with comprehensive safety measures and user-friendly interface. Users can now bind the `delete-moc-content` command to a keyboard shortcut and efficiently manage their MOC system content with context-aware deletion options.

**Usage:** Bind the "Delete MOC content" command to a key combination, then use it while in any MOC, prompt hub, or plugin-created note to see relevant deletion options.
**Next Steps:** Plugin is ready for production use with the new deletion functionality integrated seamlessly into the existing architecture.