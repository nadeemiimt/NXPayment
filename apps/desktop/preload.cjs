// Reserved for future secure IPC. No Node APIs exposed to the page.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("nxpaymentDesktop", {
  version: "0.1.0",
});
