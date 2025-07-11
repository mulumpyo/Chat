const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8000 });

const connectedNicknames = new Set();
const chatHistory = [];
const MAX_HISTORY_LENGTH = 1000;

function generateNickname() {
  const adjectives = ['꼬질꼬질한', '눅눅한', '쭈글쭈글한', '끈적끈적한', '흐물흐물한', '쿰쿰한', '삐걱거리는', '덜렁거리는', '엉망진창인', '게으른', '더러운'];
  const nouns = ['양말', '먼지', '곰팡이', '콧물', '때', '찌꺼기', '냄새', '털뭉치', '껌딱지', '콧구멍', '엉덩이', '방구'];
  let newNickname;
  do {
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    newNickname = `${randomAdjective} ${randomNoun}`;
  } while (connectedNicknames.has(newNickname));
  return newNickname;
}

function broadcastUserList() {
  const users = Array.from(wss.clients)
    .filter(client => client.readyState === WebSocket.OPEN)
    .map(client => client.nickname);
  const userListMessage = JSON.stringify({ type: 'userList', users });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(userListMessage);
    }
  });
}

wss.on('connection', ws => {
  ws.nickname = generateNickname();
  connectedNicknames.add(ws.nickname);
  console.log(`Client connected: ${ws.nickname}`);

  ws.send(JSON.stringify({ type: 'nickname', nickname: ws.nickname }));

  if (chatHistory.length > 0) {
    const initialHistory = chatHistory.slice(-50); // 가장 최근 50개만 전송
    ws.send(JSON.stringify({ type: 'history', messages: initialHistory, hasMore: chatHistory.length > 50 }));
  }

  broadcastUserList();

  ws.on('message', message => {
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message.toString());
    } catch (e) {
      console.error('Failed to parse message:', message.toString(), e);
      return;
    }

    // requestHistory 처리
    if (parsedMessage.type === 'requestHistory') {
      const offset = parsedMessage.offset || 0;
      const limit = parsedMessage.limit || 50;
      const start = Math.max(chatHistory.length - offset - limit, 0);
      const end = chatHistory.length - offset;
      const messages = chatHistory.slice(start, end);
      const hasMore = start > 0;
      ws.send(JSON.stringify({ type: 'history', messages, hasMore }));
      return;
    }

    let chatMessage;
    if (parsedMessage.type === 'chat') {
      chatMessage = { type: 'chat', sender: ws.nickname, text: parsedMessage.text };
    } else if (parsedMessage.type === 'image') {
      chatMessage = { type: 'image', sender: ws.nickname, data: parsedMessage.data };
    } else if (parsedMessage.type === 'file') {
      chatMessage = {
        type: 'file',
        sender: ws.nickname,
        data: parsedMessage.data,
        fileName: parsedMessage.fileName,
        fileSize: parsedMessage.fileSize
      };
    } else {
      console.warn('Unknown message type:', parsedMessage.type);
      return;
    }

    chatHistory.push(chatMessage);
    if (chatHistory.length > MAX_HISTORY_LENGTH) {
      chatHistory.shift();
    }

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(chatMessage));
      }
    });
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${ws.nickname}`);
    connectedNicknames.delete(ws.nickname);
    broadcastUserList();
  });
});

console.log('WebSocket server started on port 8000');
