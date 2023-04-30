import * as fs from 'fs';
import * as ps from 'node-ps-data';
import {join} from 'path';
import * as vscode from 'vscode';

var panel: vscode.WebviewPanel;
var pollingInterval = 100;
var rsmLength = 10000;

var pidMonitors = new Map();
var shouldResetPanel = false;

function nop() {}

/**
 * Creates and starts a new Webview resource monitor.
 * @param context The VS Code Extension Context from which to launch the Webview.
 * @param pid The process ID to track with the resource monitor.
 */
async function launchWebview(context: vscode.ExtensionContext, pid: number) {
    // We want to reuse the panel for new processes in an existing debug session.
    if (panel) {
        if (!shouldResetPanel) {
            return;
        }

        // Recreate the panel when starting a new debug session.
        shouldResetPanel = false;
        try {
            panel.dispose();
        } catch {
        }
    }
    // Create the webview
    panel = vscode.window.createWebviewPanel('resourceMonitor', 'Resource Monitor', vscode.ViewColumn.Beside,
                                             {enableScripts : true});

    // When removing the panel, stop all monitoring
    panel.onDidDispose(() => {
        stopMonitoring();
        pidMonitors.clear();
    });

    // Set page
    let paneljs = panel.webview.asWebviewUri(vscode.Uri.file(join(context.extensionPath, 'webview', 'panel.js')));

    var htmlText = fs.readFileSync(join(context.extensionPath, 'webview', 'panel.html')).toString();
    htmlText = htmlText.replace('${paneljs}', paneljs.toString());
    panel.webview.html = htmlText;

    panel.webview.postMessage({type : 'length', value : rsmLength});
}

class PyDebugAdapterTracker implements vscode.DebugAdapterTracker {
    context: vscode.ExtensionContext;
    constructor(context: vscode.ExtensionContext) { this.context = context; }

    // Handling start, stopped (paused) and continue events. Terminate events are handled per pid in onDidTerminateDebugSession.
    onDidSendMessage(message: any): void {
        if (message.type === 'event' && message.event === 'process') {
            // New process spawned, start monitoring pid and open/reuse webview
            const pid = message.body.systemProcessId;
            launchWebview(this.context, pid);
            startMonitor(pid);
        } else if (message.type === 'event' && message.event === 'stopped') {
            // Debugging is paused or breakpoint is reached, pause monitoring of all pids
            stopMonitoring();
        } else if (message.type === 'response' && message.command === 'continue') {
            // Started debugging again after pause, resume monitoring known pids
            for (let pid of pidMonitors.keys()) {
                let updateInterval: NodeJS.Timer = setInterval(getData, pollingInterval, pid);
                pidMonitors.set(pid, updateInterval);
            }
        }
    }
}

class PyDebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
    context: vscode.ExtensionContext;
    constructor(context: vscode.ExtensionContext) { this.context = context; }
    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new PyDebugAdapterTracker(this.context);
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension Python Resource Monitor activated.');
    // Commands
    // Polling interval change
    context.subscriptions.push(vscode.commands.registerCommand('python-resource-monitor.rsmInterval', () => {
        let intervalbox = vscode.window.createInputBox();
        intervalbox.title = 'Resource Monitor Polling Interval';
        intervalbox.placeholder = '100';
        // Validation
        intervalbox.onDidChangeValue((e) => {
            let num: number = parseInt(e);
            if (isNaN(num)) {
                intervalbox.validationMessage = 'Input must be a valid integer number of milliseconds.';
            } else if (num < 1) {
                intervalbox.validationMessage = 'Input must be a positive number of milliseconds.';
            }
        });
        // Handle accept
        intervalbox.onDidAccept((e) => {
            let num = parseInt(intervalbox.value);
            if (isNaN(num)) {
                vscode.window.showErrorMessage('Invalid value entered for polling interval.');
            } else if (num < 1) {
                vscode.window.showErrorMessage('Polling interval must be at least 1ms.');
            } else {
                pollingInterval = num;
                vscode.window.showInformationMessage(
                    `Set polling interval to ${num}ms. This will take effect when a new resource monitor is opened.`);
                intervalbox.dispose();
            }
        });
        intervalbox.show();
    }));

    // Maximum time log length
    context.subscriptions.push(vscode.commands.registerCommand('python-resource-monitor.rsmLength', () => {
        var lengthbox = vscode.window.createInputBox();
        lengthbox.title = 'Resource Monitor Length';
        lengthbox.placeholder = '0';
        lengthbox.prompt = '0 is unlimited log length.';
        // Validation
        lengthbox.onDidChangeValue((e) => {
            let num: number = parseInt(e);
            if (isNaN(num)) {
                lengthbox.validationMessage = 'Input must be a valid integer number of milliseconds.';
            }
        });
        // Handle accept
        lengthbox.onDidAccept((e) => {
            let num = parseInt(lengthbox.value);
            if (isNaN(num)) {
                vscode.window.showErrorMessage('Invalid value entered for polling interval.');
                return;
            }
            rsmLength = Math.max(0, num); // Less than 1 is treated as unlimited.
            let rsmLengthRepr = rsmLength === 0 ? 'unlimited' : `${rsmLength}ms`;
            try {
                panel.webview.postMessage({type : 'length', value : num})
                    .then(
                        () => { // On success
                            vscode.window.showInformationMessage(
                                `Successfully set resource monitor length to ${rsmLengthRepr}.`);
                        },
                        () => { // On failure
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

    // Instead of just getting the debug start event, we now use an adapter tracker. This also makes sure that we only
    // get python debugs
    vscode.debug.registerDebugAdapterTrackerFactory('python', new PyDebugAdapterTrackerFactory(context));

    // Listen for termination events per process.
    vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
        if (session.parentSession) {
            // If the process has a parent, it is a subprocess, stop monitoring this pid
            const pid = session.configuration.subProcessId;
            console.log('Stopping monitoring of pid', pid);
            const interval = pidMonitors.get(pid);
            clearInterval(interval);
            pidMonitors.delete(pid);
        } else {
            // Main process stopped, stop monitoring everything and forget all pids.
            console.log('Parent process stopped!');
            stopMonitoring();
            pidMonitors.clear();
            shouldResetPanel = true;
        }
    });
}

/**
 * Send a datapoint to the Webview.
 * @param pid The process id that gets monitored.
 * @param key The type of data to send.
 * @param time Timestamp for the data value.
 * @param value Value of data.
 */
function postData(pid: number, key: 'memdata'|'cpudata'|'readdata'|'writedata', time: number, value: number) {
    try {
        // Make sure to catch promise rejections (when the webview has been closed but a message is still posted) with
        // .then()
        panel.webview.postMessage({pid : pid, type : key, time : time, value : value}).then(nop, nop);
    } catch {
        console.error('Webview post failed. May be due to process interval not yet being closed.');
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
    postData(pid, 'memdata', timemem, mem);
    postData(pid, 'cpudata', timecpu, cpu);
    postData(pid, 'readdata', timeread, read);
    postData(pid, 'writedata', timewrite, write);
}

/**
 * Starts the monitor interval.
 * @param pid Process ID to monitor.
 */
function startMonitor(pid: number) {
    console.log(`Starting resource monitor for process ID ${pid}.`);
    let updateInterval: NodeJS.Timer = setInterval(getData, pollingInterval, pid);
    pidMonitors.set(pid, updateInterval);
}

/**
 * Stops monitoring all known pids.
 */
function stopMonitoring() {
    console.log('Stopped monitoring pids', [...pidMonitors.keys()]);
    pidMonitors.forEach(updateInterval => clearInterval(updateInterval));
}

export function deactivate() {
    try {
        panel.dispose();
    } catch {
        // pass
    }
}
