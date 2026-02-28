const http = require('http');
const fs = require('fs');
const path = require('path');
const { SkullGame, PHASES } = require('./game');

const rooms = new Map();
const sessions = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { game: new SkullGame(roomId), lastNotice: '房间已创建。' });
  }
  return rooms.get(roomId);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('请求体太大'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('JSON 格式错误'));
      }
    });
  });
}

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/public/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'application/javascript';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/public/') || req.url.endsWith('.js') || req.url.endsWith('.css'))) {
      return serveStatic(req, res);
    }

    if (req.method === 'POST' && req.url === '/api/join') {
      const { roomId, name } = await readBody(req);
      if (!roomId || !name) throw new Error('请输入房间号和昵称。');
      const playerId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const r = getRoom(String(roomId));
      r.game.addPlayer(playerId, String(name));
      r.lastNotice = `${name} 加入了房间 ${roomId}。`;
      sessions.set(sessionId, { roomId: String(roomId), playerId, name: String(name) });
      return sendJson(res, 200, { sessionId });
    }

    if (req.method === 'POST' && req.url === '/api/action') {
      const { sessionId, type, ...payload } = await readBody(req);
      const info = sessions.get(sessionId);
      if (!info) throw new Error('会话失效，请重新加入房间。');
      const r = rooms.get(info.roomId);
      if (!r) throw new Error('房间不存在。');
      const game = r.game;

      let result;
      switch (type) {
        case 'place':
          result = game.placeCard(info.playerId, payload.card);
          break;
        case 'bid':
          if (game.phase === PHASES.BIDDING && game.currentPlayer().id === info.playerId && game.currentBid !== null) {
            if (payload.amount === null || payload.amount === undefined || Number(payload.amount) <= game.currentBid) {
              result = game.passBid(info.playerId);
            } else {
              result = game.raiseBid(info.playerId, Number(payload.amount));
            }
          } else {
            result = game.startBid(info.playerId, Number(payload.amount));
          }
          break;
        case 'pass':
          result = game.passBid(info.playerId);
          break;
        case 'flipOwn':
          result = game.flipOwnTop(info.playerId);
          break;
        case 'flip':
          result = game.flipCard(info.playerId, payload.targetPlayerId, Number(payload.cardIndex));
          break;
        default:
          throw new Error('未知操作类型。');
      }
      r.lastNotice = result?.message || '已更新';
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && req.url.startsWith('/api/state?')) {
      const u = new URL(req.url, 'http://localhost');
      const sessionId = u.searchParams.get('sessionId');
      const info = sessions.get(sessionId);
      if (!info) throw new Error('会话失效，请重新加入房间。');
      const r = rooms.get(info.roomId);
      if (!r) throw new Error('房间不存在。');
      return sendJson(res, 200, { payload: r.game.serialize(info.playerId), notice: r.lastNotice });
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (error) {
    sendJson(res, 400, { error: error.message || '请求失败' });
  }
});

server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:3000');
});
