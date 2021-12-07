import { join } from "path";
import * as vscode from "vscode";
import { exec } from "child_process";

// If node-ps-data fails to load (possibly due to a failed build, MacOS, etc.) use the existing depreciated methods.
var ps: any;
try {
  ps = require("node-ps-data");
} catch {
  console.log(
    "Failed to load module node-ps-data. Using backup depreciated methods. CPU time resolution will be 1 second."
  );
}

var panel: vscode.WebviewPanel;
var pollingInterval = 100;
var rsmLength = 10000;

/**
 * Creates and starts a new Webview resource monitor.
 * @param context The VS Code Extension Context from which to launch the Webview.
 * @param pid The process ID to track with the resource monitor.
 */
async function launchWebview(context: vscode.ExtensionContext, pid: number) {
  // If a webview already exists, get rid of it.
  try {
    panel.dispose();
  } catch { }
  // Create the webview
  panel = vscode.window.createWebviewPanel(
    "resourceMonitor",
    "Resource Monitor",
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );
  // Set page
  let paneljs = panel.webview.asWebviewUri(
    vscode.Uri.file(join(context.extensionPath, "webview", "panel.js"))
  );
  let plotlyjs = panel.webview.asWebviewUri(
    vscode.Uri.file(join(context.extensionPath, "webview", "plotly.js"))
  );
  panel.webview.html = `
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Resource Monitor</title>
            <link
            href="https://raw.githubusercontent.com/microsoft/vscode-codicons/40014cd4f4415cd8aca14c50370c32346473cf6f/src/icons/graph.svg"
            rel="icon"
            />
        </head>
        <body style="height: 100%; width: 100%; padding: 0">
            <div id="container" style="margin-left: 10px;">
            <h3>Process Info:</h3>
            <div id="processinfo">
                <div id="processid">PID: ${pid}</div>
            </div>
            <h3 id="memtitle">Memory Usage</h3>
            <div style="width: 100%; max-height: 150px; margin: 0 auto">
                <canvas id="memory" style="width: 100%; height: 100%"></canvas>
            </div>
            <h3 id="cputitle">CPU Usage</h3>
            <div style="width: 100%; max-height: 150px; margin: 0 auto">
                <canvas id="cpu" style="width: 100%; height: 100%"></canvas>
            </div>
            </div>
            <script src="${paneljs}"></script>
            <script src="${plotlyjs}"></script>
        </body>
        </html>
    `;
  panel.webview.postMessage({ type: "length", value: rsmLength });

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
    // On (by my testing) seq:9 of messages, we get a message that includes the process.
    if (message.type === "event" && message.event === "process") {
      launchWebview(this.context, message.body.systemProcessId);
    }
  }
}

class PyDebugAdapterTrackerFactory
  implements vscode.DebugAdapterTrackerFactory {
  context: vscode.ExtensionContext;
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  createDebugAdapterTracker(
    session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
    return new PyDebugAdapterTracker(this.context);
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log("Extension Python Resource Monitor activated.");
  // Commands
  // Polling interval change
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "python-resource-monitor.rsmInterval",
      () => {
        let intervalbox = vscode.window.createInputBox();
        intervalbox.title = "Resource Monitor Polling Interval";
        intervalbox.placeholder = "100";
        // Validation
        intervalbox.onDidChangeValue((e) => {
          let num: number = parseInt(e);
          if (isNaN(num)) {
            intervalbox.validationMessage =
              "Input must be a valid integer number of milliseconds.";
          } else if (num < 1) {
            intervalbox.validationMessage =
              "Input must be a positive number of milliseconds.";
          } else {
            intervalbox.validationMessage = undefined;
          }
        });
        // Handle accept
        intervalbox.onDidAccept((e) => {
          let num = parseInt(intervalbox.value);
          if (isNaN(num)) {
            vscode.window.showErrorMessage(
              "Invalid value entered for polling interval."
            );
          } else if (num < 1) {
            vscode.window.showErrorMessage(
              "Polling interval must be at least 1ms."
            );
          } else {
            pollingInterval = num;
            vscode.window.showInformationMessage(
              `Set polling interval to ${num}ms. This will take effect when a new resource monitor is opened.`
            );
            intervalbox.dispose();
          }
        });
        intervalbox.show();
      }
    )
  );

  // Maximum time log length
  context.subscriptions.push(
    vscode.commands.registerCommand("python-resource-monitor.rsmLength", () => {
      var lengthbox = vscode.window.createInputBox();
      lengthbox.title = "Resource Monitor Length";
      lengthbox.placeholder = "0";
      lengthbox.prompt = "0 is unlimited log length.";
      // Validation
      lengthbox.onDidChangeValue((e) => {
        let num: number = parseInt(e);
        if (isNaN(num)) {
          lengthbox.validationMessage =
            "Input must be a valid integer number of milliseconds.";
        } else {
          lengthbox.validationMessage = undefined;
        }
      });
      // Handle accept
      lengthbox.onDidAccept((e) => {
        let num = parseInt(lengthbox.value);
        if (isNaN(num)) {
          vscode.window.showErrorMessage(
            "Invalid value entered for polling interval."
          );
        } else if (num < 1) {
          // If it is less than 1, we have infinite. Set to 0.
          rsmLength = 0;
          try {
            panel.webview.postMessage({ type: "length", value: 0 }).then(
              () => {
                // On success
                vscode.window.showInformationMessage(
                  "Successfully set resource monitor length to unlimited."
                );
              },
              () => {
                // On failure
                vscode.window.showErrorMessage(
                  "Failed to change running resource monitor length. Has it been closed? Change will take effect on next start."
                );
              }
            );
          } catch {
            // There is no webview panel
            vscode.window.showInformationMessage(
              "Set resource monitor length to unlimited. This will take effect when a new resource monitor is opened."
            );
          }
          lengthbox.dispose();
        } else {
          // Set it to whatever they entered.
          rsmLength = num;
          try {
            panel.webview.postMessage({ type: "length", value: num }).then(
              () => {
                // On success
                vscode.window.showInformationMessage(
                  `Successfully set resource monitor length to ${num}ms.`
                );
              },
              () => {
                // On failure
                vscode.window.showErrorMessage(
                  "Failed to change running resource monitor length. Has it been closed? Change will take effect on next start."
                );
              }
            );
          } catch {
            // There is no webview panel
            vscode.window.showInformationMessage(
              `Set resource monitor length to ${num}ms. This will take effect when a new resource monitor is opened.`
            );
          }
          lengthbox.dispose();
        }
      });
      lengthbox.show();
    })
  );

  // Instead of just getting the debug start event, we now use an adapter tracker.
  // This also makes sure that we only get python debugs
  vscode.debug.registerDebugAdapterTrackerFactory(
    "python",
    new PyDebugAdapterTrackerFactory(context)
  );
  // vscode.debug.onDidStartDebugSession((e) => {});

  vscode.debug.onDidTerminateDebugSession(() => {
    console.log("Stopping resource monitor.");
  });
}

