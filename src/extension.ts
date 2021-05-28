import { join } from 'path';
import * as vscode from 'vscode';
import { exec } from "child_process";


var panel: vscode.WebviewPanel;

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension Python Resource Monitor activated.');

    

    vscode.debug.onDidStartDebugSession((e) => {
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
        startMonitor(0);
        console.log("Starting resource monitor.");
    });
    vscode.debug.onDidTerminateDebugSession(() => {
        console.log("Stopped resource monitor.");
    });

}

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
                panel.webview.postMessage({ "type": "memdata", "time": time, "value": memkb }).then(() => {}, () => {});
                panel.webview.postMessage({ "type": "cpudata", "time": time, "value": cputime }).then(() => {}, () => {});
            } catch {
                console.error("Webview post failed. May be due to process interval not yet being closed.");
            }
        }
    });
}

// UNTESTED
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
                panel.webview.postMessage({ "type": "memdata", "time": time, "value": memkb }).then(() => {}, () => {});
                panel.webview.postMessage({ "type": "cpudata", "time": time, "value": cputime }).then(() => {}, () => {});
            } catch {
                console.error("Webview post failed. May be due to process interval not yet being closed.");
            }
        }
    });
}

function startMonitor(pid: number) {
    let meminterval: NodeJS.Timeout;
    if (process.platform === "win32") {
        meminterval = setInterval(getWin, 100, pid);
    } else {
        meminterval = setInterval(getMemUnix, 100, pid);
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
