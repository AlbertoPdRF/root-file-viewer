import * as vscode from "vscode";
import { RootFileEditorProvider } from "./rootFileEditor";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(RootFileEditorProvider.register(context));
}
