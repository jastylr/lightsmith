// Builds the demo project (public/demo.lightsmith): a typical small band rig
// made of fixtures from QLC+'s own library, and three songs made by the Song
// Builder. Run it again after changing the builder or the library:
//
//   npx tsx scripts/make-demo.ts
//
// The rig itself (roles, positions) is left for Lightsmith to work out when the
// demo loads, exactly as it would for anyone's show file.

import { writeFileSync } from "node:fs";
import { bundleProject, buildSong, newSong, planFromTemplate, type Project, type Song } from "../src/core";

interface DemoFixture {
  manufacturer: string;
  model: string;
  mode: string;
  channels: number;
  name: string;
  universe: number;
  /** Place in QLC+'s 3D view, in millimetres, and its rotation. */
  at: { x: number; y: number; z: number; rot: string };
}

const BAR = { manufacturer: "Chauvet", model: "COLORband PiX-M", mode: "38 Channel", channels: 38 };
const PAR = { manufacturer: "Chauvet", model: "SlimPAR Pro Q USB", mode: "10 Channel", channels: 10 };
const HEAD = { manufacturer: "Chauvet", model: "Intimidator Wash Zoom 350 IRC", mode: "14-Ch", channels: 14 };
const UPRIGHT = 'XRot="270" ZRot="270"';

const FIXTURES: DemoFixture[] = [
  { ...BAR, name: "Bar 1 (stage right)", universe: 0, at: { x: 700, y: 500, z: 600, rot: UPRIGHT } },
  { ...BAR, name: "Bar 2", universe: 0, at: { x: 2900, y: 500, z: 1100, rot: UPRIGHT } },
  { ...BAR, name: "Bar 3", universe: 0, at: { x: 5100, y: 500, z: 1100, rot: UPRIGHT } },
  { ...BAR, name: "Bar 4 (stage left)", universe: 0, at: { x: 7300, y: 500, z: 600, rot: UPRIGHT } },
  { ...PAR, name: "Floor wash SR", universe: 0, at: { x: 1500, y: 10, z: 4300, rot: 'YRot="20"' } },
  { ...PAR, name: "Floor wash SL", universe: 0, at: { x: 6500, y: 10, z: 4300, rot: 'YRot="-20"' } },
  { ...PAR, name: "Front SR (on a stand)", universe: 0, at: { x: 1800, y: 1800, z: 7000, rot: 'XRot="20"' } },
  { ...PAR, name: "Front SL (on a stand)", universe: 0, at: { x: 6200, y: 1800, z: 7000, rot: 'XRot="20"' } },
  { ...HEAD, name: "Head SR", universe: 0, at: { x: 300, y: 3, z: 3200, rot: "" } },
  { ...HEAD, name: "Head SL", universe: 0, at: { x: 7700, y: 3, z: 3200, rot: "" } },
];

function showFile(): string {
  let address = 0;
  const fixtures = FIXTURES.map((f, id) => {
    const xml = `  <Fixture>
   <Manufacturer>${f.manufacturer}</Manufacturer>
   <Model>${f.model}</Model>
   <Mode>${f.mode}</Mode>
   <ID>${id}</ID>
   <Name>${f.name}</Name>
   <Universe>${f.universe}</Universe>
   <Address>${address}</Address>
   <Channels>${f.channels}</Channels>
  </Fixture>`;
    address += f.channels;
    return xml;
  });
  const items = FIXTURES.map((f, id) => `   <FxItem ID="${id}" XPos="${f.at.x}" YPos="${f.at.y}" ZPos="${f.at.z}" ${f.at.rot}/>`.replace(" /", "/"));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Workspace>
<Workspace xmlns="http://www.qlcplus.org/Workspace" CurrentWindow="VirtualConsole">
 <Creator>
  <Name>Q Light Controller Plus</Name>
  <Version>4.14.1</Version>
  <Author>Lightsmith demo</Author>
 </Creator>
 <Engine>
  <InputOutputMap>
   <BeatGenerator BeatType="Disabled" BPM="0"/>
   <Universe Name="Universe 1" ID="0"/>
   <Universe Name="Universe 2" ID="1"/>
  </InputOutputMap>
${fixtures.join("\n")}
  <Monitor DisplayMode="1" ShowLabels="1">
   <Font>Arial,12,-1,5,50,0,0,0,0,0</Font>
   <ChannelStyle>0</ChannelStyle>
   <ValueStyle>0</ValueStyle>
   <Grid Width="8" Height="4" Depth="6" Units="0"/>
${items.join("\n")}
  </Monitor>
 </Engine>
 <VirtualConsole>
  <Frame Caption="">
   <Appearance>
    <FrameStyle>None</FrameStyle>
    <ForegroundColor>Default</ForegroundColor>
    <BackgroundColor>Default</BackgroundColor>
    <BackgroundImage>None</BackgroundImage>
    <Font>Default</Font>
   </Appearance>
  </Frame>
  <Properties>
   <Size Width="1920" Height="1080"/>
   <GrandMaster ChannelMode="Intensity" ValueMode="Reduce" SliderMode="Normal"/>
  </Properties>
 </VirtualConsole>
 <SimpleDesk>
  <Engine/>
 </SimpleDesk>
</Workspace>
`;
}

function demoSong(title: string, bpm: number, template: string, plan: { vibe: string; genre?: string; arc: string; moments: string[] }): Song {
  const sections = buildSong({ bpm, beatsPerBar: 4, sections: planFromTemplate(template), ...plan }, { hasMovers: true });
  return { ...newSong(title, bpm), sections: sections.map((s) => ({ ...s, bpm })) };
}

const songs: Song[] = [
  demoSong("Neon Highway", 128, "bridge", { vibe: "rock", genre: "rock", arc: "punch", moments: ["ending", "cutChorus", "sweep", "blinder"] }),
  demoSong("Slow Burn", 76, "solo", { vibe: "warm", genre: "blues", arc: "build", moments: ["ending", "fadeIntro", "darkIntro"] }),
  demoSong("Afterglow", 124, "prechorus", { vibe: "pop", genre: "electronic", arc: "finish", moments: ["ending", "cutChorus", "sweep", "strobePeak"] }),
];
// Stable ids, so the file only changes when the songs do.
songs.forEach((s, i) => {
  s.id = `demo-song-${i + 1}`;
  s.sections.forEach((x, j) => (x.id = `demo-${i + 1}-${j + 1}`));
});

const project: Project = {
  version: 1,
  rig: { fixtures: [] },
  songs,
  // Two sets, to show off: the whole show, and a shorter slot that leaves one song out.
  setlists: [
    { id: "demo-set-full", name: "Full set", order: songs.map((s) => s.id), skip: [] },
    { id: "demo-set-short", name: "Short slot", order: songs.map((s) => s.id), skip: ["demo-song-2"], minutes: 10 },
  ],
  currentSet: "demo-set-full",
  demo: true,
};

const text = bundleProject(project, { name: "Lightsmith demo.qxw", xml: showFile() }, [], new Date("2026-11-28T00:00:00Z"));
writeFileSync(new URL("../public/demo.lightsmith", import.meta.url), text);
console.log(`Wrote public/demo.lightsmith: ${songs.length} songs, ${FIXTURES.length} lights.`);
