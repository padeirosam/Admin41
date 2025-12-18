import SSHManager from './SSHManager.js';

export async function createFtpUser({ serverId, username, password }) {
  const userPath = `/home/streaming/${username}`;

  const commands = [
    `id ${username} || useradd -m -d ${userPath} -s /sbin/nologin ${username}`,
    `echo "${username}:${password}" | chpasswd`,
    `mkdir -p ${userPath}`,
    `chown -R ${username}:${username} ${userPath}`,
    `chmod 750 ${userPath}`
  ];

  for (const cmd of commands) {
    await SSHManager.exec(serverId, cmd);
  }

  return true;
}
