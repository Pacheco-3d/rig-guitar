#!/usr/bin/env python3
"""Generate original cabinet FIRs and transparent, artist-inspired starting presets."""
from pathlib import Path
import base64, json, math, struct, wave
ROOT=Path(__file__).resolve().parents[1]
irs=[]
for id,name,cutoff,resonance in [('studio-reference','Studio Reference 4×12',6200,.18),('warm-vintage','Warm Vintage 1×12',4300,.28),('bright-open','Bright Open 2×12',7800,.12)]:
 rate=48000;n=1024;coeff=[]
 for i in range(n):
  t=i-96
  sinc=2*cutoff/rate if not t else math.sin(2*math.pi*cutoff/rate*t)/(math.pi*t)
  window=.5-.5*math.cos(2*math.pi*i/(n-1))
  coeff.append(sinc*window)
 # Short original cabinet-like resonance/reflections; not a measured commercial cabinet.
 original=coeff[:]
 for delay,level in [(29,resonance),(67,-resonance*.65),(131,resonance*.3)]:
  for i in range(delay,n):coeff[i]+=original[i-delay]*level
 norm=sum(abs(v) for v in coeff);coeff=[v/max(1,norm) for v in coeff]
 path=ROOT/'library/irs'/f'{id}.wav'
 with wave.open(str(path),'wb') as f:f.setparams((1,2,rate,0,'NONE','not compressed'));f.writeframes(b''.join(struct.pack('<h',round(v*32767)) for v in coeff))
 irs.append({'id':path.name,'name':name,'source':'Original synthetic FIR, not a measured cabinet','license':'CC0-1.0','sampleRate':rate,'samples':n,'base64':base64.b64encode(path.read_bytes()).decode()})
# Values: gain,bass,middle,treble,presence,master. Effects: compressor,drive,delay,reverb.
entries=[
 ('Glass Clean','Clean de estúdio',None,'american',[1.8,5,4.5,6.5,5,7],False,False,False,True,[3,1.8]),
 ('Edge of Dublin','U2 / The Edge','Where the Streets Have No Name','american',[3,4.5,6,6.5,6,6],True,True,True,True,[6.5,4]),
 ('Comfort Lead','Pink Floyd / David Gilmour','Comfortably Numb','british',[5.5,5,7,5,5,7],True,True,True,True,[5.3,3]),
 ('Shine Clean','Pink Floyd / David Gilmour','Shine On You Crazy Diamond','american',[2.4,5,5.5,6,5.5,7],True,False,True,True,[4,2.5]),
 ('Sweet Lead','Guns N’ Roses / Slash','Sweet Child O’ Mine','british',[7.5,5,8,6,6,7],True,True,True,False,[3,2]),
 ('Black Rhythm','Metallica','Enter Sandman','modern',[8,7,3,6.5,6,6.5],False,True,False,False,[3,0]),
 ('Puppet Rhythm','Metallica','Master of Puppets','modern',[8.5,6,2.5,7,6.5,6],False,True,False,False,[3,0]),
 ('Back in Crunch','AC/DC / Angus Young','Back in Black','british',[6,5,7,6.5,6,7],False,False,False,False,[3,0]),
 ('Little Wing Glass','Jimi Hendrix','Little Wing','american',[4,5.5,6.5,5.5,5,7],True,True,False,True,[3,2]),
 ('Texas Snap','Stevie Ray Vaughan','Pride and Joy','american',[5,6,6,6,6,7],False,True,False,True,[2,1.5]),
 ('Brown Lead','Van Halen / Eddie Van Halen','Eruption','british',[8.5,5.5,7,6,6,6.5],True,True,True,True,[2.5,2]),
 ('Teenage Fuzz','Nirvana / Kurt Cobain','Smells Like Teen Spirit','modern',[8,6,5.5,7,5.5,6.5],False,True,False,False,[3,0]),
 ('Purple Rain Space','Prince','Purple Rain','american',[4,5,6,6.5,5,7],True,True,True,True,[5,3]),
 ('Sultans Clean','Dire Straits / Mark Knopfler','Sultans of Swing','american',[2.8,4.5,6,6.5,5.5,7],True,False,False,True,[2,1.2]),
 ('Sabbath Weight','Black Sabbath / Tony Iommi','Iron Man','british',[8,7,7.5,5.5,5,6.5],False,True,False,False,[3,0]),
 ('Seven Nation','The White Stripes / Jack White','Seven Nation Army','modern',[7,7,6,4.5,4,6],False,True,False,False,[3,0]),
 ('Arena Lead','Queen / Brian May','Bohemian Rhapsody','british',[7,5,8,6,7,6.5],True,True,True,True,[3.5,2.5]),
 ('Ambient Horizon','Ambient / worship',None,'american',[2.5,4.5,5,6,5,7],True,False,True,True,[7,5]),
]
presets=[]
for name,artist,song,model,values,comp,drive,delay,reverb,echo in entries:
 presets.append({'name':name,'tag':f'{model.upper()} · '+('CLEAN' if values[0]<4 else 'DRIVE'),'description':('Ponto de partida inspirado em '+artist+(' — '+song if song else '')+'. Ajuste à sua guitarra; não é preset oficial ou reprodução exata.'),'inspiration':{'artist':artist,'song':song,'official':False},'model':model,'values':values,'pedals':[{'on':comp,'values':[4,5]},{'on':drive,'values':[3 if values[0]<5 else 5,5]},{'on':delay,'values':echo},{'on':reverb,'values':[6 if delay else 3,4 if name=='Ambient Horizon' else 2]}],'irId':'warm-vintage.wav' if model=='american' else 'studio-reference.wav','master':55,'microphone':0,'favorite':name in ['Comfort Lead','Sweet Lead','Glass Clean']})
(ROOT/'library/presets/inspired.json').write_text(json.dumps(presets,ensure_ascii=False,indent=2)+'\n')
manifest={'version':1,'license':'CC0-1.0','description':'Original synthetic FIRs and unofficial inspired presets. No commercial IRs or official artist presets.','irs':[{k:v for k,v in ir.items() if k!='base64'} for ir in irs]}
(ROOT/'library/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
all_presets=json.loads((ROOT/'library/presets/base.json').read_text())+presets
(ROOT/'library/presets/factory.json').write_text(json.dumps(all_presets,ensure_ascii=False,indent=2)+'\n')
(ROOT/'library.js').write_text('window.RigFactoryPresets = '+json.dumps(all_presets,ensure_ascii=False)+';\nwindow.RigCabinetIrs = '+json.dumps(irs,ensure_ascii=False)+';\n')
print(f'Generated {len(presets)} inspired presets and {len(irs)} original FIRs.')
