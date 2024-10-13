import Alpine from "https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/module.esm.js";

export default function createMerchant() {
  Alpine.data("product", () => ({
    name: "",
    price: 0,

    save() {
      Alpine.store("warez").push({ name: this.name, price: this.price });
      this.name = "";
      this.price = 0;
    },
  }));

  Alpine.data("preview", () => ({
    warez: [],

    init() {
      this.warez = Alpine.store("warez");
    },
  }));

  Alpine.store("warez", []);
}
