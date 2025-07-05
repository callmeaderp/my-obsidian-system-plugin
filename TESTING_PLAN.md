# MOC System Plugin - Comprehensive Testing Plan

## Overview
This document outlines the testing procedures to verify all functionality after the redesign is complete. Each test should be performed in order, and any failures should be documented.

## Pre-Testing Setup
1. Install the redesigned plugin in a test vault
2. Create a backup of any existing MOC content
3. Ensure console is open to catch any errors
4. Have both light and dark themes ready for testing

## Phase 1: Structure Tests (Flat Folder & Merged Types)

### Test 1.1: Create Root MOC
- [ ] Create new root MOC
- [ ] Verify folder created with 🎯 emoji prefix
- [ ] Verify MOC file created inside folder
- [ ] Verify NO subfolders created (no Notes/, Resources/, Prompts/)
- [ ] Check frontmatter includes proper metadata

### Test 1.2: Create Resources
- [ ] Add resource to MOC
- [ ] Verify file created with 📚 emoji
- [ ] Verify file created directly in MOC folder (not in subfolder)
- [ ] Verify appears under Resources section in MOC

### Test 1.3: Create Prompts
- [ ] Add prompt to MOC
- [ ] Verify hub file created with 🤖 emoji (temporary until Phase 3)
- [ ] Verify v1 iteration created in same folder
- [ ] Verify both files in flat structure

### Test 1.4: Legacy Compatibility
- [ ] Open vault with existing MOCs that have subfolders
- [ ] Verify they still function
- [ ] Test adding new content to old MOCs

## Phase 2: Command & Keyboard Tests

### Test 2.1: Quick Create (Cmd+Shift+M)
- [ ] Test keyboard shortcut
- [ ] Verify creates MOC with minimal interaction
- [ ] Verify default content created

### Test 2.2: Quick Add (Cmd+M)
- [ ] Test within MOC folder
- [ ] Test outside MOC folder (should show switcher)
- [ ] Verify context awareness

### Test 2.3: Quick Iterate (Cmd+I)
- [ ] Test on prompt iteration file
- [ ] Verify creates next version
- [ ] Test with and without description

### Test 2.4: Modal Reduction
- [ ] Verify reduced modal count (3 core commands)
- [ ] Test that removed modals no longer appear
- [ ] Verify streamlined workflow

## Phase 3: Prompt System Tests

### Test 3.1: Hub Removal
- [ ] Create new prompt without hub file
- [ ] Verify iterations listed directly in MOC
- [ ] Test prompt-group frontmatter linking

### Test 3.2: LLM Links
- [ ] Add LLM links to prompt iteration
- [ ] Verify synced across iterations via frontmatter
- [ ] Test opening all links functionality

### Test 3.3: Iteration Display
- [ ] Verify bullet-list format in MOC
- [ ] Test nested display with descriptions
- [ ] Verify proper linking

## Phase 4: Polish & Enhancement Tests

### Test 4.1: Default Content
- [ ] Create new MOC
- [ ] Verify "📚 Quick Notes.md" auto-created
- [ ] Verify "🤖 General Questions v1.md" auto-created
- [ ] Test that defaults are functional

### Test 4.2: Smart Detection
- [ ] Type [[📚 New Resource]]
- [ ] Verify auto-creates as resource on click
- [ ] Type [[🤖 New Prompt]]
- [ ] Verify auto-creates as prompt v1

### Test 4.3: Performance
- [ ] Test with 100+ MOCs
- [ ] Verify style updates are debounced
- [ ] Check for memory leaks
- [ ] Test file operations speed

## Visual & Theme Tests

### Test 5.1: Color System
- [ ] Verify MOC folders have unique colors
- [ ] Test in light theme
- [ ] Test in dark theme
- [ ] Verify colors persist after reload

### Test 5.2: File Explorer
- [ ] Verify clean visual hierarchy
- [ ] Test emoji visibility
- [ ] Check hover states
- [ ] Verify no visual glitches

## Error Handling Tests

### Test 6.1: Invalid Input
- [ ] Test creating files with invalid names
- [ ] Test special characters
- [ ] Test extremely long names
- [ ] Verify appropriate error messages

### Test 6.2: Edge Cases
- [ ] Test on mobile devices
- [ ] Test with sync conflicts
- [ ] Test with read-only files
- [ ] Test concurrent operations

## Cleanup Tests

### Test 7.1: Undo System
- [ ] Create test content
- [ ] Use undo feature
- [ ] Verify only session content removed

### Test 7.2: System Cleanup
- [ ] Test full cleanup command
- [ ] Verify all plugin content removed
- [ ] Verify user content preserved

## Migration Tests

### Test 8.1: Backward Compatibility
- [ ] Import vault with old structure
- [ ] Verify continues to work
- [ ] Test gradual migration

### Test 8.2: Bulk Migration
- [ ] Test migration command (if implemented)
- [ ] Verify structure converted correctly
- [ ] Check for data loss

## Success Criteria
- All tests pass without errors
- Console shows no warnings
- Performance is smooth
- User workflow feels natural
- Average clicks per action: 1-2 (down from 5+)

## Known Issues to Document
- List any discovered edge cases
- Document any limitations
- Note any backward compatibility issues

## Post-Testing
1. Document any failures with reproduction steps
2. Update README with new usage patterns
3. Create video demo of new workflow
4. Prepare migration guide for users