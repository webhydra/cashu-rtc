import {
  Relay,
  getPublicKey,
  finalizeEvent,
} from "https://esm.sh/nostr-tools@2.8.0";

export default async function createSignalClient(url, secretKey) {
  let pubkey, remotePubkey;
  const relay = await Relay.connect(url);
  const handleEvents = function (controller) {
    relay.subscribe([{ "#p": [pubkey], kinds: [23456] }], {
      onevent(event) {
        event.content = JSON.parse(event.content);
        if (!remotePubkey) remotePubkey = event.pubkey;
        controller.enqueue(event.content);
      },
    });
  };

  return {
    getRemotePubkey() {
      return remotePubkey;
    },
    setRemotePubkey(pubkey) {
      remotePubkey = pubkey;
    },

    getReader() {
      return new ReadableStream({
        async start(controller) {
          if (!pubkey) pubkey = await getPublicKey(secretKey);
          handleEvents(controller);
        },
      });
    },

    getWriter() {
      return new WritableStream({
        async write(chunk) {
          const event = finalizeEvent(
            {
              kind: 23456,
              created_at: Math.floor(Date.now() / 1000),
              tags: [["p", remotePubkey]],
              content: JSON.stringify(chunk),
            },
            secretKey
          );
          relay.publish(event);
        },
      });
    },
  };
}
