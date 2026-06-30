import { EventEmitter } from 'events';
import { redis } from '../redis.js';

export const sseEmitter = new EventEmitter();
// Allow unlimited listeners, since we could have 10,000 active SSE connections
sseEmitter.setMaxListeners(0);

// Single global subscriber for the entire analytics-api process
const globalSubscriber = redis.duplicate();

const channelSubscribers = new Map<string, number>();

globalSubscriber.on('message', (channel, message) => {
  // Broadcast the message to all HTTP connections listening on this channel
  sseEmitter.emit(channel, message);
});

export async function subscribeToChannel(channel: string) {
  const count = channelSubscribers.get(channel) || 0;
  channelSubscribers.set(channel, count + 1);
  
  if (count === 0) {
    // We are the first listener for this channel, tell Redis to send us messages
    await globalSubscriber.subscribe(channel).catch(console.error);
  }
}

export async function unsubscribeFromChannel(channel: string) {
  const count = channelSubscribers.get(channel) || 0;
  if (count <= 1) {
    channelSubscribers.delete(channel);
    // We are the last listener, tell Redis to stop sending messages for this channel
    await globalSubscriber.unsubscribe(channel).catch(console.error);
  } else {
    channelSubscribers.set(channel, count - 1);
  }
}
