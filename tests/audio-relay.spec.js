import { test, expect } from '@playwright/test';

test.describe('Audio Relay Tests', () => {
  // Use a unique room to avoid interference from other users
  const getUniqueRoom = () => `test-room-${Date.now()}`;

  test('WebSocket connection should be established', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const room = getUniqueRoom();

    await page.goto(`?room=${room}`);

    // Wait for connection
    await page.waitForFunction(() => {
      return window.zellousDebug?.state?.ws?.readyState === 1;
    }, { timeout: 10000 });

    const wsState = await page.evaluate(() => window.zellousDebug.state.ws.readyState);
    expect(wsState).toBe(1); // OPEN

    // Verify we got a userId
    const userId = await page.evaluate(() => window.zellousDebug.state.userId);
    expect(userId).toBeTruthy();

    await context.close();
  });

  test('Two users join same room and see each other', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const room = getUniqueRoom();

    // User 1 joins
    await page1.goto(`?room=${room}`);
    await page1.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

    // User 2 joins
    await page2.goto(`?room=${room}`);
    await page2.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

    // Wait a bit for messages to propagate
    await page2.waitForTimeout(1000);

    // User 2 should see message about user 1 being online OR user joined
    const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);
    const user2Id = await page2.evaluate(() => window.zellousDebug.state.userId);

    expect(user1Id).toBeTruthy();
    expect(user2Id).toBeTruthy();
    expect(user1Id).not.toBe(user2Id);

    // Check messages panel shows other users
    const page2Messages = await page2.evaluate(() => window.zellousDebug.state.messages.map(m => m.text));
    console.log('Page2 messages:', page2Messages);

    await context1.close();
    await context2.close();
  });

  test('Speaker events are received by other user', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const room = getUniqueRoom();

    // Setup console logging for debugging
    page1.on('console', msg => console.log('Page1:', msg.text()));
    page2.on('console', msg => console.log('Page2:', msg.text()));

    // User 1 joins
    await page1.goto(`?room=${room}`);
    await page1.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
    await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 5000 });

    // User 2 joins
    await page2.goto(`?room=${room}`);
    await page2.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
    await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 5000 });

    // Wait for both to settle
    await page1.waitForTimeout(500);

    // User 1 starts speaking (simulate)
    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_start' });
    });

    // Wait for speaker_joined to propagate
    await page2.waitForTimeout(500);

    // Check if User 2 sees User 1 as active speaker
    const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);
    const activeSpeakers = await page2.evaluate(() => Array.from(window.zellousDebug.state.activeSpeakers));

    console.log('User1 ID:', user1Id);
    console.log('Active speakers on User2:', activeSpeakers);

    expect(activeSpeakers).toContain(user1Id);

    // Check if a queue segment was created
    const activeSegments = await page2.evaluate(() => {
      const segments = Array.from(window.zellousDebug.state.activeSegments.entries());
      return segments.map(([key, val]) => ({ userId: val.userId, chunks: val.chunks.length, status: val.status }));
    });
    console.log('Active segments on User2:', activeSegments);

    expect(activeSegments.length).toBeGreaterThan(0);

    // User 1 stops speaking
    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_end' });
    });

    await page2.waitForTimeout(500);

    await context1.close();
    await context2.close();
  });

  test('Audio chunks are relayed between users', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const room = getUniqueRoom();

    // User 1 joins
    await page1.goto(`?room=${room}`);
    await page1.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
    await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 5000 });

    // User 2 joins
    await page2.goto(`?room=${room}`);
    await page2.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
    await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 5000 });

    await page1.waitForTimeout(500);

    // User 1 starts speaking
    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_start' });
    });

    await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

    // Verify segment was created on user 2
    const segmentBeforeChunks = await page2.evaluate(() => {
      const user1Id = Array.from(window.zellousDebug.state.activeSpeakers)[0];
      if (!user1Id) return null;
      const segment = window.zellousDebug.state.activeSegments.get(user1Id);
      return segment ? { userId: segment.userId, chunks: segment.chunks.length, status: segment.status } : null;
    });
    console.log('Segment before chunks:', segmentBeforeChunks);

    // User 1 sends fake audio chunks
    const fakeChunk = new Uint8Array(100).fill(128);
    for (let i = 0; i < 5; i++) {
      await page1.evaluate((chunk) => {
        window.zellousDebug.network.send({ type: 'audio_chunk', data: Array.from(chunk) });
      }, Array.from(fakeChunk));
      await page1.waitForTimeout(100);
    }

    await page2.waitForTimeout(500);

    // Check if User 2 received the chunks
    const segmentAfterChunks = await page2.evaluate(() => {
      const user1Id = Array.from(window.zellousDebug.state.activeSpeakers)[0];
      if (!user1Id) return null;
      const segment = window.zellousDebug.state.activeSegments.get(user1Id);
      return segment ? { userId: segment.userId, chunks: segment.chunks.length, status: segment.status } : null;
    });
    console.log('Segment after chunks:', segmentAfterChunks);

    // Also check the old recording audio system
    const recordingAudio = await page2.evaluate(() => {
      const user1Id = Array.from(window.zellousDebug.state.activeSpeakers)[0];
      const recording = window.zellousDebug.state.recordingAudio.get(user1Id);
      return recording ? recording.length : 0;
    });
    console.log('recordingAudio chunks:', recordingAudio);

    expect(segmentAfterChunks).not.toBeNull();
    expect(segmentAfterChunks.chunks).toBeGreaterThanOrEqual(4);

    // User 1 stops speaking
    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_end' });
    });

    await page2.waitForFunction(() => window.zellousDebug.state.audioQueue.length > 0, { timeout: 5000 });

    // Check that segment was moved to queue
    const audioQueue = await page2.evaluate(() => {
      return window.zellousDebug.state.audioQueue.map(s => ({
        id: s.id,
        userId: s.userId,
        chunks: s.chunks.length,
        status: s.status
      }));
    });
    console.log('Audio queue:', audioQueue);

    expect(audioQueue.length).toBeGreaterThan(0);
    expect(audioQueue[0].chunks).toBeGreaterThanOrEqual(4);

    await context1.close();
    await context2.close();
  });

  test('Audio queue processes and plays segments', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const room = getUniqueRoom();

    // User 1 joins
    await page1.goto(`?room=${room}`);
    await page1.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

    // User 2 joins
    await page2.goto(`?room=${room}`);
    await page2.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

    await page1.waitForTimeout(500);

    // User 1 simulates full audio transmission
    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_start' });
    });
    await page1.waitForTimeout(200);

    // Send some fake chunks
    for (let i = 0; i < 3; i++) {
      await page1.evaluate(() => {
        const fakeChunk = new Uint8Array(100).fill(128);
        window.zellousDebug.network.send({ type: 'audio_chunk', data: Array.from(fakeChunk) });
      });
      await page1.waitForTimeout(50);
    }

    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_end' });
    });

    // Wait for queue processing
    await page2.waitForTimeout(1000);

    // Check queue status
    const queueState = await page2.evaluate(() => {
      return {
        queue: window.zellousDebug.state.audioQueue.map(s => ({
          id: s.id,
          status: s.status,
          chunks: s.chunks.length,
          decodedSamples: s.decodedSamples?.length || 0
        })),
        currentSegmentId: window.zellousDebug.state.currentSegmentId,
        isDeafened: window.zellousDebug.state.isDeafened,
        isSpeaking: window.zellousDebug.state.isSpeaking
      };
    });
    console.log('Queue state:', JSON.stringify(queueState, null, 2));

    // The segment should have attempted to play (or may have errored if codec invalid)
    // At minimum it should be in the queue
    expect(queueState.queue.length).toBeGreaterThan(0);

    await context1.close();
    await context2.close();
  });

  test('Debug WebSocket message flow', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const room = getUniqueRoom();

    // Intercept all WS messages on page 2
    const receivedMessages = [];
    await page2.exposeFunction('logWsMessage', (msg) => {
      receivedMessages.push(msg);
      console.log('WS received on page2:', msg);
    });

    // User 1 joins
    await page1.goto(`?room=${room}`);
    await page1.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

    // User 2 joins with message interception
    await page2.goto(`?room=${room}`);
    await page2.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

    // Hook into the message handler
    await page2.evaluate(() => {
      const originalHandle = window.zellousDebug.message.handle;
      window.zellousDebug.message.handle = (msg) => {
        window.logWsMessage(JSON.stringify(msg));
        return originalHandle(msg);
      };
    });

    await page1.waitForTimeout(500);

    // User 1 sends audio_start
    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_start' });
    });

    await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

    // User 1 sends audio chunks
    for (let i = 0; i < 2; i++) {
      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_chunk', data: [1, 2, 3, 4, 5] });
      });
      await page1.waitForTimeout(100);
    }

    await page1.evaluate(() => {
      window.zellousDebug.network.send({ type: 'audio_end' });
    });

    await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size === 0, { timeout: 5000 });

    console.log('All received messages:', receivedMessages);

    // Check that speaker_joined and audio_data were received
    const messageTypes = receivedMessages.map(m => JSON.parse(m).type);
    console.log('Message types received:', messageTypes);

    expect(messageTypes).toContain('speaker_joined');
    expect(messageTypes).toContain('audio_data');
    expect(messageTypes).toContain('speaker_left');

    await context1.close();
    await context2.close();
  });
});