/**
 * Send a datapoint to the Webview.
 * @param key The type of data to send.
 * @param time Timestamp for the data value.
 * @param value Value of data.
 */
function postData(key: "memdata" | "cpudata", time: number, value: number) {
  try {
    // Make sure to catch promise rejections (when the webview has been closed but a message is still posted) with .then()
    panel.webview
      .postMessage({ type: key, time: time, value: value })
      .then(
        () => { },
        () => { }
      );
  } catch {
    console.error(
      "Webview post failed. May be due to process interval not yet being closed."
    );
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
  // Send data to webview
  postData("memdata", timemem, mem);
  postData("cpudata", timecpu, cpu);
}

/**
 * Get data for Windows and post it to the Webview.
 * @deprecated
 * @param pid Process ID to check.
 */
function getWin(pid: number) {
  exec(
    `tasklist /fi "PID eq ${pid}" /nh /v /fo csv`,
    (error, stdout, stderr) => {
      let time = Date.now();
      if (error) {
        console.error(`Error: ${error.message}`);
      } else if (stderr) {
        console.error(`stderr: ${stderr}`);
      } else {
        stdout = stdout.slice(1, stdout.length - 1);
        let items = stdout.trim().split('","');
        // let name = items[0];
        // pid = items[1]
        // let sessionName = items[2];
        // let sessionNum = parseInt(items[3]);
        let memkb = parseInt(items[4].replace(",", "").replace(" K", ""));
        // let status = items[5];
        // let user = items[6];
        let cpuitems = items[7].split(":");
        let cputime =
          parseInt(cpuitems[0]) * 60 * 60 +
          parseInt(cpuitems[1]) * 60 +
          parseInt(cpuitems[2]);
        // let windowname = items[8];
        // Send data to webview
        postData("memdata", time, memkb * 1024);
        postData("cpudata", time, cputime / 1000);
      }
    }
  );
}

/**
 * Get data for Unix and post it to the Webview.
 * @deprecated
 * @param pid Process ID to check.
 */
function getUnix(pid: number) {
  exec(
    `ps -p ${pid} --no-headers --format size,cputime`,
    (error, stdout, stderr) => {
      let time = Date.now();
      if (error) {
        console.error(`Error: ${error.message}`);
      } else if (stderr) {
        console.error(`stderr: ${stderr}`);
      } else {
        let items = stdout.trim().split(RegExp("[ \n\t\f\r]+"));
        let memkb = parseInt(items[0]);
        let cpuitems = items[1].split(":");
        let cputime =
          parseInt(cpuitems[0]) * 60 * 60 +
          parseInt(cpuitems[1]) * 60 +
          parseInt(cpuitems[2]);
        // Send data to webview
        postData("memdata", time, memkb * 1024);
        postData("cpudata", time, cputime / 1000);
      }
    }
  );
}

function startMonitor(pid: number) {
  let updateInterval: NodeJS.Timeout;
  if (ps) {
    updateInterval = setInterval(getData, pollingInterval, pid);
  } else if (process.platform === "win32") {
    console.log("node-ps-data load failed; using Windows tasklist shell command.");
    updateInterval = setInterval(getWin, pollingInterval, pid);
  } else {
    console.log("node-ps-data load failed; using Unix ps shell command.");
    updateInterval = setInterval(getUnix, pollingInterval, pid);
  }
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
