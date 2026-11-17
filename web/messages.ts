// Load the message catalog once, at startup. Edit web/messages.json to change copy.
const url = new URL('./messages.json', import.meta.url);
const response = await fetch(url);
if (!response.ok) throw new Error(`Could not load messages (${response.status})`);

export const messages = await response.json();
