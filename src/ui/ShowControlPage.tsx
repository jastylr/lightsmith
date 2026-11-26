import { emptyShowControl, setOrder, stepCuesFor, triggerFor, newId, type ControlDevice, type ShowControl, type Trigger } from "../core";
import { ChoiceCards, Dropdown, Field, NumberInput, Segmented } from "./controls";
import { Icon } from "./icons";
import { useLastHeard, useMidi } from "./midi";
import type { Store } from "./store";
import { TriggerField, triggerText } from "./TriggerField";

/**
 * Show control: the MIDI devices on stage, and what each message starts.
 * Section triggers go by place in the song (pad 1 starts section 1 of
 * whichever song is showing), so one setup covers the whole set; a section
 * can have its own on the Songs page. Lightsmith writes them all into the
 * buttons it makes in QLC+.
 */
export function ShowControlPage({ store, onNext }: { store: Store; onNext: () => void }) {
  const control = store.project.control ?? emptyShowControl();
  const inputs = store.showFile?.inputs ?? [];
  const midi = useMidi();
  const heard = useLastHeard();
  const set = (patch: Partial<ShowControl>) => store.setControl({ ...control, ...patch });
  // A learned trigger may bring a new device with it (`withDevices`).
  const setTrigger = (key: "nextSong" | "previousSong" | "safeLook" | "blackout" | "nextSection" | "previousSection") => (t: Trigger | undefined, withDevices?: ShowControl) => {
    const base = { ...(withDevices ?? control) };
    if (t) base[key] = t;
    else delete base[key];
    store.setControl(base);
  };
  // Step cueing: the list of messages that move a song on. Learning into the
  // empty field at the end adds one; clearing one removes it.
  const setCue = (i: number) => (t: Trigger | undefined, withDevices?: ShowControl) => {
    const base = withDevices ?? control;
    const cues = [...(base.cues ?? [])];
    if (t) cues[i] = t;
    else cues.splice(i, 1);
    store.setControl({ ...base, cues });
  };
  const step = control.cueing === "step";
  const setSlot = (i: number) => (t: Trigger | undefined, withDevices?: ShowControl) => {
    const base = withDevices ?? control;
    const slots = [...base.slots];
    while (slots.length <= i) slots.push(null);
    slots[i] = t ?? null;
    while (slots.length && slots[slots.length - 1] === null) slots.pop();
    store.setControl({ ...base, slots });
  };

  const order = setOrder(store.project).filter((o) => o.included);
  const songs = order.map((o) => o.song);
  const slotCount = Math.max(8, ...songs.map((s) => s.sections.length), control.slots.length);
  const universeOptions = [
    ...inputs.map((i) => ({ value: String(i.universe), label: `Universe ${i.universe}`, description: `${i.device} (${i.plugin})` })),
    ...[1, 2, 3, 4, 5, 6, 7, 8].filter((u) => !inputs.some((i) => i.universe === u)).map((u) => ({ value: String(u), label: `Universe ${u}`, description: "Nothing patched here in the show file" })),
  ];
  const updateDevice = (d: ControlDevice) => set({ devices: control.devices.map((x) => (x.id === d.id ? d : x)) });
  const removeDevice = (d: ControlDevice) => {
    const keep = (t?: Trigger | null) => (t && t.device === d.id ? undefined : t);
    store.setControl({
      ...control,
      devices: control.devices.filter((x) => x.id !== d.id),
      slots: control.slots.map((t) => keep(t) ?? null),
      nextSong: keep(control.nextSong) ?? undefined,
      previousSong: keep(control.previousSong) ?? undefined,
      nextSection: keep(control.nextSection) ?? undefined,
      previousSection: keep(control.previousSection) ?? undefined,
      cues: (control.cues ?? []).filter((t) => t.device !== d.id),
      safeLook: keep(control.safeLook) ?? undefined,
      blackout: keep(control.blackout) ?? undefined,
    });
  };

  return (
    <section className="page show-control">
      <header className="page-head no-print">
        <h1>Show control</h1>
        <p className="lead">Run the lights from the stage: a drum pad, a footswitch or an amp preset moves the lights on, with nobody at the laptop. Lightsmith writes these into the show file it makes for QLC+, so export again after changing them.</p>
      </header>

      {midi.status === "unsupported" ? (
        <div className="notice no-print">
          <Icon name="info" />
          <span>This browser can't hear MIDI, so triggers are typed in. To set them by playing your pads and switches, open Lightsmith in Chrome or Edge.</span>
        </div>
      ) : midi.status !== "on" ? (
        <div className="notice no-print midi-start">
          <Icon name="midi" />
          <span>Plug in your devices, then let Lightsmith listen. Your browser will ask first. Nothing is sent to your devices.</span>
          <button type="button" className="primary" onClick={() => void midi.start()} disabled={midi.status === "asking"}>
            Listen for MIDI
          </button>
        </div>
      ) : (
        <div className="notice good no-print">
          <Icon name="midi" />
          <span>
            Listening to {midi.ports.length ? midi.ports.join(", ") : "no devices yet: plug one in"}.{" "}
            {heard ? (
              <>
                Last heard: <strong>{heard.port}</strong>, channel {heard.channel}, {heard.kind === "note" ? `note ${heard.number}` : heard.kind === "cc" ? `CC ${heard.number}` : `program change ${heard.number}`}.
              </>
            ) : (
              "Play something to check it's coming through."
            )}
          </span>
        </div>
      )}

      <section className="control-card no-print">
        <h2>Devices</h2>
        <p className="hint">Each thing that sends MIDI, which QLC+ universe its input is patched to (QLC+'s Inputs/Outputs tab), and the MIDI channel it sends on. Learn adds a device by itself when it hears one for the first time.</p>
        {control.devices.length === 0 ? (
          <p className="empty-line">No devices yet. Use Learn on any trigger below, or add one by hand.</p>
        ) : (
          <ul className="device-list">
            {control.devices.map((d) => (
              <li key={d.id} className="device-row">
                <Field label="Name">
                  <input className="text-input" value={d.name} onChange={(e) => updateDevice({ ...d, name: e.target.value })} aria-label="Device name" />
                </Field>
                <Field label="QLC+ input" hint={d.port ? `Heard as “${d.port}”` : undefined}>
                  <Dropdown label="QLC+ input universe" value={String(d.universe)} options={universeOptions} onChange={(u) => updateDevice({ ...d, universe: Number(u) })} />
                </Field>
                <Field label="MIDI channel">
                  <NumberInput label="MIDI channel" value={d.channel} min={1} max={16} onChange={(c) => updateDevice({ ...d, channel: Math.round(c) })} />
                </Field>
                <button type="button" className="ghost small danger" onClick={() => removeDevice(d)} aria-label={`Remove ${d.name}`} title="Remove this device and its triggers">
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="ghost small" onClick={() => set({ devices: [...control.devices, { id: newId("dev"), name: `Device ${control.devices.length + 1}`, universe: inputs.find((i) => i.plugin === "MIDI")?.universe ?? 3, channel: 1 }] })}>
            <Icon name="plus" size={15} /> Add a device by hand
          </button>
        </div>
        <Field label="QLC+ listens to" hint={control.listen === "own" ? "Each input only hears its device's channel. Use this if you've mapped QLC+ buttons yourself that would stop working otherwise." : "Every MIDI channel, so devices sharing one input (through a MIDI hub) still tell apart. Lightsmith sets this on each input it uses."}>
          <Segmented
            label="QLC+ listens to"
            value={control.listen ?? "any"}
            options={[
              { value: "any", label: "Any channel" },
              { value: "own", label: "Each device's channel" },
            ]}
            onChange={(listen: "any" | "own") => set({ listen })}
          />
        </Field>
      </section>

      <section className="control-card no-print">
        <h2>How sections are cued</h2>
        <ChoiceCards
          label="How sections are cued"
          value={control.cueing ?? "jump"}
          onChange={(cueing: "jump" | "step") => set({ cueing })}
          options={[
            { value: "step", title: "Step through each song", text: "Each cue moves the song on to its next section, in order. Best when the cues come from what the band already does, like a guitarist's scene switches, which repeat through a song." },
            { value: "jump", title: "A trigger per section", text: "Each section has its own trigger that starts it straight away. Best with a pad or button per section, or someone at the laptop." },
          ]}
        />
      </section>

      {step ? (
        <section className="control-card no-print">
          <h2>Cues</h2>
          <p className="hint">Any of these messages moves whichever song is showing on to its next section. Add every switch that marks a section change, such as each scene switch on a guitar modeler; leave out switches that don't. A section can also have a cue of its own, like the sample pad that starts it, in its Start and end card on the Songs page. Linked sections move on by themselves.</p>
          <ol className="slot-list">
            {(control.cues ?? []).map((t, i) => (
              <li key={`${t.device}/${t.kind}/${t.number}/${i}`} className="slot-row">
                <span className="slot-num">{i + 1}</span>
                <span className="slot-names">Moves the song on</span>
                <TriggerField label={`cue ${i + 1}`} value={t} control={control} inputs={inputs} onChange={setCue(i)} />
              </li>
            ))}
            <li className="slot-row">
              <span className="slot-num">
                <Icon name="plus" size={14} />
              </span>
              <span className="slot-names">
                <em>Add a cue: Learn, then press the switch</em>
              </span>
              <TriggerField key={`add-${(control.cues ?? []).length}`} label="a new cue" value={undefined} inherited="Not set" control={control} inputs={inputs} onChange={setCue((control.cues ?? []).length)} />
            </li>
          </ol>
          <p className="hint">QLC+ 5 answers every message in this list. QLC+ 4 answers only one message per control, so with QLC+ 4 have each device also send one shared message (many modelers can send two messages per switch, and MIDI interfaces such as CME's can add one) and make that your only cue.</p>
          <h3 className="subhead">When a cue is missed or doubled</h3>
          <div className="control-pairs">
            <Field label="Next section">
              <TriggerField label="Next section" value={control.nextSection} control={control} inputs={inputs} onChange={setTrigger("nextSection")} />
            </Field>
            <Field label="Previous section">
              <TriggerField label="Previous section" value={control.previousSection} control={control} inputs={inputs} onChange={setTrigger("previousSection")} />
            </Field>
          </div>
        </section>
      ) : (
        <section className="control-card no-print">
          <h2>Sections</h2>
          <p className="hint">One trigger per place in the song: the first starts section 1 of whichever song is showing, the second section 2, and so on. Set it up once for the whole set. A section can have its own trigger instead, in its Start and end card on the Songs page.</p>
          <ol className="slot-list">
            {Array.from({ length: slotCount }, (_, i) => {
              const names = songs.flatMap((s) => (s.sections[i] ? [s.sections[i]!.name] : []));
              const unique = [...new Set(names)];
              return (
                <li key={i} className="slot-row">
                  <span className="slot-num">{i + 1}</span>
                  <span className="slot-names" title={names.join(", ")}>
                    {unique.length ? unique.slice(0, 4).join(", ") + (unique.length > 4 ? " …" : "") : <em>No song has this many sections yet</em>}
                  </span>
                  <TriggerField label={`section ${i + 1}`} value={control.slots[i] ?? undefined} control={control} inputs={inputs} onChange={setSlot(i)} />
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="control-card no-print">
        <h2>Between songs</h2>
        <p className="hint">Next and previous move through the set in order. A song can also have its own trigger that jumps straight to it, like a preset on the Quad Cortex for each song.</p>
        <div className="control-pairs">
          <Field label="Next song">
            <TriggerField label="Next song" value={control.nextSong} control={control} inputs={inputs} onChange={setTrigger("nextSong")} />
          </Field>
          <Field label="Previous song">
            <TriggerField label="Previous song" value={control.previousSong} control={control} inputs={inputs} onChange={setTrigger("previousSong")} />
          </Field>
        </div>
        <ol className="slot-list">
          {order.map(({ song }, i) => (
            <li key={song.id} className="slot-row">
              <span className="slot-num">{i + 1}</span>
              <span className="slot-names">
                <strong>{song.title || "Untitled song"}</strong>
              </span>
              <TriggerField
                label={`jump to ${song.title}`}
                value={song.trigger}
                control={control}
                inputs={inputs}
                onChange={(t, withDevices) => {
                  if (withDevices) store.setControl(withDevices);
                  store.updateSong({ ...song, trigger: t });
                }}
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="control-card no-print">
        <h2>When something goes wrong</h2>
        <p className="hint">On every song's page. Safe look stops whatever is running and brings up a plain warm wash with the moving heads at home. Blackout switches QLC+'s blackout on, and off again.</p>
        <div className="control-pairs">
          <Field label="Safe look">
            <TriggerField label="Safe look" value={control.safeLook} control={control} inputs={inputs} onChange={setTrigger("safeLook")} />
          </Field>
          <Field label="Blackout">
            <TriggerField label="Blackout" value={control.blackout} control={control} inputs={inputs} onChange={setTrigger("blackout")} />
          </Field>
        </div>
      </section>

      <section className="control-card cheat-sheet">
        <div className="cheat-head">
          <h2>Cheat sheet</h2>
          <button type="button" className="ghost no-print" onClick={() => window.print()}>
            <Icon name="printer" size={16} /> Print
          </button>
        </div>
        <p className="hint no-print">What each pad, switch and preset does, song by song. Print it and tape it to the floor or the laptop.</p>
        <table className="cheat-table cheat-global">
          <tbody>
            {(
              [
                ["Next song", control.nextSong],
                ["Previous song", control.previousSong],
                ["Safe look", control.safeLook],
                ["Blackout", control.blackout],
                ...(step
                  ? ([
                      ["Next section", control.nextSection],
                      ["Previous section", control.previousSection],
                      ...(control.cues ?? []).map((t, i) => [`Cue ${i + 1}: next section`, t] as const),
                    ] as const)
                  : []),
              ] as const
            ).map(([what, t]) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td>{triggerText(t, control)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.map(({ song }, n) => (
          <div key={song.id} className="cheat-song">
            <h3>
              {n + 1}. {song.title || "Untitled song"}
              {song.trigger && <small> · jump here with {triggerText(song.trigger, control)}</small>}
            </h3>
            <table className="cheat-table">
              <tbody>
                {song.sections.map((s, i) => {
                  if (step) {
                    const prev = song.sections[i - 1];
                    return (
                      <tr key={s.id}>
                        <th scope="row">
                          {i + 1}. {s.name}
                        </th>
                        <td>
                          {prev?.autoAdvance ? `Straight after ${prev.name}` : s.trigger ? triggerText(s.trigger, control) : stepCuesFor(control, song).length ? "Next cue" : <span className="missing">No cues set up</span>}
                        </td>
                      </tr>
                    );
                  }
                  const t = triggerFor(control, s, i);
                  return (
                    <tr key={s.id}>
                      <th scope="row">
                        {i + 1}. {s.name}
                      </th>
                      <td className={t ? "" : "missing"}>
                        {t ? triggerText(t, control) : "No trigger"}
                        {s.trigger && <small> (its own)</small>}
                        {s.autoAdvance && i < song.sections.length - 1 && <small> · goes straight into {song.sections[i + 1]!.name}</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <div className="page-actions no-print">
        <button className="primary" onClick={onNext}>
          Continue to export
        </button>
      </div>
    </section>
  );
}
