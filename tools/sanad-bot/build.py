"""Writes every SVG the app and the panel need for the Sanad bot (owner decision 2026-11-17).

Run:  python3 tools/sanad-bot/build.py && node tools/sanad-bot/render.mjs
The drawing itself is sbot.py (the coordinator's); this file only places it on the right canvases and
splits the head into layers so the app can animate it: `base` (shell, visor, smile, ears, antenna),
`eyes` (blink) and `halo` (the antenna's breathing glow).
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from sbot import DEFS, RAIL, TURQ, head, scene, svg  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "svg")
os.makedirs(OUT, exist_ok=True)


def write(name, text):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(text)


def split(markup):
    """Splits head() markup into (base, eyes): the eyes are the <g filter="url(#glow)"> group."""
    m = re.search(r'<g filter="url\(#glow\)">.*?</g>', markup)
    return markup[: m.start()] + markup[m.end():], m.group(0)


# The head's box for a given centre/top/scale (ears and antenna disc included).
def box(cx, top, s):
    return cx - 196 * s, top - 88 * s, 392 * s, 328 * s


# 1) The animated mark (Sanad button, chat avatar): 1024 canvas, head centred, three layers.
S, TOP = 1.55, 395
base, eyes = split(head(512, TOP, S))
write("mark-base.svg", svg(base))
write("mark-eyes.svg", svg(eyes))
halo_r = 24 * S * 2.1
write(
    "mark-halo.svg",
    svg(f'<circle cx="512" cy="{TOP - 64 * S:.1f}" r="{halo_r:.1f}" fill="{TURQ}" filter="url(#halo)"/>').replace(
        "<defs>", '<defs><filter id="halo" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="22"/></filter>'
    ),
)
with open(os.path.join(OUT, "mark-geometry.json"), "w") as f:
    f.write('{"eyesY": %.4f, "antennaY": %.4f}\n' % ((TOP + 110 * S) / 1024, (TOP - 64 * S) / 1024))

# 2) The head alone, tight box (logo next to the wordmark, splash, panel).
x, y, w, h = box(512, 400, 2.0)
pad = 40
write(
    "head.svg",
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x - pad:.0f} {y - pad:.0f} {w + 2 * pad:.0f} {h + 2 * pad:.0f}" width="{w + 2 * pad:.0f}" height="{h + 2 * pad:.0f}"><defs>{DEFS}</defs>{head(512, 400, 2.0)}</svg>',
)

# 3) App icons: iOS full bleed (no corners: the system rounds it), web rounded, Android layers.
write("icon-ios.svg", svg(f'<rect width="1024" height="1024" fill="{RAIL}"/><circle cx="512" cy="540" r="380" fill="url(#disc)" opacity="0.18"/>' + head(512, 380, 1.62)))
write("icon-web.svg", svg(f'<rect width="1024" height="1024" rx="232" fill="{RAIL}"/><circle cx="512" cy="540" r="380" fill="url(#disc)" opacity="0.18"/>' + head(512, 380, 1.62)))
# Android: the system crops the foreground to a shape inside the middle 66%; the head stays within it.
AS = 1.2
write("android-foreground.svg", svg(head(512, 512 - 76 * AS, AS)))
write("android-background.svg", svg(f'<rect width="1024" height="1024" fill="{RAIL}"/><circle cx="512" cy="512" r="300" fill="url(#disc)" opacity="0.18"/>'))

# 4) Splash: the head on transparent (the splash background colour is rail teal in app.json).
write("splash.svg", svg(head(512, 512 - 76 * 1.9, 1.9)))

# 5) The assistant's welcome scene, on transparent so it sits on both the light and the dark ground.
write("scene.svg", svg(scene()))
print("svg ok")
