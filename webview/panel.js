/** @type {HTMLCanvasElement} */
const memCanvas = document.getElementById("memory");
/** @type {HTMLCanvasElement} */
const cpuCanvas = document.getElementById("cpu");

var memory = new Map();
var cpu = new Map();

function timeUnits(millis) {
    millis = Math.floor(millis);
    if (millis >= 1000 * 60 * 60) {
        return Math.floor(millis / (100 * 60 * 60)) / 10 + "h";
    } else if (millis >= 1000 * 60) {
        return Math.floor(millis / (100 * 60)) / 10 + "m";
    } else if (millis >= 1000) {
        return Math.floor(millis / 100) / 10 + "s";
    } else {
        return millis + "ms";
    }
}

function memUnits(kilobytes) {
    if (kilobytes >= 1024 ** 2) {
        return Math.ceil(kilobytes / (1024 * 102.4)) / 10 + "gb";
    } else if (kilobytes >= 1024) {
        return Math.ceil(kilobytes / 102.4) / 10 + "mb";
    } else {
        return kilobytes + "kb";
    }
}

function cpuUnits(cputime) {
    return String(cputime);
}

function updateGraph(canvas, minX, maxX, ticksX, unitFuncX, minY, maxY, ticksY, unitFuncY, data) {
    // Decide on tick marks (this may eventually be scalable/zoomable)
    // Y - memory
    let intervalY = maxY / ticksY;

    // X - time
    let intervalX = (maxX - minX) / ticksX;

    // Some functions to consistently get canvas location from graph values
    const marginL = 48;
    const marginR = 20;
    const marginTop = 10;
    const marginBottom = 20;
    function canvasX(graphX) {
        return Math.min(canvas.width - marginR,
            Math.max(marginL,
                canvas.width - marginR - (canvas.width - marginR - marginL) * ((graphX - minX) / (maxX - minX))
            ));
    }
    function canvasY(graphY) {
        return Math.min(canvas.height - marginBottom,
            Math.max(marginTop,
                canvas.height - marginBottom - (canvas.height - marginBottom - marginTop) * (graphY / maxY)
            ));
    }
    // Draw graph background
    let context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw tick lines and labels
    context.strokeStyle = "dimgrey";
    context.fillStyle = "black";
    context.beginPath();
    // X axis
    context.textAlign = "center";
    for (let ticknum = 0; ticknum <= ticksX; ticknum++) {
        let graphX = maxX - intervalX * ticknum;
        let cX = canvasX(graphX);
        context.moveTo(cX, canvas.height - marginBottom);
        context.lineTo(cX, marginTop);
        context.fillText("-" + unitFuncX(maxX - graphX), cX, canvas.height - marginBottom + 12);
    }
    // Y axis
    context.textAlign = "right";
    for (let ticknum = 0; ticknum <= ticksY; ticknum++) {
        let graphY = intervalY * ticknum;
        let cY = canvasY(graphY);
        context.moveTo(marginL, cY);
        context.lineTo(canvas.width - marginR, cY);
        context.fillText(unitFuncY(graphY), marginL - 2, cY);
    }
    context.stroke();

    // Draw edges (after tick lines to be on top)
    context.strokeStyle = "black";
    context.beginPath();
    context.moveTo(marginL, marginTop);
    context.lineTo(marginL, canvas.height - marginBottom);
    context.lineTo(canvas.width - marginR, canvas.height - marginBottom);
    context.lineTo(canvas.width - marginR, marginTop);
    context.stroke();

    // Draw line
    context.strokeStyle = "green";
    context.beginPath();
    context.moveTo(canvasX(minX), canvasY(memory.get(minX)));
    data.forEach((value, key) => {
        context.lineTo(canvasX(key), canvasY(value));
    });
    context.stroke();
}

function updateMem() {
    // Get bounds of graph
    let maxMem = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    memory.forEach((value, key) => {
        // Get bounds for memory; minimum is always 0
        if (value > maxMem) {
            maxMem = value;
        }
        // Get bounds for time
        if (key > maxTime) {
            maxTime = key;
        }
        if (key < minTime) {
            minTime = key;
        }
    });
    let memticks = 4;
    // Make the tick interval be the next power of 2 (4kb, 8kb, ..., 64kb, ..., 1mb, ..., 1gb)
    let interval = 2 ** Math.ceil(Math.log2(maxMem / memticks));
    maxMem = Math.ceil(maxMem / interval) * interval;
    updateGraph(memCanvas, minTime, maxTime, 9, timeUnits, 0, maxMem, memticks, memUnits, memory);
}

function updateCpu() {
    let maxCpu = 0;
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    cpu.forEach((value, key) => {
        // Get bounds for memory; minimum is always 0
        if (value > maxCpu) {
            maxCpu = value;
        }
        // Get bounds for time
        if (key > maxTime) {
            maxTime = key;
        }
        if (key < minTime) {
            minTime = key;
        }
    });
    updateGraph(cpuCanvas, minTime, maxTime, 9, timeUnits, 0, maxCpu, 5, cpuUnits, cpu);
}

var lastcpu = 0;

window.addEventListener("message", (e) => {
    /** @type {JSON} */
    const data = e.data;
    switch (data.type) {
        case "memdata":
            memory.set(data.time, data.value);
            updateMem();
            break;
        case "cpudata":
            if (lastcpu !== 0) {
                cpu.set(data.time, data.value - lastcpu);
            }
            lastcpu = data.value;
            updateCpu();
            break;
        default:
            // Discard
            console.error("Invalid message type for JSON message to WebView:\n" + data);
    }
});

// Resize event
function resize() {
    memCanvas.width = document.getElementById("memoryGroup").clientWidth;
    memCanvas.height = document.getElementById("memoryGroup").clientWidth / 4;
    cpuCanvas.width = document.getElementById("cpuGroup").clientWidth;
    cpuCanvas.height = document.getElementById("cpuGroup").clientWidth / 4;
}
window.addEventListener("resize", (e) => {
    resize();
    updateMem();
    updateCpu();
});
resize();

/*setInterval(() => {
    window.postMessage({ "type": "memdata", "time": Date.now(), "value": Math.floor(Math.sqrt(Math.random() * 1000000 ** 2)) });
}, 100);
setInterval(() => {
    window.postMessage({ "type": "cpudata", "time": Date.now(), "value": Math.floor(Math.random() * 100) });
}, 100);*/