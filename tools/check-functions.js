'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const target = 'supabase/functions/checkout-order/index.ts';

function candidateCommands() {
    const commands = ['deno'];
    if (process.platform === 'win32') {
        commands.push(
            path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe', 'deno.exe'),
            path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps', 'deno.exe')
        );
    }
    return commands;
}

for (const command of candidateCommands()) {
    if (command.includes(path.sep) && !fs.existsSync(command)) continue;
    const result = spawnSync(command, ['check', target], { stdio: 'inherit', shell: false });
    if (!result.error) process.exit(result.status ?? 0);
    if (result.error.code !== 'ENOENT' && result.error.code !== 'EACCES') {
        console.error(result.error.message);
        process.exit(1);
    }
}

console.error('Deno is not installed or is not executable. Install it from https://deno.com/ or with `winget install DenoLand.Deno`.');
process.exit(1);
