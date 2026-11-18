// Load the message catalog once, at startup. Edit web/messages.json to change copy.
interface Messages {
  greeting: Record<'lateNight' | 'morning' | 'afternoon' | 'evening', string[]>;
}

const url = new URL('./messages.json', import.meta.url);
const response = await fetch(url);
if (!response.ok) throw new Error(`Could not load messages (${response.status})`);

export const messages: Messages = await response.json() as Messages;
