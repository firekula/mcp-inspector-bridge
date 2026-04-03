import WebSocket from 'ws';

// 第一阶段最小验证机制：尝试连接到刚刚架设的桥接器
const ws = new WebSocket('ws://localhost:4456');

ws.on('open', () => {
    console.log('[MCP Client] Connected to Cocos Inspector Bridge on port 4456.');
    console.log('[MCP Client] Sending ping...');
    ws.send(JSON.stringify({ type: 'ping' }));
});

ws.on('message', (data) => {
    console.log('[MCP Client] Received:', data.toString());
    
    // 成功收到 pong 即可断开连接退出，完成最小验证闭环
    const msg = JSON.parse(data.toString());
    if (msg.type === 'pong') {
        console.log('[MCP Client] Ping successful. Exiting.');
        ws.close();
        process.exit(0);
    }
});

ws.on('error', (err) => {
    console.error('[MCP Client] Connection error:', err.message);
    process.exit(1);
});
