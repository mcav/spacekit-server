'use strict';

const uuid = require('node-uuid');
const WebSocketServer = require('ws').Server;
const SubdomainUpdater = require('./subdomain-updater');
const urlParse = require('url').parse;

class SpaceKitServer {

  constructor (hostedZoneId, domain) {
    this.subdomainUpdater = new SubdomainUpdater(hostedZoneId, domain);
    this.persistentSockets = new Map();

    const wss = new WebSocketServer({ port: process.env.PORT });

    wss.on('headers', (headers) => {
      headers['Access-Control-Allow-Origin'] = '*';
    });

    wss.on('connection', (ws) => {
      if (ws.protocol === 'spacekit') {
        this.handlePersistentSocket(ws);
      } else {
        this.handleAppSocket(ws);
      }
    });
  }

  handlePersistentSocket (ws) {
    let hostname = ws.upgradeReq.headers['x-spacekit-host'];
    let ip = ws._socket.localAddress;

    let existingSocket = this.persistentSockets.get(hostname);
    if (existingSocket) {
      existingSocket.close(1001 /* 'going away' */);
      console.warn(`[${hostname}] KILLED existing persistent connection`);
    }

    this.persistentSockets.set(hostname, ws);
    this.subdomainUpdater.updateSubdomainWithIp(hostname, ip).then(() => {
      console.log(`DNS: ${hostname} -> ${ip}`);
    }, (err) => {
      console.error(`ERROR: Failed to point "${hostname}" to "${ip}":`, err);
    });

    ws.on('close', () => {
      this.persistentSockets.delete(hostname);
      console.log(`[${hostname}] CLOSED persistent connection`);
    });

    console.log(`[${hostname}] OPENED persistent connection`);
  }

  handleAppSocket (ws) {
    let hostname = urlParse('ws://' + ws.upgradeReq.headers.host).hostname;
    let connectionId = uuid.v4();
    let ip = ws._socket.localAddress;

    if (!this.persistentSockets.get(hostname)) {
      ws.close(1011 /* 'unexpected failure' */);
      console.warn(`[${hostname}] REJECTED app socket (no persistent conn)`);
      return;
    }

    let forward = (data) => {
      let persistentSocket = this.persistentSockets.get(hostname);
      if (persistentSocket) {
        data.hostname = hostname;
        data.ip = ip;
        data.connectionId = connectionId;
        persistentSocket.send(JSON.stringify(data));
      }
    };

    forward({
      type: 'open',
      headers: ws.upgradeReq.headers,
      protocol: ws.protocol
    });

    console.log(`[${hostname}] FORWARDED-OPEN app socket`);

    ws.on('message', (data) => {
      forward({ type: 'message', data: data });
      console.log(`[${hostname}] FORWARDED-MESSAGE app socket: ${data}`);
    });

    ws.on('close', (code) => {
      forward({ type: 'close', code: code });
      console.log(`[${hostname}] FORWARDED-CLOSE app socket (code ${code})`);
    });
  }

}

module.exports = new SpaceKitServer(process.env.HOSTED_ZONE_ID, 'spacekit.io');
