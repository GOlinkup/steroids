#!/usr/bin/env python3
"""Steroids 2D — floating always-on-top interactive canvas."""
import tkinter as tk
import json
import math
import os
import random
import sys

W, H = 420, 320

# ponytail: bind to real index; labels = actual skills, not lorem blobs.
def _load_names(n=5):
    for p in (os.path.expanduser("~/.config/steroids/skill-index.json"),
              os.path.join(os.path.dirname(__file__), "skill-index.json")):
        try:
            with open(p, encoding="utf-8") as f:
                idx = json.load(f).get("index", {})
            names = sorted(idx.keys())
            if names:
                return names[:n], len(names)
        except Exception:
            continue
    return ["drag", "drop", "spin", "pulse", "glow"], 0


NAMES, NSKILLS = _load_names()

root = tk.Tk()
root.title(f"STEROIDS — {NSKILLS} skills" if NSKILLS else "STEROIDS")
root.overrideredirect(True)
root.attributes("-topmost", True)
root.attributes("-alpha", 0.88)
root.configure(bg="#0b0e14")
root.geometry(f"{W}x{H}+100+100")

canvas = tk.Canvas(root, width=W, height=H, bg="#0b0e14", highlightthickness=0)
canvas.pack()

# --- blobs ---
class Blob:
    def __init__(self, x, y, r, hue, name):
        self.x, self.y, self.r, self.base_r = x, y, r, r
        self.hue, self.name = hue, name
        self.vx = random.uniform(-0.8, 0.8)
        self.vy = random.uniform(-0.8, 0.8)
        self.phase = random.uniform(0, math.tau)
        self.trail = []
        self.orbiters = [
            {"a": random.uniform(0, math.tau), "s": random.uniform(0.01, 0.03),
             "d": random.uniform(r*1.5, r*2.5), "sz": random.uniform(1.5, 3.5),
             "ho": random.uniform(-30, 30), "trail": []}
            for _ in range(6)
        ]
        self.rings = [
            {"a": random.uniform(0, math.tau), "s": random.uniform(0.015, 0.04) * (1 if i%2==0 else -1),
             "d": r*(1.5 + i*0.35), "sz": random.uniform(3, 6), "ho": random.uniform(-25, 25)}
            for i in range(3)
        ]

    def hit(self, mx, my):
        return (mx - self.x)**2 + (my - self.y)**2 <= (self.r + 12)**2

    def update(self, t, dragging):
        if dragging is not self:
            self.x += self.vx; self.y += self.vy
            if self.x < self.r: self.x = self.r; self.vx *= -0.85
            if self.x > W - self.r: self.x = W - self.r; self.vx *= -0.85
            if self.y < self.r: self.y = self.r; self.vy *= -0.85
            if self.y > H - self.r: self.y = H - self.r; self.vy *= -0.85
        self.r = self.base_r + math.sin(t * 0.04 + self.phase) * 4
        self.trail.append((self.x, self.y))
        if len(self.trail) > 45: self.trail.pop(0)
        for o in self.orbiters:
            o["a"] += o["s"]
            o["trail"].append((self.x + math.cos(o["a"])*o["d"], self.y + math.sin(o["a"])*o["d"]))
            if len(o["trail"]) > 18: o["trail"].pop(0)
        for r in self.rings:
            r["a"] += r["s"]

    def draw(self, t):
        # outer glow
        for i in range(3, 0, -1):
            ri = self.r * (2.2 + i * 0.7)
            canvas.create_oval(self.x-ri, self.y-ri, self.x+ri, self.y+ri,
                               fill="", outline=self._hsl(self.hue, 70, 50, 0.08), width=1)
        # orbiters
        for o in self.orbiters:
            for px, py in o["trail"]:
                canvas.create_oval(px-1.5, py-1.5, px+1.5, py+1.5,
                                   fill=self._hsl(self.hue+o["ho"], 80, 65, 0.45), outline="")
        # rings
        for r in self.rings:
            rx = self.x + math.cos(r["a"])*r["d"]
            ry = self.y + math.sin(r["a"])*r["d"]
            canvas.create_oval(rx-r["sz"], ry-r["sz"], rx+r["sz"], ry+r["sz"],
                               fill=self._hsl(self.hue+r["ho"], 90, 70, 0.85), outline="")
            canvas.create_line(self.x, self.y, rx, ry,
                               fill=self._hsl(self.hue+r["ho"], 60, 55, 0.15), width=1)
        # trail
        if len(self.trail) > 1:
            for i in range(1, len(self.trail)):
                a = i / len(self.trail) * 0.3
                x0, y0 = self.trail[i-1]; x1, y1 = self.trail[i]
                canvas.create_line(x0, y0, x1, y1, fill=self._hsl(self.hue, 80, 60, a), width=2)
        # core
        ri = self.r
        canvas.create_oval(self.x-ri, self.y-ri, self.x+ri, self.y+ri,
                           fill=self._hsl(self.hue, 90, 55), outline="")
        # inner highlight
        ir = ri * 0.5
        canvas.create_oval(self.x-ir, self.y-ir, self.x+ir, self.y+ir,
                           fill=self._hsl(self.hue, 60, 90, 0.5), outline="")
        # label
        canvas.create_text(self.x, self.y, text=self.name.upper(),
                           fill="#e6e9f0", font=("Helvetica", max(8, int(ri*0.32)), "bold"))

    @staticmethod
    def _hsl(h, s, l, a=1.0):
        h = h % 360; s /= 100; l /= 100
        c = (1 - abs(2*l - 1)) * s
        x = c * (1 - abs((h/60) % 2 - 1))
        m = l - c/2
        if h < 60: r,g,b = c,x,0
        elif h < 120: r,g,b = x,c,0
        elif h < 180: r,g,b = 0,c,x
        elif h < 240: r,g,b = 0,x,c
        elif h < 300: r,g,b = x,0,c
        else: r,g,b = c,0,x
        r,g,b = int((r+m)*255), int((g+m)*255), int((b+m)*255)
        return f"#{r:02x}{g:02x}{b:02x}"

