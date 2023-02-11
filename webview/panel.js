/** @type {HTMLCanvasElement} */
const memCanvas = document.getElementById('memory');
/** @type {HTMLCanvasElement} */
const cpuCanvas = document.getElementById('cpu');
/** @type {HTMLCanvasElement} */
const fileCanvas = document.getElementById('fileio');

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

/** @type {Map<number, number>} */
var memory = new Map();
/** @type {Map<number, number>} */
var cpu = new Map();
/** @type {Map<number, number>} */
var fileread = new Map();
/** @type {Map<number, number>} */
var filewrite = new Map();

/** Length in milliseconds to keep in logs. */
var length = 0;

/**
 * Creates a string representation of time units.
 * @param {number} millis Time in milliseconds.
 * @returns {string} A string representing time and its unit with 1 decimal place.
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
 * @returns {string} A string representing memory and its unit with 0 or 1 decimal places.
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
 * @returns {string} A string representing CPU utilization percentage with 2 decimal places.
 */
function cpuUnits(cputime) { return Math.ceil(cputime * 100) / 100 + '%'; }

/**
 * @typedef {Object} Axis
 * @property {number} min Minimum shown value. All lower values will be drawn at this value.
 * @property {number} max Maximum show value. All higher values will be drawn at this value.
 * @property {number} ticks Number of ticks to include, including the beginning but excluding the end.
 * @property {function(number): string} unitFunc The function for formatting tick labels on the axis.
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
 * @param {Array<Object>} data Array of objects with information about each line to graph.
 * - `points: Map<number, number>` `(required)` Mapping of (x, y) coordinates to display.
 * - `color: string` `(required)` Style for {@link CanvasRenderingContext2D}`.strokeStyle`
 */
function updateGraph(canvas, axisX, axisY, data) {
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
     * @returns {number} The X location on the {@link canvas} that the data corresponds to.
     */
    function canvasX(graphX) {
        return Math.min(graphRight, Math.max(marginL, marginL + graphWidth * ((graphX - axisX.min) / rangeX)));
    }
    /**
     * @param {number} graphY An Y data value from the graph.
     * @returns {number} The Y location on the {@link canvas} that the data corresponds to.
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
    data.forEach((lineobj) => {
        /** @type {Map<number, number>} */
        let linedata = lineobj.points;
        context.strokeStyle = lineobj.color;
        context.beginPath();
        let first = true;
        linedata.forEach((value, key) => {
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
    memory.forEach((value, key) => {
        // Get bounds for memory; minimum is always 0
        maxMem = Math.max(maxMem, value);
        // Get bounds for time
        maxTime = Math.max(maxTime, key);
        minTime = Math.min(minTime, key);
    });
    if (length !== 0) {
        minTime = maxTime - length;
        // Prune
        memory.forEach((value, key) => {
            if (key < minTime) {
                memory.delete(key);
            }
        });
    }
    // Make the tick interval be the next power of 2 (4kb, 8kb, ..., 64kb, ..., 1mb, ..., 1gb)
    maxMem = 2 ** Math.ceil(Math.log2(maxMem));
    updateGraph(memCanvas, timeAxis(minTime, maxTime), memAxis(maxMem), [{points: memory, color: themeGreen}]);
}

/**
 * Updates the CPU graph based on the data in the {@link cpu} map.
 */
function updateCpu() {
    let maxCpu = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    cpu.forEach((value, key) => {
        // Get bounds for cpu; minimum is always 0
        maxCpu = Math.max(maxCpu, value);
        // Get bounds for time
        maxTime = Math.max(maxTime, key);
        minTime = Math.min(minTime, key);
    });
    if (length !== 0) {
        minTime = maxTime - length;
        // Prune data older than minTime
        cpu.forEach((value, key) => {
            if (key < minTime) {
                cpu.delete(key);
            }
        });
    }
    maxCpu = Math.ceil(maxCpu / 20) * 20;
    maxCpu = Math.max(maxCpu, 20);
    updateGraph(cpuCanvas, timeAxis(minTime, maxTime), cpuAxis(maxCpu), [{points: cpu, color: themeGreen}]);
}

function updateFileIO() {
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
    fileread.forEach(findmax);
    filewrite.forEach(findmax);
    if (length !== 0) {
        minTime = maxTime - length;
        // Prune data older than minTime
        let prune = (value, key, map) => {
            if (key < minTime) {
                map.delete(key);
            }
        };
        fileread.forEach(prune);
        filewrite.forEach(prune);
    }
    updateGraph(fileCanvas, timeAxis(minTime, maxTime), memAxis(maxFile),
                [{points: filewrite, color: themeCyan}, {points: fileread, color: themeGreen}]);
}

var lastcputime = -1;
var lastcpu = -1;
var lastfileread = -1;
var lastfilewrite = -1;

class Message {
    /** @type {'memdata'|'cpudata'|'readdata'|'writedata'|'length'|'reset'} */
    type;
    /** @type {number|undefined} */
    time;
    /** @type {number|undefined} */
    value;
}

window.addEventListener('message', (e) => {
    /** @type {Message} */
    const data = e.data;
    switch (data.type) {
    case 'memdata':
        memory.set(data.time, data.value);
        updateMem();
        break;
    case 'cpudata':
        if (lastcpu >= 0) {
            /** In ms, the total amount of time since the last measurement */
            let deltaT = data.time - lastcputime;
            /** In ms, the amount of CPU time used since the last measurement */
            let deltaC = data.value - lastcpu;
            cpu.set(data.time, (100.0 * deltaC) / deltaT);
        }
        lastcputime = data.time;
        lastcpu = data.value;
        updateCpu();
        break;
    case 'readdata':
        if (lastfileread >= 0) {
            /** In bytes, the amount of file read performed since the last measurement */
            let deltaR = data.value - lastfileread;
            fileread.set(data.time, deltaR);
        }
        lastfileread = data.value;
        // updateFileIO();
        break;
    case 'writedata':
        if (lastfilewrite >= 0) {
            // In bytes, the amount of file write performed since the last measurement
            let deltaW = data.value - lastfilewrite;
            filewrite.set(data.time, deltaW);
        }
        lastfilewrite = data.value;
        updateFileIO();
        break;
    case 'length':
        length = data.value;
        updateMem();
        updateCpu();
        updateFileIO();
        break;
    case 'reset':
        cpu.clear();
        updateCpu();
        memory.clear();
        updateMem();
        fileread.clear();
        filewrite.clear();
        updateFileIO();
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
    fileCanvas.width = fileCanvas.parentElement.offsetWidth - 20;
    fileCanvas.height = fileCanvas.parentElement.offsetWidth / 4;
}
window.addEventListener('resize', (e) => {
    resize();
    updateMem();
    updateCpu();
    updateFileIO();
});
resize();
