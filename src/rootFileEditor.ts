import * as vscode from "vscode";
import { Disposable } from "./dispose";

class RootFileDocument extends Disposable implements vscode.CustomDocument {
  static async create(
    uri: vscode.Uri
  ): Promise<RootFileDocument | PromiseLike<RootFileDocument>> {
    return new RootFileDocument(uri);
  }

  private readonly _uri: vscode.Uri;

  private constructor(uri: vscode.Uri) {
    super();
    this._uri = uri;
  }

  public get uri() {
    return this._uri;
  }

  private readonly _onDidDispose = this._register(
    new vscode.EventEmitter<void>()
  );

  public readonly onDidDispose = this._onDidDispose.event;

  dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }
}

export class RootFileEditorProvider
  implements vscode.CustomReadonlyEditorProvider<RootFileDocument>
{
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      RootFileEditorProvider.viewType,
      new RootFileEditorProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  private static readonly viewType = "rootFileViewer.rootFile";

  private readonly webviews = new WebviewCollection();

  constructor(private readonly _context: vscode.ExtensionContext) {}

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: {},
    _token: vscode.CancellationToken
  ): Promise<RootFileDocument> {
    const document: RootFileDocument = await RootFileDocument.create(uri);
    return document;
  }

  async resolveCustomEditor(
    document: RootFileDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.webviews.add(document.uri, webviewPanel);

    const documentRoot = document.uri.with({
      path: document.uri.path.replace(/\/[^\/]+?\.\w+$/, "/"),
    });
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._context.extensionUri, documentRoot],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document.uri
    );

    webviewPanel.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case "save": {
          const fileUri = vscode.Uri.joinPath(documentRoot, message.filename);
          vscode.workspace.fs.writeFile(
            fileUri,
            Buffer.from(message.content, "base64")
          );
          vscode.window.showInformationMessage(`Saving file ${fileUri.path}.`);
          return;
        }
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview, file: vscode.Uri): string {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "media", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "media", "vscode.css")
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "media", "rootFile.css")
    );

    const jsrootUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, "dist", "jsroot.js")
    );

    const fileUri = webview.asWebviewUri(file);

    const configuration = vscode.workspace.getConfiguration("rootFileViewer");
    const darkMode = configuration.get("darkMode");
    const layout = configuration.get("layout");
    const palette = configuration.get("palette");

    return /* html */ `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link href="${styleResetUri}" rel="stylesheet" />
        <link href="${styleVSCodeUri}" rel="stylesheet" />
        <link href="${styleMainUri}" rel="stylesheet" />

        <script src="${jsrootUri}"></script>

        <title>ROOT File</title>
      </head>
      <body>
        <div id="hierarchy"></div>

        <script>
          const vscode = acquireVsCodeApi();

          const settings = JSROOT.settings;
          settings.DarkMode = ${darkMode};
          settings.Palette = ${palette};

          const h = new JSROOT.HierarchyPainter("ROOT File Hierarchy");
          h.no_select = true;
          h.show_overflow = true;
          h.prepareGuiDiv("hierarchy", "${layout}");
          h.createBrowser("browser").then(() => {
            const titleParagraph = document.querySelector(".jsroot_browser_title");
            if (titleParagraph) {
              titleParagraph.remove();
            }

            h.openRootFile("${fileUri}");
          });

          JSROOT.setSaveFile((filename, content) => {
            vscode.postMessage({
              type: "save",
              filename,
              content: window.btoa(content),
            });
          });
        </script>
      </body>
      </html>`;
  }
}

class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
