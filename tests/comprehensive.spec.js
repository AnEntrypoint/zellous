import { test, expect } from '@playwright/test';

const getUniqueRoom = () => `test-room-${Date.now()}-${Math.random().toString(36).slice(2)}`;

test.describe('Zellous Comprehensive Tests', () => {
  test.describe('WebSocket Connection', () => {
    test('establishes WebSocket connection', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = getUniqueRoom();

      await page.goto(`?room=${room}`);
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const wsState = await page.evaluate(() => window.zellousDebug.state.ws.readyState);
      expect(wsState).toBe(1);

      await context.close();
    });

    test('receives userId from server', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = getUniqueRoom();

      await page.goto(`?room=${room}`);
      await page.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      const userId = await page.evaluate(() => window.zellousDebug.state.userId);
      expect(userId).toBeTruthy();
      expect(typeof userId).toBe('number');

      await context.close();
    });

    test('joins room from URL parameter', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = getUniqueRoom();

      await page.goto(`?room=${room}`);
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const roomId = await page.evaluate(() => window.zellousDebug.state.roomId);
      expect(roomId).toBe(room);

      await context.close();
    });

    test('defaults to lobby room when no room parameter', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const roomId = await page.evaluate(() => window.zellousDebug.state.roomId);
      expect(roomId).toBe('lobby');

      await context.close();
    });
  });

  test.describe('UI Elements', () => {
    test('all essential UI elements exist', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const elements = await page.evaluate(() => ({
        ptt: !!document.getElementById('pttBtn'),
        statusDot: !!document.getElementById('statusDot'),
        statusText: !!document.getElementById('statusText'),
        recording: !!document.getElementById('recording'),
        status: !!document.getElementById('status'),
        volume: !!document.getElementById('volume'),
        volValue: !!document.getElementById('volValue'),
        speakers: !!document.getElementById('speakers'),
        messages: !!document.getElementById('messages'),
        roomName: !!document.getElementById('roomName'),
        audioQueueView: !!document.getElementById('audioQueueView'),
        deafenBtn: !!document.getElementById('deafenBtn')
      }));

      Object.entries(elements).forEach(([key, value]) => {
        expect(value, `Element ${key} should exist`).toBe(true);
      });

      await context.close();
    });

    test('room name displays correctly', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = 'test-display-room';

      await page.goto(`?room=${room}`);
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const roomText = await page.locator('#roomName').textContent();
      expect(roomText).toContain(room);

      await context.close();
    });

    test('connection status updates to Connected', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
      await page.waitForTimeout(500);

      const statusText = await page.locator('#statusText').textContent();
      expect(statusText).toBe('Connected');

      await context.close();
    });
  });

  test.describe('State Management', () => {
    test('state object is properly initialized', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const state = await page.evaluate(() => ({
        isSpeaking: window.zellousDebug.state.isSpeaking,
        masterVolume: window.zellousDebug.state.masterVolume,
        isDeafened: window.zellousDebug.state.isDeafened,
        hasAudioContext: !!window.zellousDebug.state.audioContext,
        messagesIsArray: Array.isArray(window.zellousDebug.state.messages),
        audioQueueIsArray: Array.isArray(window.zellousDebug.state.audioQueue),
        activeSpeakersIsSet: window.zellousDebug.state.activeSpeakers instanceof Set,
        audioBuffersIsMap: window.zellousDebug.state.audioBuffers instanceof Map,
        audioHistoryIsMap: window.zellousDebug.state.audioHistory instanceof Map
      }));

      expect(state.isSpeaking).toBe(false);
      expect(state.masterVolume).toBe(0.7);
      expect(state.isDeafened).toBe(false);
      expect(state.messagesIsArray).toBe(true);
      expect(state.audioQueueIsArray).toBe(true);
      expect(state.activeSpeakersIsSet).toBe(true);
      expect(state.audioBuffersIsMap).toBe(true);
      expect(state.audioHistoryIsMap).toBe(true);

      await context.close();
    });

    test('config constants are correct', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug, { timeout: 10000 });

      const config = await page.evaluate(() => window.zellousDebug.config);
      expect(config.chunkSize).toBe(4096);
      expect(config.sampleRate).toBe(48000);

      await context.close();
    });
  });

  test.describe('Multi-User Functionality', () => {
    test('two users can join same room and see each other', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      
      await page2.waitForFunction(() => {
        const msgs = window.zellousDebug.state.messages;
        return msgs.some(m => m.text.includes('is online') || m.text.includes('joined'));
      }, { timeout: 10000 });

      const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);
      const user2Id = await page2.evaluate(() => window.zellousDebug.state.userId);

      expect(user1Id).not.toBe(user2Id);

      const page2Messages = await page2.evaluate(() => window.zellousDebug.state.messages.map(m => m.text));
      const hasUserOnline = page2Messages.some(m => m.includes('is online') || m.includes('joined'));
      expect(hasUserOnline).toBe(true);

      await context1.close();
      await context2.close();
    });

    test('rooms are isolated - users in different rooms cannot see each other', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room1 = getUniqueRoom();
      const room2 = getUniqueRoom();

      await page1.goto(`?room=${room1}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room2}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);
      const page2Messages = await page2.evaluate(() => window.zellousDebug.state.messages);

      const hasUser1 = page2Messages.some(m => m.userId === user1Id);
      expect(hasUser1).toBe(false);

      await context1.close();
      await context2.close();
    });

    test('user left event is received when user disconnects', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);

      await context1.close();
      await page2.waitForTimeout(500);

      const page2Messages = await page2.evaluate(() => window.zellousDebug.state.messages.map(m => m.text));
      const hasUserLeft = page2Messages.some(m => m.includes('left'));
      expect(hasUserLeft).toBe(true);

      await context2.close();
    });
  });

  test.describe('Speaker Events and Audio Relay', () => {
    test('speaker_joined event is received when user starts speaking', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_start' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

      const activeSpeakers = await page2.evaluate(() => Array.from(window.zellousDebug.state.activeSpeakers));

      expect(activeSpeakers).toContain(user1Id);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_end' });
      });

      await context1.close();
      await context2.close();
    });

    test('speaker_left event clears active speaker', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_start' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_end' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size === 0, { timeout: 5000 });

      const activeSpeakers = await page2.evaluate(() => Array.from(window.zellousDebug.state.activeSpeakers));

      expect(activeSpeakers).not.toContain(user1Id);

      await context1.close();
      await context2.close();
    });

    test('audio chunks are relayed to other users', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_start' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

      for (let i = 0; i < 5; i++) {
        await page1.evaluate(() => {
          const fakeChunk = new Array(100).fill(128);
          window.zellousDebug.network.send({ type: 'audio_chunk', data: fakeChunk });
        });
        await page1.waitForTimeout(100);
      }
      await page2.waitForTimeout(500);

      const segmentData = await page2.evaluate(() => {
        const user1Id = Array.from(window.zellousDebug.state.activeSpeakers)[0];
        const segment = window.zellousDebug.state.activeSegments.get(user1Id);
        return segment ? { chunks: segment.chunks.length, status: segment.status } : null;
      });

      expect(segmentData).not.toBeNull();
      expect(segmentData.chunks).toBeGreaterThanOrEqual(4);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_end' });
      });

      await context1.close();
      await context2.close();
    });

    test('audio segments move to queue when speaker stops', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_start' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

      for (let i = 0; i < 3; i++) {
        await page1.evaluate(() => {
          window.zellousDebug.network.send({ type: 'audio_chunk', data: new Array(100).fill(128) });
        });
        await page1.waitForTimeout(100);
      }
      await page2.waitForTimeout(300);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_end' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.audioQueue.length > 0, { timeout: 5000 });

      const queueData = await page2.evaluate(() => {
        return window.zellousDebug.state.audioQueue.map(s => ({
          id: s.id,
          chunks: s.chunks.length,
          status: s.status
        }));
      });

      expect(queueData.length).toBeGreaterThan(0);
      expect(queueData[0].chunks).toBeGreaterThanOrEqual(2);

      await context1.close();
      await context2.close();
    });

    test('sender does not receive their own audio chunks', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(300);

      const user1Id = await page1.evaluate(() => window.zellousDebug.state.userId);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_start' });
      });
      await page1.waitForTimeout(200);

      for (let i = 0; i < 3; i++) {
        await page1.evaluate(() => {
          window.zellousDebug.network.send({ type: 'audio_chunk', data: new Array(100).fill(128) });
        });
        await page1.waitForTimeout(50);
      }

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_end' });
      });
      await page1.waitForTimeout(300);

      const page1SegmentsFromOthers = await page1.evaluate((myId) => {
        const segments = Array.from(window.zellousDebug.state.activeSegments.entries());
        return segments.filter(([key]) => key !== myId).length;
      }, user1Id);

      const page1QueueFromOthers = await page1.evaluate((myId) => {
        return window.zellousDebug.state.audioQueue.filter(s => s.userId !== myId && !s.isOwnAudio).length;
      }, user1Id);

      expect(page1SegmentsFromOthers).toBe(0);
      expect(page1QueueFromOthers).toBe(0);

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Volume Control', () => {
    test('volume slider updates masterVolume', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      await page.fill('#volume', '50');
      await page.locator('#volume').dispatchEvent('input');

      const masterVolume = await page.evaluate(() => window.zellousDebug.state.masterVolume);
      expect(masterVolume).toBe(0.5);

      await context.close();
    });

    test('volume display updates with slider', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      await page.fill('#volume', '30');
      await page.locator('#volume').dispatchEvent('input');

      const volText = await page.locator('#volValue').textContent();
      expect(volText).toBe('30%');

      await context.close();
    });
  });

  test.describe('Deafen Mode', () => {
    test('deafen button toggles isDeafened state', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      let isDeafened = await page.evaluate(() => window.zellousDebug.state.isDeafened);
      expect(isDeafened).toBe(false);

      await page.click('#deafenBtn');
      isDeafened = await page.evaluate(() => window.zellousDebug.state.isDeafened);
      expect(isDeafened).toBe(true);

      await page.click('#deafenBtn');
      isDeafened = await page.evaluate(() => window.zellousDebug.state.isDeafened);
      expect(isDeafened).toBe(false);

      await context.close();
    });

    test('deafen button updates UI when activated', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      await page.click('#deafenBtn');

      const hasActiveClass = await page.locator('#deafenBtn').evaluate(el => el.classList.contains('active'));
      expect(hasActiveClass).toBe(true);

      const btnText = await page.locator('#deafenBtn').textContent();
      expect(btnText).toContain('Deafened');

      await context.close();
    });
  });

  test.describe('PTT (Push-to-Talk)', () => {
    test('PTT button sets isSpeaking state on mousedown', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
      await page.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 5000 });

      await page.locator('#pttBtn').dispatchEvent('mousedown');
      await page.waitForTimeout(100);

      const isSpeaking = await page.evaluate(() => window.zellousDebug.state.isSpeaking);
      expect(isSpeaking).toBe(true);

      await page.locator('#pttBtn').dispatchEvent('mouseup');
      await page.waitForTimeout(100);

      const isSpeakingAfter = await page.evaluate(() => window.zellousDebug.state.isSpeaking);
      expect(isSpeakingAfter).toBe(false);

      await context.close();
    });

    test('PTT button shows recording indicator', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });
      await page.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 5000 });

      await page.locator('#pttBtn').dispatchEvent('mousedown');
      await page.waitForTimeout(100);

      const recordingVisible = await page.locator('#recording').evaluate(el => el.style.display !== 'none');
      expect(recordingVisible).toBe(true);

      const hasRecordingClass = await page.locator('#pttBtn').evaluate(el => el.classList.contains('recording'));
      expect(hasRecordingClass).toBe(true);

      await page.locator('#pttBtn').dispatchEvent('mouseup');

      await context.close();
    });
  });

  test.describe('Audio Queue System', () => {
    test('queue view exists and is initially empty state', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const queueLength = await page.evaluate(() => window.zellousDebug.state.audioQueue.length);
      expect(queueLength).toBe(0);

      const activeSegmentsSize = await page.evaluate(() => window.zellousDebug.state.activeSegments.size);
      expect(activeSegmentsSize).toBe(0);

      await context.close();
    });

    test('queue segment is created for active speaker', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      await page2.waitForTimeout(500);

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_start' });
      });
      
      await page2.waitForFunction(() => window.zellousDebug.state.activeSpeakers.size > 0, { timeout: 5000 });

      const activeSpeakersOnPage2 = await page2.evaluate(() => Array.from(window.zellousDebug.state.activeSpeakers));
      expect(activeSpeakersOnPage2.length).toBeGreaterThan(0);

      const activeSegments = await page2.evaluate(() => {
        return Array.from(window.zellousDebug.state.activeSegments.entries()).map(([key, val]) => ({
          userId: val.userId,
          status: val.status
        }));
      });

      expect(activeSegments.length).toBeGreaterThan(0);
      expect(activeSegments[0].status).toBe('recording');

      await page1.evaluate(() => {
        window.zellousDebug.network.send({ type: 'audio_end' });
      });

      await context1.close();
      await context2.close();
    });
  });

  test.describe('Message History', () => {
    test('messages are stored with correct structure', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      const room = getUniqueRoom();

      await page1.goto(`?room=${room}`);
      await page1.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });

      await page2.goto(`?room=${room}`);
      await page2.waitForFunction(() => window.zellousDebug?.state?.userId, { timeout: 10000 });
      
      await page2.waitForFunction(() => window.zellousDebug.state.messages.length > 0, { timeout: 10000 });

      const messages = await page2.evaluate(() => window.zellousDebug.state.messages);

      expect(messages.length).toBeGreaterThan(0);
      const msg = messages[0];
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('text');
      expect(msg).toHaveProperty('time');

      await context1.close();
      await context2.close();
    });

    test('messages limit is enforced at 50', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      await page.evaluate(() => {
        for (let i = 0; i < 60; i++) {
          window.zellousDebug.message.add(`Test message ${i}`);
        }
      });

      const messageCount = await page.evaluate(() => window.zellousDebug.state.messages.length);
      expect(messageCount).toBe(50);

      await context.close();
    });
  });

  test.describe('Debug Interface', () => {
    test('window.zellousDebug exposes all modules', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto('/');
      await page.waitForFunction(() => window.zellousDebug, { timeout: 10000 });

      const modules = await page.evaluate(() => ({
        hasState: !!window.zellousDebug.state,
        hasConfig: !!window.zellousDebug.config,
        hasAudio: !!window.zellousDebug.audio,
        hasMessage: !!window.zellousDebug.message,
        hasNetwork: !!window.zellousDebug.network,
        hasPtt: !!window.zellousDebug.ptt,
        hasQueue: !!window.zellousDebug.queue,
        hasDeafen: !!window.zellousDebug.deafen
      }));

      Object.entries(modules).forEach(([key, value]) => {
        expect(value, `Module ${key} should exist`).toBe(true);
      });

      await context.close();
    });
  });

  test.describe('Room URL Parsing', () => {
    test('handles special characters in room names', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = 'test-room-123';

      await page.goto(`?room=${room}`);
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const roomId = await page.evaluate(() => window.zellousDebug.state.roomId);
      expect(roomId).toBe(room);

      await context.close();
    });

    test('handles URL encoded room names', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = 'test room spaces';
      const encodedRoom = encodeURIComponent(room);

      await page.goto(`?room=${encodedRoom}`);
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const roomId = await page.evaluate(() => window.zellousDebug.state.roomId);
      expect(roomId).toBe(room);

      await context.close();
    });

    test('handles multiple query parameters', async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const room = 'multi-param-room';

      await page.goto(`?foo=bar&room=${room}&baz=qux`);
      await page.waitForFunction(() => window.zellousDebug?.state?.ws?.readyState === 1, { timeout: 10000 });

      const roomId = await page.evaluate(() => window.zellousDebug.state.roomId);
      expect(roomId).toBe(room);

      await context.close();
    });
  });
});
