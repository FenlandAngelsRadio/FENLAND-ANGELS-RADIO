// Fixed command and pinned host key; the server key cannot open a shell or forward ports.
export function sshConfigured(): boolean {
  return ['FAR_SERVER_SSH_HOST','FAR_SERVER_SSH_USER','FAR_SERVER_SSH_KEY_B64','FAR_SERVER_SSH_SHA256']
    .every(name => Boolean(Deno.env.get(name)));
}

export async function serverBridge(service: 'djs'|'calls', method: string, path: string, body?: unknown): Promise<{status:number,data:any}> {
  if (!sshConfigured()) throw new Error('FAR server connection is not configured.');
  const fingerprint = Deno.env.get('FAR_SERVER_SSH_SHA256')!;
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('FAR server identity is not configured.');
  const { Client } = await import('npm:ssh2@1.17.0');
  const payload = JSON.stringify({ service, method, path, body });
  if (new TextEncoder().encode(payload).length > 16384) throw new Error('Request too large.');
  return await new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const finish = (error?: Error, result?: {status:number,data:any}) => {
      if (settled) return;
      settled = true; clearTimeout(timer); client.end();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(new Error('FAR server did not confirm the request.')), service === 'djs' ? 130000 : 20000);
    client.on('error', () => finish(new Error('FAR server connection unavailable.')));
    client.on('close', () => { if (!settled) finish(new Error('FAR server connection closed before confirmation.')); });
    client.on('ready', () => client.exec('far-api', (error:any, channel:any) => {
      if (error) return finish(new Error('FAR server command unavailable.'));
      let output = '', bytes = 0;
      channel.on('data', (chunk:any) => {
        bytes += chunk.length;
        if (bytes > 262144) return finish(new Error('FAR server response too large.'));
        output += chunk.toString('utf8');
      });
      channel.stderr.on('data', () => {}); // Do not disclose server diagnostics or credentials.
      channel.on('error', () => finish(new Error('FAR server request failed.')));
      channel.on('close', (code:number) => {
        try {
          if (code !== 0) throw new Error();
          const result = JSON.parse(output);
          if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599 || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new Error();
          finish(undefined, result);
        } catch { finish(new Error('FAR server response could not be confirmed.')); }
      });
      channel.end(payload);
    }));
    client.connect({ host: Deno.env.get('FAR_SERVER_SSH_HOST')!, port: 22,
      username: Deno.env.get('FAR_SERVER_SSH_USER')!,
      privateKey: atob(Deno.env.get('FAR_SERVER_SSH_KEY_B64')!),
      hostHash: 'sha256', hostVerifier: (key:string) => key === fingerprint,
      algorithms: { serverHostKey: ['ssh-ed25519'] }, readyTimeout: 12000,
      keepaliveInterval: 10000, keepaliveCountMax: 2 });
  });
}
