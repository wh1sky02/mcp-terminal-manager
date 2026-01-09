
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function getClaudeConfigPath(): string | null {
    const platform = os.platform();
    const home = os.homedir();

    if (platform === 'darwin') {
        return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else if (platform === 'win32') {
        return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    } else {
        // Linux support is unofficial/varied, checking common locations or creating generic
        // Assuming typical XDG or user might desire it in .config
        return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
    }
}

async function prompt(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

export async function runSetup() {
    console.log(`${CYAN}==========================================`);
    console.log(`   MCP Terminal Manager Setup Wizard`);
    console.log(`==========================================${RESET}\n`);

    const configPath = getClaudeConfigPath();
    console.log(`Detected Platform: ${os.platform()}`);
    console.log(`Target Config: ${configPath}\n`);

    if (!configPath) {
        console.error(`${RED}Could not determine config path for this platform.${RESET}`);
        process.exit(1);
    }

    // Use the current executable path for the config
    // This allows local installation support
    const scriptPath = process.argv[1];

    // Ensure we are using the absolute path
    const absoluteScriptPath = path.resolve(scriptPath);

    const mcpConfig = {
        command: "node",
        args: [absoluteScriptPath]
    };

    let existingConfig: any = { mcpServers: {} };
    let fileExists = false;

    if (fs.existsSync(configPath)) {
        fileExists = true;
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            existingConfig = JSON.parse(content);
        } catch (e) {
            console.error(`${YELLOW}Warning: Existing config file found but could not be parsed. Starting fresh.${RESET}`);
        }
    } else {
        // Ensure directory exists
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            console.log(`${YELLOW}Config directory does not exist. Creating: ${dir}${RESET}`);
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Check if already configured
    if (existingConfig.mcpServers && existingConfig.mcpServers["mcp-terminal-manager"]) {
        console.log(`${YELLOW}mcp-terminal-manager is already configured.${RESET}`);
        const update = await prompt("Do you want to update the configuration? (y/N): ");
        if (!update.toLowerCase().startsWith('y')) {
            console.log("Setup cancelled.");
            return;
        }
    }

    if (!existingConfig.mcpServers) {
        existingConfig.mcpServers = {};
    }

    existingConfig.mcpServers["mcp-terminal-manager"] = mcpConfig;

    try {
        fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));
        console.log(`${GREEN}✅ Successfully wrote configuration to ${configPath}${RESET}`);
        console.log(`\nAdded configuration:`);
        console.log(JSON.stringify({ "mcp-terminal-manager": mcpConfig }, null, 2));
        console.log(`\n${CYAN}Please restart your MCP client (GitHub Copilot, Claude Desktop, etc.) to apply changes.${RESET}`);
    } catch (error: any) {
        console.error(`${RED}Error writing configuration: ${error.message}${RESET}`);
        process.exit(1);
    }
}
