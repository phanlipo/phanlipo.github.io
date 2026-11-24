// Test data for medical-codes: small hand-written ClaML and EDV-TXT files in the layout of the BfArM downloads
// (no real BfArM content – the files are licensed) and a ZIP writer (stored or deflate, like the BfArM ZIPs).
import { deflateRawSync, crc32 } from 'node:zlib';

export const ICD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ClaML SYSTEM "ClaML.dtd">
<ClaML version="2.0.0">
  <Meta name="lang" value="de"/>
  <Identifier authority="BfArM" uid="test"/>
  <Title name="ICD-10-GM" version="2026" date="2025-09-12">Internationale statistische Klassifikation (Testauszug)</Title>
  <ClassKinds><ClassKind name="chapter"/><ClassKind name="block"/><ClassKind name="category"/></ClassKinds>
  <RubricKinds><RubricKind name="preferred"/><RubricKind name="inclusion"/><RubricKind name="exclusion"/><RubricKind name="note"/></RubricKinds>
  <Modifier code="S04M00_5"><SubClass code="0"/><SubClass code="1"/></Modifier>
  <ModifierClass modifier="S04M00_5" code="0"><SuperClass code="S04M00_5"/>
    <Rubric kind="preferred"><Label xml:lang="de">Mehrere Lokalisationen</Label></Rubric></ModifierClass>
  <ModifierClass modifier="S04M00_5" code="1"><SuperClass code="S04M00_5"/>
    <Rubric kind="preferred"><Label xml:lang="de">Schulterregion</Label></Rubric>
    <Rubric kind="inclusion"><Label xml:lang="de">Klavikula, Skapula</Label></Rubric></ModifierClass>
  <Class code="I" kind="chapter"><SubClass code="A00-A09"/>
    <Rubric kind="preferred"><Label xml:lang="de">Bestimmte infektiöse und parasitäre Krankheiten</Label></Rubric></Class>
  <Class code="A00-A09" kind="block"><SuperClass code="I"/><SubClass code="A00"/><SubClass code="A01"/>
    <Rubric kind="preferred"><Label xml:lang="de">Infektiöse Darmkrankheiten</Label></Rubric></Class>
  <Class code="A00" kind="category"><SuperClass code="A00-A09"/><SubClass code="A00.0"/><SubClass code="A00.9"/>
    <Meta name="Para295" value="P"/>
    <Rubric kind="preferred"><Label xml:lang="de">Cholera</Label></Rubric></Class>
  <Class code="A00.0" kind="category"><SuperClass code="A00"/>
    <Rubric kind="preferred"><Label xml:lang="de">Cholera durch Vibrio cholerae O:1, Biovar cholerae</Label></Rubric>
    <Rubric kind="inclusion"><Label xml:lang="de">Klassische Cholera</Label></Rubric></Class>
  <Class code="A00.9" kind="category"><SuperClass code="A00"/>
    <Rubric kind="preferred"><Label xml:lang="de">Cholera, nicht näher bezeichnet</Label></Rubric>
    <Rubric kind="exclusion"><Label xml:lang="de">Paratyphus A (<Reference>A01.1</Reference>)</Label></Rubric>
    <Rubric kind="note"><Label xml:lang="de"><Para>Erster Absatz &amp; mehr.</Para><List><ListItem>Punkt eins</ListItem><ListItem>Punkt zwei</ListItem></List></Label></Rubric></Class>
  <Class code="A01" kind="category"><SuperClass code="A00-A09"/><SubClass code="A01.0"/><SubClass code="A01.1"/>
    <Rubric kind="preferred"><Label xml:lang="de">Typhus abdominalis und Paratyphus</Label></Rubric></Class>
  <Class code="A01.0" kind="category" usage="dagger"><SuperClass code="A01"/>
    <Rubric kind="preferred"><Label xml:lang="de">Typhus abdominalis</Label></Rubric></Class>
  <Class code="A01.1" kind="category"><SuperClass code="A01"/>
    <Rubric kind="preferred"><Label xml:lang="de">Paratyphus A</Label></Rubric></Class>
  <Class code="XIII" kind="chapter"><SubClass code="M00-M03"/>
    <Rubric kind="preferred"><Label xml:lang="de">Krankheiten des Muskel-Skelett-Systems</Label></Rubric></Class>
  <Class code="M00-M03" kind="block"><SuperClass code="XIII"/><SubClass code="M00"/>
    <Rubric kind="preferred"><Label xml:lang="de">Infektiöse Arthropathien</Label></Rubric></Class>
  <Class code="M00" kind="category"><SuperClass code="M00-M03"/><SubClass code="M00.0"/><ModifiedBy code="S04M00_5"/>
    <Rubric kind="preferred"><Label xml:lang="de">Eitrige Arthritis</Label></Rubric></Class>
  <Class code="M00.0" kind="category"><SuperClass code="M00"/>
    <Rubric kind="preferred"><Label xml:lang="de">Arthritis und Polyarthritis durch Staphylokokken</Label></Rubric></Class>
