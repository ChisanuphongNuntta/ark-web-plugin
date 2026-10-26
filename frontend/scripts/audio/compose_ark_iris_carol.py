"""Compose "Ark Iris Winter": a soft music-box carol for the IRIS website.

Melody: "Silent Night" (Franz Gruber, 1818, public domain). The arrangement, timbres and
mix below are original to this project, so the rendered file has no third-party recording
rights attached.  Everything is synthesised with numpy/scipy, then encoded by ffmpeg.

    python -I compose_ark_iris_carol.py <out.mp3>
"""
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter

SR = 44100
UNIT = 0.40  # seconds per eighth note (6/8 lullaby, ~ 50 bpm dotted quarter)
rng = np.random.default_rng(2026)

# --- melody in C major: (midi, units); 6 units per bar -------------------------
MELODY = [
    (67, 3), (69, 1), (67, 2), (64, 6),
    (67, 3), (69, 1), (67, 2), (64, 6),
    (74, 3), (74, 1), (71, 2), (72, 6),
    (72, 3), (72, 1), (67, 2), (69, 3), (69, 1), (72, 2),
    (71, 2), (69, 2), (67, 2), (69, 3), (67, 1), (64, 2),
    (69, 3), (69, 1), (72, 2), (71, 2), (69, 2), (67, 2), (69, 3), (67, 1), (64, 2),
    (74, 3), (74, 1), (77, 2), (74, 2), (71, 2), (72, 2), (76, 6),
    (72, 3), (67, 1), (64, 2), (67, 2), (65, 2), (62, 2), (60, 6),
]
CHORDS = {
    "C": (48, 55, 64),   # C3 G3 E4
    "F": (41, 53, 60),
    "G": (43, 50, 59),
    "Am": (45, 52, 60),
    "Em": (40, 47, 55),
    "Dm": (50, 57, 62),
}
PCS = {"C": {0, 4, 7}, "F": {5, 9, 0}, "G": {7, 11, 2}, "Am": {9, 0, 4}, "Em": {4, 7, 11}, "Dm": {2, 5, 9}}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bars_of(melody):
    bars, cur, t = [], [], 0
    for m, u in melody:
        cur.append((m, u, t))
        t += u
        if t % 6 == 0:
            bars.append(cur)
            cur = []
    if cur:
        bars.append(cur)
    return bars


def pick_chord(bar):
    pcs = [(m % 12, u) for m, u, _ in bar]
    best, score = "C", -1
    for name, tones in PCS.items():
        s = sum(u for pc, u in pcs if pc in tones)
        if name in ("C", "G") and s == score:
            best = name
        if s > score:
            best, score = name, s
    return best


def music_box(freq, dur, vel=1.0):
    n = int((dur + 2.6) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, tau in ((1.0, 1.0, 1.6), (2.0, 0.42, 0.9), (3.01, 0.2, 0.5), (4.17, 0.16, 0.32), (5.43, 0.07, 0.2), (6.8, 0.04, 0.12)):
        out += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / tau)
    # tiny comb "pluck" transient
    click = rng.standard_normal(int(0.004 * SR)) * 0.25
    out[: click.size] += click
    env_in = np.minimum(1.0, t / 0.002)
    return out * env_in * vel


def pad(freqs, dur):
    n = int((dur + 1.8) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.0035, 0.0, 0.0035):
            ph = rng.random() * 6.28
            out += np.sin(2 * np.pi * f * (1 + det) * t + ph) + 0.3 * np.sin(2 * np.pi * 2 * f * (1 + det) * t + ph)
    a = np.minimum(1.0, t / 1.1)
    r = np.clip((dur + 1.8 - t) / 1.7, 0, 1)
    return out * a * r * 0.11


def bell_noise(dur=0.22):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    b, a = butter(2, [5200 / (SR / 2), 9800 / (SR / 2)], btype="band")
    x = lfilter(b, a, x) * np.exp(-np.arange(n) / (0.045 * SR))
    return x


def shimmer(freq):
    n = int(3.2 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.005 * t)) * np.exp(-t / 0.9) * np.minimum(1, t / 0.006)


