'use strict';
const WebSocket = require('ws');

// Connect locally with the 'spacekit' websocket protocol
let ws = new WebSocket('ws://localhost:9999', 'spacekit', {
  headers: { 'x-spacekit-host': 'mcav' }
});

ws.on('open', (evt) => {
  console.log('Connected to SpaceKit server.');
});

let connections = new Map();

ws.on('message', (data) => {
  data = JSON.parse(data);
  let id = data.connectionId;

  if (data.type === 'open') {
    console.log('OPEN FROM', data.hostname, data.ip);
    connections[id] = new WebSocket('ws://localhost:8888', data.protocol);
  } else if (data.type === 'message') {
    console.log('MESSAGE FROM', data.hostname, data.ip, data.data);
    let out = connections[id];
    out.send(data.data);
  } else if (data.type === 'close') {
    console.log('CLOSE FROM', data.hostname, data.ip);
    let out = connections[id];
    delete connections[id];
    out.close();
  }
});

ws.on('close', (evt) => {
  console.log('Disconnected from SpaceKit server.');
});
