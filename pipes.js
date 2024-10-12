export function createConnection(client, peer) {
  client.getReader().pipeThrough(peer.connect()).pipeTo(client.getWriter());
}

