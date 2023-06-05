/** @type {HTMLCanvasElement} */
const memCanvas = document.getElementById('memory');
/** @type {HTMLCanvasElement} */
const cpuCanvas = document.getElementById('cpu');
/** @type {HTMLCanvasElement} */
const fileReadCanvas = document.getElementById('fileread');
/** @type {HTMLCanvasElement} */
const fileWriteCanvas = document.getElementById('filewrite');
/** @type {HTMLDivElement} */
const pidsDiv = document.getElementById('pids');

/** @type {CSSStyleDeclaration} */
const style = getComputedStyle(document.body);

/** @type {string} */
const themeWhite = style.getPropertyValue('--vscode-terminal-ansiWhite');
/** @type {string} */
const themeGrey = style.getPropertyValue('--vscode-terminal-ansiBrightBlack');
/** @type {string} */
const themeGreen = style.getPropertyValue('--vscode-terminal-ansiGreen');
/** @type {string} */
const themeCyan = style.getPropertyValue('--vscode-terminal-ansiCyan');
/** @type {string[]} */
const colors = [
    style.getPropertyValue('--vscode-terminal-ansiGreen'), style.getPropertyValue('--vscode-terminal-ansiCyan'),
    style.getPropertyValue('--vscode-terminal-ansiBlue'), style.getPropertyValue('--vscode-terminal-ansiMagenta'),
    style.getPropertyValue('--vscode-terminal-ansiRed'), style.getPropertyValue('--vscode-terminal-ansiYellow'),
    style.getPropertyValue('--vscode-terminal-ansiBrightGreen'),
    style.getPropertyValue('--vscode-terminal-ansiBrightCyan'),
    style.getPropertyValue('--vscode-terminal-ansiBrightBlue'),
    style.getPropertyValue('--vscode-terminal-ansiBrightMagenta'),
    style.getPropertyValue('--vscode-terminal-ansiBrightRed'),
    style.getPropertyValue('--vscode-terminal-ansiBrightYellow')
];

class PidMonitor {
    constructor(pid) {
        /** @type {Map<number, number>} */
        this.memory = new Map();
        /** @type {Map<number, number>} */
        this.cpu = new Map();
        /** @type {Map<number, number>} */
        this.fileread = new Map();
        /** @type {Map<number, number>} */
        this.filewrite = new Map();

        this.lastcputime = -1;
        this.lastcpu = -1;
        this.lastfileread = -1;
        this.lastfilewrite = -1;

        // Pick the next color from the list of colors
        const nextColorIndex = pids.size % colors.length === 0 ? 0 : pids.size;
        this.color = colors[nextColorIndex];
    }
}

/** @type {Map<number, PidMonitor>} */
var pids = new Map();

/** Length in milliseconds to keep in logs. */
var length = 0;

/**
 * Creates a string representation of time units.
 * @param {number} millis Time in milliseconds.
 * @returns {string} A string representing time and its unit with 1 decimal
 *     place.
 */
function timeUnits(millis) {
    millis = Math.floor(millis);
    if (millis >= 1000 * 60 * 60) {
        return Math.floor(millis / (100 * 60 * 60)) / 10 + 'h';
    } else if (millis >= 1000 * 60) {
        return Math.floor(millis / (100 * 60)) / 10 + 'm';
    } else if (millis >= 1000) {
        return Math.floor(millis / 100) / 10 + 's';
    } else {
        return millis + 'ms';
    }
}

/**
 * Creates a string representation of memory units.
 * @param {number} bytes Number of bytes.
 * @returns {string} A string representing memory and its unit with 0 or 1
 *     decimal places.
 */
function memUnits(bytes) {
    if (bytes >= 1024 ** 3) {
        let gb = bytes / (1024 ** 3);
        gb = gb <= 9.9 ? Math.ceil(gb * 10) / 10 : Math.ceil(gb);
        return gb + 'gb';
    } else if (bytes >= 1024 ** 2) {
        let mb = bytes / (1024 ** 2);
        mb = mb <= 9.9 ? Math.ceil(mb * 10) / 10 : Math.ceil(mb);
        return mb + 'mb';
    } else if (bytes >= 1024) {
        let kb = bytes / 1024;
        kb = kb <= 9.9 ? Math.ceil(kb * 10) / 10 : Math.ceil(kb);
        return kb + 'kb';
    } else {
        return bytes + 'b';
    }
}

