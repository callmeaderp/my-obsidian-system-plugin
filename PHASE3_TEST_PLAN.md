# Phase 3 Test Plan: Prompt System Overhaul

## Overview
Phase 3 eliminates the prompt hub pattern and implements a streamlined prompt iteration system where iterations are managed directly in MOCs using nested bullet lists.

## Key Changes

### 1. Remove Prompt Hub Pattern
**Before:**
```
🎯 Project MOC/
├── 🤖 API Design.md (hub)
├── 🤖 API Design v1.md
└── 🤖 API Design v2 - Added error handling.md
```

**After:**
```
🎯 Project MOC/
├── 🤖 API Design v1.md
└── 🤖 API Design v2 - Added error handling.md
```

### 2. MOC Prompt Section Structure
**Before (links to hub):**
```markdown
## Prompts
- [[🤖 API Design]]
- [[🤖 Caching Strategy]]
```

**After (nested iterations):**
```markdown
## Prompts
- 🤖 API Design
  - [[🤖 API Design v1]]
  - [[🤖 API Design v2 - Added error handling]]
- 🤖 Caching Strategy
  - [[🤖 Caching Strategy v1]]
```

### 3. LLM Links in Frontmatter
**Before (in hub file):**
```markdown
## LLM Links
```llm-links
https://claude.ai/chat/abc
https://chatgpt.com/c/def
```
```

**After (in each iteration's frontmatter):**
```yaml
---
note-type: prompt
prompt-group: "API Design"
iteration: 2
llm-links:
  - https://claude.ai/chat/abc
  - https://chatgpt.com/c/def
---
```

## Implementation Steps

### Step 1: Update Create Prompt Logic
- [ ] Modify `createPrompt()` to create `v1` directly (no hub)
- [ ] Add prompt-group, iteration, and llm-links to frontmatter
- [ ] Update MOC to add prompt group with first iteration

### Step 2: Update Quick Iterate Logic
- [ ] Modify `quickIterate()` to work without hub files
- [ ] Extract prompt-group from current iteration
- [ ] Sync llm-links from current iteration to new iteration
- [ ] Update MOC to add new iteration under prompt group

### Step 3: Update Duplicate Iteration Logic
- [ ] Modify `duplicatePromptIteration()` to work without hub
- [ ] Use prompt-group to find related iterations
- [ ] Sync llm-links across iterations

### Step 4: Update Open LLM Links
- [ ] Change from hub-based to iteration-based
- [ ] Read llm-links from frontmatter instead of content

### Step 5: Update MOC Section Management
- [ ] Implement nested bullet list for prompts
- [ ] Group iterations by prompt-group
- [ ] Maintain alphabetical order of groups

## Test Scenarios

### 1. Create New Prompt
- Run Quick Create (Cmd+Shift+M) to create MOC
- Run Quick Add (Cmd+M) with "🤖 Test Prompt"
- Verify:
  - Creates "🤖 Test Prompt v1.md" (no hub)
  - Adds to MOC under Prompts section
  - Includes proper frontmatter

### 2. Quick Iterate Existing Prompt
- Open "🤖 Test Prompt v1.md"
- Run Quick Iterate (Cmd+I)
- Add description "improved version"
- Verify:
  - Creates "🤖 Test Prompt v2 - improved version.md"
  - Syncs llm-links from v1
  - Updates MOC with nested structure

### 3. Add LLM Links
- Add URLs to llm-links frontmatter in v1
- Create v2 using Quick Iterate
- Verify llm-links are synced to v2

### 4. Open LLM Links
- Add multiple URLs to llm-links
- Run "Open all LLM links" command
- Verify all URLs open in browser

### 5. Multiple Prompt Groups
- Create multiple prompts in same MOC
- Verify MOC shows:
  ```markdown
  ## Prompts
  - 🤖 API Design
    - [[🤖 API Design v1]]
    - [[🤖 API Design v2]]
  - 🤖 Database Schema
    - [[🤖 Database Schema v1]]
  ```

### 6. Migration Compatibility
- Test with existing vaults that have hub files
- Ensure backward compatibility during transition

## Success Criteria
- [ ] No prompt hub files are created
- [ ] Iterations are grouped in MOC by prompt name
- [ ] LLM links sync across iterations
- [ ] All prompt commands work without hubs
- [ ] Existing functionality is preserved
- [ ] Clean, intuitive prompt organization

## Rollback Plan
If issues arise:
1. Git revert to Phase 2 complete commit
2. Document specific issues encountered
3. Revise approach based on findings