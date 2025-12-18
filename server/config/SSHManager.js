import { Client } from 'ssh2';
import { pool } from './database.js';

class SSHManager {
  static async getServerConfig(serverId) {
    const [rows] = await pool.execute(
      `SELECT ip, ssh_port, ssh_user, ssh_password 
       FROM wowza_servers 
       WHERE codigo = ? AND status = 'ativo'`,
      [serverId]
    );

    if (rows.length === 0) {
      throw new Error('Servidor Wowza não encontrado');
    }

    return rows[0];
  }

  static exec(serverId, command) {
    return new Promise(async (resolve, reject) => {
      const server = await this.getServerConfig(serverId);

      const conn = new Client();

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let stdout = '';
          let stderr = '';

          stream
            .on('close', (code) => {
              conn.end();
              if (code !== 0 && stderr) {
                return reject(new Error(stderr));
              }
              resolve(stdout);
            })
            .on('data', (data) => {
              stdout += data.toString();
            });

          stream.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        });
      });

      conn.on('error', reject);

      conn.connect({
        host: server.ip,
        port: server.ssh_port || 22,
        username: server.ssh_user,
        password: server.ssh_password
      });
    });
  }
}

export default SSHManager;
