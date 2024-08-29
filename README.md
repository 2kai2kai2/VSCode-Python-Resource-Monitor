[
![GitHub Version](https://img.shields.io/github/package-json/v/2kai2kai2/VSCode-Python-Resource-Monitor?color=blue&logo=Github)
](https://github.com/2kai2kai2/VSCode-Python-Resource-Monitor)
[
![Published Version](https://img.shields.io/visual-studio-marketplace/v/kaih2o.python-resource-monitor?color=blue&logo=Visual%20Studio%20Code&logoColor=%230078d7)
![Installs](https://img.shields.io/visual-studio-marketplace/i/kaih2o.python-resource-monitor?logo=Visual%20Studio%20Code&logoColor=%230078d7)
![Last Updated](https://img.shields.io/visual-studio-marketplace/last-updated/kaih2o.python-resource-monitor?logo=Visual%20Studio%20Code&logoColor=%230078d7)
](https://marketplace.visualstudio.com/items?itemName=kaih2o.python-resource-monitor)
[
![Donate](https://img.shields.io/badge/Patreon-donate-orange?logo=Patreon)
](https://www.patreon.com/bePatron?u=9073173)

# Python Resource Monitor

Until now, resource and performance monitor extensions in VS Code only displayed current global resource consumption data via lists and text. Likewise, it is very awkward to use third-party tools to find the process you want to monitor.

However, this extension provides an easier, graphical solution that can show data specific to the process being used by the Python debugger! _Yeah, so I made this because searching for the right Python process in Task Manager was annoying._

## Features

Provides a resource monitor that is opened when debugging Python, including process memory, cpu usage, and file usage. Automatically appears in the debug tab when debugging with python.

![usage](images/usage.gif)

_Test program storing strings of random sizes in memory_

### Uses theme colors

![usage2](images/dark_sc.png)

### Customizable

| Command                   | Usage                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PyRSM: Length`           | Set the maximum log length in milliseconds of the resource monitor. Set to `0` to allow unlimited length (time display will scale). |
| `PyRSM: Polling Interval` | Set the time between datapoints in milliseconds.                                                                                    |

## Known Issues and Future Updates

- Hopefully, this will one day work for many languages and debuggers!
- Response to mouseover of the graph.
