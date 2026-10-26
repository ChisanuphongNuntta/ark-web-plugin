"""Original ARK IRIS Xmas Exotic instrumental. No third-party melody or samples.

100 BPM, D harmonic minor, 48 bars, bells / plucked strings / hand drums / pads.
Run: python compose_ark_iris_xmas_exotic.py
Requires numpy, scipy and ffmpeg. Masters are kept outside the web bundle.
"""
from pathlib import Path
import json, math, subprocess, wave
import numpy as np
from scipy.signal import butter, sosfilt

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/audio'
MASTER=ROOT.parent/'artifacts/audio'
OUT.mkdir(parents=True,exist_ok=True); MASTER.mkdir(parents=True,exist_ok=True)
SR=44100; BPM=100; BEAT=60/BPM; BAR=BEAT*4; BARS=48
rng=np.random.default_rng(156340)
mix=np.zeros((int((BARS*BAR+4)*SR),2),dtype=np.float32)
def hz(m): return 440*2**((m-69)/12)
def place(sig,at,gain=.1,pan=0):
    start=int(at*SR);end=min(len(mix),start+len(sig))
    if end<=start:return
    sig=sig[:end-start]*gain
    mix[start:end,0]+=sig*math.sqrt((1-pan)/2)
    mix[start:end,1]+=sig*math.sqrt((1+pan)/2)
def bell(m,dur=2):
    t=np.arange(int(dur*SR))/SR; f=hz(m)
    y=np.zeros_like(t)
    for partial,amp,decay in [(1,1,1.15),(2.003,.35,.65),(3.99,.12,.28),(5.43,.045,.15)]:
        y+=amp*np.sin(2*np.pi*f*partial*t)*np.exp(-t/decay)
    return (y*np.minimum(t/.006,1)).astype(np.float32)
def pluck(m,dur=1.1):
    t=np.arange(int(dur*SR))/SR; f=hz(m)
    # Rounded resonant-string harmonics with a soft, woody attack.
    y=sum(np.sin(2*np.pi*f*k*t+.1*k)*np.exp(-t*(2.2+k*.72))/k**1.65 for k in range(1,8))
    y*=np.minimum(t/.008,1)
    return y.astype(np.float32)
def pad(notes,dur):
    t=np.arange(int((dur+1.3)*SR))/SR;y=np.zeros_like(t)
    for m in notes:
        for det in [-.0015,.0015]:
            y+=np.sin(2*np.pi*hz(m)*(1+det)*t+rng.random()*6.28)
    env=np.minimum(t/.8,1)*np.clip((dur+1.3-t)/1.4,0,1)
    return (y*env/len(notes)/2).astype(np.float32)
def bass(m,dur=.7):
    t=np.arange(int(dur*SR))/SR;f=hz(m)
    return ((np.sin(2*np.pi*f*t)+.14*np.sin(4*np.pi*f*t))*np.minimum(t/.018,1)*np.exp(-t/ .28)).astype(np.float32)
def drum(kind):
    dur=.5 if kind=='low' else .24;t=np.arange(int(dur*SR))/SR
    f=76 if kind=='low' else 188
    pitch=f*t+f*.009*(1-np.exp(-t/.009))
    y=np.sin(2*np.pi*pitch)*np.exp(-t/(.115 if kind=='low' else .055))
    noise=rng.normal(0,1,len(t))
    y+=sosfilt(butter(2,[1200,5000],btype='bandpass',fs=SR,output='sos'),noise)*np.exp(-t/.017)*.15
    return (y*np.minimum(t/.003,1)).astype(np.float32)
def sleigh():
    t=np.arange(int(.20*SR))/SR
    noise=sosfilt(butter(2,[5500,10000],btype='bandpass',fs=SR,output='sos'),rng.normal(0,1,len(t)))
    metal=sum(np.sin(2*np.pi*f*t) for f in [6201,7513,9187])/3
    return ((noise*.25+metal*.28)*np.exp(-t/.042)*np.minimum(t/.002,1)).astype(np.float32)

