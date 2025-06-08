# MOC System Plugin

An Obsidian plugin that automates MOC (Map of Content) based note organization with context-aware commands and dynamic content management.

## Features

- **Context-aware note creation** - Single command adapts based on current context
- **Dynamic sections** - MOC sections appear only when content is added
- **Prompt versioning** - Manage iterative LLM conversations with hub/iteration structure
- **Multi-link opening** - Open all LLM chat links with one command
- **Auto-maintenance** - Automatic folder creation and broken link cleanup

## Commands

1. **Create MOC or add content** - Main context-aware command
2. **Duplicate prompt iteration** - Create new version of prompt with optional description
3. **Open all LLM links** - Open all links from prompt hub's llm-links block

## Usage

Install the plugin and assign keyboard shortcuts to the commands. The main command will:
- Create a new MOC if not in one
- Show options to add content (Sub-MOC, Note, Resource, Prompt) if in a MOC

## File Structure

```
Vault Root/
├── Top-level MOCs
├── MOCs/          (Sub-MOCs)
├── Notes/         (Content notes)
├── Resources/     (Reference materials)
└── Prompts/       (LLM prompts and iterations)
```