import { useEffect, useState } from "react";
import { newId, triggerLabel, type ControlDevice, type InputPatch, type ShowControl, type Trigger, type TriggerKind } from "../core";
import { Dropdown, NumberInput, Segmented } from "./controls";
import { Icon } from "./icons";
import { listenOnce, useMidi, type Heard } from "./midi";

/**
 * The device a heard message came from: one already set up (same port and
 * channel, or same channel when the port isn't known yet), or a new one,
 * patched to the QLC+ input with the same name when the show file has one.
 */
export function deviceForHeard(h: Heard, control: ShowControl, inputs: InputPatch[]): { control: ShowControl; device: ControlDevice } {
  const byPort = control.devices.find((d) => d.port === h.port && d.channel === h.channel);
  if (byPort) return { control, device: byPort };
  const byChannel = control.devices.filter((d) => !d.port && d.channel === h.channel);
  if (byChannel.length === 1) {
    const device = { ...byChannel[0]!, port: h.port };
    return { control: { ...control, devices: control.devices.map((d) => (d.id === device.id ? device : d)) }, device };
  }
  const midiInputs = inputs.filter((i) => i.plugin === "MIDI");
  const samePort = midiInputs.find((i) => i.device.toLowerCase() === h.port.toLowerCase());
  const samePortDevice = control.devices.find((d) => d.port === h.port);
  const universe = samePort?.universe ?? samePortDevice?.universe ?? midiInputs[0]?.universe ?? 3;
  const device: ControlDevice = { id: newId("dev"), name: `${h.port}${control.devices.some((d) => d.port === h.port) ? ` (channel ${h.channel})` : ""}`, port: h.port, channel: h.channel, universe };
  return { control: { ...control, devices: [...control.devices, device] }, device };
}

export function triggerText(t: Trigger | undefined, control: ShowControl | undefined): string {
  if (!t) return "None";
  const dev = control?.devices.find((d) => d.id === t.device);
  return `${dev?.name ?? "Missing device"} · ${triggerLabel(t)}`;
}

/**
 * A trigger you set by playing it (Learn), or by hand: which device, note /
 * CC / program, and its number.
 */
export function TriggerField({
  value,
  control,
  inputs,
  onChange,
  label,
  inherited,
}: {
  value: Trigger | undefined;
  control: ShowControl;
  inputs: InputPatch[];
  /** A learned trigger can come with a new device: then `control` is the updated set of devices. */
  onChange: (t: Trigger | undefined, control?: ShowControl) => void;
  label: string;
  /** Shown when there's no value: what applies instead. */
  inherited?: string;
}) {
  const midi = useMidi();
  const [listening, setListening] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!listening || midi.status !== "on") return;
    const stop = listenOnce((h) => {
      setListening(false);
      const r = deviceForHeard(h, control, inputs);
      onChange({ device: r.device.id, kind: h.kind, number: h.number }, r.control !== control ? r.control : undefined);
    });
    const timer = window.setTimeout(() => setListening(false), 15000);
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [listening, midi.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const learn = async () => {
    if (midi.status !== "on") await midi.start();
    setListening(true);
  };
  const dev = value ? control.devices.find((d) => d.id === value.device) : undefined;

  return (
    <div className={listening ? "trigger-field listening" : "trigger-field"}>
      <span className={value ? "trigger-value" : "trigger-value none"} title={label}>
        {listening ? (
          <>
            <span className="trigger-pulse" aria-hidden="true" /> Play it now…
          </>
        ) : value ? (
          <>
            <strong>{dev?.name ?? "Missing device"}</strong> {triggerLabel(value)}
          </>
        ) : (
          (inherited ?? "None")
        )}
      </span>
      <span className="trigger-actions">
        {midi.status !== "unsupported" &&
          (listening ? (
            <button type="button" className="ghost small" onClick={() => setListening(false)}>
              Cancel
            </button>
          ) : (
            <button type="button" className="ghost small" onClick={() => void learn()} title={`Play the pad, switch or preset for ${label}`}>
              <Icon name="ear" size={15} /> Learn
            </button>
          ))}
        <button type="button" className="ghost small" onClick={() => setManual(!manual)} aria-expanded={manual} title="Type it in">
          <Icon name="edit" size={15} />
        </button>
        {value && (
          <button type="button" className="ghost small" onClick={() => onChange(undefined)} title="Remove this trigger" aria-label={`Remove the trigger for ${label}`}>
            <Icon name="x" size={15} />
          </button>
        )}
      </span>
      {midi.status === "denied" && listening === false && <small className="trigger-note">The browser didn't allow MIDI. Allow it in the address bar's site settings, or type the trigger in.</small>}
      {manual && (
        <div className="trigger-manual">
          {control.devices.length === 0 ? (
            <small className="trigger-note">Add a device first (under Devices), or use Learn.</small>
          ) : (
            <>
              <Dropdown label="Device" value={value?.device ?? control.devices[0]!.id} options={control.devices.map((d) => ({ value: d.id, label: d.name }))} onChange={(device) => onChange({ kind: value?.kind ?? "note", number: value?.number ?? 36, device })} />
              <Segmented
                label="Message"
                value={value?.kind ?? "note"}
                options={[
                  { value: "note", label: "Note" },
                  { value: "cc", label: "CC" },
                  { value: "pc", label: "Program" },
                ]}
                onChange={(kind: TriggerKind) => onChange({ device: value?.device ?? control.devices[0]!.id, number: value?.number ?? 36, kind })}
              />
              <NumberInput label="Number" value={value?.number ?? 36} min={0} max={127} onChange={(n) => onChange({ device: value?.device ?? control.devices[0]!.id, kind: value?.kind ?? "note", number: Math.round(n) })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
