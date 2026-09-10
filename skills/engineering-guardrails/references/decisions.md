# Decisions that cost something

All of these came from something that actually broke. No abstract advice.

---

## Silent failure — the most expensive class

Looking back, **doing nothing without an error** stayed hidden longest. The user assumes they did
it wrong. Nothing appears in a log. It does not reproduce.

The actual list:

| What | Why it was silent |
|---|---|
| A paste evaporated | `patchLayer(layers, id, …)` mapped over the list; no match meant the original came back |
| A paste landed invisibly | The target layer, or a folder above it, was hidden. It did arrive |
| An empty video file | A range shorter than one frame rounded to `Math.round(0.01*30) = 0`, and a writer with zero frames still emits bytes |
| A file no decoder opens | A canvas size of 0 means `GifWriter({width: 0})` happily accepts frames |
| A project with no music | A server error page in the `.emv` audio field went straight into `<audio>.src` |
| Playback froze | A stored rate of `0` stops the clock. `parseFloat('0')` passes every check |
| Undo painted the wrong cut | After an `await`, a closure still held the old state |

**Rule:** if any function can end in "did nothing", that path must **say so** (a toast, an error),
**be blocked** (a disabled control), or **throw**. `if (!x) return;` is for when that is the
normal path, not for when it is the failure.

Where they hide:

```bash
grep -rn 'catch\s*{\s*}' src/          # swallowed exceptions
grep -rn '\.map(.*=>.*id ===' src/     # patch-by-map that returns the original on no match
grep -rn '|| \[\]\|?? 0' src/          # defaults that make an absent thing look present
```

## Derive vs store

**Two copies of one fact will drift.** No exceptions.

`currentCut` was looked up by hand thirteen times under five names — `cut`, `cc`, `src`, `A`,
`primary`. Five names for one thing when reading, and thirteen chances to search the wrong list
when writing.

```js
// Do not store it. Store the id and derive the rest.
const currentCut = cuts.find(c => c.id === currentCutId);
```

**How a mirror smells:** a piece of state holding another's `length`, or the result of a `some()`
or `find()`. It is fine while both are updated together, and over the moment one path updates only
one of them.

**Exception:** when deriving is expensive on the render path, cache it — but use the cache in
**one** place, and write the invalidation condition beside it.

## Never mix relative and absolute units

The costliest conceptual mistake here.

Some animation values were measured against **progress through a cut (0–1)** and others in
**seconds or Hz**. Mixed together, "make the whole thing four times slower" moved only half of
them — the drawing slowed while the hair kept swinging at its original frequency.

**Rule:** put the unit in the name or in a comment, and when a file holds both kinds, write the
table:

```
cut.anim.inDur      seconds          × k
text.anim.typeSpeed chars/second     ÷ k
layer.anim.speed    cycles per cut   untouched   ← scale this too and it slows twice
```

## When a reducer

When several pieces of state **always move together**, make them one reducer, because forgetting
one leaves a state with no name — a clip range pointing at audio that is gone. Audio and video
were five such pieces.

Once grouped, **keep the read sites unchanged** and route only writes through actions:

```js
const [media, dispatchMedia] = useReducer(mediaReducer, EMPTY_MEDIA);
const { audioFile, audioUrl, audioDuration, audioData } = media;   // every reader keeps its name
```

## When a hook

**Only when the seam cost is low.** Use the table in SKILL.md.

Groups that score low are one of two shapes:

- **settings** — read everywhere, written almost nowhere (tool, colour, width: reads 4)
- **things that know nothing of the outside** — the audio track knows nothing of cuts, layers, the
  canvas or the timeline (reads 4)

What scores high is **something that genuinely touches everything**. Drawing does (53). Do not
extract that — extract **what it reads**. The drawing code is then untouched and the file loses
twenty-eight names.

**Pass injected dependencies grouped.** Not twenty names threaded one at a time, but one object
that says what the bundle is:

```js
useThing({
    media: { audioRef, videoElRef, audioUrl },     // grouped by what they are
    paint: { canvasRef, paintFrame },
});
```

## A component, not a render prop

If a render function is being passed as a prop, what that buys is **that nobody has to write down
that piece's inputs**. Counted, there were twenty. Written down, they become something you can
manage.

## No confirmation dialog in front of something undoable

If it **can** be undone, a dialog buys nothing and gets clicked through. Record the history entry
first, then say what happened and that **Ctrl+Z** exists.

If it **cannot** be undone, the answer is not a dialog either — **show the result before it
happens**: the factor, the running time before and after, and what will not follow along.
