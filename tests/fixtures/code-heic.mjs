// Creates code.heic: a securPharm GS1 DataMatrix (same code as in securpharm-scanner.spec.mjs) as HEIC,
// stand-in for an iPhone photo of a pack. Needs Python with pillow-heif (pip install pillow pillow-heif):
// node tests/fixtures/code-heic.mjs
import bwipjs from 'bwip-js';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const png = await bwipjs.toBuffer({ bcid: 'gs1datamatrix', text: '(01)04150123456782(21)ABC123XYZ9(10)CH4711(17)281231', scale: 6, padding: 10, backgroundcolor: 'FFFFFF' });
const tmp = join(tmpdir(), 'code-heic.png');
writeFileSync(tmp, png);
execFileSync('python3', ['-c', `import sys
from PIL import Image
import pillow_heif
pillow_heif.from_pillow(Image.open(sys.argv[1]).convert('RGB')).save(sys.argv[2], quality=95)`, tmp, new URL('./code.heic', import.meta.url).pathname]);