xs = [W * 0.22, W * 0.52, W * 0.78, W * 0.38, W * 0.82]
ys = [H * 0.35, H * 0.48, H * 0.32, H * 0.72, H * 0.70]
rs = [38, 48, 34, 42, 30]
hues = [132, 216, 132, 216, 150]  # demo theme: green #7ee787 / blue #1f6feb family
blobs = [Blob(xs[i], ys[i], rs[i], hues[i], NAMES[i] if i < len(NAMES) else "skill") for i in range(5)]

# --- connections ---
def draw_links():
    for i in range(len(blobs)):
        for j in range(i+1, len(blobs)):
            a, b = blobs[i], blobs[j]
            d = math.hypot(a.x-b.x, a.y-b.y)
            if d < 250:
                alpha = (1 - d/250) * 0.25
                canvas.create_line(a.x, a.y, b.x, b.y,
                                   fill=Blob._hsl((a.hue+b.hue)//2, 60, 55, alpha), width=1)

# --- particles ---
bg_parts = [{"x": random.uniform(0,W), "y": random.uniform(0,H),
             "vx": random.uniform(-0.2,0.2), "vy": random.uniform(-0.2,0.2),
             "sz": random.uniform(0.8, 2), "h": 220} for _ in range(50)]  # slate particles, demo-dim

def draw_bg(t):
    for p in bg_parts:
        p["x"] += p["vx"]; p["y"] += p["vy"]
        if p["x"] < 0: p["x"] = W
        if p["x"] > W: p["x"] = 0
        if p["y"] < 0: p["y"] = H
        if p["y"] > H: p["y"] = 0
        fl = 0.3 + 0.7 * abs(math.sin(t*0.06 + p["h"]))
        canvas.create_oval(p["x"]-p["sz"], p["y"]-p["sz"], p["x"]+p["sz"], p["y"]+p["sz"],
                           fill=Blob._hsl(p["h"], 50, 55, fl*0.4), outline="")

# --- drag ---
dragging = [None]
offx = offy = [0]

def on_press(e):
    for b in reversed(blobs):
        if b.hit(e.x, e.y):
            dragging[0] = b; offx[0] = e.x - b.x; offy[0] = e.y - b.y
            break

def on_drag(e):
    if dragging[0]:
        dragging[0].x = e.x - offx[0]
        dragging[0].y = e.y - offy[0]
        dragging[0].vx = 0; dragging[0].vy = 0

def on_release(e):
    if dragging[0]:
        dragging[0].vx = random.uniform(-2, 2)
        dragging[0].vy = random.uniform(-2, 2)
    dragging[0] = None

def on_scroll(e):
    for b in blobs:
        if b.hit(e.x, e.y):
            b.base_r = max(15, min(90, b.base_r + (-5 if e.delta > 0 else 5)))
            break

canvas.bind("<Button-1>", on_press)
canvas.bind("<B1-Motion>", on_drag)
canvas.bind("<ButtonRelease-1>", on_release)
canvas.bind("<MouseWheel>", on_scroll)
canvas.bind("<Button-4>", lambda e: on_scroll(type('',(),{"delta":1,"x":e.x,"y":e.y})()))
canvas.bind("<Button-5>", lambda e: on_scroll(type('',(),{"delta":-1,"x":e.x,"y":e.y})()))

# --- title bar drag ---
def title_press(e): offx[0] = e.x_root - root.winfo_x(); offy[0] = e.y_root - root.winfo_y()
def title_drag(e): root.geometry(f"+{e.x_root - offx[0]}+{e.y_root - offy[0]}")

# right-click close
def on_right(e): root.destroy()
canvas.bind("<Button-3>", on_right)

# --- main loop ---
t = [0]
def frame():
    t[0] += 1
    canvas.delete("all")
    draw_bg(t[0])
    draw_links()
    for b in blobs:
        b.update(t[0], dragging[0])
        b.draw(t[0])
    root.after(33, frame)  # ~30fps

frame()
root.mainloop()
