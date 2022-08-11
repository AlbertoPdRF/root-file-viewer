(() => {
  const vscode = acquireVsCodeApi();

  const jsroot = this.JSROOT;

  let requests = {};
  let id = 0;
  class WebViewProxy extends jsroot.FileProxy {
    constructor(name, size) {
      super();
      this._name = name;
      this._size = size;
    }

    openFile() {
      return Promise.resolve(true);
    }

    getFileName() {
      return this._name;
    }

    getFileSize() {
      return this._size;
    }

    readBuffer(pos, sz) {
      return new Promise((resolve) => {
        requests[++id] = resolve;
        vscode.postMessage({
          type: "read",
          pos,
          sz,
          id,
        });
      });
    }
  }

  const dataset = document.getElementById("script").dataset;

  const settings = jsroot.settings;
  settings.DarkMode = dataset.darkMode === "true";
  settings.Palette = parseInt(dataset.palette);

  const h = new jsroot.HierarchyPainter("ROOT File Hierarchy");
  h.no_select = true;
  h.show_overflow = true;
  h.prepareGuiDiv("hierarchy", dataset.layout);
  h.createBrowser("browser").then(() => {
    const titleParagraph = document.querySelector(".jsroot_browser_title");
    if (titleParagraph) {
      titleParagraph.remove();
    }

    h.openRootFile(
      new WebViewProxy(dataset.fileUri, parseInt(dataset.fileSize))
    );
  });

  window.addEventListener("message", (event) => {
    const message = event.data; // The JSON data our extension sent
    if (message?.read && message?.id) {
      const resolve = requests[message.id];
      delete requests[message.id];
      if (resolve) {
        const blobStr = window.atob(message.read); // convert to binary string
        // const blobStr = Buffer.from(message.read, "base64")
        const buffer = new ArrayBuffer(blobStr.length);
        const view = new DataView(buffer, 0, blobStr.length);
        for (let i = 0; i < blobStr.length; ++i) {
          view.setUint8(i, blobStr.charCodeAt(i));
        }
        resolve(view);
      }
    }
  });

  jsroot.setSaveFile((filename, content) => {
    vscode.postMessage({
      type: "save",
      filename,
      content: window.btoa(content),
      // content: Buffer.from(content).toString("base64"),
    });
  });
})();
