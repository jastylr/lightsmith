# Deep dives: the parts that need special attention

*A companion to the course. The chapters build Lightsmith in order; these deep dives slow down on the ideas that trip people up, explain each one from scratch with small examples, and then show exactly where it lives in Lightsmith.*

## How to use this

Each chapter in the syllabus has a **Needs special attention** line that points here. When you reach that chapter, read the deep dive first, do its **Try it**, then build the chapter. The deep dives don't depend on each other much, so you can also read one on its own when something in the code puzzles you.

Every deep dive has the same parts:

- **Where it shows up.** The chapters and files.
- **Why it's hard.** What makes this idea slippery, usually because it behaves differently from what you'd expect coming from PHP.
- **The idea, from scratch.** The concept on its own, with a small example you can paste into a scratch file and run.
- **In Lightsmith.** The real code, and why it's written that way.
- **Mistakes to watch for.** Bugs this idea causes, several of them real bugs we hit while building the app.
- **Try it.** A short exercise that makes the idea stick.

To run the small examples, make a scratch file such as `scratch.ts` and run it with `npx tsx scratch.ts`. For the React examples, paste them into your learner build.

**Difficulty.** ● needs care, ●● hard, ●●● the hardest parts of the course. Don't rush the ●●● ones.

| # | Deep dive | Difficulty | Chapters |
|---|---|---|---|
| 1 | [Types that vanish: trusting data at the edges](#dd-1) | ●● | 4, 5, 9, 12 |
| 2 | [Unions and narrowing: one value, several shapes](#dd-2) | ● | 5, 9, 21, 22 |
| 3 | [Never change it, copy it: immutability and undo](#dd-3) | ●● | 7, 9, 10 |
| 4 | [When React runs your code: renders, effects and cleanup](#dd-4) | ●●● | 7, 14, 16, 18, 22 |
| 5 | [Stale closures, and refs as the way out](#dd-5) | ●●● | 7, 16, 18, 22 |
| 6 | [Measuring the page: refs to elements and layout effects](#dd-6) | ●● | 14, 16, 18 |
| 7 | [Trees and recursion: reading and writing XML](#dd-7) | ●● | 11, 22 |
| 8 | [Generating output you can run twice: idempotence](#dd-8) | ●● | 22 |
| 9 | [Bits and bytes: how a MIDI message becomes a QLC+ channel](#dd-9) | ●● | 22, part 2 |
| 10 | [Trigonometry for moving lights](#dd-10) | ●●● | 13, 18, 20 |
| 11 | [Time, tempo and the trouble with decimals](#dd-11) | ● | 16, 20, 21 |
| 12 | [Asynchronous code: promises, permissions and the event loop](#dd-12) | ●● | 3, 12, 22 part 2 |
| 13 | [Pure functions, side effects and tests](#dd-13) | ● | 11, 22, 24 |
| 14 | [State outside React: module variables and singletons](#dd-14) | ● | 12, 22 part 2, 24 |
| 15 | [The CSS cascade: why a rule didn't apply](#dd-15) | ●● | 8, 14, 18 |
| 16 | [Keyboard and screen readers: building accessible controls](#dd-16) | ● | 6, 8, 18 |
| 17 | [The lighting domain: DMX, HTP and LTP](#dd-17) | ●● | 1, 9, 22 |

---

<a id="dd-1"></a>

## 1. Types that vanish: trusting data at the edges ●●

**Where it shows up.** Chapters 4, 5, 9 and 12. `normalizeProject` in `src/core/model.ts`, `readProjectFile` in `src/core/projectFile.ts`, `loadXML`-style readers in `src/core/workspace.ts` and `src/core/fixture.ts`.

**Why it's hard.** TypeScript checks your code while you write it, then the types are deleted. The browser runs plain JavaScript. So a type is a promise *you* make about data, and TypeScript believes you. Inside your own code that promise holds, because TypeScript checked every line that made the data. At the *edges*, where data comes in from outside (a file the user drops, `localStorage`, `JSON.parse`, a network reply), nothing checked it. If you tell TypeScript "this is a `Project`" and it isn't, the type checker stays quiet and your app breaks later, somewhere far away from the real cause.

Coming from PHP: it's like declaring `function save(Project $p)` but then building `$p` straight from `$_POST`. The type hint only means something if something actually made sure the data fits.

**The idea, from scratch.**

```ts
interface Song {
  title: string;
  bpm: number;
}

// JSON.parse returns `any`: TypeScript gives up and trusts you.
const song = JSON.parse('{"title": "Intro"}') as Song;

console.log(song.bpm * 2); // NaN. No error at compile time, none at runtime either.
```

The `as Song` told TypeScript something that wasn't true. The fix is to *check* the data where it comes in, and turn it into the right shape, filling in or rejecting what's missing:

```ts
function readSong(data: unknown): Song {
  // `unknown` means "could be anything": TypeScript makes you check before use.
  if (typeof data !== "object" || data === null) throw new Error("Not a song");
  const d = data as Record<string, unknown>;
  return {
    title: typeof d.title === "string" ? d.title : "Untitled",
    bpm: typeof d.bpm === "number" && d.bpm > 0 ? d.bpm : 120,
  };
}

const ok = readSong(JSON.parse('{"title": "Intro"}'));
console.log(ok.bpm * 2); // 240
```

Two rules come out of this. Use `unknown`, not `any`, for data you haven't checked yet: `unknown` forces you to check, `any` switches checking off. And check once, at the edge, so the rest of the app can trust the type.

**In Lightsmith.** Every way data gets in goes through a reader:

- A project from `localStorage` or a `.lightsmith` file goes through `readProjectFile`, which checks the header, refuses a file from a newer version with a plain reason, and then calls `normalizeProject`. `normalizeProject` copies only the fields it knows and fills in defaults, so a project saved by an older Lightsmith (before `setlist` or `control` existed) loads with sensible values instead of `undefined` surprises.
- A QLC+ show file is XML text. `parseWorkspace` reads attributes as strings and converts them on purpose: `Number(getAttr(u, "ID") ?? 0)`. The `?? 0` is the default when the attribute isn't there at all.

**Mistakes to watch for.**
- Writing `as Something` to make an error go away. It doesn't fix anything; it hides the error. Every `as` in this codebase sits right after a check that makes it true.
- Forgetting that `Number("")` is `0` and `Number("abc")` is `NaN`. Both are numbers as far as TypeScript knows.
- Adding a new field to `Project` and forgetting to copy it in `normalizeProject`. This actually happened: positions on the Stage page vanished after reloading, because `normalizeProject` didn't know about `rig.positions` yet. There's a test now.

**Try it.** In your learner build, add an optional `notes?: string` to `Song`. Save a project, reload the page, and confirm the notes are gone. Fix `normalizeProject`, then write a test that saves and reloads a song with notes.

---

<a id="dd-2"></a>

## 2. Unions and narrowing: one value, several shapes ●

**Where it shows up.** Chapters 5, 9, 21 and 22. `ColorTarget`, `Trigger`, `TriggerKind`, `Built` in `ExportPage.tsx`.

**Why it's hard.** In Java you'd make a class hierarchy for "a value that can be one of several kinds". TypeScript usually uses a *union* instead, and then works out which kind you have from the checks you write. That's powerful, but you have to learn to read what TypeScript knows at each line.

**The idea, from scratch.**

```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };

function area(s: Shape): number {
  if (s.kind === "circle") {
    // In here TypeScript knows s is the circle, so s.radius is allowed.
    return Math.PI * s.radius ** 2;
  }
  // Only the square is left, so s.side is allowed.
  return s.side ** 2;
}
```

The shared `kind` field is called the *discriminant*, and checking it *narrows* the type. Add a third shape and every function that forgot to handle it becomes an error, if you end with an exhaustive check:

```ts
function never(x: never): never {
  throw new Error(`Unhandled: ${JSON.stringify(x)}`);
}
// ...at the end of a switch on s.kind:  default: return never(s);
```

**In Lightsmith.** A kind of light's color setting is `ColorTarget = "mix" | "white" | number | string[]`: mix all the colors, plain white, one color by its index, or a list of chosen colors. Code narrows with `typeof t === "number"`, `Array.isArray(t)` and `t === "mix"`. A MIDI trigger has `kind: "note" | "cc" | "pc"`, and `qlcInputChannel` picks the right number range from it. On the Export page, the build result is a union of two shapes (`mode: "set"` or `mode: "song"`), so the page can't show a set summary for a single-song export by mistake.

**Mistakes to watch for.** Narrowing doesn't survive a function boundary or a callback that runs later: TypeScript can't know the value didn't change in between. Copy the narrowed value into a `const` first.

**Try it.** Add a fourth `ColorTarget`, `"off"`, in your learner build, and let the compiler show you every place that has to handle it.

---

<a id="dd-3"></a>

## 3. Never change it, copy it: immutability and undo ●●

**Where it shows up.** Chapters 7, 9 and 10. `change()` and the undo history in `src/ui/store.ts`; every `onChange({ ... })` in the editor.

**Why it's hard.** In PHP every request starts fresh, so changing an array in place is normal. In a React app the data lives for hours, and React decides whether to redraw by asking "is this the *same object* as before?" (`===`). If you change an object in place, it's still the same object, so React may not redraw, and undo has nothing to go back to.

**The idea, from scratch.**

```ts
const before = { title: "Intro", bpm: 120 };

// Mutating: the old version is gone.
const sameObject = before;
sameObject.bpm = 140;
console.log(before.bpm); // 140: "before" changed too, they're one object.

// Copying: a new object with one field different; the old one is untouched.
const original = { title: "Intro", bpm: 120 };
const next = { ...original, bpm: 140 };
console.log(original.bpm, next.bpm, original === next); // 120 140 false
```

The `...` (spread) copies one level only. Nested objects are still shared, so to change something deep you copy each level on the way down:

```ts
const song = { title: "Intro", sections: [{ name: "Verse", bars: 8 }] };
const longer = {
  ...song,
  sections: song.sections.map((s, i) => (i === 0 ? { ...s, bars: 16 } : s)),
};
// song.sections[0].bars is still 8. Untouched sections are shared, which is fine
// because nobody changes them.
```

**In Lightsmith.** The whole project is one value. Every edit goes through `change(fn)`, where `fn` takes the current project and returns a new one:

```ts
const change = useCallback((fn: (p: Project) => Project, record = true) => {
  const before = current.current;
  const next = fn(before);
  if (next === before) return;               // nothing changed: no undo step
  if (record) history.current.record(before); // keep the old version for undo
  current.current = next;
  setProjectState(next);
}, []);
```

Because old versions are never changed, undo is just "go back to the previous object". There's no need to work out how to reverse each kind of edit. Dragging a timeline block makes dozens of edits a second, so drags are wrapped in `beginGesture()` and `endGesture()` to count as one undo step.

**Mistakes to watch for.**
- `array.push`, `array.sort` and `array.splice` change the array in place. In state, use `[...a, x]`, `[...a].sort()` and `a.filter(...)` instead.
- Copying the top level but changing a nested object: the copy and the original still share it.
- `structuredClone` makes a full deep copy. It's handy, but slower, and it isn't needed when you copy along the path you change.

**Try it.** Write a function `renameSection(song, id, name)` that returns a new song. Then write a test that checks the original song is unchanged and that untouched sections are the *same* objects (`===`).

---

<a id="dd-4"></a>

## 4. When React runs your code: renders, effects and cleanup ●●●

**Where it shows up.** Chapters 7, 14, 16, 18 and 22 part 2. Almost every component, and especially the timeline playback, the stage preview, the settings bar (`IntersectionObserver`) and MIDI learn (`TriggerField.tsx`).

**Why it's hard.** A React component isn't run once. It's a function React calls *again* every time its state or props change. Anything in its body runs on every render. Work that has to happen *because* of a render (start a timer, listen to an event, ask the browser something) goes in `useEffect`, and every effect that starts something must also stop it, or you get duplicate listeners, timers that never end, and memory that's never freed.

**The idea, from scratch.**

```tsx
function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Runs after the component is on screen.
    const timer = setInterval(() => setNow(new Date()), 1000);
    // The function you return is the cleanup. React calls it when the
    // component leaves the screen, and before running the effect again.
    return () => clearInterval(timer);
  }, []); // [] = run once, when the component appears.

  return <p>{now.toLocaleTimeString()}</p>;
}
```

The array at the end is the *dependency list*. React runs the effect again whenever something in it has changed since last time:

- `[]`: once, when the component appears.
- `[songId]`: when it appears and whenever `songId` changes. The old effect is cleaned up first.
- no array: after every render. That's rarely what you want.

A rough timeline of a component's life:

```
render → paint → effect runs
state changes → render → paint → cleanup (old) → effect runs (new)
component removed → cleanup
```

In development, React's Strict Mode runs effects, cleans them up and runs them again on purpose, to flush out effects without a correct cleanup.

**In Lightsmith.** The small preview in the settings bar appears when the big one scrolls off screen. An `IntersectionObserver` watches the big preview; the effect starts it and its cleanup disconnects it:

```ts
useEffect(() => {
  const el = previewRef.current;
  if (!el) return;
  const io = new IntersectionObserver(([e]) =>
    setPreviewGone(!!e && e.intersectionRatio < 0.35 && e.boundingClientRect.top < 0));
  io.observe(el);
  return () => io.disconnect();
}, [popped]); // the big preview moves to its own window when popped out
```

MIDI learn (`TriggerField.tsx`) shows the full pattern: while `listening` is true, listen for one message and set a 15-second timeout; the cleanup stops both, whether the message arrived, the user pressed Cancel, or the component disappeared.

**Mistakes to watch for.**
- Calling a state setter in the component body (not in an effect or event handler): it triggers another render, which calls it again, forever.
- Forgetting the cleanup. With a `window` listener, every re-run adds another one, and the handler ends up running five times per event.
- Using an effect to work out a value from props or state. That's not a side effect: just compute it in the body, during render.

**Try it.** Add `console.log("effect")` and `console.log("cleanup")` to an effect in your learner build, then watch the console while you switch sections. Explain every line you see, including the extra pair from Strict Mode.

---

<a id="dd-5"></a>

## 5. Stale closures, and refs as the way out ●●●

**Where it shows up.** Chapters 7, 16, 18 and 22 part 2. `current.current` in the store, `useLastHeard` in `src/ui/midi.ts`, and the playback timer on the timeline.

**Why it's hard.** This is the bug that confuses everyone at first. A function remembers the variables that existed *when it was created*. That's a *closure*. In React every render creates new variables, so a function made during an old render keeps seeing old values. It's called "stale".

**The idea, from scratch.** Plain JavaScript first:

```ts
function makeCounter() {
  let count = 0;
  return () => ++count; // this function "closes over" count
}
const next = makeCounter();
next(); next();
console.log(next()); // 3: the function kept its own count
```

Now the React bug:

```tsx
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      console.log(count);   // always 0!
      setCount(count + 1);  // always sets 1
    }, 1000);
    return () => clearInterval(t);
  }, []); // the effect ran once, during the first render, when count was 0
  return <p>{count}</p>;
}
```

The interval's function was made during the first render and kept *that render's* `count` forever. There are two fixes:

```ts
// 1. Ask React for the latest value instead of using the remembered one.
setCount((c) => c + 1);

// 2. Keep the latest value in a ref: one box that stays the same across renders.
const countRef = useRef(count);
countRef.current = count;          // update the box on every render
// ...later, in the old function: countRef.current is always up to date.
```

`useRef` gives you an object with a `.current` field that stays the *same object* for the life of the component. Changing `.current` doesn't cause a render, which is exactly what you want for values a timer or listener needs to read.

**In Lightsmith.**
- The store keeps the project in state (to redraw the screen) *and* in a ref, `current.current`, so `change()` always works from the latest project even when two changes happen in the same moment.
- `useLastHeard` in `midi.ts` puts the setter in a ref, so the MIDI listener registered once still calls the current one.

**Mistakes to watch for.** Fixing a stale value by adding it to the effect's dependency list *can* be right, but for timers and listeners it means tearing down and restarting them on every change. When the effect should stay running, use a ref.

**Try it.** Make the broken counter above, watch it stick at 1, then fix it both ways.

---

<a id="dd-6"></a>

## 6. Measuring the page: refs to elements and layout effects ●●

**Where it shows up.** Chapters 14, 16 and 18. Dragging on the Stage plan, the timeline's resize handles and zoom, the settings bar.

**Why it's hard.** React describes *what* should be on screen. Sometimes you need facts only the browser knows after it has laid things out: where an element is, how wide it is, whether it's visible. You reach those through a ref attached to the element, and you have to read them at the right moment.

**The idea, from scratch.**

```tsx
function Width() {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    setW(box.current?.getBoundingClientRect().width ?? 0);
  }, []);
  return <div ref={box}>I am {Math.round(w)} pixels wide</div>;
}
```

`useLayoutEffect` runs after React has updated the page but *before* the browser paints it. Use it when you measure and then adjust something, so the user never sees the in-between frame. `useEffect` runs after painting, which is fine for anything the user doesn't see jump.

`getBoundingClientRect()` gives positions relative to the *visible window*. To turn one into a scroll position for the whole page, add `window.scrollY`. You'll see that in Lightsmith.

**In Lightsmith.** Clicking a section on the left used to scroll the whole page up, because `scrollIntoView()` scrolls *every* scrollable ancestor, including the page. The fix measures the timeline and the block and scrolls only the timeline sideways:

```ts
const b = box.getBoundingClientRect();
const r = el.getBoundingClientRect();
const by = r.left < b.left ? r.left - b.left - 16 : r.right > b.right ? r.right - b.right + 16 : 0;
if (by) box.scrollBy({ left: by, behavior: "smooth" });
```

Dragging on the Stage plan turns mouse pixels into stage millimetres by measuring the plan's size, then dividing.

**Mistakes to watch for.** Reading a ref during render: on the first render `ref.current` is still `null`, because the element doesn't exist yet. Only read refs in effects and event handlers.

**Try it.** Build a box you can drag with the mouse. Store its position in state, and use the box's `getBoundingClientRect()` to keep it inside its parent.

---

<a id="dd-7"></a>

## 7. Trees and recursion: reading and writing XML ●●

**Where it shows up.** Chapters 11 and 22. `src/core/xml.ts` (`parseXml`, `serializeXml`, `el`, `childElements`, `firstChild`, `textOf`) and every `walk` function in `generate.ts`.

**Why it's hard.** A QLC+ show file is a tree: elements inside elements, any number of levels deep. Code that handles a tree usually calls *itself* on each child. That's *recursion*, and it takes a while before it feels natural.

**The idea, from scratch.** A tree node with children:

```ts
interface Node {
  name: string;
  children: Node[];
}

const tree: Node = {
  name: "Frame",
  children: [
    { name: "Button", children: [] },
    { name: "Frame", children: [{ name: "Button", children: [] }] },
  ],
};

// Count every Button, however deep it is.
function countButtons(n: Node): number {
  let total = n.name === "Button" ? 1 : 0;
  for (const c of n.children) total += countButtons(c); // the function calls itself
  return total;
}
console.log(countButtons(tree)); // 2
```

Every recursive function needs a *base case* that stops it. Here, a node with no children loops zero times and returns. Think of it like this: "my answer is my own part plus my children's answers", and trust the call on each child to do its part.

**In Lightsmith.** `xml.ts` turns text into a tree of `XmlElement { name, attrs, children }` and back again. It's small and hand-written, so we control exactly what comes out: QLC+ is fussy about its files, and the output should change as little as possible from what came in. The generator searches the Virtual Console with walks like this one, which finds the old "Set (Lightsmith)" frame wherever you moved it:

```ts
const find = (parent: XmlElement): void => {
  for (const c of childElements(parent)) {
    if (c.name === "SoloFrame" && getAttr(c, "Caption") === SET_FRAME) { /* remember it */ }
    else find(c); // look inside everything else
  }
};
```

A walk can also carry information *down* the tree. When Lightsmith looks for MIDI mappings you made yourself, it passes along whether it's already inside one of Lightsmith's own frames, so those are skipped.

**Mistakes to watch for.**
- Text between elements is part of the tree too: a child can be a string. That's why `childElements` filters to elements only.
- Changing a list of children while looping over it. Collect what to remove first, then remove it, as `removeWhere` does.

**Try it.** Write `listCaptions(e: XmlElement): string[]` that returns the caption of every Virtual Console widget in your show file, at any depth. Run it on your real `.qxw`.

---

<a id="dd-8"></a>

## 8. Generating output you can run twice: idempotence ●●

**Where it shows up.** Chapter 22. `generateSong` and `generateSet` in `src/core/generate.ts`.

**Why it's hard.** You'll export, try it on the rig, change something and export again, dozens of times. Each export starts from your show file, and that file may already hold an older export. Doing something twice should give the same result as doing it once. That's *idempotence*, and it doesn't come for free: by default, a second run adds a second copy of everything.

**The idea, from scratch.**

```ts
// Not idempotent: run it twice and you get two "Lightsmith" entries.
function addMenu(menu: string[]) {
  menu.push("Lightsmith");
}

// Idempotent: remove what we made before, then add it fresh.
function setMenu(menu: string[]) {
  const others = menu.filter((m) => m !== "Lightsmith");
  return [...others, "Lightsmith"];
}
```

The trick is being able to *recognise your own output*, while leaving everything else exactly as it was.

**In Lightsmith.** Three things make export repeatable:

1. **Everything Lightsmith makes is labelled.** Functions go in the QLC+ folder `Lightsmith/<song title>`, and frames have captions ending in "(Lightsmith)". On export, everything with that label is removed first, then rebuilt.
2. **Where you put things is kept.** Before removing the old frame, the generator remembers its position and puts the new one in the same spot, so a frame you dragged somewhere stays there.
3. **New IDs never clash.** QLC+ functions and widgets need unique numbers. `nextFunctionId` and `nextWidgetId` find the highest one in use and count up from there.

This is also why two songs with the same name are refused: they'd share a folder, and the second would wipe out the first.

**Mistakes to watch for.** A label that's too loose deletes the user's own work. A label that's too strict misses old output, which piles up export after export. Both are tested: "exporting twice gives one copy", and "the rest of your show stays as it was".

**Try it.** In a test, run `generateSet` twice on the same workspace and check that the number of functions and frames is the same after the second run.

---

<a id="dd-9"></a>

## 9. Bits and bytes: how a MIDI message becomes a QLC+ channel ●●

**Where it shows up.** Chapter 22 part 2. `readMessage` in `src/ui/midi.ts` and `qlcInputChannel` in `src/core/model.ts`.

**Why it's hard.** Most code never looks at individual bits. MIDI does: it packs two facts into one byte. QLC+ packs two facts into one number too. To read and write those, you use the *bitwise* operators `&`, `|` and `<<`.

**The idea, from scratch.** A byte is 8 bits. Write it in hexadecimal and each hex digit is exactly 4 bits, which makes the packing easy to see:

```
0x91  =  1001 0001
         ^^^^ ^^^^
         |    └── low 4 bits:  1  → MIDI channel 2 (channels count from 0)
         └─────── high 4 bits: 9  → "note on"
```

- `x & 0xF0` keeps the high 4 bits and clears the rest (AND: a bit survives only where both have a 1).
- `x & 0x0F` keeps the low 4 bits.
- `a << 12` shifts `a` left by 12 bits, the same as multiplying by 4096.
- `a | b` combines two numbers whose bits don't overlap (OR).

```ts
const status = 0x91;
console.log((status & 0xf0).toString(16)); // "90": note on
console.log((status & 0x0f) + 1);          // 2: MIDI channel 2

const packed = (1 << 12) | 164;            // channel bits and a number, together
console.log(packed);                       // 4260
console.log(packed >> 12, packed & 0xfff); // 1 164: unpack them again
```

**In Lightsmith.** Reading a MIDI message from a pad:

```ts
const channel = (status & 0x0f) + 1;
const cmd = status & 0xf0;
if (cmd === 0x90 && d2 > 0) return { port, channel, kind: "note", number: d1 };
```

A note-on with velocity 0 counts as a release (`d2 > 0`). That's a MIDI rule many devices rely on.

Writing it for QLC+: its MIDI plugin numbers controllers 0–127, notes 128–255 and program changes 384–511. When it listens on every channel, it adds the MIDI channel (0–15) in the bits above 12:

```ts
const base = t.kind === "cc" ? 0 : t.kind === "note" ? 128 : 384;
const ch = base + t.number;
return listen === "own" ? ch : ((device.channel - 1) << 12) | ch;
```

So your Strike pad sending note 36 on MIDI channel 2 is QLC+ input channel `(1 << 12) | (128 + 36)` = 4260. These rules weren't guessed: they come from QLC+'s own source code (`midiprotocol.cpp`), and a test pins them down.

**Mistakes to watch for.** Off-by-one: MIDI channels are 1–16 for people and 0–15 in the byte. Keep the conversion in one place.

**Try it.** Write `describe(bytes: number[])` that turns `[0xb2, 20, 127]` into "CC 20 on channel 3". Then check `qlcInputChannel` by hand for a program change 5 on channel 4.

---

<a id="dd-10"></a>

## 10. Trigonometry for moving lights ●●●

**Where it shows up.** Chapters 13, 18 and 20. `standsUp` in `src/core/workspace.ts`, the beams in `StagePreview.tsx`, and `efxPoint`, `efxTravel` and `moverTiming` in `src/core/model.ts`.

**Why it's hard.** Moving heads, QLC+'s 3D view and EFX shapes are all geometry, and the bugs are subtle: the numbers look reasonable while the lights point the wrong way. Two real bugs from building this app came from here (see Mistakes).

**The idea, from scratch.** A point going round a circle once, as `t` goes from 0 to 2π (a full turn, in *radians*):

```ts
for (let i = 0; i <= 8; i++) {
  const t = (i / 8) * 2 * Math.PI;
  const x = Math.cos(t), y = Math.sin(t);
  console.log(x.toFixed(2), y.toFixed(2)); // walks round the unit circle
}
```

- `cos` and `sin` always stay between −1 and 1, so you scale them: `x = centre + cos(t) * width`.
- Change the speeds and you get other shapes: `x = cos(2t), y = cos(t)` draws a figure eight.
- Degrees to radians: multiply by π/180.

**In Lightsmith.**

*Shapes.* `efxPoint` copies the formulas QLC+ uses for its EFX shapes (from QLC+'s `efx.cpp`), so Lightsmith's preview and the real lights trace the same path. One detail matters a lot: QLC+'s *width* is how far the head travels *each way* from the middle, not the total. Lightsmith first treated it as the total, so big shapes were cut off at 127.

*Can the heads keep up?* To know whether a shape is too fast, `efxTravel` walks round it in 720 small steps and adds up how far the motors move:

```ts
total += Math.max(Math.abs(x - px) * width, Math.abs(y - py) * height);
```

Why `Math.max`? The pan and tilt motors move at the same time, so each step takes as long as whichever motor has further to go. Adding up many tiny steps like this is a simple form of *numerical integration*. When there's no neat formula, you measure.

*Which way is up?* QLC+'s 3D view stores rotations as three angles applied one after another. Whether a bar stands upright depends on all of them together, so `standsUp` works out where the bar's length ends up pointing (`|cos(Y) · sin(Z)| > 0.7`) instead of looking at one angle.

**Mistakes to watch for.**
- Mixing degrees and radians. JavaScript's `Math.cos` takes radians.
- Corners vs middles. QLC+ stores a fixture's *corner*, not its middle, so every light came in shifted toward stage right until we added half the fixture's size.
- Trusting the picture. The preview showed a fast circle that the real heads couldn't follow, so they just twitched. Now the preview and the export both use `moverTiming`, so they can't disagree.

**Try it.** Draw `efxPoint("Eight", t)` as an SVG path for t from 0 to 2π, then check it against the shape QLC+ shows in its EFX editor.

---

<a id="dd-11"></a>

## 11. Time, tempo and the trouble with decimals ●

**Where it shows up.** Chapters 16, 20 and 21. `sectionMs`, `barsForSeconds`, `moverCycleBeats` and `moverTiming`.

**Why it's hard.** Music runs in beats and bars, while computers and QLC+ run in milliseconds. Converting back and forth with decimals collects small errors.

**The idea, from scratch.**

```ts
console.log(0.1 + 0.2);            // 0.30000000000000004
console.log(0.1 + 0.2 === 0.3);    // false

const beatMs = 60000 / 138;        // 434.78260869565216...
const bar = 4 * beatMs;            // 1739.13...
```

Numbers in JavaScript are binary fractions, and 0.1 can't be written exactly in binary, just as 1/3 can't be written exactly in decimal. So round when you *show* a number or *hand it over* (QLC+ wants whole milliseconds), compare with a tolerance (`Math.abs(a - b) < 1e-9`) instead of `===`, and keep the exact musical value (bars, beats) as the thing you store.

**In Lightsmith.** A section stores its length in *bars*, never in seconds; seconds are worked out when needed. The "In seconds" box converts the other way and rounds to whole bars, which is why its hint says "Rounds to whole bars". When a movement is too fast, `moverTiming` *doubles* the number of beats instead of stretching it to some odd length, so the movement still lands on the beat.

**Try it.** At 138 BPM, how many whole bars is closest to 20 seconds? Work it out by hand, then check it with `barsForSeconds`.

---

<a id="dd-12"></a>

## 12. Asynchronous code: promises, permissions and the event loop ●●

**Where it shows up.** Chapters 3, 12 and 22 part 2. Reading dropped files (`file.text()`), fetching the fixture library, `navigator.requestMIDIAccess()`.

**Why it's hard.** In PHP, a line waits until it's finished. In the browser, slow work (reading a file, a network request, waiting for the user to allow MIDI) runs *in the background*, and your code carries on. The answer arrives later as a *promise*.

**The idea, from scratch.**

```ts
function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function demo() {
  console.log("1. start");
  await wait(500);           // pause *this function*; the page keeps running
  console.log("3. half a second later");
}
demo();
console.log("2. this runs before 3");
```

`await` pauses only the `async` function it's in. Everything else carries on, which is why "2" prints before "3". Errors in async code are caught with `try`/`catch` around the `await`:

```ts
try {
  const access = await navigator.requestMIDIAccess();
} catch {
  // the user said no, or the browser can't do MIDI
}
```

**In Lightsmith.** `useMidi().start()` asks for MIDI access. While the browser is showing its permission prompt, the status is `"asking"`, so the button can be disabled. Then it becomes `"on"` or `"denied"`. Several files dropped at once are read one after another with `await file.text()`. A file that fails shows an error and doesn't stop the others.

**Mistakes to watch for.**
- Forgetting `await`: you get a Promise object, not the value, and TypeScript may let it through if you then pass it somewhere loosely typed.
- A component can disappear while it's waiting. Setting state afterwards is harmless in React 18 and later, but starting new work then isn't.

**Try it.** Write `readAll(files: File[])` that reads every file and returns `{ name, text }[]`, reporting each failure without stopping the rest.

---

<a id="dd-13"></a>

## 13. Pure functions, side effects and tests ●

**Where it shows up.** Chapters 11, 22 and 24. The whole of `src/core`, and `tests/core.test.ts`.

**Why it's hard.** It's easy to understand, and harder to keep to. A *pure* function returns a value based only on its inputs, and changes nothing outside itself. Pure functions are easy to test and impossible to break by calling them at the wrong time.

**The idea, from scratch.**

```ts
// Pure: same inputs, same answer, nothing else touched.
const beatsToMs = (beats: number, bpm: number) => (beats * 60000) / bpm;

// Impure: depends on and changes something outside.
let total = 0;
const addToTotal = (n: number) => (total += n);
```

A test for the pure one with Node's built-in runner:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("2 beats at 120 BPM is one second", () => {
  assert.equal(beatsToMs(2, 120), 1000);
});
```

**In Lightsmith.** The engine (`src/core`) never touches the browser: no `window`, no `localStorage`, no React. That's why its 45 tests run in Node in under a second, why the export and the preview can share functions like `moverTiming`, and why Part 2 can move the engine onto a server unchanged.

One honest exception: `generateSong` changes the workspace you pass it instead of returning a new one. That's faster for big files, but it means the caller must parse a fresh copy each time, and the Export page does. The code audit in Chapter 24 lists it.

**Mistakes to watch for.** Reaching for `Date.now()` or `Math.random()` inside the engine makes functions impure and tests flaky. Pass the time in as an argument instead, as `bundleProject` does with `now`.

**Try it.** Find a function in `src/core` without a test, and write one.

---

<a id="dd-14"></a>

## 14. State outside React: module variables and singletons ●

**Where it shows up.** Chapters 12, 22 part 2 and 24. `access` and `listeners` in `src/ui/midi.ts`, `rememberedTab` in `SongsPage.tsx`, the fixture-library cache in `store.ts`.

**Why it's hard.** A variable declared at the top of a file (outside any component) exists once, for the whole app, for as long as the page is open. That's sometimes exactly right and sometimes a trap.

**The idea, from scratch.**

```ts
// counter.ts
let clicks = 0;                       // one per app, shared by every importer
export const click = () => ++clicks;
```

Every file that imports `click` shares the same `clicks`. React doesn't know about it, so changing it doesn't redraw anything.

**In Lightsmith.** The browser should only be asked for MIDI access once, and every trigger field should hear the same devices. So `midi.ts` keeps one `access` object and a `Set` of listeners at module level, and components subscribe and unsubscribe in effects (deep dive 4). Each `useMidi()` hook copies what it needs into React state, so the screen updates.

**Mistakes to watch for.** On a server (Part 2), module variables are shared between *different users'* requests. That's fine for a cache of public data, and a disaster for anything personal. Chapter 24 lists every module-level variable for that reason.

**Try it.** Add a second listener to `midi.ts` that counts every message heard, and show the count on the Show control page. Notice what you need to make it redraw.

---

<a id="dd-15"></a>

## 15. The CSS cascade: why a rule didn't apply ●●

**Where it shows up.** Chapters 8, 14 and 18. `src/ui/styles.css`.

**Why it's hard.** When two CSS rules set the same thing, the browser picks one by *specificity* first and *order* second. Ignoring that causes "my CSS does nothing" bugs, which feel random until you know the rules.

**The idea, from scratch.** Specificity is counted as (ids, classes and attributes, elements). More wins; if it's equal, the later rule wins.

```css
[data-card="movers"] { --accent: teal; }     /* (0,1,0): one attribute */
.group[data-card]    { --accent: orange; }   /* (0,2,0): a class + an attribute — this wins */
```

A *custom property* (`--accent`) follows the same rules, and children inherit it. So one variable, set per card, can color a card's icon, edge and tab button together.

`position: sticky` has a trap of its own: it sticks inside its nearest scrolling ancestor, so any ancestor with `overflow: hidden` or `overflow: auto` quietly breaks it. Lightsmith uses `overflow-x: clip` on the main area, which hides the overflow without making a scroll container.

**In Lightsmith.** This exact bug happened. Each settings card was meant to have its own color, but every card came out orange. A general rule, `.group[data-card] { --accent: var(--tungsten); }`, was *more specific* than the per-card rules, so it beat them. Deleting it fixed every card at once.

**Mistakes to watch for.** Reaching for `!important`. It wins today and starts a specificity war tomorrow. Make the selectors simpler instead. In the browser's dev tools, the Styles panel crosses out each rule that lost and shows which one won.

**Try it.** In dev tools, inspect a settings tab and find the rule that sets its `--accent`. Change the value there and watch the icon and the underline change together.

---

<a id="dd-16"></a>

## 16. Keyboard and screen readers: building accessible controls ●

**Where it shows up.** Chapters 6, 8 and 18. The settings tabs (`CardNav`), `Segmented`, `Dropdown`, `ChoiceCards` and focus outlines.

**Why it's hard.** A `<div>` with a click handler looks like a button but isn't one. Keyboard users can't reach it, and screen readers don't announce it. Real controls need the right element or the right ARIA roles, and the keyboard behaviour people expect.

**The idea, from scratch.** Start with the right element: `<button>` gets focus, Enter and Space, and the right announcement for free. For patterns HTML doesn't have, such as tabs, follow the ARIA pattern:

```tsx
<div role="tablist" aria-label="Settings">
  <button role="tab" aria-selected={true} tabIndex={0}>Colors</button>
  <button role="tab" aria-selected={false} tabIndex={-1}>Moving heads</button>
</div>
```

Only the selected tab is in the Tab-key order (`tabIndex={0}`); the arrow keys move between tabs. That's called a *roving tabindex*. It means one press of Tab gets you past the whole tab strip instead of nine.

**In Lightsmith.** The settings tabs do exactly this: the left and right arrows, Home and End all move between tabs, and focus follows. The "Editing …" line is an `aria-live` region, so a screen reader announces the new section when you switch. Animations respect `prefers-reduced-motion`.

**Try it.** Unplug the mouse (or don't touch it) and build a section using only the keyboard. Every place you get stuck is a bug to fix.

---

<a id="dd-17"></a>

## 17. The lighting domain: DMX, HTP and LTP ●●

**Where it shows up.** Chapters 1, 9 and 22. Beam resets and color scenes in `generate.ts`, and the profiles in `fixture.ts`.

**Why it's hard.** It isn't programming, but the code makes no sense without it, and getting it wrong produces lights that are stuck, dark or the wrong color.

**The idea.** A DMX *universe* is 512 *channels*, each a number from 0 to 255. A fixture uses a block of them: one for dimmer, three for red, green and blue, one for pan, and so on. Its `.qxf` definition says which is which. When several QLC+ functions want the same channel at once, QLC+ decides who wins:

- **HTP, highest takes precedence,** for intensity: two scenes both lighting a lamp means the brighter wins. Stop one scene and its light drops away.
- **LTP, latest takes precedence,** for everything else (color, pan, tilt, zoom, gobo): the last one set wins, *and keeps its value after the function stops*.

**In Lightsmith.** LTP is why the generator does something that looks redundant: if any section of a song sets zoom, strobe, gobo or prism, *every other* section sets them back to neutral. Otherwise the Chorus's strobe would carry on into the Verse. Moving-head position and speed are also LTP, which is why they sit in their own scene with no fade, so the heads don't crawl slowly into place.

**Try it.** In QLC+, make two scenes that set the same lamp's color to red and to blue. Start both, stop the blue one, and see which color stays. Then explain it with the rules above.

---

*These deep dives grow with the app. When a chapter's concept turns out to be harder than expected, it gets a deep dive here, and the chapter's "Needs special attention" line points to it.*
