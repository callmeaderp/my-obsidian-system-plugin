# MOC System Plugin - Comprehensive Testing Guide

This document provides a complete testing plan for all plugin features, ordered logically for debugging. Follow each section in order to ensure proper functionality.

## Prerequisites

1. **Enable the Plugin**
   - Open Obsidian Settings → Community Plugins
   - Ensure "MOC System" is enabled
   - Check that the plugin loads without errors

2. **Verify Initial Setup**
   - Open Developer Console (Ctrl/Cmd + Shift + I)
   - Check for any error messages on plugin load
   - Verify styles.css exists in plugin directory

## Phase 1: Core MOC Structure Testing

### 1.1 Create Root MOC
**Test:** Quick Create MOC (Cmd/Ctrl + Shift + M)
- [ ] Press hotkey in any context
- [ ] Type "Test Project" when prompted
- [ ] Verify creates: `🎯 Test Project MOC/🎯 Test Project MOC.md`
- [ ] Check file contains:
  - Default sections (Resources, Prompts, Sub-MOCs)
  - Proper frontmatter with `note-type: moc`
  - Random color values in frontmatter
- [ ] Verify folder has color styling in file explorer

### 1.2 Create Sub-MOC
**Test:** Create Sub-MOC under parent
- [ ] Open the `🎯 Test Project MOC.md` file
- [ ] Run Quick Create MOC (Cmd/Ctrl + Shift + M)
- [ ] Type "Feature A" when prompted
- [ ] Verify creates: `🎯 Test Project MOC/🎯 Feature A MOC.md`
- [ ] Verify parent MOC updated with link in Sub-MOCs section
- [ ] Check sub-MOC has proper structure and frontmatter

### 1.3 Folder Color Styling
**Test:** Dynamic CSS generation
- [ ] Create 3-4 MOCs with Quick Create
- [ ] Check each folder has unique color in file explorer
- [ ] Switch between light and dark themes
- [ ] Verify colors adapt appropriately to theme

## Phase 2: Quick Commands Testing

### 2.1 Quick Add Resource
**Test:** Add resource to MOC (Cmd/Ctrl + M)
- [ ] Create a new note anywhere: "Test Resource.md"
- [ ] With cursor in the file, press Cmd/Ctrl + M
- [ ] Select "Resource" from dropdown
- [ ] Select "Test Project" MOC
- [ ] Verify:
  - File moved to `🎯 Test Project MOC/📚 Test Resource.md`
  - Link added to Resources section of MOC
  - Smart emoji detection works (file renamed with 📚)

### 2.2 Quick Add Prompt
**Test:** Add prompt to MOC
- [ ] Create a new note: "API Design.md"
- [ ] Press Cmd/Ctrl + M
- [ ] Select "Prompt" from dropdown
- [ ] Select "Test Project" MOC
- [ ] Verify:
  - File moved to `🎯 Test Project MOC/🤖 API Design v1.md`
  - Link added to Prompts section with proper nesting
  - Frontmatter includes `prompt-group` and `iteration: 1`

### 2.3 Context-Aware Quick Add
**Test:** Quick Add from within MOC folder
- [ ] Navigate to `🎯 Test Project MOC` folder
- [ ] Create new file: "Database Schema.md"
- [ ] Press Cmd/Ctrl + M
- [ ] Verify parent MOC is auto-detected (no selection needed)
- [ ] Select "Prompt" type
- [ ] Verify proper file creation and linking

## Phase 3: Prompt Iteration System

### 3.1 Quick Iterate
**Test:** Create prompt iterations (Cmd/Ctrl + I)
- [ ] Open `🤖 API Design v1.md`
- [ ] Press Cmd/Ctrl + I
- [ ] Add description: "Added error handling"
- [ ] Verify creates: `🤖 API Design v2 - Added error handling.md`
- [ ] Check MOC Prompts section shows nested structure:
  ```
  - 🤖 API Design
    - [[🤖 API Design v1]]
    - [[🤖 API Design v2 - Added error handling]]
  ```

### 3.2 LLM Links Management
**Test:** Open LLM Links command
- [ ] Add some URLs to a prompt's frontmatter `llm-links` field
- [ ] Run "Open LLM Links" command
- [ ] Verify all URLs open in browser
- [ ] Test with empty/missing llm-links field (should show notice)

