"""Compose "ARK IRIS Aurora": a soft, fully original ambient piece for the IRIS website.

Melody, chords and timbres are original to this project (no existing tune), so the file carries no
third-party rights.  D major / B minor, 78 bpm, warm pads, glassy FM bells, a quiet pluck arpeggio and a
low heartbeat pulse.  Synthesised with numpy/scipy and encoded with ffmpeg.

    python -I compose_ark_iris_aurora.py <out.mp3>
"""
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter

SR = 44100
BPM = 78
BEAT = 60.0 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(1027)

# name -> (bass root, chord tones in mid register)
CH = {
    "Bm": (47, (59, 62, 66)),
    "G": (43, (55, 59, 62)),
    "D": (50, (54, 57, 62)),
    "A": (45, (57, 61, 64)),
    "Em": (40, (55, 59, 64)),
}

# each bar: (chord, [(beat offset, midi, beats)])
A = [
    ("Bm", [(0, 78, 1.5), (1.5, 76, .5), (2, 74, 2)]),
    ("G", [(0, 71, 1), (1, 74, 1), (2, 79, 2)]),
    ("D", [(0, 78, 1.5), (1.5, 81, .5), (2, 78, 2)]),
    ("A", [(0, 76, 1), (1, 73, 1), (2, 69, 2)]),
    ("Bm", [(0, 74, 1), (1, 78, 1), (2, 81, 1), (3, 78, 1)]),
    ("G", [(0, 79, 1.5), (1.5, 78, .5), (2, 74, 2)]),
    ("D", [(0, 78, 1), (1, 76, 1), (2, 74, 1), (3, 73, 1)]),
    ("A", [(0, 76, 3)]),
]
B = [
    ("G", [(0, 83, 1.5), (1.5, 81, .5), (2, 79, 2)]),
    ("D", [(0, 78, 2), (2, 74, 2)]),
    ("Em", [(0, 79, 1.5), (1.5, 76, .5), (2, 71, 2)]),
    ("A", [(0, 73, 1), (1, 76, 1), (2, 81, 2)]),
    ("G", [(0, 79, 1), (1, 83, 1), (2, 86, 2)]),
    ("D", [(0, 81, 1.5), (1.5, 78, .5), (2, 81, 2)]),
    ("Em", [(0, 79, 1), (1, 76, 1), (2, 74, 1), (3, 71, 1)]),
    ("A", [(0, 73, 1), (1, 76, 1), (2, 81, 2)]),
]
BRIDGE = [("Bm", [(0, 86, 4)]), ("G", [(0, 83, 4)]), ("D", [(0, 81, 2), (2, 78, 2)]), ("A", [(0, 76, 4)])]
INTRO = [("Bm", []), ("G", []), ("D", []), ("A", [])]
OUTRO = [("Bm", [(0, 78, 3)]), ("G", [(0, 74, 3)]), ("D", [(0, 78, 4)]), ("D", [])]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bell(freq, dur, vel=1.0):
    n = int((dur + 3.0) * SR)
    t = np.arange(n) / SR
    idx = 2.4 * np.exp(-t / 0.35)
    sig = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * 3.5 * t))
    sig += 0.35 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.7)
    return sig * np.exp(-t / 1.5) * np.minimum(1.0, t / 0.003) * vel


def pluck(freq, vel=1.0):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.15) + 0.15 * np.sin(2 * np.pi * freq * 3 * t) * np.exp(-t / 0.08)
    return sig * np.exp(-t / 0.28) * np.minimum(1.0, t / 0.002) * vel


def pad(freqs, dur):
    tail = 1.6
    n = int((dur + tail) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0.0, 0.004):
            ph = rng.random() * 6.28
            out += np.sin(2 * np.pi * f * (1 + det) * t + ph) + 0.28 * np.sin(2 * np.pi * 2 * f * (1 + det) * t + ph) + 0.1 * np.sin(2 * np.pi * 3 * f * t + ph)
    lfo = 0.88 + 0.12 * np.sin(2 * np.pi * 0.11 * t + rng.random() * 6.28)
    a = np.minimum(1.0, t / 1.3)
    r = np.clip((dur + tail - t) / tail, 0, 1)
    return out * a * r * lfo * 0.085


def sub(freq, dur):
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    env = np.minimum(1.0, t / 0.08) * np.clip((dur + 0.5 - t) / 0.5, 0, 1)
    return (np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)) * env * 0.5