def place(buf, sig, at, gain, pan=0.0):
    i = int(at * SR)
    end = min(buf.shape[1], i + sig.size)
    if end <= i:
        return
    seg = sig[: end - i] * gain
    buf[0, i:end] += seg * (1 - max(0, pan))
    buf[1, i:end] += seg * (1 + min(0, pan))


def render_verse(buf, t0, verse):
    bars = bars_of(MELODY)
    for bi, bar in enumerate(bars):
        bar_t = t0 + bi * 6 * UNIT
        ch = CHORDS[pick_chord(bar)]
        place(buf, pad([hz(m) for m in ch], 6 * UNIT), bar_t, 1.0 if verse == 0 else 1.25, 0.0)
        # soft sleigh-bell sway on the two strong beats of every bar
        for beat in (0, 3):
            place(buf, bell_noise(), bar_t + beat * UNIT, 0.05 if verse == 0 else 0.07, rng.uniform(-0.5, 0.5))
        for m, u, off in bar:
            at = bar_t + off * UNIT
            place(buf, music_box(hz(m), u * UNIT, 1.0), at, 0.24, -0.1)
            if verse == 1:
                place(buf, music_box(hz(m + 12), u * UNIT, 0.7), at + 0.012, 0.11, 0.18)
        if verse == 1:
            # gentle arpeggio under the tune (harp-like music box, low register)
            for k, m in enumerate((ch[0] + 12, ch[1] + 12, ch[2], ch[1] + 12, ch[0] + 24, ch[1] + 12)):
                place(buf, music_box(hz(m), UNIT, 0.5), bar_t + k * UNIT, 0.075, rng.uniform(-0.3, 0.3))
        # Tek crystal shimmer: a very quiet high ping once per two bars
        if bi % 2 == 1:
            place(buf, shimmer(hz(ch[2] + 24)), bar_t + 2 * UNIT, 0.035, rng.uniform(-0.8, 0.8))


def reverb(x):
    n = int(2.9 * SR)
    t = np.arange(n) / SR
    ir = [rng.standard_normal(n) * np.exp(-t / 0.75) for _ in range(2)]
    b, a = butter(1, 6500 / (SR / 2))
    ir = [lfilter(b, a, i) for i in ir]
    wet = np.stack([fftconvolve(x[0], ir[0])[: x.shape[1]], fftconvolve(x[1], ir[1])[: x.shape[1]]])
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = x / (np.max(np.abs(x)) + 1e-9)
    return dry * 0.74 + wet * 0.5


def main(out):
    verse_len = len(bars_of(MELODY)) * 6 * UNIT
    total = verse_len * 2 + 5.0
    buf = np.zeros((2, int(total * SR)))
    render_verse(buf, 0.6, 0)
    render_verse(buf, 0.6 + verse_len, 1)

    # echo for the shimmer-y air (3/8 note delay, low feedback)
    d = int(UNIT * 3 * SR)
    echo = buf.copy()
    for k in range(1, 4):
        echo[:, k * d:] += buf[:, : buf.shape[1] - k * d] * (0.34 ** k) * (1 if k % 2 else -1 * 0 + 1)
    buf = echo
    mix = reverb(buf)

    # fades so the loop joins smoothly, then headroom for a quiet background track
    fi = int(2.5 * SR)
    fo = int(3.5 * SR)
    mix[:, :fi] *= np.linspace(0, 1, fi)
    mix[:, -fo:] *= np.linspace(1, 0, fo)
    mix = mix / np.max(np.abs(mix)) * 0.56  # about -5 dBFS peak; the player also attenuates

    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2").T.copy()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "112k", "-ar", "44100",
         "-metadata", "title=Ark Iris Winter", "-metadata", "artist=IRIS Thailand",
         "-metadata", "comment=Original arrangement of Silent Night (public domain melody)", out],
        check=True,
    )
    print(f"wrote {out}  duration={total:.1f}s  bars/verse={len(bars_of(MELODY))}")


if __name__ == "__main__":
    main(sys.argv[1])
