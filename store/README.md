# Store kit

- `index.html`: the press kit page (art, screenshots, fact sheet). Live at https://merchantsteam29.github.io/mimic/store/index.html
- `description.md`: the store text, tags, content notes and controls to paste into itch.io / CrazyGames.
- `art/`: covers. itch.io wants 630x500 (`cover-630x500.png`); CrazyGames wants 1920x1080, 800x1200 and 800x800.
- `screenshots/`: 1920x1080, taken in the game with the trailer camera (clean screen, sharp picture).
- `art.html`: draws a cover from a screenshot. Open `art.html?w=630&h=500&img=01-hospital` in a window exactly that size
  and screenshot it (`pos=50% 30%` moves the picture).

## The trailer camera

Open the game with `?trailer` in the address (https://merchantsteam29.github.io/mimic/?trailer), start a run, then press
**`** (backquote, left of 1) to take the camera off the player:

| Key | |
| --- | --- |
| WASD, mouse | fly, look (it glides) |
| Q / Z | down / up |
| Shift / Alt | faster / slower |
| H | hide everything on screen |
| V | sharper picture (the camcorder look stays) |
| G | it ignores you (you can't be caught while filming) |
| F | freeze the mimic where it is |
| [ / ] | slow motion (1x, 0.5x, 0.25x) |
| K / P / C | add a keyframe here / play the keyframes as one smooth move / clear them |

Record the screen with OBS (or Win+Alt+R). Players never see any of this.
