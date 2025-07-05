# Phase 2 Testing Plan - Quick Commands

## Overview
This document outlines the test scenarios for the Phase 2 quick commands implementation.

## Quick Create Command (Cmd+Shift+M)

### Test Cases:
1. **Basic MOC Creation**
   - Press Cmd+Shift+M
   - Enter MOC name "Test Project"
   - Verify: 
     - MOC folder created: "🎯 Test Project MOC"
     - MOC file created: "🎯 Test Project MOC.md"
     - Default content created:
       - "📚 Quick Notes.md"
       - "🤖 General Questions.md" (hub)
       - "🤖 General Questions v1.md" (iteration)

2. **Cancel Creation**
   - Press Cmd+Shift+M
   - Click Cancel or press Escape
   - Verify: No files created

3. **Empty Name Handling**
   - Press Cmd+Shift+M
   - Leave name empty and press Enter
   - Verify: Modal remains open, no error

## Quick Add Command (Cmd+M)

### Test Cases:
1. **Add Resource in MOC Context**
   - Open a MOC file
   - Press Cmd+M
   - Enter "Meeting Notes"
   - Verify: "📚 Meeting Notes.md" created in MOC folder

2. **Add Resource with Emoji Prefix**
   - In MOC context, press Cmd+M
   - Enter "📚 Research Document"
   - Verify: "📚 Research Document.md" created (emoji not duplicated)

3. **Add Prompt in MOC Context**
   - In MOC context, press Cmd+M
   - Enter "🤖 API Design"
   - Verify: 
     - "🤖 API Design.md" (hub) created
     - "🤖 API Design v1.md" created

4. **No MOC Context**
   - Open a file outside any MOC
   - Press Cmd+M
   - Verify: Notice displayed about not being in MOC context

5. **Child File Context**
   - Open a resource/prompt inside a MOC
   - Press Cmd+M
   - Enter "New Item"
   - Verify: File created in the parent MOC folder

## Quick Iterate Command (Cmd+I)

### Test Cases:
1. **Basic Iteration**
   - Open "🤖 Some Prompt v1.md"
   - Press Cmd+I
   - Press Enter (no description)
   - Verify: "🤖 Some Prompt v2.md" created with same content

2. **Iteration with Description**
   - Open "🤖 Some Prompt v1.md"
   - Press Cmd+I
   - Enter "Added error handling"
   - Verify: "🤖 Some Prompt v2 - Added error handling.md" created

3. **Non-Prompt File**
   - Open a resource or MOC file
   - Press Cmd+I
   - Verify: Notice displayed that file is not a prompt iteration

4. **Hub Update**
   - After creating iteration
   - Open the prompt hub file
   - Verify: New iteration link added to Iterations section

## Keyboard Shortcuts

### Test Cases:
1. **Verify Shortcuts Registered**
   - Check Settings > Hotkeys
   - Verify shortcuts appear:
     - Quick Create MOC: Cmd+Shift+M
     - Quick Add to MOC: Cmd+M
     - Quick Iterate Prompt: Cmd+I

2. **Shortcut Conflicts**
   - Check for conflicts with existing shortcuts
   - Verify all shortcuts work as expected

## Integration Tests

### Test Cases:
1. **Complete Workflow**
   - Create MOC with Cmd+Shift+M
   - Add resource with Cmd+M
   - Add prompt with Cmd+M (using 🤖 prefix)
   - Open prompt v1 and iterate with Cmd+I
   - Verify entire structure created correctly

2. **Legacy Commands Still Work**
   - Verify old context menu commands still function
   - Verify deprecated modals still open when accessed

## Error Handling

### Test Cases:
1. **Invalid Characters**
   - Try creating items with invalid characters
   - Verify proper sanitization and error messages

2. **Duplicate Names**
   - Try creating items with existing names
   - Verify appropriate handling

3. **File System Errors**
   - Test with read-only folders (if possible)
   - Verify graceful error handling