#!/usr/bin/env python3
"""Звуки игры: скачать записи с Mixkit (бесплатная лицензия Mixkit, можно в играх, без указания автора)
и подготовить для Web Audio -> public/sounds/*.mp3 + manifest.json.

    python3 scripts/sounds.py      (нужны ffmpeg и numpy)

scripts/sounds.txt: «ключ id id ...» — ключ, по которому звук ищет src/audio.js, и номера звуков Mixkit
(https://mixkit.co/free-sound-effects/ — номер есть в адресе превью). Несколько id = случайный выбор.
Обработка: моно, срез ниже 40 Гц и выше 9 кГц (без резкости), выравнивание громкости (loudnorm),
обрезка тишины, фоновые звуки — бесшовные петли.
"""
import subprocess, json, sys, os, numpy as np
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=os.path.join(ROOT,'.cache','sounds'); OUT=os.path.join(ROOT,'public','sounds'); os.makedirs(OUT, exist_ok=True)
SR=44100
LOOPS={'wind':30,'drone':40,'roomtone':30,'radio_static':10,'musicbox':16,'phone_ring':8.7,'tv_static':10,'water_tap':8,'water_bath':8,'gas':12,'fridge':4.4}
LOUD={'wind':-26,'drone':-26,'roomtone':-32,'radio_static':-30,'tv_static':-30,'fridge':-30,'gas':-28,'water_tap':-24,'water_bath':-24,'musicbox':-22,'phone_ring':-20}
MAXLEN={'sting':5,'riser':7,'boom':4,'breath':4,'growl':4,'scream':3,'door_open':3,'door_close':2.5,'flush':3.5,'car_start':4,'drip':2.5,'paper':1.5}
def dec(f):
    raw=subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar',str(SR),'-af','highpass=f=40,lowpass=f=9000','-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).copy()
def enc(x,path,lufs):
    tmp=path+'.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','-','-af',f'loudnorm=I={lufs}:TP=-3:LRA=11',
                    '-ar',str(SR),'-c:a','libmp3lame','-b:a','96k',path],input=x.astype(np.float32).tobytes(),check=True)
def trim_lead(x,th=0.01):
    idx=np.where(np.abs(x)>th*np.abs(x).max())[0]
    if not len(idx): return x
    a=max(0,idx[0]-int(0.01*SR)); b=min(len(x),idx[-1]+int(0.05*SR)); return x[a:b]
def seamless(x,dur,F=1.5):
    n=min(len(x),int(dur*SR)+int(F*SR)); x=x[:n]; f=int(F*SR)
    y=x[:n-f].copy(); r=np.linspace(0,1,f)
    y[:f]=x[:f]*np.sqrt(r)+x[n-f:]*np.sqrt(1-r); return y
import urllib.request
os.makedirs(SRC, exist_ok=True)
def fetch(id):
    p=f'{SRC}/{id}.mp3'
    if not os.path.exists(p):
        u=f'https://assets.mixkit.co/active_storage/sfx/{id}/{id}-preview.mp3'
        open(p,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read())
man={}
for line in open(os.path.join(ROOT,'scripts','sounds.txt')):
    k,*ids=line.split()
    for i,id in enumerate(ids):
        fetch(id); x=dec(f'{SRC}/{id}.mp3')
        if k in LOOPS: x=seamless(x,LOOPS[k], F=min(1.5,len(x)/SR*0.15))
        else:
            x=trim_lead(x)
            if k in MAXLEN and len(x)>MAXLEN[k]*SR:
                x=x[:int(MAXLEN[k]*SR)]; f=int(0.6*SR); x[-f:]*=np.linspace(1,0,f)
            f=int(0.004*SR); x[:f]*=np.linspace(0,1,f)
        name=f'{k}_{i+1}.mp3'; enc(x,f'{OUT}/{name}',LOUD.get(k,-20))
        man.setdefault(k,[]).append(name)
json.dump(man,open(f'{OUT}/manifest.json','w'),indent=1,ensure_ascii=False)
print(len(sum(man.values(),[])),'files')
