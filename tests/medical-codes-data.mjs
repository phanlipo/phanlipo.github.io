// Test data for medical-codes: small hand-written ClaML and EDV-TXT files in the layout of the BfArM downloads
// (no real BfArM content – the files are licensed) and a ZIP writer (stored or deflate, like the BfArM ZIPs).
// The layout follows the real files (checked with ICD-10-GM 2026, OPS 2027, Alpha-ID-SE 2027, ICF 2005 …):
// Title name "ICD-10" for GM and WHO, preferredLong, Fragment type="list", Reference class="in brackets",
// excludeOnPrecedingModifier, no-break spaces, ICF qualifiers as modifiers, "↔" in the OPS alphabet,
// read-me files next to the data.
import { deflateRawSync, crc32 } from 'node:zlib';

export const ICD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ClaML SYSTEM "ClaML.dtd">
<ClaML version="2.0.0">
  <Meta name="lang" value="de"/>
  <Identifier authority="BfArM" uid="test"/>
  <Title name="ICD-10" version="2026" date="2025-09-12">Internationale statistische Klassifikation (Testauszug)</Title>
  <ClassKinds><ClassKind name="chapter"/><ClassKind name="block"/><ClassKind name="category"/></ClassKinds>
  <RubricKinds><RubricKind name="preferred"/><RubricKind name="inclusion"/><RubricKind name="exclusion"/><RubricKind name="note"/></RubricKinds>
  <Modifier code="S04M00_5"><SubClass code="0"/><SubClass code="1"/></Modifier>
  <Modifier code="S04E10_4"><SubClass code=".0"/><SubClass code=".9"/></Modifier>
  <Modifier code="S04E10_5"><SubClass code="0"/><SubClass code="1"/></Modifier>
  <ModifierClass code=".0" modifier="S04E10_4"><SuperClass code="S04E10_4"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE">Mit Koma</Label></Rubric></ModifierClass>
  <ModifierClass code=".9" modifier="S04E10_4"><SuperClass code="S04E10_4"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE">Ohne Komplikationen</Label></Rubric></ModifierClass>
  <ModifierClass code="0" modifier="S04E10_5">
    <Meta name="excludeOnPrecedingModifier" value="S04E10_4 .0"/><SuperClass code="S04E10_5"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE">Nicht als entgleist bezeichnet</Label></Rubric></ModifierClass>
  <ModifierClass code="1" modifier="S04E10_5"><SuperClass code="S04E10_5"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE">Als entgleist bezeichnet</Label></Rubric></ModifierClass>
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
    <Rubric kind="preferredLong"><Label xml:lang="de">Typhus abdominalis und Paratyphus: Paratyphus A</Label></Rubric>
    <Rubric kind="preferred"><Label xml:lang="de">Paratyphus A</Label></Rubric></Class>
  <Class code="IV" kind="chapter"><SubClass code="E10-E14"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE">Endokrine, Ernährungs- und Stoffwechselkrankheiten</Label></Rubric></Class>
  <Class code="E10-E14" kind="block"><SuperClass code="IV"/><SubClass code="E10"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE">Diabetes mellitus</Label></Rubric></Class>
  <Class code="E10" kind="category">
    <Meta name="Para295" value="V"/><Meta name="SexCode" value="9"/><Meta name="AgeLow" value="j010"/><Meta name="P17b-d" value="2"/>
    <SuperClass code="E10-E14"/>
    <ModifiedBy all="true" code="S04E10_4"/>
    <ModifiedBy all="true" code="S04E10_5"/>
    <Rubric kind="preferred"><Label xml:lang="de-DE" xml:space="default">Diabetes mellitus, Typ\u00a01</Label></Rubric>
    <Rubric kind="inclusion"><Label xml:lang="de-DE" xml:space="default">
        <Fragment type="list">Diabetes mellitus:</Fragment>
        <Fragment type="list">juveniler Typ</Fragment>
      </Label></Rubric>
    <Rubric kind="exclusion"><Label xml:lang="de-DE" xml:space="default">Cholera o.n.A.<Reference class="in brackets">A00.9</Reference></Label></Rubric></Class>
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
  <ModifierClass modifier="ST5780" code="0"><Meta name="ZusatzK" value="N"/><Rubric kind="preferred"><Label xml:lang="de">Klavikula</Label></Rubric></ModifierClass>
  <ModifierClass modifier="ST5780" code="1"><Rubric kind="preferred"><Label xml:lang="de">Humerus proximal</Label></Rubric></ModifierClass>
  <Class code="5" kind="chapter"><SubClass code="5-78...5-86"/>
    <Rubric kind="preferred"><Label xml:lang="de">Operationen</Label></Rubric></Class>
  <Class code="5-78...5-86" kind="block"><SuperClass code="5"/><SubClass code="5-780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Operationen an den Bewegungsorganen</Label></Rubric></Class>
  <Class code="5-780" kind="category"><SuperClass code="5-78...5-86"/><SubClass code="5-780.0"/><SubClass code="5-780.1"/><ModifiedBy code="ST5780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Inzision am Knochen, septisch und aseptisch</Label></Rubric></Class>
  <Class code="5-780.0" kind="category"><SuperClass code="5-780"/><Meta name="EinmalK" value="J"/>
    <Rubric kind="preferred"><Label xml:lang="de">Exploration von Knochengewebe</Label></Rubric></Class>
  <Class code="5-780.1" kind="category"><SuperClass code="5-780"/><ExcludeModifier code="ST5780"/>
    <Rubric kind="preferred"><Label xml:lang="de">Knochenbohrung, Größe egal</Label></Rubric></Class>