/**
 * Creates a string representation of CPU utilization.
 * @param {number} cputime Percentage CPU utilization.
 * @returns {string} A string representing CPU utilization percentage with 2
 *     decimal places.
 */
function cpuUnits(cputime) { return Math.ceil(cputime * 100) / 100 + '%'; }

/**
 * @typedef {Object} Axis
 * @property {number} min Minimum shown value. All lower values will be drawn at
 * this value.
 * @property {number} max Maximum show value. All higher values will be drawn at
 * this value.
 * @property {number} ticks Number of ticks to include, including the beginning
 * but excluding the end.
 * @property {function(number): string} unitFunc The function for formatting
 * tick labels on the axis.
 */

/**
 * @param {number} min
 * @param {number} max
 * @returns {Axis}
 */
function timeAxis(min, max) { return {min: min, max: max, ticks: 10, unitFunc: timeUnits}; }
/**
 * @param {number} max
 * @returns {Axis}
 */
function cpuAxis(max) { return {min: 0, max: max, ticks: 5, unitFunc: cpuUnits}; }
/**
 * @param {number} max
 * @returns {Axis}
 */
function memAxis(max) { return {min: 0, max: max, ticks: 4, unitFunc: memUnits}; }

/**
 * Updates a graph on a specified canvas.
 * @param {HTMLCanvasElement} canvas The canvas to draw the graph on.
 * @param {Axis} axisX X-axis details
 * @param {Axis} axisY Y-axis details
 * @param {string} type The name of the type you want to plot, e.g. cpu, memory, filewrite, fileread.
 */
function updateGraph(canvas, axisX, axisY, type) {
    let rangeY = axisY.max - axisY.min;
    let rangeX = axisX.max - axisX.min;

    // Decide on tick marks (this may eventually be scalable/zoomable)
    /** Memory usage/CPU time/etc. interval */
    let intervalY = rangeY / axisY.ticks;
    /** Time interval */
    let intervalX = rangeX / axisX.ticks;

    const marginL = 48;
    const marginR = 20;
    const marginTop = 10;
    const marginBottom = 20;

    // Calculate some values beforehand for readability
    /** Y location where the bottom of the graph should be on the {@link canvas}, in pixels. */
    let graphBottom = canvas.height - marginBottom;
    /** Distance between where the top and bottom of the graph should be on the {@link canvas}, in pixels. */
    let graphHeight = canvas.height - marginBottom - marginTop;
    /** X location where the right edge of the graph should be on the {@link canvas}, in pixels. */
    let graphRight = canvas.width - marginR;
    /** Distance between where the left and right edges of the graph should be on the {@link canvas}, in pixels. */
    let graphWidth = canvas.width - marginR - marginL;

    // Some functions to consistently get canvas location from graph values
    /**
     * @param {number} graphX An X data value from the graph.
     * @returns {number} The X location on the {@link canvas} that the data
     *     corresponds to.
     */
    function canvasX(graphX) {
        return Math.min(graphRight, Math.max(marginL, marginL + graphWidth * ((graphX - axisX.min) / rangeX)));
    }
    /**
     * @param {number} graphY An Y data value from the graph.
     * @returns {number} The Y location on the {@link canvas} that the data
     *     corresponds to.
     */
    function canvasY(graphY) {
        return Math.min(graphBottom, Math.max(marginTop, graphBottom - graphHeight * ((graphY - axisY.min) / rangeY)));
    }
    // Draw graph background
    let context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw tick lines and labels
    context.strokeStyle = themeGrey;
    context.fillStyle = themeWhite;
    context.beginPath();
    // X axis
    context.textAlign = 'center';
    for (let ticknum = 0; ticknum <= axisX.ticks; ticknum++) {
        let graphX = axisX.max - intervalX * ticknum;
        let cX = canvasX(graphX);
        context.moveTo(cX, graphBottom);
        context.lineTo(cX, marginTop);
        context.fillText('-' + axisX.unitFunc(axisX.max - graphX), cX, graphBottom + 12);
    }
    // Y axis
    context.textAlign = 'right';
    for (let ticknum = 0; ticknum <= axisY.ticks; ticknum++) {
        let graphY = intervalY * ticknum;
        let cY = canvasY(graphY);
        context.moveTo(marginL, cY);
        context.lineTo(graphRight, cY);
        context.fillText(axisY.unitFunc(graphY), marginL - 2, cY);
    }
    context.stroke();

    // Draw edges (after tick lines to be on top)
    context.strokeStyle = themeWhite;
    context.beginPath();
    context.moveTo(marginL, marginTop);
    context.lineTo(marginL, graphBottom);
    context.lineTo(graphRight, graphBottom);
    context.lineTo(graphRight, marginTop);
    context.stroke();

    // Draw lines
    context.lineWidth = 2;

    pids.forEach(pidMonitor => {
        // Draw the given "type" (cpu, memory, fileread, filewrite)
        data = pidMonitor[type];
        let first = true;

        context.strokeStyle = pidMonitor.color;
        context.beginPath();
        data.forEach((value, key) => {
            if (first) {
                context.moveTo(canvasX(key), canvasY(value));
                first = false;
            } else {
                context.lineTo(canvasX(key), canvasY(value));
            }
        });
        context.stroke();
    });
}

