# AGENTS.md - Workspace Agent Instructions

## RTK - Rust Token Killer Configuration

Always run commands using `rtk` to optimize token consumption and filter noisy shell outputs.

### Meta Commands
```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze command history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

### Hook-Based & Transparent Usage
All git, cargo, package, and list operations should be proxied through `rtk`:
* Example: `git status` -> `rtk git status`
* Example: `npm run build` -> `rtk npm run build`
* Example: `ls` -> `rtk ls`

### Installation Verification
```bash
rtk --version         # Verify rtk binary version
rtk gain              # Verify command capability
```
