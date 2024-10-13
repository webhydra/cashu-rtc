export default function createMessenger() {
  Alpine.data("messenger", () => ({
    message: "",
    messages: [],
    _send: () => null,

    init() {
      const { send, listen } = createMessageChannel(peerA);
      listen((message) => this.messages.push(message));
      this._send = send;
    },

    send() {
      this._send(this.message);
      this.message = "";
    },
  }));
}
