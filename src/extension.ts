import * as fs from 'fs';
import * as ps from 'node-ps-data';
import {join} from 'path';
import * as vscode from 'vscode';

var panel: vscode.WebviewPanel;
var pollingInterval = 100;
var rsmLength = 10000;

function nop() {}

/**
 * Creates and starts a new Webview resource monitor.
 * @param context The VS Code Extension Context from which to launch the
 *     Webview.
 * @param pid The process ID to track with the resource monitor.
 */
async function launchWebview(context: vscode.ExtensionContext, pid: number) {
  // If a webview already exists, get rid of it.
  try {
    panel.dispose();
  } catch {
  }
  // Create the webview
  panel = vscode.window.createWebviewPanel(
      'resourceMonitor', 'Resource Monitor', vscode.ViewColumn.Beside,
      {enableScripts: true});
  // Set page
  let paneljs = panel.webview.asWebviewUri(
      vscode.Uri.file(join(context.extensionPath, 'webview', 'panel.js')));

  var htmlText =
      fs.readFileSync(join(context.extensionPath, 'webview', 'panel.html'))
          .toString();
  htmlText = htmlText.replace('${pid}', pid.toString());
  htmlText = htmlText.replace('${paneljs}', paneljs.toString());
  panel.webview.html = htmlText;

  panel.webview.postMessage({type: 'length', value: rsmLength});

  // Start updates
  startMonitor(pid);
  console.log(`Starting resource monitor for process ID ${pid}.`);
}

class PyDebugAdapterTracker implements vscode.DebugAdapterTracker {
  context: vscode.ExtensionContext;
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  onDidSendMessage(message: any): void {
    // Python ("python" "launch")
    // On (by my testing) seq:9 of messages, we get a message that includes
    // the process.
    if (message.type === 'event' && message.event === 'process') {
      launchWebview(this.context, message.body.systemProcessId);
    }
  }
}

class PyDebugAdapterTrackerFactory implements
    vscode.DebugAdapterTrackerFactory {
  context: vscode.ExtensionContext;
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  createDebugAdapterTracker(session: vscode.DebugSession):
      vscode.ProviderResult<vscode.DebugAdapterTracker> {
    return new PyDebugAdapterTracker(this.context);
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension Python Resource Monitor activated.');
  // Commands
  // Polling interval change
  context.subscriptions.push(vscode.commands.registerCommand(
      'python-resource-monitor.rsmInterval', () => {
        let intervalbox = vscode.window.createInputBox();
        intervalbox.title = 'Resource Monitor Polling Interval';
        intervalbox.placeholder = '100';
        // Validation
        intervalbox.onDidChangeValue((e) => {
          let num: number = parseInt(e);
          if (isNaN(num)) {
            intervalbox.validationMessage =
                'Input must be a valid integer number of milliseconds.';
          } else if (num < 1) {
            intervalbox.validationMessage =
                'Input must be a positive number of milliseconds.';
          }
        });
        // Handle accept
        intervalbox.onDidAccept((e) => {
          let num = parseInt(intervalbox.value);
          if (isNaN(num)) {
            vscode.window.showErrorMessage(
                'Invalid value entered for polling interval.');
          } else if (num < 1) {
            vscode.window.showErrorMessage(
                'Polling interval must be at least 1ms.');
          } else {
            pollingInterval = num;
            vscode.window.showInformationMessage(`Set polling interval to ${
                num}ms. This will take effect when a new resource monitor is opened.`);
            intervalbox.dispose();
          }
        });
        intervalbox.show();
      }));

  // Maximum time log length
  context.subscriptions.push(vscode.commands.registerCommand(
      'python-resource-monitor.rsmLength', () => {
        var lengthbox = vscode.window.createInputBox();
        lengthbox.title = 'Resource Monitor Length';
        lengthbox.placeholder = '0';
        lengthbox.prompt = '0 is unlimited log length.';
        // Validation
        lengthbox.onDidChangeValue((e) => {
          let num: number = parseInt(e);
          if (isNaN(num)) {
            lengthbox.validationMessage =
                'Input must be a valid integer number of milliseconds.';
          }
        });
        // Handle accept
        lengthbox.onDidAccept((e) => {
          let num = parseInt(lengthbox.value);
          if (isNaN(num)) {
            vscode.window.showErrorMessage(
                'Invalid value entered for polling interval.');
            return;
          }
          rsmLength = Math.max(0, num);  // Less than 1 is treated as unlimited.
          let rsmLengthRepr = rsmLength === 0 ? 'unlimited' : `${rsmLength}ms`;
          try {
            panel.webview.postMessage({type: 'length', value: num})
                .then(
                    () => {
                      // On success
                      vscode.window.showInformationMessage(
                          `Successfully set resource monitor length to ${
                              rsmLengthRepr}.`);
                    },
                    () => {
                      // On failure
                      vscode.window.showErrorMessage(
                          'Failed to change running resource monitor length. Has it been closed? Change will take effect on next start.');
                    });
          } catch {
            // There is no webview panel
            vscode.window.showInformationMessage(`Set resource monitor length to ${
                rsmLengthRepr}. This will take effect when a new resource monitor is opened.`);
          }
          lengthbox.dispose();
        });
        lengthbox.show();
      }));

  // Instead of just getting the debug start event, we now use an adapter
  // tracker. This also makes sure that we only get python debugs
  vscode.debug.registerDebugAdapterTrackerFactory(
      'python', new PyDebugAdapterTrackerFactory(context));
  // vscode.debug.onDidStartDebugSession((e) => {});

  vscode.debug.onDidTerminateDebugSession(() => {
    console.log('Stopping resource monitor.');
  });
}

/**
 * Send a datapoint to the Webview.
 * @param key The type of data to send.
 * @param time Timestamp for the data value.
 * @param value Value of data.
 */
function postData(
    key: 'memdata'|'cpudata'|'readdata'|'writedata', time: number,
    value: number) {
  try {
    // Make sure to catch promise rejections (when the webview has been
    // closed but a message is still posted) with .then()
    panel.webview.postMessage({type: key, time: time, value: value})
        .then(nop, nop);
  } catch {
    console.error(
        'Webview post failed. May be due to process interval not yet being closed.');
  }
}

/**
 * Get data for a specified process ID using node-ps-data.
 * @param pid Process ID to check.
 */
function getData(pid: number) {
  let cpu = ps.cpuTime(pid);
  let timecpu = Date.now();
  let mem = ps.memInfo(pid);
  let timemem = Date.now();
  let read = ps.fileRead(pid);
  let timeread = Date.now();
  let write = ps.fileWrite(pid);
  let timewrite = Date.now();
  // Send data to webview
  postData('memdata', timemem, mem);
  postData('cpudata', timecpu, cpu);
  postData('readdata', timeread, read);
  postData('writedata', timewrite, write);
}

/**
 * Starts the monitor interval and initializes dispose events.
 * @param pid Process ID to monitor.
 */
function startMonitor(pid: number) {
  let updateInterval: NodeJS.Timer = setInterval(getData, pollingInterval, pid);
  panel.onDidDispose(() => {
    clearInterval(updateInterval);
  });
  vscode.debug.onDidTerminateDebugSession(() => {
    clearInterval(updateInterval);
  });
}

export function deactivate() {
  try {
    panel.dispose();
  } catch {
    // pass
  }
}