def thump():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    f = 52 + 38 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)


def sparkle(freq):
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * freq * 2.01 * t)) * np.exp(-t / 0.55) * np.minimum(1, t / 0.004)


def place(buf, sig, at, gain, pan=0.0):
    i = int(at * SR)
    end = min(buf.shape[1], i + sig.size)
    if end <= i:
        return
    seg = sig[: end - i] * gain
    buf[0, i:end] += seg * (1 - max(0, pan))
    buf[1, i:end] += seg * (1 + min(0, pan))


def section(buf, t0, bars, lead=0.0, arp=0.0, pulse=0.0, double=False, sparkles=0.04):
    for bi, (name, notes) in enumerate(bars):
        bt = t0 + bi * BAR
        root, tones = CH[name]
        place(buf, pad([hz(m) for m in tones], BAR), bt, 1.0)
        place(buf, sub(hz(root), BAR), bt, 0.55)
        if arp:
            seq = (0, 1, 2, 1, 2, 1, 2, 1)
            for k, ix in enumerate(seq):
                m = tones[ix] + 12
                place(buf, pluck(hz(m)), bt + k * BEAT / 2, arp * (1.0 if k % 2 == 0 else 0.7), -0.3 + 0.6 * (k % 3) / 2)
        if pulse:
            for beat in (0, 2):
                place(buf, thump(), bt + beat * BEAT, pulse)
        for off, midi, beats in notes:
            at = bt + off * BEAT
            place(buf, bell(hz(midi), beats * BEAT), at, lead, -0.12)
            if double:
                place(buf, bell(hz(midi - 12), beats * BEAT, 0.8), at + 0.01, lead * 0.5, 0.15)
        if sparkles and bi % 2 == 1:
            place(buf, sparkle(hz(tones[2] + 24)), bt + rng.uniform(0.2, 2.5) * BEAT, sparkles, rng.uniform(-0.8, 0.8))


def reverb(x):
    n = int(3.2 * SR)
    t = np.arange(n) / SR
    ir = [rng.standard_normal(n) * np.exp(-t / 0.9) for _ in range(2)]
    b, a = butter(1, 5800 / (SR / 2))
    ir = [lfilter(b, a, i) for i in ir]
    wet = np.stack([fftconvolve(x[0], ir[0])[: x.shape[1]], fftconvolve(x[1], ir[1])[: x.shape[1]]])
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = x / (np.max(np.abs(x)) + 1e-9)
    return dry * 0.7 + wet * 0.52


def main(out):
    plan = [
        (INTRO, dict(lead=0.0, sparkles=0.05)),
        (A, dict(lead=0.26, arp=0.07)),
        (B, dict(lead=0.27, arp=0.08, pulse=0.05)),
        (A, dict(lead=0.27, arp=0.09, pulse=0.06, double=True)),
        (BRIDGE, dict(lead=0.24, sparkles=0.06)),
        (OUTRO, dict(lead=0.22, arp=0.05)),
    ]
    total_bars = sum(len(b) for b, _ in plan)
    total = total_bars * BAR + 6.0
    buf = np.zeros((2, int(total * SR)))
    t = 0.5
    for bars, kw in plan:
        section(buf, t, bars, **kw)
        t += len(bars) * BAR

    # soft echo (dotted eighth)
    d = int(BEAT * 0.75 * SR)
    echo = buf.copy()
    for k in range(1, 4):
        echo[:, k * d:] += buf[:, : buf.shape[1] - k * d] * (0.3 ** k)
    mix = reverb(echo)

    fi, fo = int(3.0 * SR), int(4.0 * SR)
    mix[:, :fi] *= np.linspace(0, 1, fi)
    mix[:, -fo:] *= np.linspace(1, 0, fo)
    mix = mix / np.max(np.abs(mix)) * 0.56

    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2").T.copy()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        wav_path = f.name
    with wave.open(wav_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-b:a", "128k", "-ar", "44100",
         "-metadata", "title=ARK IRIS Aurora", "-metadata", "artist=IRIS Thailand",
         "-metadata", "comment=Original composition", out],
        check=True,
    )
    print(f"wrote {out}  duration={total:.1f}s  bars={total_bars}")


if __name__ == "__main__":
    main(sys.argv[1])
