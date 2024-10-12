export function createConnection(client, peer) {
  client.getReader().pipeThrough(peer.connect()).pipeTo(client.getWriter());
}

export function createMessageChannel(peer) {
  /** @type {ReadableStreamDefaultController} */
  let ctr;

  /** @type {(message: any) => void | Promise<void>} */
  let cb;
  new ReadableStream({
    start(controller) {
      ctr = controller;
    },
  })
    .pipeThrough(peer.data("message"))
    .pipeTo(
      new WritableStream({
        async write(chunk) {
          if (chunk) {
            try {
              const p = cb?.(JSON.parse(chunk));
              if (p) await p;
            } catch (e) {
              log.error(e);
            }
          }
        },
      })
    );

  return {
    send(data) {
      if (!data) return;
      ctr.enqueue(JSON.stringify(data));
    },
    listen(callback) {
      cb = callback;
    },
  };
}
