import { isPlainObject } from "./util.js";

export default function createPeer(options = {}) {
  const {
    peerConfig = {},
    dataChannels = [],
    initiator = false,
    offerOptions = {},
    answerOptions = {},
  } = options;

  const idledListeners = new Map();
  const idledMessageQueue = new Map();
  const role = initiator ? "initiator" : "responder";

  /** @type {PeerDataChannelMap} */
  const channelsMap = new Map(
    isPlainObject(dataChannels)
      ? Object.entries(dataChannels)
      : dataChannels.map((name) => [name, {}])
  );

  /** @type {Map<string, {channel:RTCDataChannel; initialized: boolean}>} */
  const channels = new Map();

  const pc = new RTCPeerConnection(peerConfig);
  const bufferQueue = new WeakMap();

  function send(channel, data) {
    if (!data) return;

    try {
      if (channel.bufferedAmount < 65536) {
        channel.send(data);
      } else {
        setTimeout(() => send(channel, data), 100);
      }
    } catch (error) {
      console.warn(error);
      const messages = bufferQueue.get(channel) ?? [data];
      bufferQueue.set(channel, messages);
    }
  }

  function handleIdledDataChannel(channel) {
    const label = channel.label;
    const createListeners = idledListeners.get(label);
    if (createListeners) {
      console.log(role, "initialize data channel", label);
      createListeners(channel);
      idledListeners.delete(label);
    }
    const chunks = idledMessageQueue.get(label);
    if (chunks) {
      for (const chunk of chunks) {
        send(channel, chunk);
      }
      idledMessageQueue.delete(label);
    }
  }

  function handleBufferQueue(channel) {
    const files = bufferQueue.get(channel) ?? [];
    while (files.length > 0) {
      send(channel, files.shift());
    }
    bufferQueue.delete(channel);
  }

  if (initiator) {
    for (const [label, init] of channelsMap.entries()) {
      const channel = pc.createDataChannel(label, init);
      channels.set(label, channel);
      channel.onopen = () => handleIdledDataChannel(channel);
      channel.onbufferedamountlow = () => handleBufferQueue(channel);
    }
  } else {
    pc.ondatachannel = (event) => {
      console.log(role, "create data channel", event.channel.label);
      const channel = event.channel;
      channels.set(channel.label, channel);
      channel.onopen = () => handleIdledDataChannel(channel);
      channel.onbufferedamountlow = () => handleBufferQueue(channel);
    };
  }

  /** @type {(() => void) | null} */
  let injectOffer = null;

  async function createOffer() {
    const offer = await pc.createOffer(offerOptions);
    await pc.setLocalDescription(offer);
    return { type: "offer", data: pc.localDescription.toJSON() };
  }

  let signalController = null;

  function enqueueSignal(data) {
    try {
      console.log(role, "send", data);
      signalController.enqueue(data);
    } catch (error) {
      console.error(role, error);
    }
  }

  const waitingQueue = [];

  return {
    /** @type {RTCPeerConnection} */
    peerConnection: pc,

    signal() {
      return new ReadableStream({
        start(controller) {
          const onSignal = (type) => () =>
            controller.enqueue({ type, data: pc[type] });

          pc.onsignalingstatechange = onSignal("signalingState");
          pc.oniceconnectionstatechange = onSignal("iceConnectionState");
          pc.onicegatheringstatechange = onSignal("iceGatheringState");
          pc.onconnectionstatechange = onSignal("connectionState");
        },
      });
    },

    connect() {
      const queueIceCandidates = [];
      return new TransformStream({
        async start(controller) {
          signalController = controller;

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              enqueueSignal({
                type: "candidate",
                data: event.candidate.toJSON(),
              });
            }
          };

          pc.onicecandidateerror = (event) => {
            console.error(role, "ice candidate error", event.errorCode);
          };

          pc.onnegotiationneeded = async () => {
            console.log(role, "renegotiation needed");
            try {
              const message = await createOffer();
              enqueueSignal(message);
            } catch (error) {
              console.error(role, error);
            }
          };

          injectOffer = async () => {
            const message = await createOffer();
            enqueueSignal(message);
          };

          while (waitingQueue.length) {
            const message = await waitingQueue.shift()();
            enqueueSignal(message);
          }
        },

        async transform(chunk) {
          const { type, data = chunk.status } =
            chunk.type === "data" ? chunk.data : chunk;
          try {
            if (type === "offer") {
              await pc.setRemoteDescription(data);
              console.log(role, "received offer");

              const answer = await pc.createAnswer(answerOptions);
              await pc.setLocalDescription(answer);
              enqueueSignal({
                type: "answer",
                data: pc.localDescription.toJSON(),
              });
              console.log(role, "sent answer");
              while (queueIceCandidates.length) {
                await pc.addIceCandidate(queueIceCandidates.shift());
                console.log(role, "received ice candidate");
              }
            } else if (type === "answer") {
              await pc.setRemoteDescription(data);
              console.log(role, "received answer");
              while (queueIceCandidates.length) {
                await pc.addIceCandidate(queueIceCandidates.shift());
                console.log(role, "received ice candidate");
              }
            } else if (type === "candidate") {
              if (pc.remoteDescription === null) {
                queueIceCandidates.push(data);
              } else {
                await pc.addIceCandidate(data);
                console.log(role, "received ice candidate");
              }
            }
          } catch (error) {
            console.error(role, error);
          }
        },

        flush(controller) {
          console.warn(role, "connection closed");
          controller.close();
        },
      });
    },

    async reconnect() {
      try {
        console.log(role, "reconnect");
        const message = await createOffer();
        enqueueSignal(message);
      } catch (error) {
        console.error(role, error);
      }
    },

    end() {
      pc.close();
    },

    /**
     * Creates a transform stream that forwards data from data channels to the
     * controller. The transform stream is parameterized by a mapping of property
     * names to data channel labels. When a data channel is opened, a listener
     * is set up to forward messages to the controller under the associated
     * property name. If the data channel is not yet open, messages are queued
     * and sent when the channel is opened.
     * @param {string[] | { channelMapping: string[] | { [key: string]: string } }} [options]
     * @returns {TransformStream}
     */
    multiData({ channelMapping = [] } = {}) {
      channelMapping = Array.isArray(channelMapping)
        ? new Map(channelMapping.map((label) => [label, label]))
        : new Map(Object.entries(channelMapping));
      const setupListeners = (controller, channel, prop) => {
        channel.onmessage = (event) =>
          controller.enqueue({ [prop]: event.data });
      };

      return new TransformStream({
        async start(controller) {
          for (const [prop, label] of channelMapping.entries()) {
            const channel = channels.get(label);
            if (channel?.readyState === "open") {
              setupListeners(controller, channel, prop);
            } else {
              idledListeners.set(label, (channel) =>
                setupListeners(controller, channel, prop)
              );
            }
          }
        },

        async transform(chunk) {
          for (const [prop, label] of channelMapping.entries()) {
            const channel = channels.get(label);
            if (channel?.readyState === "open") {
              send(channel, chunk[prop]);
            } else if (idledMessageQueue.has(label)) {
              idledMessageQueue.get(label).push(chunk[prop]);
            } else {
              idledMessageQueue.set(label, [chunk[prop]]);
            }
          }
        },

        flush(controller) {
          for (const label of channelMapping.values()) {
            console.warn(role, "data channel closed", label);
            const channel = channels.get(label);
            if (channel?.readyState === "open") {
              channel.close();
            } else if (idledMessageQueue.has(label)) {
              while (idledMessageQueue.get(label).length) {
                controller.enqueue(idledMessageQueue.get(label).shift());
              }
            }
          }
          controller.close();
        },
      });
    },

    data(label) {
      const setupListeners = (controller, channel) => {
        channel.onmessage = (event) => controller.enqueue(event.data);
      };

      return new TransformStream({
        async start(controller) {
          const channel = channels.get(label);
          if (channel?.readyState === "open") {
            setupListeners(controller, channel);
          } else {
            idledListeners.set(label, (channel) =>
              setupListeners(controller, channel)
            );
          }
        },

        async transform(chunk) {
          const channel = channels.get(label);
          if (channel?.readyState === "open") {
            send(channel, chunk);
          } else if (idledMessageQueue.has(label)) {
            idledMessageQueue.get(label).push(chunk);
          } else {
            idledMessageQueue.set(label, [chunk]);
          }
        },

        flush(controller) {
          console.warn(role, "data channel closed", label);
          const channel = channels.get(label);
          if (channel?.readyState === "open") {
            channel.close();
          } else if (idledMessageQueue.has(label)) {
            while (idledMessageQueue.get(label).length) {
              controller.enqueue(idledMessageQueue.get(label).shift());
            }
          }
          controller.close();
        },
      });
    },
  };
}
