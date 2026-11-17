// Small, made-up fixture definitions and a workspace used by the tests.

export const PAR_QXF = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE FixtureDefinition>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Manufacturer>Test</Manufacturer>
 <Model>RGBW Par</Model>
 <Type>Color Changer</Type>
 <Channel Name="Dimmer" Preset="IntensityMasterDimmer"/>
 <Channel Name="Strobe">
  <Group Byte="0">Shutter</Group>
  <Capability Min="0" Max="9">No function</Capability>
  <Capability Min="10" Max="255">Strobe slow to fast</Capability>
 </Channel>
 <Channel Name="Red" Preset="IntensityRed"/>
 <Channel Name="Green" Preset="IntensityGreen"/>
 <Channel Name="Blue" Preset="IntensityBlue"/>
 <Channel Name="White" Preset="IntensityWhite"/>
 <Mode Name="6ch">
  <Channel Number="0">Dimmer</Channel>
  <Channel Number="1">Strobe</Channel>
  <Channel Number="2">Red</Channel>
  <Channel Number="3">Green</Channel>
  <Channel Number="4">Blue</Channel>
  <Channel Number="5">White</Channel>
 </Mode>
</FixtureDefinition>`;

export const BAR_QXF = `<?xml version="1.0" encoding="UTF-8"?>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Manufacturer>Test</Manufacturer>
 <Model>Pixel Bar 4</Model>
 <Type>LED Bar (Pixels)</Type>
 <Channel Name="Dimmer" Preset="IntensityDimmer"/>
 <Channel Name="R1" Preset="IntensityRed"/><Channel Name="G1" Preset="IntensityGreen"/><Channel Name="B1" Preset="IntensityBlue"/>
 <Channel Name="R2" Preset="IntensityRed"/><Channel Name="G2" Preset="IntensityGreen"/><Channel Name="B2" Preset="IntensityBlue"/>
 <Channel Name="R3" Preset="IntensityRed"/><Channel Name="G3" Preset="IntensityGreen"/><Channel Name="B3" Preset="IntensityBlue"/>
 <Channel Name="R4" Preset="IntensityRed"/><Channel Name="G4" Preset="IntensityGreen"/><Channel Name="B4" Preset="IntensityBlue"/>
 <Mode Name="13ch">
  <Channel Number="0">Dimmer</Channel>
  <Channel Number="1">R1</Channel><Channel Number="2">G1</Channel><Channel Number="3">B1</Channel>
  <Channel Number="4">R2</Channel><Channel Number="5">G2</Channel><Channel Number="6">B2</Channel>
  <Channel Number="7">R3</Channel><Channel Number="8">G3</Channel><Channel Number="9">B3</Channel>
  <Channel Number="10">R4</Channel><Channel Number="11">G4</Channel><Channel Number="12">B4</Channel>
  <Head><Channel>1</Channel><Channel>2</Channel><Channel>3</Channel></Head>
  <Head><Channel>4</Channel><Channel>5</Channel><Channel>6</Channel></Head>
  <Head><Channel>7</Channel><Channel>8</Channel><Channel>9</Channel></Head>
  <Head><Channel>10</Channel><Channel>11</Channel><Channel>12</Channel></Head>
 </Mode>
</FixtureDefinition>`;

export const MOVER_QXF = `<?xml version="1.0" encoding="UTF-8"?>
<FixtureDefinition xmlns="http://www.qlcplus.org/FixtureDefinition">
 <Manufacturer>Test</Manufacturer>
 <Model>Spot Mover</Model>
 <Type>Moving Head</Type>
 <Channel Name="Pan" Preset="PositionPan"/>
 <Channel Name="Tilt" Preset="PositionTilt"/>
 <Channel Name="Speed" Preset="SpeedPanTiltFastSlow"/>
 <Channel Name="Dimmer" Preset="IntensityMasterDimmer"/>
 <Channel Name="Shutter">
  <Group Byte="0">Shutter</Group>
  <Capability Min="0" Max="9" Preset="ShutterOpen">Open</Capability>
  <Capability Min="10" Max="255" Preset="StrobeSlowToFast">Strobe</Capability>
 </Channel>
 <Channel Name="Red" Preset="IntensityRed"/>
 <Channel Name="Green" Preset="IntensityGreen"/>
 <Channel Name="Blue" Preset="IntensityBlue"/>
 <Mode Name="8ch">
  <Channel Number="0">Pan</Channel><Channel Number="1">Tilt</Channel><Channel Number="2">Speed</Channel>
  <Channel Number="3">Dimmer</Channel><Channel Number="4">Shutter</Channel>
  <Channel Number="5">Red</Channel><Channel Number="6">Green</Channel><Channel Number="7">Blue</Channel>
 </Mode>
</FixtureDefinition>`;

const fixture = (id: number, model: string, mode: string, addr: number, chs: number) => ` <Fixture>
   <Manufacturer>Test</Manufacturer>
   <Model>${model}</Model>
   <Mode>${mode}</Mode>
   <ID>${id}</ID>
   <Name>${model} ${id}</Name>
   <Universe>0</Universe>
   <Address>${addr}</Address>
   <Channels>${chs}</Channels>
  </Fixture>`;

export const WORKSPACE_QXW = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Workspace>
<Workspace xmlns="http://www.qlcplus.org/Workspace" CurrentWindow="FixtureManager">
 <Creator><Name>Q Light Controller Plus</Name><Version>4.14.0</Version><Author>Test &amp; Co</Author></Creator>
 <Engine>
  <InputOutputMap><Universe Name="Universe 1" ID="0"/></InputOutputMap>
${fixture(0, "Pixel Bar 4", "13ch", 0, 13)}
${fixture(1, "Pixel Bar 4", "13ch", 13, 13)}
${fixture(2, "RGBW Par", "6ch", 26, 6)}
${fixture(3, "RGBW Par", "6ch", 32, 6)}
${fixture(4, "Spot Mover", "8ch", 38, 8)}
${fixture(5, "Spot Mover", "8ch", 46, 8)}
  <Function ID="0" Type="Scene" Name="My own scene">
   <Speed FadeIn="0" FadeOut="0" Duration="0"/>
   <FixtureVal ID="2">0,255,2,255</FixtureVal>
  </Function>
 </Engine>
 <VirtualConsole>
  <Frame Caption="" ID="0">
   <WindowState Visible="True" X="0" Y="0" Width="1920" Height="1080"/>
   <Button Caption="Mine" ID="1">
    <WindowState Visible="True" X="15" Y="15" Width="93" Height="93"/>
    <Function ID="0"/>
    <Action>Toggle</Action>
   </Button>
  </Frame>
 </VirtualConsole>
</Workspace>`;
