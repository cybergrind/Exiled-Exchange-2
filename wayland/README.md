# Running on Wayland (niri)

`./run` at the repository root checks and prepares everything, then starts the app from source.
It needs `uv`, Node 22+ and an X server (`xwayland-satellite`, which niri starts by itself).

Add [niri-window-rule.kdl](niri-window-rule.kdl) to your niri config once, or `include` it;
`./run` refuses to start without it. Adjust its `y` to the height of your bar.

Price check is `Alt + D` over an item; `Esc` or a click on the background returns to the game.
Hotkeys only exist while the game has focus, and a compositor bind on the same key wins over them.

## Why it takes all of this

| Problem | Effect | Fix |
| --- | --- | --- |
| Electron 40 picks native Wayland in a Wayland session | No `globalShortcut`, no overlay placement. The game tracking is XCB anyway | `./run` forces `--ozone-platform=x11` |
| The overlay is mapped as soon as the game gets focus, and it asks for fullscreen | niri tiles it and focuses it, the game blurs, every hotkey is dropped | The window rule, plus `hideOverlayOnBlur` to keep it unmapped until there is something to show |
| The empty X input shape does not reach Wayland: the overlay takes the pointer over the whole window | With `focus-follows-mouse` it takes focus from the game, which is what the press-and-hold price check needs to keep (not tested) | Price check uses the locked mode: the overlay gets focus on purpose |
| On Linux the overlay is activated by a raw X `SetInputFocus`, which Chromium misses once the window has been hidden | From the second price check on, the keyboard goes nowhere, Esc included | `OverlayWindow.ts` also calls `focus()` |

`hideOverlayOnBlur` and the hotkey are the fork's defaults for a new config. `./run` applies them
to an existing one and also fills in the game config path, which the app does not find in a
non-default Steam library. Setting `logKeys` keeps the overlay mapped, which brings the focus
problem back.

The synthetic Ctrl+Alt+C reaches the game over XTest because the game is an X client too, unlike
in the sessions reported in upstream PR #964. That PR takes another way, a root evdev helper.