### 3.3 Prompt Group Integrity
**Test:** Multiple iterations maintain grouping
- [ ] Create 3-4 iterations of same prompt
- [ ] Verify all have same `prompt-group` in frontmatter
- [ ] Check MOC maintains proper nested structure
- [ ] Delete middle iteration, verify structure updates correctly

## Phase 4: Smart Features & Performance

### 4.1 Smart Emoji Detection
**Test:** Automatic file type detection
- [ ] Create files with emojis already in name:
  - `📚 Existing Resource.md`
  - `🤖 Existing Prompt.md`
- [ ] Use Quick Add on each
- [ ] Verify plugin detects type without asking
- [ ] Check files aren't double-emoji'd

### 4.2 Default Content Creation
**Test:** MOCs have immediate utility
- [ ] Create new MOC with Quick Create
- [ ] Verify default sections are present and properly formatted
- [ ] Add content to each section
- [ ] Verify section order is maintained during updates

### 4.3 Performance Testing
**Test:** Large-scale operations
- [ ] Create MOC with 50+ items in various sections
- [ ] Add/remove items rapidly
- [ ] Check for UI lag or freezing
- [ ] Monitor console for performance warnings

## Error Handling & Edge Cases

### 5.1 Duplicate Names
**Test:** Handle existing files
- [ ] Try creating MOC with existing name
- [ ] Try adding file that would conflict
- [ ] Verify appropriate error messages

### 5.2 Broken Links
**Test:** Clean up broken links command
- [ ] Manually delete a linked file
- [ ] Run "Clean up broken links in MOCs"
- [ ] Verify link removed from MOC
- [ ] Check no valid links were removed

### 5.3 Invalid Input
**Test:** Input validation
- [ ] Try creating items with:
  - Empty names
  - Special characters only
  - Very long names (100+ chars)
- [ ] Verify appropriate validation messages

## Vault Management Commands

### 6.1 Reorganize MOC
**Test:** Move MOCs in hierarchy
- [ ] Run "Reorganize MOC" on sub-MOC
- [ ] Try promoting to root
- [ ] Try moving to different parent
- [ ] Verify files move correctly and links update

### 6.2 Undo Test Changes
**Test:** Session cleanup
- [ ] Create several test files in one session
- [ ] Run "Undo test changes"
- [ ] Verify only session files are listed
- [ ] Confirm deletion removes correct files

### 6.3 Update Vault
**Test:** System updates
- [ ] Manually modify a MOC's frontmatter
- [ ] Run "Update vault to latest system"
- [ ] Verify frontmatter corrected
- [ ] Check all MOCs updated consistently

## Keyboard Shortcuts Verification

Run command palette and verify all shortcuts work:
- [ ] Cmd/Ctrl + Shift + M: Quick Create MOC
- [ ] Cmd/Ctrl + M: Quick Add to MOC
- [ ] Cmd/Ctrl + I: Quick Iterate Prompt

## Final Integration Test

### Complete Workflow Test
1. [ ] Create root MOC for "Web App"
2. [ ] Add sub-MOCs for "Frontend" and "Backend"
3. [ ] Add resources to each MOC
4. [ ] Create and iterate prompts in each
5. [ ] Reorganize one sub-MOC to different parent
6. [ ] Clean up broken links
7. [ ] Undo session changes

## Known Issues to Watch For

- Performance with 100+ MOCs
- Theme switching while modals are open
- Concurrent file operations
- Network drives or synced folders

## Debugging Tips

1. **Check Console First**: Most errors will appear in developer console
2. **Verify File Permissions**: Ensure Obsidian can write to vault
3. **Check Frontmatter**: Invalid YAML can cause issues
4. **Disable Other Plugins**: Test in isolation if issues occur
5. **Check styles.css**: Missing styles file causes color issues

## Success Criteria

- [ ] All core commands execute without errors
- [ ] File operations complete successfully
- [ ] UI remains responsive
- [ ] No data loss occurs
- [ ] All features work as documented

---

**Testing Complete**: If all checks pass, the plugin is functioning correctly!