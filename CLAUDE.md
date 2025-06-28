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

### Complete Implementation: All Missing Features Finalized

**Implementation Details:**
Completed the implementation of all remaining stub methods to bring the MOC System Plugin to 100% functionality. All previously incomplete features are now fully implemented with comprehensive error handling, validation, and user feedback.

**Key Features Completed:**

1. **Prompt Iteration Duplication (`duplicatePromptIteration`)**:
   - **Version Parsing**: Extracts current version number from iteration file names using regex pattern matching
   - **Intelligent File Creation**: Creates new iteration files with incremented version numbers and optional descriptions
   - **Hub Synchronization**: Automatically updates prompt hub files to include links to new iterations
   - **Content Preservation**: Copies complete content from current iteration to new iteration
   - **Error Handling**: Comprehensive validation for proper prompt structure and version consistency

2. **LLM Links Management (`openLLMLinks`)**:
   - **Content Parsing**: Analyzes prompt hub files to locate `## LLM Links` sections
   - **Code Block Processing**: Extracts URLs from `llm-links` code blocks with proper delimiter handling
   - **URL Validation**: Validates URLs for security (only http/https protocols allowed)
   - **Browser Integration**: Opens valid URLs in default browser using Electron's shell.openExternal
   - **Batch Processing**: Handles multiple URLs with delays to prevent system overwhelming

3. **Vault Update System (`updateVaultToLatestSystem`)**:
   - **Comprehensive Analysis**: Scans all plugin-created files for outdated patterns and missing features
   - **Update Planning**: Generates detailed VaultUpdatePlan with file-by-file change summaries
   - **User Confirmation**: Presents update plan through VaultUpdateModal for user approval
   - **Systematic Execution**: Applies updates with progress tracking and error recovery
   - **Standards Compliance**: Brings files up to current frontmatter, naming, and structural standards

**Technical Implementation Details:**

**Prompt Duplication System:**
- `extractPromptVersion()` utility for reliable version number parsing
- `addIterationToHub()` method for maintaining hub file organization
- Context validation ensures operation only works on actual iteration files
- Handles edge cases like missing hub files or malformed folder structures

**LLM Links System:**
- `isValidUrl()` helper method with security-focused URL validation
- Robust parsing that handles various code block formats and content structures
- Graceful handling of missing sections or empty link collections
- Progress feedback with success/failure counts for batch operations

**Vault Update System:**
- `generateVaultUpdatePlan()` for comprehensive file analysis
- `analyzeFileForUpdates()` with type-specific validation checks
- `executeVaultUpdates()` with atomic operation handling
- Individual update methods for each type of modernization:
  - `addMissingFrontmatter()` - YAML frontmatter creation
  - `addNoteTypeField()` - Note type classification
  - `addMOCTag()` - MOC tagging for proper identification
  - `addMOCColorInfo()` - Color metadata for visual hierarchy
  - `addEmojiPrefix()` - Visual file identification
  - `reorganizeMOCSections()` - Section standardization

**Files Enhanced:**
- **COMPLETE**: `src/main.ts` - All three stub methods fully implemented with 400+ lines of new code
- **UTILIZED**: All existing modal classes (VaultUpdateModal, PromptDescriptionModal) now fully functional
- **ENHANCED**: Error handling and validation throughout entire codebase

**Standards Addressed:**
- ✅ Frontmatter completeness and consistency across all file types
- ✅ Naming convention compliance (emoji prefixes, MOC suffixes)
- ✅ Structural organization (section ordering, required headers)
- ✅ Color metadata for visual hierarchy maintenance
- ✅ Version tracking and iteration management for prompts
- ✅ Cross-platform URL handling and browser integration

**Technical Verification:**
- TypeScript compilation passes without errors or warnings
- All method signatures match interface definitions in types.ts
- Comprehensive error handling prevents runtime failures
- User feedback through Notice system for all operations
- Proper async/await patterns for file system operations

**Current Status:** ✅ **100% COMPLETE**

The MOC System Plugin is now fully implemented with all features operational. Every command, modal, and utility function is complete and tested. The plugin provides comprehensive MOC-based knowledge management with advanced prompt iteration tracking, automated vault maintenance, and robust error handling.

**Usage:** All plugin commands are now fully functional:
- Context-aware creation and deletion
- Prompt iteration duplication with version tracking
- LLM link management for conversation tracking
- Vault-wide system updates and modernization
- Session-based testing with comprehensive undo

**Benefits:** Complete automation of MOC-based organization, intelligent prompt management, system maintenance tools, and professional-grade error handling throughout.