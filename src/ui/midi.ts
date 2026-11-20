/**
 * Web MIDI: hearing pads, footswitches and amp modelers in the browser, so a
 * trigger can be set by playing it ("MIDI learn"). Chrome and Edge have it;
 * Safari and Firefox (without an add-on) don't, and then triggers are typed in.
 */
import { useEffect, useRef, useState } from "react";
import type { TriggerKind } from "../core";

export interface Heard {
  port: string;
  /** 1-16 */
  channel: number;
  kind: TriggerKind;
  number: number;
}

type Status = "unsupported" | "off" | "asking" | "on" | "denied";

interface MidiAccessLike {
  inputs: Map<string, { name?: string | null; onmidimessage: ((e: { data: Uint8Array | null }) => void) | null }>;
  onstatechange: (() => void) | null;
}

let access: MidiAccessLike | null = null;
const listeners = new Set<(h: Heard) => void>();
const portListeners = new Set<(ports: string[]) => void>();

/** A message that can start something: note on, control change (pressed) or program change. */
export function readMessage(data: Uint8Array | number[], port: string): Heard | null {
  const [status = 0, d1 = 0, d2 = 0] = Array.from(data);
  if (status >= 0xf0) return null; // clock, active sensing and other system messages
  const channel = (status & 0x0f) + 1;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && d2 > 0) return { port, channel, kind: "note", number: d1 };
  if (cmd === 0xb0 && d2 > 0) return { port, channel, kind: "cc", number: d1 };
  if (cmd === 0xc0) return { port, channel, kind: "pc", number: d1 };
  return null;
}

function hookInputs() {
  if (!access) return;
  for (const input of access.inputs.values()) {
    const port = input.name ?? "MIDI device";
    input.onmidimessage = (e) => {
      const h = e.data ? readMessage(e.data, port) : null;
      if (h) for (const l of listeners) l(h);
    };
  }
  const ports = [...access.inputs.values()].map((i) => i.name ?? "MIDI device");
  for (const l of portListeners) l(ports);
}

/** MIDI in this browser: whether it's on, the devices plugged in, and a way to switch it on. */
export function useMidi() {
  const supported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
  const [status, setStatus] = useState<Status>(!supported ? "unsupported" : access ? "on" : "off");
  const [ports, setPorts] = useState<string[]>(() => (access ? [...access.inputs.values()].map((i) => i.name ?? "MIDI device") : []));
  useEffect(() => {
    portListeners.add(setPorts);
    return () => void portListeners.delete(setPorts);
  }, []);
  const start = async () => {
    if (!supported) return;
    if (access) return setStatus("on");
    setStatus("asking");
    try {
      access = (await (navigator as unknown as { requestMIDIAccess: (o?: object) => Promise<MidiAccessLike> }).requestMIDIAccess({ sysex: false })) as MidiAccessLike;
      access.onstatechange = hookInputs;
      hookInputs();
      setStatus("on");
    } catch {
      setStatus("denied");
    }
  };
  return { status, ports, start };
}

/** Listen for the next playable message, once. Returns a function that stops listening. */
export function listenOnce(onHeard: (h: Heard) => void): () => void {
  const l = (h: Heard) => {
    listeners.delete(l);
    onHeard(h);
  };
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** Every message as it arrives (for the "last heard" readout). */
export function useLastHeard(): Heard | null {
  const [last, setLast] = useState<Heard | null>(null);
  const ref = useRef(setLast);
  ref.current = setLast;
  useEffect(() => {
    const l = (h: Heard) => ref.current(h);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return last;
}