/**
 * Updates the memory graph based on the data in the {@link memory} map.
 */
function updateMem() {
    // Get bounds of graph
    let maxMem = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    pids.forEach((pidMonitor, pid) => {
        pidMonitor.memory.forEach((value, key) => {
            // Get bounds for memory; minimum is always 0
            maxMem = Math.max(maxMem, value);
            // Get bounds for time
            maxTime = Math.max(maxTime, key);
            minTime = Math.min(minTime, key);
        });
        if (length !== 0) {
            minTime = maxTime - length;
            // Prune
            pidMonitor.memory.forEach((value, key) => {
                if (key < minTime) {
                    pidMonitor.memory.delete(key);
                }
            });
        }
    });
    // Make the tick interval be the next power of 2 (4kb, 8kb, ..., 64kb, ...,
    // 1mb, ..., 1gb)
    maxMem = 2 ** Math.ceil(Math.log2(maxMem));
    updateGraph(memCanvas, timeAxis(minTime, maxTime), memAxis(maxMem), 'memory');
}

/**
 * Updates the CPU graph based on the data in the {@link cpu} map.
 */
function updateCpu() {
    let maxCpu = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;

    pids.forEach((pidMonitor, pid) => {
        pidMonitor.cpu.forEach((value, key) => {
            // Get bounds for cpu; minimum is always 0
            maxCpu = Math.max(maxCpu, value);
            // Get bounds for time
            maxTime = Math.max(maxTime, key);
            minTime = Math.min(minTime, key);
        });
        if (length !== 0) {
            minTime = maxTime - length;
            // Prune data older than minTime
            pidMonitor.cpu.forEach((value, key) => {
                if (key < minTime) {
                    pidMonitor.cpu.delete(key);
                }
            });
        }
    });
    maxCpu = Math.ceil(maxCpu / 20) * 20;
    maxCpu = Math.max(maxCpu, 20);
    updateGraph(cpuCanvas, timeAxis(minTime, maxTime), cpuAxis(maxCpu), 'cpu');
}

function updateFileRead() {
    let maxFile = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    let findmax = (value, key) => {
        // Get bounds for fileio; minimum is always 0
        maxFile = Math.max(maxFile, value);
        // Get bounds for time
        maxTime = Math.max(maxTime, key);
        minTime = Math.min(minTime, key);
    };

    pids.forEach((pidMonitor, pid) => {
        pidMonitor.fileread.forEach(findmax);
        if (length !== 0) {
            minTime = maxTime - length;
            // Prune data older than minTime
            let prune = (value, key, map) => {
                if (key < minTime) {
                    map.delete(key);
                }
            };
            pidMonitor.fileread.forEach(prune);
        }
    });
    updateGraph(fileReadCanvas, timeAxis(minTime, maxTime), memAxis(maxFile), 'fileread');
}

function updateFileWrite() {
    let maxFile = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    let findmax = (value, key) => {
        // Get bounds for fileio; minimum is always 0
        maxFile = Math.max(maxFile, value);
        // Get bounds for time
        maxTime = Math.max(maxTime, key);
        minTime = Math.min(minTime, key);
    };

    pids.forEach((pidMonitor, pid) => {
        pidMonitor.filewrite.forEach(findmax);
        if (length !== 0) {
            minTime = maxTime - length;
            // Prune data older than minTime
            let prune = (value, key, map) => {
                if (key < minTime) {
                    map.delete(key);
                }
            };
            pidMonitor.filewrite.forEach(prune);
        }
    });
    updateGraph(fileWriteCanvas, minTime, maxTime, 10, timeUnits, 0, maxFile, 5, memUnits, 'filewrite');
}

