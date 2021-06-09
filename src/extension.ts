import { join } from 'path';
import * as vscode from 'vscode';
import { exec } from "child_process";

// If node-ps-data fails to load (possibly due to a failed build, etc.) use the existing depreciated methods.
var ps: any;
try {
    ps = require('node-ps-data');
} catch {
    console.log("Failed to load module node-ps-data. Using backup depreciated methods. CPU time resolution will be 1 second.");
}


var panel: vscode.WebviewPanel;
var pollingInterval = 100;
var rsmLength = 10000;

function launchWebview(context: vscode.ExtensionContext, pid: number) {
    try {
        panel.dispose();
    } catch {}
    panel = vscode.window.createWebviewPanel("resourceMonitor", "Resource Monitor", vscode.ViewColumn.Beside, {enableScripts: true});

    let paneljs = panel.webview.asWebviewUri(vscode.Uri.file(join(context.extensionPath, 'webview', 'panel.js')));
    panel.webview.html = `
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resource Monitor</title>
        <link href="https://raw.githubusercontent.com/microsoft/vscode-codicons/40014cd4f4415cd8aca14c50370c32346473cf6f/src/icons/graph.svg" rel="icon">
    </head>
    <body>
        <h1 id="memtitle">Memory Usage</h1>
        <canvas id="memory" width=512, height=128></canvas>
        <h1 id="cputitle">CPU Usage</h1>
        <canvas id="cpu" width=512, height=128></canvas>
        <script src="${paneljs}"></script>
    </body>
    </html>
    `;
    panel.webview.postMessage({"type": "length", "value": rsmLength});
    
    startMonitor(pid);
    console.log(`Starting resource monitor for process ID ${pid}.`);
}

