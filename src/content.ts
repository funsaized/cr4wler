import { Cr4wler } from './engine';
import type { Command } from './types';
// executeScript can be invoked repeatedly; one isolated-world controller per document.
const scope = globalThis as typeof globalThis & { __cr4wler?: Cr4wler };
if (!scope.__cr4wler) {
  const engine = new Cr4wler();
  scope.__cr4wler = engine;
  chrome.runtime.onMessage.addListener((message: Command, _sender, respond) => {
    if (message?.type !== 'CR4WLER') return;
    if (message.action === 'summon') respond(engine.summon(message.settings, message.firstUse));
    else if (message.action === 'restore') respond(engine.restore());
    else if (message.action === 'pause') respond(engine.pause());
    else if (message.action === 'configure') respond(engine.configure(message.settings ?? {}));
    else respond(engine.status());
  });
}
