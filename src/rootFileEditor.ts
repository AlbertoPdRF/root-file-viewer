import * as path from "path";
import * as vscode from "vscode";
import { Disposable } from "./dispose";

// import * as fs from "fs";


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

    let filesize = 0, filename = "file.root";

    // let btoa = require('btoa');   // this should be "btoa" module
    // let fs = require('fs');       // this is native "fs" module
    // let fd = fs.openSync(filename, 'r');
    // if (fd) {
    // let stats = fs.statSync(filename.uri);
    //  filesize = stats.size;
    // }

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      document.uri,
      filename,
      filesize
    );


    webviewPanel.webview.postMessage({ info: "Say hello size = " + filesize });

    // handle message inside Code
    webviewPanel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'alert':
               vscode.window.showErrorMessage(message.text);
               return;
            case 'save':
               // let fs = require('fs');       // this is native "fs" module
               // let atob = require('atob');   // this should be "atob" module
               // fs.writeFileSync(message.filename, atob(message.content)); // save binary file
               vscode.window.showInformationMessage(`Want to save file ${message.filename} base64 content ${message.content.length}`);
               return;
            case 'read': {
               let buffer = new ArrayBuffer(message.sz);
               let view = new DataView(buffer, 0, message.sz);
               let bytesRead = fs.readSync(fd, view, 0, message.sz, message.pos);
               let binStr = "";
               for (let i = 0; i < message.sz; ++i)
                  binStr += String.fromCharCode(view.getUint8(i));
               webviewPanel.webview.postMessage({
                   id: message.id,
                   data: btoa(binStr)
                });
               return;
            }

          }
        }
    );
  }

  private getHtmlForWebview(webview: vscode.Webview, file: vscode.Uri, filename: string, filesize: Number): string {
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
          const vscode = acquireVsCodeApi(),
                requests = {}; // list of requests

          let id = 0;

          class WebViewProxy extends JSROOT.FileProxy {
             constructor() {
               super();
            }

            getFileName() { return "${filename}"; }

            getFileSize() { return ${filesize}; }

            readBuffer(pos, sz)
            {
               return new Promise(resolve => {
                  requests[++id] = resolve;
                  vscode.postMessage({
                     command: 'read',
                     pos, sz, id
                  });
               });
            }
          }

          const settings = JSROOT.settings;
          settings.DarkMode = ${darkMode};
          settings.Palette = ${palette};

          const h = new JSROOT.HierarchyPainter("ROOT File Hierarchy");
          h.no_select = true;
          h.show_overflow = true;
          h.prepareGuiDiv("hierarchy", "${layout}");
          h.createBrowser("browser").then(() => {
            const titleParagraph = document.querySelector(".jsroot_browser_title");
            if (titleParagraph)
              titleParagraph.remove();

            h.openRootFile("${fileUri}");

            // instead should be h.openRootFile(new WebViewProxy);
          });

          // Handle the message inside the webview
          window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent
            if (message?.read && message?.id) {
               let resolve = requests[message.id];
               delete requests[message.id];

               if (resolve) {
                  let blobStr = atob(message.read); // convert to binary string
                  let buffer = new ArrayBuffer(blobStr.length);
                  let view = new DataView(buffer, 0, blobStr.length);
                  for (let i = 0; i < blobStr.length; ++i)
                     view.setUint8(i, blobStr.charCodeAt(i));
                  resolve(view);
               }

            } else if (message?.info)
               console.log('got message', message?.info);
          });

          vscode.postMessage({
             command: 'alert',
             text: 'test message for alert command'
          });

          JSROOT.setSaveFile((filename, content) => {
             // here binary content
             vscode.postMessage({
                command: 'save',
                filename,
                content: window.btoa(content)
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
