"""High-resolution PNG exports of frontend/public/logo.svg (bolt on a rounded dark tile).

    python promo/logo_export.py   # -> promo/logo/*.png
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "logo"
TILE, BOLT, TEXT = (12, 16, 20, 255), (79, 214, 160, 255), (238, 241, 243, 255)
BOLT_PATH = [(19, 5), (10, 16.5), (15.4, 16.5), (13, 27), (23.2, 14.2), (17.6, 14.2)]
SS = 4


def bolt(draw: ImageDraw.ImageDraw, x: float, y: float, scale: float) -> None:
    draw.polygon([(x + px * scale, y + py * scale) for px, py in BOLT_PATH], fill=BOLT)


def icon(size: int, rounded: bool = True) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, big - 1, big - 1), radius=big * 8 / 32 if rounded else 0, fill=TILE)
    bolt(d, 0, 0, big / 32)
    return img.resize((size, size), Image.LANCZOS)


def avatar(size: int) -> Image.Image:
    big = size * SS
    img = Image.new("RGBA", (big, big), TILE)
    scale = big * 0.62 / 22
    bolt(ImageDraw.Draw(img), big / 2 - 16.6 * scale, big / 2 - 16 * scale, scale)
    return img.resize((size, size), Image.LANCZOS)


def wordmark(height: int, background) -> Image.Image:
    big = height * SS
    font = ImageFont.truetype("seguisb.ttf", int(big * 0.5))
    label = "Quantify"
    left, top, right, bottom = font.getbbox(label)
    pad, gap, mark = big * 0.2, big * 0.18, big * 0.6
    width = int(pad * 2 + mark + gap + (right - left))
    img = Image.new("RGBA", (width, big), background)
    tile = icon(int(mark / SS)).resize((int(mark), int(mark)), Image.LANCZOS)
    img.alpha_composite(tile, (int(pad), int((big - mark) / 2)))
    ImageDraw.Draw(img).text((pad + mark + gap - left, (big - (bottom - top)) / 2 - top), label, font=font, fill=TEXT)
    return img.resize((int(width / SS), height), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    icon(2048).save(OUT / "quantify_icon_2048.png")
    avatar(1080).save(OUT / "quantify_tiktok_avatar_1080.png")
    wordmark(600, TILE).save(OUT / "quantify_wordmark_dark.png")
    wordmark(600, (0, 0, 0, 0)).save(OUT / "quantify_wordmark_transparent.png")
    for p in sorted(OUT.glob("*.png")):
        with Image.open(p) as im:
            print(p.name, im.size)


if __name__ == "__main__":
    main()
