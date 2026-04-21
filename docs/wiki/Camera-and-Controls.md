# Camera and Controls

## Mouse

- **Click + drag** anywhere on the canvas to orbit the camera around its target.
- **Scroll** (or pinch on a trackpad) to zoom. Bounds: min distance 4, max distance 80.
- **Click a zone** to glide the orbit target to that zone (smooth lerp, not a snap).
- **Click a timeline segment** to glide the camera to that agent at that moment.

## Keyboard

### Arrow pan

Arrow keys pan the orbit target in the ground plane relative to where the camera is currently facing.

- `ArrowUp` - forward (along the camera look vector projected onto xz).
- `ArrowDown` - backward.
- `ArrowLeft` - strafe left.
- `ArrowRight` - strafe right.

Forward / back is boosted by ~2.2x strafe speed so the perceived motion feels balanced. Forward-pan translates the orbit target along the look direction, which visually reads slower than strafing at the same world speed; the multiplier compensates.

### Dolly

- `+` / `=` / `PageUp` - dolly in.
- `-` / `_` / `PageDown` - dolly out.

### Modifiers

- Hold **Shift** while panning or dollying to move 2.5x faster.

### Priorities

- Arrow / dolly keys are ignored while focus is inside a text input, textarea, or any other editable field. Typing in Settings never jitters the camera.
- Any arrow or dolly press cancels an in-flight `village:focus-zone` / `village:focus-agent` glide so the user always wins.
- Window blur drops all pressed-key state so an alt-tab mid-press does not keep the camera panning.

## App shortcuts

- `Esc` - close the bubble drawer, any open modal, or the settings pane.
- `Cmd+,` - open Settings.
- `Cmd+W` - close the current tab.
- `Cmd+Option+I` - toggle DevTools (renderer).

## Under the hood

- Camera uses drei `<OrbitControls>` with `screenSpacePanning`, `minDistance=4`, `maxDistance=80`, `maxPolarAngle=0.7pi`. The polar cap lets the camera dip below the horizon for the underwater view without flipping over.
- Arrow / dolly logic lives in `src/renderer/village/useKeyboardPan.ts`. Pure `panDeltaForKeys` and `dollyDeltaForKeys` helpers are fully unit-tested in `tests/unit/keyboardPan.test.ts`.
- Smooth zone / agent glides come from a `<CameraTargetLerper>` inside the Canvas that reads a shared `desiredTargetRef` and lerps the orbit target at an exponential-decay rate.
