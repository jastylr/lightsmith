# Contributing to Lightsmith

Thanks for helping! Lightsmith aims to let people with no lighting experience build good-looking
shows for QLC+. Keep that person in mind: plain words in the UI, sensible defaults, no jargon
without an explanation.

## Ground rules

- **Lightsmith writes files; QLC+ runs the show.** We don't send DMX, talk to MIDI devices or edit
  fixture definitions. If a feature needs that, it belongs in QLC+.
- **Never break the user's workspace.** Everything we generate lives under the `Lightsmith/<song>`
  function folder and a `<song> (Lightsmith)` Virtual Console frame, so it can be replaced on the
  next export without touching the user's own work.
- **Same choices, same output.** The generator is deterministic. Avoid randomness.
- **Engine and UI stay separate.** `src/core` must not import from `src/ui` or React.

## Getting started

```sh
npm install
npm test
npm run dev
```

## Good first contributions

- **Presets** in `src/core/presets.ts`: moods, colors, movements, section types. Keep existing
  `id`s unchanged; saved songs refer to them.
- **Checks** in `src/core/checks.ts`: anything that would make a look go dark or confuse QLC+.
- **Fixture quirks**: if a fixture from the QLC+ library behaves oddly, open an issue with the
  make, model and mode.

## Pull requests

- Add or update tests in `tests/` for engine changes.
- Run `npm test` and `npm run typecheck` before opening the PR.
- Describe what a user would see differently.
