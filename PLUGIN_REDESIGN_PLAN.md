# MOC System Plugin - Redesign Plan

## Overview
This document outlines the planned redesign of the MOC System Plugin to eliminate friction and create a more natural, fluid workflow. The core philosophy shifts from "system that manages everything" to "assistant that enhances natural workflow."

## Core Philosophy Change
- **From**: Modal-based system that enforces rigid structure
- **To**: Invisible assistant that enhances natural Obsidian workflow
- **Key Principle**: Make the right thing the easy thing

## Major Structural Changes

### 1. Consolidate Note Types
**Current**: Three types (Notes, Resources, Prompts) with separate folders
**New**: Two types only
- 📚 Resources (merges Notes + Resources)
- 🤖 Prompts (with iterations)

**Rationale**: Artificial distinction between notes/resources creates unnecessary cognitive load

### 2. Flatten Folder Structure
**Current**: 
```
MOC/
├── Notes/
├── Resources/
└── Prompts/
```

**New**:
```
MOC/
├── 🎯 MOC Name.md
├── 📚 Resource 1.md
├── 📚 Resource 2.md
├── 🤖 Prompt Name v1.md
└── 🤖 Prompt Name v2.md
```

**Rationale**: Subfolders create barriers to content access

### 3. Remove Prompt Hub Pattern
**Current**: Separate hub file that links to iterations
**New**: 
- Iterations listed directly in MOC under Prompts section
- Shared LLM links stored in frontmatter (synced across iterations)
- Use `prompt-group` field to link iterations

**Example MOC Structure**:
```markdown
## Prompts
- 🤖 API Design
  - [[🤖 API Design v1]]
  - [[🤖 API Design v2 - Added error handling]]
- 🤖 Caching Strategy
  - [[🤖 Caching Strategy v1]]
```

### 4. Default Content in MOCs
**Current**: Empty folders created with MOC
**New**: Auto-create starter content:
- 📚 Quick Notes.md (default resource)
- 🤖 General Questions v1.md (default prompt)

**Rationale**: Empty structures are useless; starter content enables immediate use

## Modal Reduction Strategy

### Current State: 11 Modals
- CreateMOCModal
- AddToMOCModal
- DeleteMOCContentModal
- VaultUpdateModal
- ReorganizeMOCModal
- PromptDescriptionModal
- CleanupConfirmationModal
- UndoTestChangesModal
- SelectParentMOCModal
- CreateParentMOCModal
- CreateItemModal

### New State: 3 Core Commands
1. **Quick Create** (Cmd+Shift+M)
   - Creates MOC with default content
   - No modal needed - just prompts for name

2. **Quick Add** (Cmd+M)
   - Context-aware addition to current MOC
   - Falls back to quick switcher if not in MOC

3. **Quick Iterate** (Cmd+I)
   - Duplicates current prompt as new version
   - Optional inline description prompt

## Technical Implementation Changes

### Frontmatter Simplification
**New prompt frontmatter**:
```yaml
---
note-type: prompt
prompt-group: "API Design"  # Links iterations
iteration: 2
llm-links: 
  - https://claude.ai/chat/abc
  - https://chatgpt.com/c/def
---
```

### Smart Pattern Recognition
- Detect [[📚 Resource Name]] → Auto-create as resource
- Detect [[🤖 Prompt Name]] → Auto-create as prompt v1
- Context-aware link organization

### Keyboard-First Interaction
- Every action has a keyboard shortcut
- Minimal modal usage (only for complex input)
- Inline completions where possible

## Implementation Order

### Phase 1: Structure Simplification ✅ COMPLETE
- [x] Merge notes/resources into single type
- [x] Remove subfolder creation
- [x] Update file creation logic
- [x] Implement flat folder structure

**Phase 1 Outcomes:**
- Successfully merged Notes and Resources into single 'resource' type
- Removed all subfolder creation logic (Notes/, Resources/, Prompts/)
- Files now created directly in MOC folder (flat structure)
- Standardized MOC emoji to 🎯 for consistency
- Updated all type definitions and file creation logic
- Build passes with no TypeScript errors

### Phase 2: Modal Reduction ✅ COMPLETE
- [x] Implement three core commands
- [x] Add keyboard shortcuts
- [x] Remove unnecessary modals (deprecated 3 modals)
- [x] Add context-aware behaviors

**Phase 2 Outcomes:**
- Implemented Quick Create (Cmd+Shift+M) for instant MOC creation with defaults
- Implemented Quick Add (Cmd+M) for context-aware content addition
- Implemented Quick Iterate (Cmd+I) for streamlined prompt versioning
- Deprecated CreateMOCModal, AddToMOCModal, and CreateItemModal
- Reduced clicks from 5+ to 1-2 for common operations
- All commands have keyboard shortcuts for maximum efficiency

### Phase 3: Prompt System Overhaul ✅ COMPLETE
- [x] Remove hub file pattern
- [x] Implement frontmatter syncing for llm-links
- [x] Add bullet-list prompt display in MOCs
- [x] Update iteration creation logic

**Phase 3 Outcomes:**
- Eliminated prompt hub files - prompts now created as v1 directly
- LLM links stored in frontmatter with automatic syncing across iterations
- Nested bullet list structure in MOCs groups iterations by prompt name
- Quick Iterate (Cmd+I) works seamlessly without hub files
- Open LLM Links command reads from iteration frontmatter
- Backward compatibility maintained during transition

### Phase 4: Polish & Enhancement
- [ ] Auto-create default content with MOCs
- [ ] Smart emoji detection
- [ ] Drag-drop reorganization
- [ ] Performance optimizations

## Success Metrics
- Reduce average clicks per action from 5+ to 1-2
- Eliminate modal fatigue
- Enable natural writing flow with enhancement
- Maintain all core functionality with less friction

## Migration Strategy
- Existing MOCs continue to work
- Gradual migration as users interact with content
- Backward compatibility maintained
- Optional bulk migration command

## Future Considerations
- Voice command integration
- AI-powered organization suggestions
- Template system integration
- Graph view enhancements for MOC relationships