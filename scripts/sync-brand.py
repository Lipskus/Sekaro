"""Generate external logo assets from the application mark and theme tokens."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
logo = (ROOT / "frontend/src/redesign/Logo.jsx").read_text()
css = (ROOT / "frontend/src/redesign/design.css").read_text()
paths = re.findall(r'<path d="([^"]+)"', logo)
assert len(paths) == 3, "Review generator when the application mark changes"

def palette(selector):
    block = re.search(re.escape(selector) + r"\s*\{([^}]+)\}", css).group(1)
    return dict(re.findall(r"--sk-([\w-]+):([^;]+);", block))

light = palette(":root")
dark = {**light, **palette("html[data-theme=dark]")}

def svg(theme, adaptive=False):
    style = ""
    if adaptive:
        style = '<style>@media(prefers-color-scheme:dark){' + ''.join(
            f'.{name}{{fill:{dark[token]}}}' for name, token in
            [('background', 'surface'), ('top', 'logo-top'), ('bottom', 'primary'), ('cutout', 'surface')]
        ) + '}</style>'
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
            + style + f'<rect class="background" width="48" height="48" rx="12" fill="{theme["surface"]}"/>'
            + '<g transform="translate(7 6)">'
            + ''.join(f'<path class="{name}" d="{d}" fill="{theme[token]}"/>' for d, name, token in
                      zip(paths, ['top', 'bottom', 'cutout'], ['logo-top', 'primary', 'surface']))
            + '</g></svg>\n')

for name in ['static/favicon.svg', 'static/sekaro-favicon-v1.svg', 'static/sekaro-favicon-v2.svg',
             'frontend/src/assets/sekaro_logo.svg']:
    (ROOT / name).write_text(svg(light, adaptive=True))
for name, theme in [('light', light), ('dark', dark)]:
    (ROOT / f'static/sekaro-logo-{name}.svg').write_text(svg(theme))
