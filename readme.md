# hackathon project cashu-rtc

Interactive cashu shop.

## Precondition

- Using [Polar](https://lightningpolar.com/) to create a test lightning network
- Using [gonuts](https://github.com/elnosh/gonuts) mint
- Using [nostr-rs-relay](https://github.com/scsibug/nostr-rs-relay) as a signal server

## Nostr event

I create an ephemeral event of `kind:23456` (an event that will/should not be saved by the relay) for every
connection information the two peers are exchanging.

```json
{
  "kind": 23456,
  "created_at": 1728797989,
  "tags": [["p", "<receiver pubkey>"]],
  "content": "<exchange data>"
  // ...
}
```

# ToDo

- [x] Find a nostr relay I can use to move around some ephemeral events
- [x] setup local lightning nodes + mint
- [x] Get used to cashu library
- [x] Add cashu functionality
  - [x] Create encoded token
  - [x] Send encoded tokens
  - [x] Save received tokens
  - [x] Save save balance
- [x] Nostr + WebRTC
  - [x] Sending nostr pubkey is a much better idea...
- [x] Create nostr relay connection for signaling RTC connection states
- [x] Make a test HTML for RTC connection
- [x] Make a test HTML for cashu behavior
- [ ] Make a test HTML for creating shop manager and a shop view
  - [ ] Send a list of products
  - [ ] Customer chooses items to buy
  - [ ] Click on buy and the whole cashu minting and tokens run under the hood
- [ ] Throw it all together and make a MVP
  - [ ] Create a shop site for the merchant
    - [ ] Create QR code and/or npub to copy
  - [ ] Create a shop view for the customer
    - [ ] Scan QR code and/or npub to paste
