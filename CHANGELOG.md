# Change Log

All notable changes to the Python Resource Monitor extension will be documented in this file.

## 0.0.1 - Alpha
- Initial release

## 0.0.2 - Alpha
- Added icon and more details.


## 0.1.0 - Alpha
- Implemented millisecond-accurate CPU Usage using a module I made for this purpose, `node-ps-data`

## 0.1.1 - Alpha
- Bugfix: Kilobytes were not accurately converted to bytes for legacy memory consumption lookups, resulting in 1kb being reported as 1 byte, and so on.
- Added data to `package.json` to improve VS Marketplace page and search.

## 0.1.2 - Alpha
- Fixed marketplace colorscheme

## 0.1.3 - Alpha
- Updated dependencies including my `node-ps-data` addon with an improved build system.

## 0.1.4 - Alpha
- Add responsive design with display scaling
- Add support for theme colors
- Display process ID

## 0.1.5 - Alpha
- Add code badges

## 0.1.6 - Alpha
- Updated dependencies to fix an issue with `ansi-regex` and ensure latest version of `node-ps-data`

## 0.1.7 - Alpha
- Quick fix for `0.1.6 - Alpha`

## 0.1.8 - Alpha
- With the new update of `node-ps-data` ensuring consistency in memory results on Windows, we no longer use the `tasklist` shell command except as a fallback, and prefer `node-ps-data`.

## 0.1.9 - Alpha
- Add [Patreon](https://www.patreon.com/bePatron?u=9073173) link

## 0.2.0 - Beta
- Add file read and write data.

## 0.2.1 - Beta
- Force `node-ps-data` [v1.3.1](https://github.com/2kai2kai2/node-ps-data/releases/tag/v1.3.1) to avoid an installation bug.
- Add support for [Multiprocessing](https://docs.python.org/3/library/multiprocessing.html) _(credit to [@mgrunbauer](https://github.com/2kai2kai2/VSCode-Python-Resource-Monitor/pull/8))_
    - Split file read and file write data

## 0.2.2 - Beta
- Actually fixed the installation bug this time. Turns out we have to package `node_modules` with the dependencies.

## 0.2.3 - Beta
- Update to `node-ps-data` [v1.4.0](https://github.com/2kai2kai2/node-ps-data/releases/tag/v1.4.0) to add support for Apple Silicon (`darwin-arm64`)
- Add support for the new default VS Code Python debugger type `debugpy`

## 0.3.0
- Update to `node-ps-data` [v1.4.1](https://github.com/2kai2kai2/node-ps-data/releases/tag/v1.4.1) and use memory resident/working set size instead of full memory (since MacOS memory reports the full address space which is not useful)
- Moved graphs to the debug sideview instead of opening a new page when debug starts.
