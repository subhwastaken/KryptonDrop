import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function main() {
  console.log("🛠️ STARTING AUTOMATIC CLAUDE DESKTOP MCP SETUP...");

  // Path to Claude Desktop configuration file on macOS
  const configDir = path.join(os.homedir(), "Library", "Application Support", "Claude");
  const configFile = path.join(configDir, "claude_desktop_config.json");

  // Create the directory if it doesn't exist
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log(`Created directory: ${configDir}`);
  }

  // Load existing config or initialize default
  let config: any = { mcpServers: {} };
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, "utf8");
      config = JSON.parse(content);
      if (!config.mcpServers) {
        config.mcpServers = {};
      }
      console.log("Loaded existing Claude Desktop config file.");
    } catch (err) {
      console.warn("⚠️ Failed to parse existing config, creating backup and starting fresh.");
      fs.writeFileSync(`${configFile}.bak`, fs.readFileSync(configFile));
    }
  }

  // Add the stdio server configuration
  config.mcpServers["krypton-drop"] = {
    command: "npx",
    args: [
      "tsx",
      "/Volumes/WD_Subharup/Monad Hackathon/Proof-Of-Human-Drops/scripts/mcp-stdio-server.ts"
    ]
  };

  // Save the updated configuration
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf8");
  console.log(`\n✅ SUCCESSFULLY CONFIGURED CLAUDE DESKTOP MCP!`);
  console.log(`Saved changes to: ${configFile}`);
  console.log(`\n👉 NEXT STEP: Fully close and restart your Claude Desktop app to load the new tools!`);
}

main().catch((err) => {
  console.error("❌ Setup failed:", err);
  process.exit(1);
});
