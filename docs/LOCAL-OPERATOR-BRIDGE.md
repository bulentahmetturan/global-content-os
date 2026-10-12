# GCOS Local Operator Bridge

The bridge is a local Node.js CLI and MCP stdio process in `scripts/operator-bridge/`. It exposes nine fixed, argument-free operations. The CLI accepts only those operation names. There is no arbitrary URL, SQL, shell, credential alias, or resource-path input.

## Current Surface

- Windows Credential Manager aliases: `CLOUDFLARE_READ`, `GCOS_OPS_READ`, `DOSSIER_OPS_READ`.
- Cloudflare reads: at most 20 Worker version metadata rows; active deployment metadata bracketed by deployment reads; known rollback version metadata. No executable source or binding values are returned.
- Application reads: fixed GCOS OPS summary, Dossier OPS summary, alerts, audit (20 rows), and runs (20 rows). Application credentials remain distinct.
- GET only, fixed HTTPS origins and paths, redirects rejected, no retries, bounded timeouts and response sizes.
- Only fields accepted by the existing `operator-evidence-sanitize.mjs` projector may reach tool results or stored evidence. Audit events and evidence are written under `%LOCALAPPDATA%\GCOS\operator-bridge`; 5 MiB audit and 100-evidence-file caps fail closed.
- MCP supports legacy `2025-11-25` initialization and modern `2026-07-28` discovery/per-request metadata. Modern requests are version-checked. Tools have empty schemas and read-only annotations.

Run a local operation:

```powershell
node scripts/operator-bridge/cli.mjs operator_credential_status
node scripts/operator-bridge/cli.mjs cloudflare_worker_versions
```

The second command makes a production metadata GET only when a Cloudflare credential is enrolled and the owner invokes that exact operation. It has not been invoked during bridge development.

Run tests:

```powershell
npm run operator-bridge:test
```

## Credential Enrollment

Enrollment is separate from bridge startup. It prompts in an interactive console using hidden input, refuses to overwrite an existing alias, and stores only in Windows Credential Manager. The secret is not an argument, environment variable, configuration value, chat result, or evidence field.

After the credential-boundary owner decision below, run one alias at a time from an interactive PowerShell window:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "C:\Users\W11\Desktop\projects\content-systems\gcos-central-recovery\scripts\operator-bridge\credential-store.ps1" -Mode Enroll -Alias CLOUDFLARE_READ
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "C:\Users\W11\Desktop\projects\content-systems\gcos-central-recovery\scripts\operator-bridge\credential-store.ps1" -Mode Enroll -Alias GCOS_OPS_READ
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "C:\Users\W11\Desktop\projects\content-systems\gcos-central-recovery\scripts\operator-bridge\credential-store.ps1" -Mode Enroll -Alias DOSSIER_OPS_READ
```

Use the existing authorized credential for each identity; do not create, rotate, or substitute one. Enrollment checks only the Windows Credential Manager alias and never obtains a Cloudflare Worker secret. GCOS and Dossier application bearer credentials are separate inputs. Enrolled values are not read during presence checks.

## Agent Connection Templates

These are project-scoped templates only. They have not been installed or written into global client configuration. They contain no credentials. Use the exact local paths below; each client starts the same server process.

### Codex

Add the following to the relevant `[mcp_servers]` config scope (`~/.codex/config.toml` or a trusted project `.codex/config.toml`):

```toml
[mcp_servers.gcos_local_operator]
command = "C:\\Program Files\\nodejs\\node.exe"
args = ["C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery\\scripts\\operator-bridge\\server.mjs"]
cwd = "C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery"
enabled = true
startup_timeout_sec = 10
tool_timeout_sec = 20
default_tools_approval_mode = "approve"
```

### Claude Code

Add under the project `.mcp.json` `mcpServers` object, then review/approve the project server in Claude Code:

```json
{
  "mcpServers": {
    "gcos-local-operator": {
      "type": "stdio",
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery\\scripts\\operator-bridge\\server.mjs"]
    }
  }
}
```

### Cursor

Add under `.cursor/mcp.json` `mcpServers`:

```json
{
  "mcpServers": {
    "gcos-local-operator": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery\\scripts\\operator-bridge\\server.mjs"]
    }
  }
}
```

### OpenCode

For the current documented `mcp.servers` config shape in `opencode.jsonc`:

```jsonc
{
  "mcp": {
    "servers": {
      "gcos-local-operator": {
        "type": "local",
        "command": [
          "C:\\Program Files\\nodejs\\node.exe",
          "C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery\\scripts\\operator-bridge\\server.mjs"
        ],
        "cwd": "C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery",
        "disabled": false,
        "timeout": 20000,
        "protocol": "auto"
      }
    }
  }
}
```

### Hermes

Add under `mcp_servers` in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  gcos-local-operator:
    command: "C:\\Program Files\\nodejs\\node.exe"
    args:
      - "C:\\Users\\W11\\Desktop\\projects\\content-systems\\gcos-central-recovery\\scripts\\operator-bridge\\server.mjs"
    enabled: true
    timeout: 20
    connect_timeout: 10
    supports_parallel_tool_calls: false
```

## Security Boundary and Owner Action

The bridge never returns credential values through CLI or MCP, and it launches PowerShell with a minimal inherited environment. However, all five agents currently run as the same Windows user. Windows Credential Manager credentials protected for that user are accessible to other processes running as that same user; an agent with arbitrary shell/process access can bypass the bridge and call the native credential API directly. Consequently, this same-user arrangement cannot satisfy the stated requirement that agents have no direct access to the underlying secret store.

The local implementation therefore does not enroll or read credentials by default, and project configuration should not be enabled until the owner selects an isolation boundary. Recommended: run the bridge under a dedicated restricted Windows identity/service broker, with a narrow authenticated local IPC interface, OS ACLs preventing agents from querying that identity's credential store, and only the bridge process authorized to make outbound HTTPS requests. Alternative: explicitly accept a weaker trusted-agent threat model for all agents under the current Windows logon; this does not meet the original no-direct-secret-store-access requirement and is not recommended. No service, identity, ACL, or credential changes are made by this repository work.

Owner selection is also required for which existing application credential source to enroll: authorized secure vault retrieval or interactive entry by the credential owner. The bridge cannot recover or rotate either application bearer credential. Cloudflare API token authentication does not authenticate either application endpoint.

## Local Presence Check

`operator_credential_status` reports only PRESENT/MISSING booleans for the three bridge aliases. It does not test remote authentication. Do not put credentials in client `env`, agent settings, shell history, or evidence artifacts.
