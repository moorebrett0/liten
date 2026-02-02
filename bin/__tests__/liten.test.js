const { spawn } = require('child_process');
const path = require('path');

describe('Liten CLI', () => {
  jest.setTimeout(30000); // Increase timeout for CLI tests
  const cliPath = path.resolve(__dirname, '../liten.js');
  let runningProcesses = [];

  afterEach(() => {
    // Clean up any running processes
    runningProcesses.forEach(proc => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
      }
    });
    runningProcesses = [];
  });
  
  const waitForOutput = (cli, pattern, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cli.stdout.removeListener('data', handler);
        reject(new Error(`Timeout waiting for pattern: ${pattern}`));
      }, timeout);

      const handler = (data) => {
        const output = data.toString();
        if (output.includes(pattern)) {
          clearTimeout(timer);
          cli.stdout.removeListener('data', handler);
          resolve(output);
        }
      };
      cli.stdout.on('data', handler);
    });
  };

  const waitForPrompt = async (cli) => {
    // Wait for initial welcome message - more flexible matching
    await waitForOutput(cli, 'Welcome to Liten Gateway', 10000);
    // Then wait for prompt
    await waitForOutput(cli, 'Liten >', 5000);
  };

  describe('Interactive Shell', () => {
    it('should start and show welcome message', (done) => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      let receivedWelcome = false;
      cli.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Welcome to Liten Gateway') && !receivedWelcome) {
          receivedWelcome = true;
          expect(output).toContain('Welcome to Liten Gateway');
          cli.kill();
          done();
        }
      });
    });

    it('should respond to help command', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      await waitForPrompt(cli);
      cli.stdin.write('help\n');
      
      const output = await waitForOutput(cli, 'Commands:');
      expect(output).toContain('status');
      expect(output).toContain('list-keys');
      cli.kill();
    });
  });

  describe('Command Line Arguments', () => {
    it('should handle status command', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);

      await waitForPrompt(cli);
      cli.stdin.write('status\n');

      const output = await waitForOutput(cli, 'Port:');
      expect(output).toContain('Domains:');
      expect(output).toContain('Routes:');
      cli.kill();
    });

    it('should handle list-keys command', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      await waitForPrompt(cli);
      cli.stdin.write('list-keys\n');
      
      await waitForOutput(cli, 'Liten >');
      cli.kill();
    });

    it('should handle add-key command', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      const testKey = 'test-key-' + Date.now();
      
      await waitForPrompt(cli);
      cli.stdin.write(`add-key ${testKey}\n`);
      await waitForOutput(cli, 'Liten >');
      
      cli.stdin.write('list-keys\n');
      const output = await waitForOutput(cli, testKey);
      
      cli.stdin.write(`remove-key ${testKey}\n`);
      await waitForOutput(cli, 'Liten >');
      cli.kill();
    });

    it('should handle domain management commands', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      await waitForPrompt(cli);
      cli.stdin.write('add-domain test.local http://localhost:3000\n');
      await waitForOutput(cli, 'Liten >');
      
      cli.stdin.write('list-domains\n');
      const output = await waitForOutput(cli, 'test.local');
      expect(output).toContain('localhost:3000');
      
      cli.stdin.write('remove-domain test.local\n');
      await waitForOutput(cli, 'Liten >');
      cli.kill();
    });

    it('should handle logs command', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      await waitForPrompt(cli);
      cli.stdin.write('logs 5\n');
      await waitForOutput(cli, 'Liten >');
      cli.kill();
    });

    it('should handle reload command', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      await waitForPrompt(cli);
      cli.stdin.write('reload\n');
      
      const output = await waitForOutput(cli, 'Config reloaded');
      cli.kill();
    });

    it('should handle unknown commands gracefully', async () => {
      const cli = spawn('node', [cliPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      runningProcesses.push(cli);
      
      await waitForPrompt(cli);
      cli.stdin.write('unknown-command\n');
      
      const output = await waitForOutput(cli, 'Unknown command');
      cli.kill();
    });
  });
});