</ClaML>
`;

export const ALPHA_TXT = [
  '1|I97525|A00.0|||||Cholera durch Vibrio cholerae O:1, Biovar cholerae',
  '1|I12345|A00.9|||||Asiatische Cholera',
  '0|I11111|A01.0+|G01*||||Typhusmeningitis',
  '1|I22222|E75.2||||324|Morbus Fabry',
].join('\r\n') + '\r\n';

// ICD-10-GM alphabet: kind|number|print flag|primary|star|additional|primary 2|text, Windows-1252
export const ICD_ALPHA_TXT = [
  '1|86000|1|A00.0||||Klassische Cholera',
  '2|86001|1|A01.0+|G01*|||Typhöse Meningitis',
  '0|86498|1|||||Abnorm - s. Art der Krankheit',
].join('\r\n') + '\r\n';
// OPS alphabet: kind|id|code|code 2|text; "↔" = a side is needed
export const OPS_ALPHA_TXT = '1|948|5-780.00↔||Exploration von Knochengewebe an der Klavikula\r\n0|10422|||Abnorm - s. jeweiliger Eingriff\r\n';

// ICF: the modifiers are qualifiers ("xxx.1"), not further codes
export const ICF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ClaML version="2.0.0">
  <Title date="2012-06-19" name="ICF" version="2005">Internationale Klassifikation der Funktionsfähigkeit (Testauszug)</Title>
  <Modifier code="Q_Ausmaß_der_Schädigung"><SubClass code="xxx.0"/><SubClass code="xxx.1"/>
    <Rubric kind="preferred"><Label xml:lang="de">Ausmaß oder Größe der Schädigung</Label></Rubric></Modifier>
  <ModifierClass code="xxx.0" modifier="Q_Ausmaß_der_Schädigung"><Rubric kind="preferred"><Label xml:lang="de">Schädigung nicht vorhanden</Label></Rubric></ModifierClass>
  <ModifierClass code="xxx.1" modifier="Q_Ausmaß_der_Schädigung"><Rubric kind="preferred"><Label xml:lang="de">Schädigung leicht ausgeprägt</Label></Rubric></ModifierClass>
  <Class code="b" kind="component"><SubClass code="b1"/><ModifiedBy all="true" code="Q_Ausmaß_der_Schädigung"/>
    <Rubric kind="preferred"><Label xml:lang="de">Körperfunktionen</Label></Rubric></Class>
  <Class code="b1" kind="chapter"><SuperClass code="b"/><SubClass code="b110"/>
    <Rubric kind="preferred"><Label xml:lang="de">Mentale Funktionen</Label></Rubric></Class>
  <Class code="b110" kind="fourdigit"><SuperClass code="b1"/><SubClass code="b1100"/>
    <Rubric kind="preferred"><Label xml:lang="de">Funktionen des Bewusstseins</Label></Rubric></Class>
  <Class code="b1100" kind="fivedigit"><SuperClass code="b110"/>
    <Rubric kind="preferred"><Label xml:lang="de">Bewusstseinszustand</Label></Rubric></Class>
</ClaML>
`;

export const META_TXT = '3;T;X;01;A00;A00.0;A00.0;A000;Cholera durch Vibrio cholerae;Cholera\n3;T;X;01;A00;A00.9;A00.9;A009;Cholera, n.n.bez.;Cholera\n';

// Minimal ZIP writer: files = [{ name, data: string|Buffer, latin1?, store? }]
export function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    // latin1: like the ICD-10-GM alphabet (Windows-1252; the dagger is written "+" there)
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
  // Read-me files describe the fields with "|" – they must not become a list
  { name: 'icd10gm2026syst_claml_liesmich.txt', data: 'Feld 1|Feld 2|Feld 3\nFeld 4|Feld 5|Feld 6\n' },
]);
export const opsZip = () => zip([{ name: 'ops2027syst_claml_20261017.xml', data: OPS_XML, latin1: true, store: true }]);
export const alphaZip = () => zip([{ name: 'icd10gm2026_alphaidse_edvtxt_20250926.txt', data: ALPHA_TXT }]);
export const icdAlphaZip = () => zip([{ name: 'icd10gm2026alpha_edvtxt_20250926.txt', data: ICD_ALPHA_TXT, latin1: true }, { name: 'icd10gm2026alpha_edvtxt_liesmich.txt', data: 'a|b\nc|d\n' }]);
export const opsAlphaZip = () => zip([{ name: 'ops2027alpha_edvtxt_20261106.txt', data: OPS_ALPHA_TXT }]);
export const icfZip = () => zip([{ name: 'Klassifikationsdateien/icf2005syst_claml_20120619.xml', data: ICF_XML }]);
export const metaZip = () => zip([{ name: 'Klassifikationsdateien/icd10gm2026syst_kodes.txt', data: META_TXT }]);
// Earlier versions come as one ZIP with ZIPs inside
export const nestedZip = () => zip([{ name: 'icd10gm2026syst-claml.zip', data: icdZip(), store: true }]);
