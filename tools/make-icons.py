"""Renders tools/icon.html with headless Edge and writes the PNG icon sizes into icons/.
Usage: python tools/make-icons.py   (needs Microsoft Edge and Pillow)"""
import subprocess, pathlib, tempfile
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
with tempfile.TemporaryDirectory() as tmp:
    src = pathlib.Path(tmp) / "icon-1024.png"
    subprocess.run([edge, "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    f"--screenshot={src}", "--window-size=1024,1024", (root / "tools" / "icon.html").as_uri()], check=True)
    img = Image.open(src).convert("RGB").crop((0, 0, 1024, 1024))
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        img.resize((size, size), Image.LANCZOS).save(root / "icons" / name, optimize=True)
        print("wrote", name)
