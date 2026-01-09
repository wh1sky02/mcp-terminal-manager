#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as pty from "node-pty";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
// @ts-ignore
import pdf from "pdf-parse";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";

interface Session {
    id: string;
    process: pty.IPty;
    outputBuffer: string;
}

const sessions: Map<string, Session> = new Map();

const server = new Server(
    {
        name: "terminal-session-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// File parsing helpers
async function parsePdf(filePath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
}

function parseExcel(filePath: string): string {
    const workbook = XLSX.readFile(filePath);
    let result = "";
    workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        result += `--- Sheet: ${sheetName} ---\n`;
        result += XLSX.utils.sheet_to_csv(sheet);
        result += "\n\n";
    });
    return result;
}

async function parseImage(filePath: string): Promise<string> {
    const { data: { text } } = await Tesseract.recognize(filePath, "eng");
    return text;
}

const TOOLS = [
    {
        name: "create_terminal",
        description: "Create a new terminal session. Returns the session ID. Safe to execute. Defaults to bash/zsh.",
        inputSchema: {
            type: "object",
            properties: {
                cwd: { type: "string", description: "Initial working directory" },
                shell: { type: "string", description: "Shell to use (default: bash or zsh)" },
                root_password: { type: "string", description: "Optional. If provided, the terminal will attempt to start as a root session (sudo)." }
            },
        },
    },
    {
        name: "run_command",
        description: "Run a command in a specific terminal session. This writes to the terminal's stdin. It returns immediately.",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "The session ID" },
                command: { type: "string", description: "The command to run." },
            },
            required: ["session_id", "command"],
        },
    },
    {
        name: "read_output",
        description: "Read the unread output from a terminal session and clear the buffer.",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "The session ID" },
            },
            required: ["session_id"],
        },
    },
    {
        name: "kill_terminal",
        description: "Kill a terminal session.",
        inputSchema: {
            type: "object",
            properties: {
                session_id: { type: "string", description: "The session ID" },
            },
            required: ["session_id"],
        },
    },
    {
        name: "list_terminals",
        description: "List all active terminal sessions.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "run_root_command",
        description: "Execute a single command as root using sudo. Returns the output.",
        inputSchema: {
            type: "object",
            properties: {
                command: { type: "string", description: "Command to execute" },
                password: { type: "string", description: "Root/User password for sudo" },
                cwd: { type: "string", description: "Working directory" }
            },
            required: ["command", "password"]
        }
    },
    {
        name: "read_special_file",
        description: "Read content from PDF, Excel, Image, or plain text files. Auto-detects based on extension.",
        inputSchema: {
            type: "object",
            properties: {
                path: { type: "string", description: "Absolute path to the file" }
            },
            required: ["path"]
        }
    },
    {
        name: "get_system_logs",
        description: "Retrieve recent system logs (tail) or read specific log files.",
        inputSchema: {
            type: "object",
            properties: {
                log_file: { type: "string", description: "Path to log file (default: /var/log/syslog or generic linux logs)" },
                lines: { type: "number", description: "Number of lines to read (default: 50)" }
            }
        }
    }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS,
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
        if (name === "create_terminal") {
            const cwd = (args?.cwd as string) || os.homedir();
            let shell = (args?.shell as string);
            const rootPassword = (args?.root_password as string);

            if (!shell) {
                shell = os.platform() === "win32" ? "powershell.exe" : (process.env.SHELL || "bash");
            }

            let ptyProcess: pty.IPty;

            if (rootPassword) {
                // Spawn sudo with the shell. 
                // -S: read password from stdin
                // -p '': empty prompt
                ptyProcess = pty.spawn("sudo", ["-S", "-p", "", shell], {
                    name: "xterm-color",
                    cols: 80,
                    rows: 30,
                    cwd: cwd,
                    env: process.env,
                });

                // Write password immediately
                ptyProcess.write(rootPassword + "\n");
            } else {
                ptyProcess = pty.spawn(shell, [], {
                    name: "xterm-color",
                    cols: 80,
                    rows: 30,
                    cwd: cwd,
                    env: process.env,
                });
            }

            const sessionId = Math.random().toString(36).substring(7);

            const session: Session = {
                id: sessionId,
                process: ptyProcess,
                outputBuffer: "",
            };

            ptyProcess.onData((data) => {
                session.outputBuffer += data;
            });

            ptyProcess.onExit(() => {
                session.outputBuffer += "\n[Process exited]\n";
            });

            sessions.set(sessionId, session);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ session_id: sessionId, shell, cwd, mode: rootPassword ? "root" : "user" }),
                    },
                ],
            };
        }

        if (name === "run_command") {
            const sessionId = args?.session_id as string;
            const command = args?.command as string;

            const session = sessions.get(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found.`);
            }

            session.process.write(command.endsWith("\n") ? command : command + "\n");

            return {
                content: [
                    {
                        type: "text",
                        text: `Command sent to session ${sessionId}.`,
                    },
                ],
            };
        }

        if (name === "read_output") {
            const sessionId = args?.session_id as string;
            const session = sessions.get(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found.`);
            }

            const output = session.outputBuffer;
            session.outputBuffer = "";

            return {
                content: [
                    {
                        type: "text",
                        text: output,
                    },
                ],
            };
        }

        if (name === "kill_terminal") {
            const sessionId = args?.session_id as string;
            const session = sessions.get(sessionId);
            if (!session) {
                throw new Error(`Session ${sessionId} not found.`);
            }

            session.process.kill();
            sessions.delete(sessionId);

            return {
                content: [
                    {
                        type: "text",
                        text: `Session ${sessionId} killed.`,
                    },
                ],
            };
        }

        if (name === "list_terminals") {
            const activeSessions = Array.from(sessions.keys());
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(activeSessions)
                    }
                ]
            }
        }

        if (name === "run_root_command") {
            const command = args?.command as string;
            const password = args?.password as string;
            const cwd = (args?.cwd as string) || os.homedir();

            // Construct command to pipe password to sudo -S
            // Note: This is executing in a child process, not the PTY, to capture clean output
            // But we need to use a shell to handle the pipe.
            const childProcess = await import("child_process");

            return new Promise((resolve, reject) => {
                // simple echo password | sudo -S command
                // NOTE: This creates a security risk if command logging is enabled on the system, 
                // but this is requested feature: "root password".
                const finalCommand = `echo "${password}" | sudo -S -p '' ${command}`;

                childProcess.exec(finalCommand, { cwd }, (error, stdout, stderr) => {
                    if (error) {
                        // Sudo often writes prompt or errors to stderr
                        resolve({
                            content: [{ type: "text", text: `Error: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}` }],
                            isError: true
                        });
                    } else {
                        resolve({
                            content: [{ type: "text", text: stdout || stderr }] // sudo might print to stderr
                        });
                    }
                });
            });
        }

        if (name === "read_special_file") {
            const filePath = args?.path as string;
            const ext = path.extname(filePath).toLowerCase();
            let content = "";

            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            if (ext === ".pdf") {
                content = await parsePdf(filePath);
            } else if (ext === ".xlsx" || ext === ".xls") {
                content = parseExcel(filePath);
            } else if ([".png", ".jpg", ".jpeg", ".bmp", ".gif"].includes(ext)) {
                content = await parseImage(filePath);
            } else {
                // Default to text
                content = fs.readFileSync(filePath, "utf-8");
            }

            return {
                content: [{ type: "text", text: content }]
            };
        }

        if (name === "get_system_logs") {
            const logFile = (args?.log_file as string) || "/var/log/syslog";
            const lines = (args?.lines as number) || 50;

            // Check if linux
            const childProcess = await import("child_process");

            let cmd = "";
            if (fs.existsSync(logFile)) {
                cmd = `tail -n ${lines} ${logFile}`;
            } else {
                // Try journalctl if file doesn't exist (likely systemd system)
                cmd = `journalctl -n ${lines} --no-pager`;
            }

            return new Promise((resolve) => {
                childProcess.exec(cmd, (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            content: [{ type: "text", text: `Error reading logs: ${error.message}\n${stderr}` }],
                            isError: true
                        });
                    } else {
                        resolve({
                            content: [{ type: "text", text: stdout }]
                        });
                    }
                });
            });
        }

        throw new Error(`Tool ${name} not found.`);
    } catch (error: any) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error.message}`,
                },
            ],
            isError: true,
        };
    }
});

async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Terminal MCP Server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