</ClaML>
`;

// OPS-like: modifier for the 6th digit on a 4-digit class, excluded for one child; ISO-8859-1 encoded
export const OPS_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<ClaML version="2.0.0">
  <Title name="OPS" version="2027" date="2026-10-17">Operationen- und Prozedurenschlüssel (Testauszug)</Title>
  <Modifier code="ST5780"><SubClass code="0"/><SubClass code="1"/></Modifier>
  <ModifierClass modifier="ST5780" code="0"><Rubric kind="preferred"><Label xml:lang="de">Klavikula</Label></Rubric></ModifierClass>
  <ModifierClass modifier="ST5780" code="1"><Rubric kind="preferred"><Label xml:lang="de">Humerus proximal</Label></Rubric></ModifierClass>
  <Class code="5" kind="chapter"><SubClass code="5-78...5-86"/>
    <Rubric kind="preferred"><Label xml:lang="de">Operationen</Label></Rubric></Class>
  <Class code="5-78...5-86" kind="block"><SuperClass code="5"/><SubClass code="5-780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Operationen an den Bewegungsorganen</Label></Rubric></Class>
  <Class code="5-780" kind="category"><SuperClass code="5-78...5-86"/><SubClass code="5-780.0"/><SubClass code="5-780.1"/><ModifiedBy code="ST5780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Inzision am Knochen, septisch und aseptisch</Label></Rubric></Class>
  <Class code="5-780.0" kind="category"><SuperClass code="5-780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Exploration von Knochengewebe</Label></Rubric></Class>
  <Class code="5-780.1" kind="category"><SuperClass code="5-780"/><ExcludeModifier code="ST5780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Knochenbohrung, Größe egal</Label></Rubric></Class>
</ClaML>
`;

export const ALPHA_TXT = [
  '1|I97525|A00.0|||||Cholera durch Vibrio cholerae O:1, Biovar cholerae',
  '1|I12345|A00.9|||||Asiatische Cholera',
  '0|I11111|A01.0|G01*||||Typhusmeningitis',
  '1|I22222|E75.2||||324|Morbus Fabry',
].join('\r\n') + '\r\n';

export const META_TXT = '3;T;X;01;A00;A00.0;A00.0;A000;Cholera durch Vibrio cholerae;Cholera\n3;T;X;01;A00;A00.9;A00.9;A009;Cholera, n.n.bez.;Cholera\n';

// Minimal ZIP writer: files = [{ name, data: string|Buffer, latin1?, store? }]
export function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, f.latin1 ? 'latin1' : 'utf8');
    const comp = f.store ? data : deflateRawSync(data);
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(data);
    const method = f.store ? 0 : 8;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// The ZIPs as the user downloads them
export const icdZip = () => zip([
  { name: 'Klassifikationsdateien/ClaML.dtd', data: '<!ELEMENT ClaML ANY>' },
  { name: 'Klassifikationsdateien/icd10gm2026syst_claml_20250912.xml', data: ICD_XML },
  { name: 'Lizenz.txt', data: 'Nutzungsbedingungen: siehe Website.' },
]);
export const opsZip = () => zip([{ name: 'ops2027syst_claml_20261017.xml', data: OPS_XML, latin1: true, store: true }]);
export const alphaZip = () => zip([{ name: 'icd10gm2026_alphaidse_edvtxt_20250926.txt', data: ALPHA_TXT }]);
export const metaZip = () => zip([{ name: 'Klassifikationsdateien/icd10gm2026syst_kodes.txt', data: META_TXT }]);
// Earlier versions come as one ZIP with ZIPs inside
export const nestedZip = () => zip([{ name: 'icd10gm2026syst-claml.zip', data: icdZip(), store: true }]);
