// Direct WebSocket relay test
import WebSocket from 'ws';

const BASE_URL = process.env.TEST_URL || 'ws://localhost:3456';

async function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

async function collectMessages(ws, duration = 1000) {
  const messages = [];
  return new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
    };
    ws.on('message', handler);
    setTimeout(() => {
      ws.off('message', handler);
      resolve(messages);
    }, duration);
  });
}

async function runTests() {
  console.log('Testing audio relay against:', BASE_URL);
  let passed = 0;
  let failed = 0;

  // Test 1: Basic connection
  console.log('\n=== Test 1: Basic Connection ===');
  try {
    const ws = new WebSocket(BASE_URL);
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const connMsg = await waitForMessage(ws, 'connection_established');
    console.log('✓ Got connection_established with clientId:', connMsg.clientId);
    ws.close();
    passed++;
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  // Test 2: Room join
  console.log('\n=== Test 2: Room Join ===');
  try {
    const ws = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws.on('open', resolve));
    await waitForMessage(ws, 'connection_established');

    ws.send(JSON.stringify({ type: 'join_room', roomId: 'test-room' }));
    const roomMsg = await waitForMessage(ws, 'room_joined');
    console.log('✓ Joined room:', roomMsg.roomId);
    ws.close();
    passed++;
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  // Test 3: Two users in same room see each other
  console.log('\n=== Test 3: Two Users in Same Room ===');
  try {
    const room = 'test-room-' + Date.now();

    const ws1 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws1.on('open', resolve));
    const conn1 = await waitForMessage(ws1, 'connection_established');
    ws1.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws1, 'room_joined');

    const ws2 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws2.on('open', resolve));
    const conn2 = await waitForMessage(ws2, 'connection_established');

    // Set up listener for user_joined on ws1
    const userJoinedPromise = waitForMessage(ws1, 'user_joined', 3000);

    ws2.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws2, 'room_joined');

    const userJoined = await userJoinedPromise;
    console.log('✓ User1 saw User2 join:', userJoined.userId);

    ws1.close();
    ws2.close();
    passed++;
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  // Test 4: Speaker events are broadcast
  console.log('\n=== Test 4: Speaker Events Broadcast ===');
  try {
    const room = 'test-room-' + Date.now();

    const ws1 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws1.on('open', resolve));
    const conn1 = await waitForMessage(ws1, 'connection_established');
    ws1.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws1, 'room_joined');

    const ws2 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws2.on('open', resolve));
    ws2.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws2, 'room_joined');

    // Clear any pending messages
    await new Promise(r => setTimeout(r, 100));

    // ws1 starts speaking
    const speakerJoinedPromise = waitForMessage(ws2, 'speaker_joined', 3000);
    ws1.send(JSON.stringify({ type: 'audio_start' }));

    const speakerJoined = await speakerJoinedPromise;
    console.log('✓ User2 received speaker_joined for User1:', speakerJoined.userId);

    // ws1 stops speaking
    const speakerLeftPromise = waitForMessage(ws2, 'speaker_left', 3000);
    ws1.send(JSON.stringify({ type: 'audio_end' }));

    const speakerLeft = await speakerLeftPromise;
    console.log('✓ User2 received speaker_left for User1:', speakerLeft.userId);

    ws1.close();
    ws2.close();
    passed++;
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  // Test 5: Audio chunks are relayed
  console.log('\n=== Test 5: Audio Chunks Relay ===');
  try {
    const room = 'test-room-' + Date.now();

    const ws1 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws1.on('open', resolve));
    const conn1 = await waitForMessage(ws1, 'connection_established');
    ws1.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws1, 'room_joined');

    const ws2 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws2.on('open', resolve));
    ws2.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws2, 'room_joined');

    // Clear any pending messages
    await new Promise(r => setTimeout(r, 100));

    // Collect all messages on ws2
    const messagesPromise = collectMessages(ws2, 2000);

    // ws1 starts speaking
    ws1.send(JSON.stringify({ type: 'audio_start' }));

    // ws1 sends audio chunks
    await new Promise(r => setTimeout(r, 100));
    const testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = 0; i < 5; i++) {
      ws1.send(JSON.stringify({ type: 'audio_chunk', data: testData }));
      await new Promise(r => setTimeout(r, 50));
    }

    // ws1 stops speaking
    ws1.send(JSON.stringify({ type: 'audio_end' }));

    const messages = await messagesPromise;

    const audioDataMessages = messages.filter(m => m.type === 'audio_data');
    const speakerJoinedMessages = messages.filter(m => m.type === 'speaker_joined');
    const speakerLeftMessages = messages.filter(m => m.type === 'speaker_left');

    console.log('Messages received by User2:');
    console.log('  - speaker_joined:', speakerJoinedMessages.length);
    console.log('  - audio_data:', audioDataMessages.length);
    console.log('  - speaker_left:', speakerLeftMessages.length);

    if (audioDataMessages.length === 5) {
      console.log('✓ All 5 audio chunks received');

      // Verify the data is correct
      const firstChunk = audioDataMessages[0];
      if (JSON.stringify(firstChunk.data) === JSON.stringify(testData)) {
        console.log('✓ Audio data integrity verified');
      } else {
        console.log('✗ Audio data mismatch:', firstChunk.data);
        failed++;
        passed--;
      }
      passed++;
    } else {
      console.log('✗ Expected 5 audio chunks, got:', audioDataMessages.length);
      failed++;
    }

    ws1.close();
    ws2.close();
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  // Test 6: Sender does NOT receive own audio
  console.log('\n=== Test 6: Sender Does Not Receive Own Audio ===');
  try {
    const room = 'test-room-' + Date.now();

    const ws1 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws1.on('open', resolve));
    ws1.send(JSON.stringify({ type: 'join_room', roomId: room }));
    await waitForMessage(ws1, 'room_joined');

    // Collect all messages on ws1 (the sender)
    const messagesPromise = collectMessages(ws1, 2000);

    // ws1 speaks
    ws1.send(JSON.stringify({ type: 'audio_start' }));
    await new Promise(r => setTimeout(r, 100));

    for (let i = 0; i < 3; i++) {
      ws1.send(JSON.stringify({ type: 'audio_chunk', data: [1, 2, 3] }));
      await new Promise(r => setTimeout(r, 50));
    }

    ws1.send(JSON.stringify({ type: 'audio_end' }));

    const messages = await messagesPromise;

    const audioDataMessages = messages.filter(m => m.type === 'audio_data');
    const speakerJoinedMessages = messages.filter(m => m.type === 'speaker_joined');

    console.log('Messages received by sender (User1):');
    console.log('  - speaker_joined:', speakerJoinedMessages.length);
    console.log('  - audio_data:', audioDataMessages.length);

    if (audioDataMessages.length === 0) {
      console.log('✓ Sender correctly did NOT receive own audio');
      passed++;
    } else {
      console.log('✗ BUG: Sender received their own audio!');
      failed++;
    }

    // Note: Sender DOES receive speaker_joined (broadcast to all including sender)
    // This is expected behavior per server.js line 49

    ws1.close();
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  // Test 7: Room isolation
  console.log('\n=== Test 7: Room Isolation ===');
  try {
    const room1 = 'room1-' + Date.now();
    const room2 = 'room2-' + Date.now();

    // User in room1
    const ws1 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws1.on('open', resolve));
    ws1.send(JSON.stringify({ type: 'join_room', roomId: room1 }));
    await waitForMessage(ws1, 'room_joined');

    // User in room2
    const ws2 = new WebSocket(BASE_URL);
    await new Promise((resolve) => ws2.on('open', resolve));
    ws2.send(JSON.stringify({ type: 'join_room', roomId: room2 }));
    await waitForMessage(ws2, 'room_joined');

    // Collect messages on ws2
    const messagesPromise = collectMessages(ws2, 1500);

    // ws1 sends audio in room1
    ws1.send(JSON.stringify({ type: 'audio_start' }));
    await new Promise(r => setTimeout(r, 50));
    ws1.send(JSON.stringify({ type: 'audio_chunk', data: [1, 2, 3] }));
    await new Promise(r => setTimeout(r, 50));
    ws1.send(JSON.stringify({ type: 'audio_end' }));

    const messages = await messagesPromise;

    const audioMessages = messages.filter(m =>
      m.type === 'audio_data' || m.type === 'speaker_joined' || m.type === 'speaker_left'
    );

    if (audioMessages.length === 0) {
      console.log('✓ Room isolation working - User2 in room2 received no audio from room1');
      passed++;
    } else {
      console.log('✗ BUG: Room isolation broken - received messages from other room:', audioMessages);
      failed++;
    }

    ws1.close();
    ws2.close();
  } catch (err) {
    console.log('✗ Failed:', err.message);
    failed++;
  }

  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
