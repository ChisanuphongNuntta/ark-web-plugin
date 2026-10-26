"""ARK IRIS Happy Xmas Remix — original instrumental. No third-party melody or samples.

128 BPM, C major, 64 bars, festive bells / dance drums / bright arpeggios.
Run: python compose_ark_iris_happy_xmas.py
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
SR=44100; BPM=128; BEAT=60/BPM; BAR=BEAT*4; BARS=64
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

# A bright major-key rework of the original IRIS motif, with a dance-pop groove.
CHORDS=[(36,48,55,64),(43,50,55,62),(45,52,57,64),(41,48,57,65),
        (36,52,55,64),(43,50,59,67),(41,48,57,65),(43,50,55,62)]
MELODY=[[(76,.5),(79,.5),(84,1),(83,.5),(79,.5),(76,1)],
        [(74,.5),(79,.5),(83,1),(86,.5),(83,.5),(79,1)],
        [(81,1),(79,.5),(76,.5),(72,.5),(76,.5),(81,1)],
        [(77,.5),(81,.5),(84,1),(86,.5),(84,.5),(81,1)],
        [(88,.5),(86,.5),(84,1),(79,.5),(76,.5),(79,1)],
        [(86,.5),(83,.5),(79,1),(74,.5),(79,.5),(83,1)],
        [(84,.5),(81,.5),(77,1),(76,.5),(77,.5),(81,1)],
        [(83,.5),(79,.5),(74,.5),(79,.5),(76,1),(84,1)]]
def kick():
    t=np.arange(int(.35*SR))/SR
    phase=2*np.pi*(49*t+85*.018*(1-np.exp(-t/.018)))
    return (np.sin(phase)*np.exp(-t/.095)*np.minimum(t/.002,1)).astype(np.float32)
def clap():
    t=np.arange(int(.21*SR))/SR
    noise=sosfilt(butter(2,[1100,6800],btype='bandpass',fs=SR,output='sos'),rng.normal(0,1,len(t)))
    env=sum(np.where(t>=off,np.exp(-np.maximum(0,t-off)/.026),0) for off in [0,.011,.022])
    return (noise*env*.25*np.minimum(t/.001,1)).astype(np.float32)
def hat():
    t=np.arange(int(.1*SR))/SR
    noise=sosfilt(butter(2,7500,btype='highpass',fs=SR,output='sos'),rng.normal(0,1,len(t)))
    return (noise*np.exp(-t/.019)*.45).astype(np.float32)
k=kick(); c=clap(); h=hat()
for bar in range(BARS):
    at=bar*BAR; chord=CHORDS[bar%8]
    main=8<=bar<56; breakdown=32<=bar<40
    place(pad(chord[1:],BAR),at,.15)
    # Sparkling, alternating plucks keep the arrangement buoyant.
    for n in range(8):
        m=chord[1+n%3]+12
        place(pluck(m,.65),at+n*BEAT/2,.10 if main else .065,-.45 if n%2 else .45)
    if bar>=4:
        for beat in range(4):
            if not breakdown:place(k,at+beat*BEAT,.32 if main else .17)
            place(bass(chord[0]+(12 if beat==3 else 0),.4),at+(beat+.5)*BEAT,.23 if main else .11)
        for beat in [1,3]:
            if not breakdown:place(c,at+beat*BEAT,.16)
        for beat in [.5,1.5,2.5,3.5]:place(h,at+beat*BEAT,.11,.25)
    for n in range(8):
        place(sleigh(),at+n*BEAT/2,.038 if n%2==0 else .022,-.4 if n%2 else .4)
    if 4<=bar<60:
        off=0
        for note,length in MELODY[bar%8]:
            place(bell(note,1.5),at+off*BEAT,.15 if not breakdown else .10,-.10)
            if 40<=bar<56:place(pluck(note-12,.5),at+off*BEAT+.008,.095,.25)
            off+=length
    elif bar%2==0:place(bell(chord[-1]+24),at,.10,.15)
    if bar%8==7:
        for n,note in enumerate([79,81,83,84]):place(bell(note,1),at+(3+n/4)*BEAT,.075,.3)

# Stereo dotted-eighth delay and restrained diffuse ambience.
dry=mix.copy()
for i,gain in [(1,.16),(2,.08),(3,.035)]:
    shift=int(BEAT*.75*i*SR)
    mix[shift:]+=dry[:-shift,::-1]*gain
for seconds,gain in [(.061,.035),(.113,.032),(.179,.026),(.263,.02)]:
    shift=int(seconds*SR);mix[shift:]+=dry[:-shift]*gain
mix=sosfilt(butter(2,11500,fs=SR,output='sos'),mix,axis=0)
mix[:int(SR*1.5)]*=np.linspace(0,1,int(SR*1.5))[:,None]
mix[-int(SR*4):]*=np.linspace(1,0,int(SR*4))[:,None]
mix=np.tanh(mix*.9)
mix*=.82/(np.max(np.abs(mix))+1e-9)
pcm=(mix*32767).astype('<i2')
master=MASTER/'ark-iris-happy-xmas-remix-v1-master.wav'
with wave.open(str(master),'wb') as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes(pcm.tobytes())
dest=OUT/'ark-iris-happy-xmas-remix-v1.mp3'
subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(master),'-af','loudnorm=I=-18:TP=-2:LRA=8','-ar','44100','-codec:a','libmp3lame','-b:a','160k','-metadata','title=ARK IRIS Happy Xmas Remix','-metadata','artist=IRIS Thailand','-metadata','comment=Original composition and synthesis; no third-party samples or melody',str(dest)],check=True)
report={'title':'ARK IRIS Happy Xmas Remix','bpm':BPM,'key':'C major','bars':BARS,'durationSeconds':len(mix)/SR,'original':True,'master':str(master),'webAsset':str(dest),'webBytes':dest.stat().st_size,'masterPeakDbfs':20*math.log10(float(np.max(np.abs(mix))))}
(MASTER/'ark-iris-happy-xmas-remix-v1.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