# Original eight-bar theme. The C# dominant cadence provides the exotic colour.
CHORDS=[(38,50,57,65),(34,50,58,65),(43,50,58,67),(33,49,57,64),
        (38,53,57,65),(36,52,55,64),(43,50,58,65),(33,49,57,64)]
MELODY=[[(74,1),(69,.5),(77,.5),(76,.5),(74,.5),(69,1)],
        [(70,.5),(74,.5),(77,1),(81,.5),(77,.5),(74,1)],
        [(79,1),(77,.5),(74,.5),(70,1),(74,1)],
        [(73,.5),(76,.5),(81,1),(79,.5),(76,.5),(73,1)],
        [(74,.5),(77,.5),(81,1),(86,1),(81,1)],
        [(79,1),(76,.5),(72,.5),(67,1),(72,1)],
        [(74,.5),(70,.5),(67,1),(69,1),(70,1)],
        [(73,.5),(76,.5),(69,1),(73,1),(74,1)]]
low=drum('low'); high=drum('high')
for bar in range(BARS):
    at=bar*BAR; chord=CHORDS[bar%8]
    main=8<=bar<40; bridge=24<=bar<40
    place(pad(chord[1:],BAR),at,.19 if main else .15)
    for k in range(8):
        m=chord[1+(k%3)]+(12 if k%4==3 else 0)
        place(pluck(m),at+k*BEAT/2,.095 if main else .08, -.45 if k%2 else .45)
    if main or bar>=4:
        for beat in [0,2]:place(bass(chord[0]),at+beat*BEAT,.25)
        for beat in [0,1.75,2.5]:place(low,at+beat*BEAT,.13 if main else .07,-.12)
        for beat in [.75,1.5,3,3.5]:place(high,at+beat*BEAT,.075 if main else .035,.3)
    for k in range(8):
        place(sleigh(),at+k*BEAT/2,.026*(1 if k%2==0 else .55), .55 if k%2 else -.55)
    if 8<=bar<44:
        off=0
        for note,length in MELODY[bar%8]:
            place(bell(note),at+off*BEAT,.15 if main else .1,-.12)
            if bridge and off in [0,2]:place(pluck(note-12),at+off*BEAT+.015,.085,.35)
            off+=length
    elif bar%2==0:
        place(bell(chord[-1]+12,2.5),at,.11,.2)
    if bar%8==7:place(bell(86,3),at+3.5*BEAT,.045,.65)

# Stereo dotted-eighth delay and restrained diffuse ambience.
dry=mix.copy()
for i,gain in [(1,.16),(2,.08),(3,.035)]:
    shift=int(BEAT*.75*i*SR)
    mix[shift:]+=dry[:-shift,::-1]*gain
for seconds,gain in [(.061,.035),(.113,.032),(.179,.026),(.263,.02)]:
    shift=int(seconds*SR);mix[shift:]+=dry[:-shift]*gain
mix=sosfilt(butter(2,11500,fs=SR,output='sos'),mix,axis=0)
mix[:int(SR*1.5)]*=np.linspace(0,1,int(SR*1.5))[:,None]
mix[-int(SR*5):]*=np.linspace(1,0,int(SR*5))[:,None]
mix=np.tanh(mix*.9)
mix*=.82/(np.max(np.abs(mix))+1e-9)
pcm=(mix*32767).astype('<i2')
master=MASTER/'ark-iris-xmas-exotic-v1-master.wav'
with wave.open(str(master),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
dest=OUT/'ark-iris-xmas-exotic-v1.mp3'
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(master),'-af','loudnorm=I=-20:TP=-2:LRA=9','-ar','44100','-codec:a','libmp3lame','-b:a','160k','-metadata','title=ARK IRIS Xmas Exotic','-metadata','artist=IRIS Thailand','-metadata','comment=Original composition and synthesis; no third-party samples or melody',str(dest)],check=True)
report={'title':'ARK IRIS Xmas Exotic','bpm':BPM,'key':'D harmonic minor','bars':BARS,'durationSeconds':len(mix)/SR,'original':True,'master':str(master),'webAsset':str(dest),'webBytes':dest.stat().st_size,'masterPeakDbfs':20*math.log10(float(np.max(np.abs(mix))))}
(MASTER/'ark-iris-xmas-exotic-v1.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
