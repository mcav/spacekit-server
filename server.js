const WebSocketServer = require('ws').Server
const wss = new WebSocketServer({ port: process.env.PORT })

wss.on('connection', function connection (ws) {
  ws.on('message', function incoming (message) {
    ws.send('echo: ' + message)
  })

  ws.send('hi')
})
