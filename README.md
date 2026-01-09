# MCP Terminal Manager

A professional Model Context Protocol (MCP) server that provides robust terminal access, session management, and system monitoring capabilities.

## Usage

### Quick Setup

To automatically configure the MCP server for Claude Desktop (supported on Mac, Windows, and compatible Linux setups):

```bash
npx mcp-terminal-manager setup
```

### Run Locally (Development)

You can run the server directly from the source directory:

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npx .
```

### Install from GitHub

```bash
npm install -g git+https://github.com/wh1sky02/mcp-terminal-manager.git
mcp-terminal-manager
```

## Features

- **Full Terminal Access**: Uses `node-pty` to spawn real pseudo-terminals, supporting interactive commands and shell state.
- **Session Management**: maintain multiple independent terminal sessions.
- **Tools**:
  - `create_terminal`: Start a new shell session. Can start as **Root Mode** if `root_password` is provided.
  - `run_command`: Send input to a session (e.g., `ls -la`, `cd project`).
  - `read_output`: Get the output from the session.
  - `list_terminals`: See active sessions.
  - `kill_terminal`: Clean up sessions.
  - `run_root_command`: Execute a single command as root by providing the password (e.g., `sudo`).
  - `read_special_file`: Read content from PDF, Excel (.xlsx), Images (OCR), or text files.
  - `get_system_logs`: Retrieve system logs (like `/var/log/syslog` or `journalctl`).

## Configuration

The server runs on stdio. Configure your MCP client (like Claude or Antigravity) to run `npx mcp-terminal-manager` (or the path to the executable if installed locally).

## Dependencies

- **node-pty**: Terminal emulation.
- **pdf-parse**: Extract text from PDFs.
- **xlsx**: Read Excel spreadsheets.
- **tesseract.js**: OCR for images.
- **Buffer handling**: Various image support.

## Security Note

The `run_root_command` tool accepts a password and pipes it to `sudo`. While convenient, be aware of standard security implications of handling root passwords in scripts/logs.


1. Clone the repo.
2. `npm install`
3. `npm run build`
4. Use `node dist/index.js` as the command.