class Message {
    /** @type {number|undefined} */
    pid;
    /** @type {'memdata'|'cpudata'|'readdata'|'writedata'|'length'|'reset'} */
    type;
    /** @type {number|undefined} */
    time;
    /** @type {number|undefined} */
    value;
}

/**
 * Updates the pid div with new pids.
 */
function updatePidsDiv() {
    const pidElements = [];
    pids.forEach((pidMonitor, pid) => {
        el = document.createElement('span');
        el.style.color = pidMonitor.color;
        el.innerText = `${pid} `;
        pidElements.push(el);
    });
    pidsDiv.replaceChildren(...pidElements);
}

/**
 * Finds or creates the PidMonitor for the given pid.
 * @param {number} pid The pid that we are monitoring
 * @returns {PidMonitor} The instance of PidMonitor that we use to store
 *     metrics for this pid.
 */
function getPidMonitor(pid) {
    if (!Number.isSafeInteger(pid) || pid < 0) {
        return null;
    }

    let pidMonitor = pids.get(pid);
    // New pid, add to the mapping to keep track
    if (!pidMonitor) {
        pids.set(pid, new PidMonitor(pid));
        pidMonitor = pids.get(pid);
        updatePidsDiv();
    }
    return pidMonitor;
}

window.addEventListener('message', (e) => {
    /** @type {Message} */
    const data = e.data;
    /** @type {PidMonitor} */
    const pidMonitor = getPidMonitor(data.pid);

    switch (data.type) {
    case 'memdata':
        pidMonitor.memory.set(data.time, data.value);
        updateMem();
        break;
    case 'cpudata':
        if (pidMonitor.lastcpu >= 0) {
            /** In ms, the total amount of time since the last measurement */
            let deltaT = data.time - pidMonitor.lastcputime;
            /** In ms, the amount of CPU time used since the last measurement */
            let deltaC = data.value - pidMonitor.lastcpu;
            pidMonitor.cpu.set(data.time, (100.0 * deltaC) / deltaT);
        }
        pidMonitor.lastcputime = data.time;
        pidMonitor.lastcpu = data.value;
        updateCpu();
        break;
    case 'readdata':
        if (pidMonitor.lastfileread >= 0) {
            /**
             * In bytes, the amount of file read performed since the last
             * measurement
             */
            let deltaR = data.value - pidMonitor.lastfileread;
            pidMonitor.fileread.set(data.time, deltaR);
        }
        pidMonitor.lastfileread = data.value;
        updateFileRead();
        break;
    case 'writedata':
        if (pidMonitor.lastfilewrite >= 0) {
            // In bytes, the amount of file write performed since the last
            // measurement
            let deltaW = data.value - pidMonitor.lastfilewrite;
            pidMonitor.filewrite.set(data.time, deltaW);
        }
        pidMonitor.lastfilewrite = data.value;
        updateFileWrite();
        break;
    case 'length':
        length = data.value;
        updateMem();
        updateCpu();
        updateFileRead();
        updateFileWrite();
        break;
    case 'reset':
        pids.clear();
        updateMem();
        updateCpu();
        updateFileRead();
        updateFileWrite();
        break;
    default:
        // Discard
        console.error('Invalid message type for JSON message to WebView:\n' + data);
    }
});

/**
 * Resize graphs to an appropriate size.
 *
 * `4:1 width:height`
 */
function resize() {
    memCanvas.width = memCanvas.parentElement.offsetWidth - 20;
    memCanvas.height = memCanvas.parentElement.offsetWidth / 4;
    cpuCanvas.width = cpuCanvas.parentElement.offsetWidth - 20;
    cpuCanvas.height = cpuCanvas.parentElement.offsetWidth / 4;
    fileReadCanvas.width = fileReadCanvas.parentElement.offsetWidth - 20;
    fileReadCanvas.height = fileReadCanvas.parentElement.offsetWidth / 4;
    fileWriteCanvas.width = fileWriteCanvas.parentElement.offsetWidth - 20;
    fileWriteCanvas.height = fileWriteCanvas.parentElement.offsetWidth / 4;
}
window.addEventListener('resize', (e) => {
    resize();
    updateMem();
    updateCpu();
    updateFileRead();
    updateFileWrite();
});
resize();