class PyDebugAdapterTracker implements vscode.DebugAdapterTracker {
    context: vscode.ExtensionContext;
    constructor (context: vscode.ExtensionContext) {
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

class PyDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
    context: vscode.ExtensionContext;
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new PyDebugAdapterTracker(this.context);
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension Python Resource Monitor activated.');
    // Commands
    // Polling interval change
    context.subscriptions.push(vscode.commands.registerCommand("python-resource-monitor.rsmInterval", () => {
        let intervalbox = vscode.window.createInputBox();
        intervalbox.title = "Resource Monitor Polling Interval";
        intervalbox.placeholder = "100";
        // Validation
        intervalbox.onDidChangeValue((e) => {
            let num: number = parseInt(e);
            if (isNaN(num)) {
                intervalbox.validationMessage = "Input must be a valid integer number of milliseconds.";
            } else if (num < 1) {
                intervalbox.validationMessage = "Input must be a positive number of milliseconds.";
            } else {
                intervalbox.validationMessage = undefined;
            }
        });
        // Handle accept
        intervalbox.onDidAccept((e) => {
            let num = parseInt(intervalbox.value);
            if (isNaN(num)) {
                vscode.window.showErrorMessage("Invalid value entered for polling interval.");
            } else if (num < 1) {
                vscode.window.showErrorMessage("Polling interval must be at least 1ms.");
            } else {
                pollingInterval = num;
                vscode.window.showInformationMessage(`Set polling interval to ${num}ms. This will take effect when a new resource monitor is opened.`);
                intervalbox.dispose();
            }
        });
        intervalbox.show();
    }));

    // Maximum time log length
    context.subscriptions.push(vscode.commands.registerCommand("python-resource-monitor.rsmLength", () => {
        var lengthbox = vscode.window.createInputBox();
        lengthbox.title = "Resource Monitor Length";
        lengthbox.placeholder = "0";
        lengthbox.prompt = "0 is unlimited log length.";
        // Validation
        lengthbox.onDidChangeValue((e) => {
            let num: number = parseInt(e);
            if (isNaN(num)) {
                lengthbox.validationMessage = "Input must be a valid integer number of milliseconds.";
            } else {
                lengthbox.validationMessage = undefined;
            }
        });
        // Handle accept
        lengthbox.onDidAccept((e) => {
            let num = parseInt(lengthbox.value);
            if (isNaN(num)) {
                vscode.window.showErrorMessage("Invalid value entered for polling interval.");
            } else if (num < 1) {
                // If it is less than 1, we have infinite. Set to 0.
                rsmLength = 0;
                try {
                    panel.webview.postMessage({"type": "length", "value": 0}).then(() => {
                        // On success
                        vscode.window.showInformationMessage("Successfully set resource monitor length to unlimited.");
                    }, () => {
                        // On failure
                        vscode.window.showErrorMessage("Failed to change resource monitor length. Has it been closed?");
                    });
                } catch {
                    // There is no webview panel
                    vscode.window.showInformationMessage("Set resource monitor length to unlimited. This will take effect when a new resource monitor is opened.");
                }
                lengthbox.dispose();
            } else {
                // Set it to whatever they entered.
                rsmLength = num;
                try {
                    panel.webview.postMessage({"type": "length", "value": num}).then(() => {
                        // On success
                        vscode.window.showInformationMessage(`Successfully set resource monitor length to ${num}ms.`);
                    }, () => {
                        // On failure
                        vscode.window.showErrorMessage("Failed to change resource monitor length. Has it been closed?");
                    });
                } catch {
                    // There is no webview panel
                    vscode.window.showInformationMessage(`Set resource monitor length to ${num}ms. This will take effect when a new resource monitor is opened.`);
                }
                lengthbox.dispose();
            }
        });
        lengthbox.show();
    }));

    // Instead of just getting the debug start event, we now use an adapter tracker.
    // This also makes sure that we only get python debugs
    vscode.debug.registerDebugAdapterTrackerFactory("python", new PyDebugAdapterTrackerFactory(context));
    // vscode.debug.onDidStartDebugSession((e) => {});

    vscode.debug.onDidTerminateDebugSession(() => {
        console.log("Stopping resource monitor.");
    });
}

function getData(pid: number) {
    
    let cpu = ps.cpuTime(pid);
    let timecpu = Date.now();
    try {
        // Send data to webview
        // Make sure to catch promise rejections (when the webview has been closed but a message is still posted) with .then()
        // Windows memory data isn't as accurate so use tasklist
        if (process.platform === "win32") {
            exec(`tasklist /fi "PID eq ${pid}" /nh /v /fo csv`, (error, stdout, stderr) => {
                let timemem = Date.now();
                if (error) {
                    console.error(`Error: ${error.message}`);
                } else if (stderr) {
                    console.error(`stderr: ${stderr}`);
                } else {
                    stdout = stdout.slice(1, stdout.length - 1);
                    let items = stdout.trim().split('","');
                    let name = items[0];
                    // pid = items[1]
                    let sessionName = items[2];
                    let sessionNum = parseInt(items[3]);
                    let memkb = parseInt(items[4].replace(",", "").replace(" K", ""));
                    /*let status = items[5];
                    let user = items[6];
                    let cpuitems = items[7].split(":");
                    let cputime = parseInt(cpuitems[0]) * 60 * 60 + parseInt(cpuitems[1]) * 60 + parseInt(cpuitems[2]);
                    let windowname = items[8];*/
                    // Send data to webview
                    // Make sure to catch promise rejections (when the webview has been closed but a message is still posted) with .then()
                    panel.webview.postMessage({ "type": "memdata", "time": timemem, "value": memkb * 1024 }).then(() => {}, () => {});
                }
            });
        } else {
            let timemem = Date.now();
            let mem = ps.memInfo(pid);
            panel.webview.postMessage({ "type": "memdata", "time": timemem, "value": mem }).then(() => {}, () => {});
        }
        // CPU
        panel.webview.postMessage({ "type": "cpudata", "time": timecpu, "value": cpu }).then(() => {}, () => {});
    } catch {
        console.error("Webview post failed. May be due to process interval not yet being closed.");
    }
}

/**
 * @deprecated
 * @param pid Process ID to check
 */
function getWin(pid: number) {
    exec(`tasklist /fi "PID eq ${pid}" /nh /v /fo csv`, (error, stdout, stderr) => {
        let time = Date.now();
        if (error) {
            console.error(`Error: ${error.message}`);
        } else if (stderr) {
            console.error(`stderr: ${stderr}`);
        } else {
            stdout = stdout.slice(1, stdout.length - 1);
            let items = stdout.trim().split('","');
            let name = items[0];
            // pid = items[1]
            let sessionName = items[2];
            let sessionNum = parseInt(items[3]);
            let memkb = parseInt(items[4].replace(",", "").replace(" K", ""));
            let status = items[5];
            let user = items[6];
            let cpuitems = items[7].split(":");
            let cputime = parseInt(cpuitems[0]) * 60 * 60 + parseInt(cpuitems[1]) * 60 + parseInt(cpuitems[2]);
            let windowname = items[8];
            try {
                // Send data to webview
                // Make sure to catch promise rejections (when the webview has been closed but a message is still posted) with .then()
                panel.webview.postMessage({ "type": "memdata", "time": time, "value": memkb * 1024 }).then(() => {}, () => {});
                panel.webview.postMessage({ "type": "cpudata", "time": time, "value": cputime/1000 }).then(() => {}, () => {});
            } catch {
                console.error("Webview post failed. May be due to process interval not yet being closed.");
            }
        }
    });
}

/**
 * @deprecated
 * @param pid Process ID to check
 */
function getMemUnix(pid: number) {
    exec(`ps -p ${pid} --no-headers --format size,cputime`, (error, stdout, stderr) => {
        let time = Date.now();
        if (error) {
            console.error(`Error: ${error.message}`);
        } else if (stderr) {
            console.error(`stderr: ${stderr}`);
        } else {
            let items = stdout.trim().split(RegExp("[ \n\t\f\r]+"));
            let memkb = parseInt(items[0]);
            let cpuitems = items[1].split(":");
            let cputime = parseInt(cpuitems[0]) * 60 * 60 + parseInt(cpuitems[1]) * 60 + parseInt(cpuitems[2]);
            try {
                // Send data to webview
                // Make sure to catch promise rejections (when the webview has been closed but a message is still posted) with .then()
                panel.webview.postMessage({ "type": "memdata", "time": time, "value": memkb * 1024 }).then(() => {}, () => {});
                panel.webview.postMessage({ "type": "cpudata", "time": time, "value": cputime/1000 }).then(() => {}, () => {});
            } catch {
                console.error("Webview post failed. May be due to process interval not yet being closed.");
            }
        }
    });
}

function startMonitor(pid: number) {
    let meminterval: NodeJS.Timeout;
    if (ps) {
        meminterval = setInterval(getData, pollingInterval, pid);
    } else if (process.platform === "win32") {
        meminterval = setInterval(getWin, pollingInterval, pid);
    } else {
        meminterval = setInterval(getMemUnix, pollingInterval, pid);
    }
    panel.onDidDispose(() => {
        clearInterval(meminterval);
    });
    vscode.debug.onDidTerminateDebugSession(() => {
        clearInterval(meminterval);
    });
}

export function deactivate() {
    try {
        panel.dispose();
    } catch {
        // pass
    }
}
