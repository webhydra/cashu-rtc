import Alpine from "https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/module.esm.js";
import {
  CashuMint,
  CashuWallet,
  MintQuoteState,
  getEncodedToken,
} from "https://esm.sh/@cashu/cashu-ts@1.1.0";
import createPeer from "../external/peer.js";
import createSignalClient from "../relay.js";
import { createConnection } from "../pipes.js";

export default function createWallet() {
  const mintUrl = "http://localhost:3338";
  const mint = new CashuMint(mintUrl);
  const secretKey = generateSecretKey();

  Alpine.data("transaction", () => ({
    sendToken: "",
    receiveToken: "",
    sendAmount: "0",
    proofs: [],
    wallet: null,

    peer: null,
    pubkey: null,
    remotePubkey: null,
    relayUrl: "ws://localhost:1234",

    async init() {
      this.wallet = new CashuWallet(mint, { unit: "sat" });
      this.pubkey = getPublicKey(secretKey);
    },

    async createInitPeer() {
      this.peer = createPeer({ initiator: true, dataChannels: ["message"] });
      const signalClient = await createSignalClient(this.relayUrl, secretKey);
      signalClient.setRemotePubkey(remotePubkey);
      createConnection(signalClient, peer);
    },

    async createPeer() {
      this.peer = createPeer({ dataChannels: ["message"] });
      const signalClient = await createSignalClient(this.relayUrl, secretKey);
      createConnection(signalClient, peer);
    },

    async send() {
      const sendAmount = parseInt(this.sendAmount, 10);
      const proofs = Alpine.store("proofs");

      const { send: sendProofs, returnChange: changeProofs } =
        await this.wallet.send(sendAmount, proofs);
      const encoded = getEncodedToken({
        token: [{ mint: mintUrl, proofs: sendProofs }],
      });
      Alpine.store("proofs", changeProofs);
      console.log("response", changeProofs, sendProofs, encoded);
    },

    async receive() {
      if (!this.receiveToken) return;
      const receive = await this.wallet.receive(this.receiveToken);
      if (receive) Alpine.store("proofs").push(...receive);
    },
  }));

  Alpine.data("wallet", () => ({
    plannedTokenAmount: "0",

    wallet: null,
    info: {},
    mintQuote: {},
    proofs: [],
    checkedQuote: {},
    invoiceCopied: false,

    get totalAmount() {
      return Alpine.store("proofs").reduce(
        (total, proof) => total + proof.amount,
        0
      );
    },

    get pendingAmount() {
      return Alpine.store("quotes")
        .filter((quote) => quote.state === MintQuoteState.UNPAID)
        .reduce((total, quote) => total + quote.amount, 0);
    },

    get canMint() {
      const allowed = this.checkedQuote.state === MintQuoteState.PAID;
      return allowed;
    },

    async init() {
      this.wallet = new CashuWallet(mint, { unit: "sat" });
    },

    async copyInvoice() {
      navigator.clipboard.writeText(this.mintQuote.request);
      this.invoiceCopied = true;
      setTimeout(() => (this.invoiceCopied = false), 3000);
    },

    async updateQuote() {
      const plannedTokenAmount = parseInt(this.plannedTokenAmount, 10);
      this.mintQuote = await this.wallet.createMintQuote(plannedTokenAmount);
      console.log("mint quote", this.mintQuote);
    },

    async updateInfo() {
      this.info = await this.wallet.getMintInfo();
    },

    async checkQuote() {
      if (!this.mintQuote.quote) return;
      this.checkedQuote = await this.wallet.checkMintQuote(
        this.mintQuote.quote
      );
      console.log("checked quote", this.checkedQuote);
    },

    async mint() {
      if (this.canMint) {
        const tokenAmount = parseInt(this.plannedTokenAmount, 10);
        const { proofs } = await this.wallet.mintTokens(
          tokenAmount,
          this.mintQuote.quote
        );
        const storedProofs = Alpine.store("proofs");
        storedProofs.push(...proofs);
        this.proofs = storedProofs;
        this.plannedTokenAmount = "0";
      }
    },
  }));

  Alpine.store("proofs", []);
  Alpine.store("quotes", []);
}
