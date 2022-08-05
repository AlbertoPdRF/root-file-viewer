(() => {
  const vscode = acquireVsCodeApi();

  const jsroot = this.JSROOT;
  const dataset = document.getElementById("script").dataset;

  const settings = jsroot.settings;
  settings.DarkMode = dataset.darkMode === "true";
  settings.Palette = parseInt(dataset.palette);

  const h = new jsroot.HierarchyPainter("ROOT File Hierarchy");
  h.no_select = true;
  h.show_overflow = true;
  h.prepareGuiDiv("hierarchy", dataset.layout);
  console.log(dataset.layout);
  h.createBrowser("browser").then(() => {
    const titleParagraph = document.querySelector(".jsroot_browser_title");
    if (titleParagraph) {
      titleParagraph.remove();
    }

    h.openRootFile(dataset.fileUri);
  });

  jsroot.setSaveFile((filename, content) => {
    vscode.postMessage({
      type: "save",
      filename,
      content: window.btoa(content),
    });
  });
})();
