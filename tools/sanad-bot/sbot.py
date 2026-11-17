# Sanad bot drawing (owner decision 2026-11-17), by the coordinator. Kept as drawn; only the file
# writes at the bottom run as a script now, so build.py can import the drawing functions.
import math
RAIL, TEAL, MID, TURQ, LIGHT, INK = "#0d3b41", "#0e5a61", "#1fa89c", "#5fd3c6", "#a8ece4", "#0b2a2e"
DEFS = f'''<linearGradient id="disc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{TURQ}"/><stop offset="1" stop-color="{MID}"/></linearGradient>
<linearGradient id="shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dcebe8"/></linearGradient>
<linearGradient id="lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7fbfa"/><stop offset="1" stop-color="#dfeae8"/></linearGradient>
<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0b2a2e" flood-opacity="0.18"/></filter>'''
def svg(body, bg=None, w=1024, h=1024):
    b = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{DEFS}</defs>{b}{body}</svg>'
def head(cx=470, top=230, s=1.0):
    """Sanad's head: white shell, dark visor, two ring eyes that glow, a small smile, antenna with the turquoise disc."""
    g = lambda v: v*s
    x0, w, h = cx-g(170), g(340), g(240)
    eye = lambda ex: (f'<circle cx="{ex:.1f}" cy="{top+g(110):.1f}" r="{g(30):.1f}" fill="none" stroke="{TURQ}" stroke-width="{g(11):.1f}"/>'
                      f'<circle cx="{ex:.1f}" cy="{top+g(110):.1f}" r="{g(9):.1f}" fill="{LIGHT}"/>')
    return (f'<rect x="{cx-g(7):.1f}" y="{top-g(60):.1f}" width="{g(14):.1f}" height="{g(62):.1f}" rx="{g(7):.1f}" fill="#cfe1de"/>'
            f'<circle cx="{cx}" cy="{top-g(64):.1f}" r="{g(24):.1f}" fill="{TURQ}" filter="url(#glow)"/>'
            f'<rect x="{x0-g(26):.1f}" y="{top+g(78):.1f}" width="{g(44):.1f}" height="{g(86):.1f}" rx="{g(22):.1f}" fill="{MID}"/>'
            f'<rect x="{x0+w-g(18):.1f}" y="{top+g(78):.1f}" width="{g(44):.1f}" height="{g(86):.1f}" rx="{g(22):.1f}" fill="{MID}"/>'
            f'<rect x="{x0:.1f}" y="{top:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{g(118):.1f}" fill="url(#shell)" filter="url(#soft)"/>'
            f'<rect x="{x0+g(36):.1f}" y="{top+g(58):.1f}" width="{w-g(72):.1f}" height="{g(104):.1f}" rx="{g(52):.1f}" fill="{INK}"/>'
            f'<g filter="url(#glow)">{eye(cx-g(56))}{eye(cx+g(56))}</g>'
            f'<path d="M{cx-g(34):.1f},{top+g(192):.1f} Q{cx},{top+g(218):.1f} {cx+g(34):.1f},{top+g(192):.1f}" fill="none" stroke="{RAIL}" stroke-width="{g(12):.1f}" stroke-linecap="round"/>')
def dots_ring(cx, cy, r, n=8, d=6):
    return ''.join(f'<circle cx="{cx+r*math.cos(2*math.pi*i/n):.1f}" cy="{cy+r*math.sin(2*math.pi*i/n):.1f}" r="{d}" fill="{[TURQ, MID][i%2]}"/>' for i in range(n))
def scene():
    """Sanad at work: the bot behind its laptop, answering in a bubble, on the sea-glass disc."""
    return (f'<circle cx="470" cy="520" r="340" fill="url(#disc)"/>'
            + head(470, 250) +
            f'<ellipse cx="470" cy="560" rx="120" ry="58" fill="url(#shell)"/>'
            f'<rect x="296" y="540" width="348" height="230" rx="28" fill="url(#lid)" filter="url(#soft)"/>'
            f'<rect x="270" y="760" width="400" height="22" rx="11" fill="#c9dbd8"/>'
            f'<circle cx="470" cy="655" r="22" fill="{TURQ}"/>' + dots_ring(470, 655, 46) +
            f'<path d="M690,268 H830 A52,52 0 0 1 882,320 V352 A52,52 0 0 1 830,404 H730 L690,438 L700,404 H690 A52,52 0 0 1 638,352 V320 A52,52 0 0 1 690,268 Z" fill="#ffffff" stroke="{RAIL}" stroke-width="10" stroke-linejoin="round"/>'
            f'<circle cx="716" cy="336" r="13" fill="{MID}"/><circle cx="760" cy="336" r="13" fill="{TURQ}"/><circle cx="804" cy="336" r="13" fill="{LIGHT}"/>')
def icon():
    """App icon / Sanad button: the head alone on rail teal, sized for small screens."""
    return f'<rect width="1024" height="1024" rx="232" fill="{RAIL}"/><circle cx="512" cy="540" r="380" fill="url(#disc)" opacity="0.18"/>' + head(512, 380, 1.62)
def button():
    return f'<circle cx="512" cy="512" r="512" fill="{RAIL}"/>' + head(512, 395, 1.55)
if __name__ == "__main__":
  open("scene.svg", "w").write(svg(scene(), "#ffffff"))
  open("scene-dark.svg", "w").write(svg(scene(), RAIL))
  open("icon.svg", "w").write(svg(icon()))
  open("button.svg", "w").write(svg(button()))
  print("ok")
