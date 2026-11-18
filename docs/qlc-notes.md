# QLC+ notes

Things about QLC+ files and behavior the generator relies on. Add to this when you learn
something the hard way.

## Light needs a dimmer and a color

A fixture with a master dimmer shows nothing unless the dimmer is up *and* a color channel has a
value. Every look Lightsmith writes sets both.

## Don't write shutter values the definition doesn't explain

If a definition labels a shutter/strobe range "No function" without marking it `ShutterOpen`,
writing that value (even 0) can make QLC+'s 3D visualizer treat the shutter as closed, so the
fixture looks dark although the real fixture may be fine. Lightsmith never writes shutter channels
for normal looks, and `checks.ts` warns when a scene does.

## RGB matrices only drive color

An RGB Matrix in RGB mode sets the red/green/blue channels of the heads in its fixture group. It
does not touch the dimmer, so each section also runs a scene that holds the dimmer. Intensity
channels merge highest-takes-precedence, so a dim base color plus a matrix layers nicely.

## Extra heads can break moving heads

Adding heads to a moving head definition (for example, one per LED ring) can stop QLC+ linking the
pan/tilt and master dimmer channels to head 1, which also breaks EFX and the visualizer. Lightsmith
uses whatever heads the definition declares and only drives color on them.

## Chasers

- A step hold of `4294967294` means "hold forever" (shown as ∞ in QLC+). The song cue chaser uses
  it so each section waits for a trigger.
- With per-step speed modes, a step lasts `FadeIn + Hold`; `FadeOut` happens as the next step starts.

## IDs and folders

- Function IDs, fixture group IDs and Virtual Console widget IDs must be unique in their own lists.
- A function's `Path` attribute puts it in a folder; `/` makes nested folders.
