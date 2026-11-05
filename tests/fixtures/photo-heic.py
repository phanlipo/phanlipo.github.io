# Creates photo.heic: 64x48, four coloured quadrants (red | green / blue | white) for image-converter.spec.mjs
# pip install pillow pillow-heif; python photo-heic.py photo.heic
import sys
from PIL import Image
import pillow_heif

img = Image.new('RGB', (64, 48))
for x in range(64):
    for y in range(48):
        img.putpixel((x, y), [(220, 30, 30), (30, 200, 60), (40, 60, 220), (255, 255, 255)][(y >= 24) * 2 + (x >= 32)])
pillow_heif.from_pillow(img).save(sys.argv[1], quality=90)
