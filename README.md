# Python Resource Monitor

## Features
Provides a resource monitor that is opened when debugging Python, including process memory and cpu usage. Automatically launches (or reuses existing tab) upon debugging with Python.

![usage](images/usage.gif)

*Test program storing strings of random sizes in memory*

| Command | Usage |
| ------- | ----- |
| `PyRSM: Length` | Set the maximum log length in milliseconds of the resource monitor. Set to `0` to allow unlimited length (time display will scale). |
| `PyRSM: Polling Interval` | Set the time between datapoints in milliseconds. |

## Known Issues and Future Updates

- CPU time has low resolution, and only shows data when a second of cpu time has been used due to `tasklist`'s smallest resolution being one second.
- Hopefully, this will one day work for many languages and debuggers!
- Not tested on Linux or MacOS.
- I don't think it will work with the Python multiprocessing module quite yet.

### 0.0.1
First Release! All the basics seem to work.