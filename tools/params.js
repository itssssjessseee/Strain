// ---------- parameter table ----------
const P={},IDS=[];
const pct=v=>Math.round(v*100)+'';
const bip=v=>(v>0?'+':'')+Math.round(v*100);
const fHz=v=>{const f=20*Math.pow(2,v*10);return f<1000?Math.round(f)+' Hz':(f/1000).toFixed(1)+' k';};
const fT=v=>{const t=0.001*Math.pow(10000,v);return t<1?Math.round(t*1000)+' ms':t.toFixed(1)+' s';};
const fInt=v=>(v>0?'+':'')+Math.round(v);
const LFN=['4 bar','2 bar','1 bar','3/4','1/2','1/4','1/8','1/16','1/32'];
const SRC=['—','LFO 1','LFO 2','LFO 3','Filter Env','Mod Env','Velocity','Key Track','Mod Wheel','Slide','Random','Amp Env'];
const DST=['—','Pitch','Osc 2 Pitch','Osc 3 Pitch','Osc 1 Shape','Osc 2 Shape','Osc 3 Shape','Warp','FM','Cutoff','Cutoff 2','Resonance','Filter Bal','Amp','Pan','Osc 1 Level','Osc 2 Level','Osc 3 Level','Noise','Drive','Sub'];
const WTN=['Spectra','Vox','Pulse','Bell','Digital','Organ'];
function D(id,label,def,sec,o){P[id]=Object.assign({id,label,def,sec,min:0,max:1,fmt:pct},o||{});IDS.push(id);}
for(let i=1;i<=3;i++){const o='o'+i;
  D(o+'mode','Mode',0,'osc',{opts:['Classic','Hyper','Wave']});
  D(o+'wt','Table',0,'osc',{opts:WTN});
  D(o+'shape','Shape',0.5,'osc',{fmt:(v,pt)=>pt[o+'mode']?pct(v):v<0.03?'Sine':Math.abs(v-0.5)<0.03?'Saw':v>0.97?'Pulse':pct(v)});
  D(o+'warp','Pulse W',0,'osc');
  D(o+'semi','Semi',0,'osc',{min:-36,max:36,step:1,fmt:fInt});
  D(o+'det','Detune',i===2?0.12:0,'osc',{min:-1,max:1,fmt:v=>fInt(v*50)+' c'});
  D(o+'lvl','Level',i===1?0.8:0,'osc');
}
D('fm','FM 1→2',0,'osc');D('sync','Sync 2→1',0,'osc',{tog:1});D('ring','Ring Mod',0,'osc');
D('sub','Sub',0,'osc');D('noise','Noise',0,'osc');D('ncol','Colour',0.7,'osc');
D('vmode','Voices',0,'glb',{opts:['Poly','Mono','Legato']});
D('uni','Unison',1,'osc',{min:1,max:4,step:1,fmt:v=>Math.round(v)+'×'});
D('udet','Uni Detune',0.3,'osc');D('uspread','Uni Width',0.7,'osc');
D('glide','Glide',0,'glb');D('drift','Drift',0.2,'osc');
D('f1type','Type',0,'flt',{opts:['Ladder 24','LP 12','Band','High','Notch']});
D('f1cut','Cutoff',0.7,'flt',{fmt:fHz});D('f1res','Reso',0.15,'flt');D('f1env','Env',0.3,'flt',{min:-1,max:1,fmt:bip});D('f1key','Key Trk',0.5,'flt');
D('f2type','Type',0,'flt',{opts:['Off','LP 12','Band','High','Notch']});
D('f2cut','Cutoff',0.5,'flt',{fmt:fHz});D('f2res','Reso',0.1,'flt');D('f2env','Env',0,'flt',{min:-1,max:1,fmt:bip});D('f2key','Key Trk',0,'flt');
D('route','Routing',0,'flt',{opts:['Serial','Parallel','Split']});
D('fbal','Balance',0,'flt',{min:-1,max:1,fmt:bip});
D('satType','Saturation',0,'flt',{opts:['Off','Soft','Hard','Fold','Rectify','Crush']});
D('drive','Drive',0.2,'flt');
[['a','Amp',[0,0.6,0.8,0.5]],['f','Filter',[0,0.55,0.3,0.5]],['m','Mod',[0,0.5,0,0.5]]].forEach(([k,n,d])=>{
  D(k+'A','Attack',d[0],'env',{fmt:fT});D(k+'D','Decay',d[1],'env',{fmt:fT});D(k+'S','Sustain',d[2],'env');D(k+'R','Release',d[3],'env',{fmt:fT});});
D('velAmp','Vel→Amp',0.5,'env');
[[0,0.55,0],[1,0.5,1],[5,0.2,0]].forEach((d,i)=>{const l='l'+(i+1);
  D(l+'shape','Wave',d[0],'mod',{opts:['Sine','Triangle','Saw','Square','S&H','Drift']});
  D(l+'rate','Rate',d[1],'mod',{fmt:(v,pt)=>pt[l+'sync']?LFN[Math.round(v*8)]:(()=>{const f=0.02*Math.pow(1500,v);return f<1?f.toFixed(2)+' Hz':f.toFixed(1)+' Hz';})()});
  D(l+'sync','Tempo',d[2],'mod',{tog:1});});
D('l1fade','Fade In',0,'mod',{fmt:v=>(v*v*3).toFixed(1)+' s'});
for(let j=0;j<8;j++){D('m'+j+'s','Source',j===0?6:j===1?9:0,'mod',{opts:SRC,hide:1});D('m'+j+'d','Dest',j<2?9:0,'mod',{opts:DST,hide:1});D('m'+j+'a','Amt',j===0?0.2:j===1?0.3:0,'mod',{min:-1,max:1,fmt:bip,hide:1});}
D('chRate','Rate',0.3,'fx');D('chDepth','Depth',0.5,'fx');D('chMix','Mix',0,'fx');
D('phRate','Rate',0.2,'fx');D('phDepth','Depth',0.6,'fx');D('phFb','Feedback',0.4,'fx');D('phMix','Mix',0,'fx');
D('dlTime','Time',2,'fx',{opts:['1/16','1/8','1/8 dot','1/4','1/4 dot','1/2','1/8 trip','1/4 trip']});
D('dlFb','Feedback',0.4,'fx');D('dlTone','Tone',0.6,'fx');D('dlMix','Mix',0,'fx');D('dlPing','Ping-pong',1,'fx',{tog:1});
D('rvSize','Size',0.5,'fx');D('rvDamp','Damp',0.4,'fx');D('rvMix','Mix',0.15,'fx');
D('boost','Low Boost',0,'fx');D('vol','Volume',0.7,'glb');
D('bpm','Tempo',120,'glb',{min:60,max:200,step:1,fmt:v=>Math.round(v)+''});
D('arpOn','Arp',0,'arp',{tog:1});D('arpHold','Latch',0,'arp',{tog:1});
D('arpMode','Mode',0,'arp',{opts:['Up','Down','Up/Down','Random','As Played','Chord']});
D('arpOct','Octaves',2,'arp',{min:1,max:4,step:1,fmt:v=>Math.round(v)+''});
D('arpDiv','Step',3,'arp',{opts:['1/4','1/8','1/8 trip','1/16','1/16 trip','1/32']});
D('arpGate','Gate',0.5,'arp');D('arpSwing','Swing',0,'arp');
for(let i=0;i<16;i++)D('ap'+i,'',i%4===0?2:1,'arp',{min:0,max:2,step:1,hide:1});
const DEF={};IDS.forEach(id=>DEF[id]=P[id].def);
const isKnob=d=>!d.opts&&!d.tog;

// ---------- factory patches ----------
const mm=(j,s,d,a)=>({['m'+j+'s']:s,['m'+j+'d']:d,['m'+j+'a']:a});
const pat=s=>{const o={};s.split('').forEach((c,i)=>o['ap'+i]=+c);return o;};
const PRESETS=[
 ['Solar Hyper','Lead',{o1mode:1,o1shape:.8,o1warp:.45,o2mode:1,o2semi:12,o2shape:.7,o2warp:.5,o2lvl:.45,f1type:1,f1cut:.8,f1res:.1,f1env:.12,aR:.58,chMix:.3,dlMix:.25,rvMix:.3,rvSize:.6,l1rate:.72,l1fade:.5,...mm(2,1,1,.07)}],
 ['Sync Razor','Lead',{o1lvl:0,o2lvl:.9,o2semi:7,o2det:0,sync:1,vmode:1,glide:.25,f1type:1,f1cut:.82,f1env:.1,mD:.62,mS:.15,satType:1,drive:.3,dlMix:.28,rvMix:.2,...mm(2,5,2,.75),...mm(3,9,2,.5),...mm(1,0,0,0)}],
 ['Hoover Bloom','Lead',{o1mode:1,o1shape:.9,o1warp:.7,o2shape:1,o2warp:.3,o2semi:-12,o2det:0,o2lvl:.7,vmode:1,glide:.2,uni:2,udet:.45,f1type:1,f1cut:.76,f1res:.2,mD:.4,l1rate:.6,chMix:.6,chDepth:.7,rvMix:.3,dlMix:.15,...mm(2,5,1,-.3),...mm(3,1,7,.35)}],
 ['Reese Engine','Bass',{o1semi:-12,o2semi:-12,o2det:.38,o2lvl:.8,vmode:1,glide:.22,f1cut:.42,f1res:.22,f1env:.1,satType:1,drive:.35,phMix:.35,phRate:.1,rvMix:0,boost:.4,aR:.35,...mm(2,3,9,.08)}],
 ['Acid Strain','Bass',{o1semi:-12,vmode:2,glide:.3,f1cut:.3,f1res:.8,f1env:.55,fD:.42,fS:0,aD:.55,aS:.5,aR:.3,satType:1,drive:.45,dlMix:.2,rvMix:.05,arpOn:1,arpOct:2,arpMode:2,arpGate:.55,...mm(0,6,9,.45),...pat('2011202110212012')}],
 ['Sub Monolith','Bass',{o1shape:.15,o1semi:-12,sub:.8,vmode:1,f1cut:.38,f1env:.3,fD:.4,fS:.1,satType:1,drive:.3,boost:.5,rvMix:0,aR:.3}],
 ['Cathedral','Pad',{o1mode:1,o1shape:.6,o1warp:.35,o2mode:2,o2wt:1,o2shape:.3,o2lvl:.6,o2det:0,uni:2,f1type:1,f1cut:.52,f1res:.1,f1env:.22,fA:.72,fD:.8,fS:.7,aA:.72,aR:.8,chMix:.5,rvMix:.55,rvSize:.82,...mm(2,3,5,.4)}],
 ['Vox Humana','Pad',{o1mode:2,o1wt:1,o1shape:.3,o2mode:2,o2wt:1,o2shape:.6,o2semi:12,o2lvl:.35,o2det:.08,uni:2,udet:.25,f1type:1,f1cut:.72,f1env:.1,aA:.62,aR:.72,l2shape:0,l2rate:.25,chMix:.35,rvMix:.5,rvSize:.7,...mm(2,2,4,.3),...mm(3,3,5,.3),...mm(1,9,4,.5)}],
 ['String Machine','Pad',{o1mode:1,o1shape:.5,o1warp:.3,o2shape:.9,o2warp:.2,o2semi:12,o2lvl:.3,f1type:1,f1cut:.66,f1env:.1,f2type:3,f2cut:.28,aA:.55,aR:.66,l1rate:.45,chMix:.7,phMix:.2,rvMix:.4,...mm(2,1,7,.25)}],
 ['Glass Pluck','Pluck',{o1mode:2,o1wt:3,o1shape:.6,o2lvl:.35,o2semi:12,o2det:.1,f1type:1,f1cut:.36,f1env:.6,fD:.42,fS:0,aD:.52,aS:0,aR:.48,dlMix:.35,rvMix:.35,chMix:.2}],
 ['Digital Rain','Pluck',{o1mode:2,o1wt:4,o1shape:.2,f1type:1,f1cut:.5,f1env:.5,fD:.4,fS:0,aD:.46,aS:0,aR:.42,l2shape:2,l2rate:.25,arpOn:1,arpOct:3,arpMode:2,dlMix:.4,rvMix:.3,...mm(2,2,4,.6),...pat('2110211021102111')}],
 ['Pulse Garden','Pluck',{o1mode:2,o1wt:2,o1shape:.1,o2shape:1,o2semi:-12,o2lvl:.4,o2det:.06,f1cut:.4,f1res:.3,f1env:.45,fD:.45,fS:.05,aD:.55,aS:.1,aR:.45,mD:.5,dlMix:.3,dlTime:1,rvMix:.25,...mm(2,5,4,.7)}],
 ['FM Tines','Keys',{o1shape:0,o1lvl:0,o1semi:12,o2shape:0,o2lvl:.9,o2det:0,fm:.3,sub:.15,f1type:1,f1cut:.92,f1env:0,aD:.72,aS:.25,aR:.5,mD:.48,chMix:.35,rvMix:.25,...mm(0,6,8,.35),...mm(2,5,8,.4)}],
 ['Brass Section','Keys',{o2lvl:.7,o2det:.15,f1cut:.36,f1res:.1,f1env:.45,fA:.32,fD:.55,fS:.5,aA:.25,aR:.4,chMix:.2,rvMix:.25,...mm(0,6,9,.35)}],
 ['Organ Loft','Keys',{o1mode:2,o1wt:5,o1shape:.5,o2mode:2,o2wt:5,o2shape:.85,o2semi:12,o2lvl:.35,o2det:0,f1type:1,f1cut:.86,f1env:0,aA:.08,aS:1,aR:.22,velAmp:.1,chMix:.5,chRate:.62,chDepth:.4,rvMix:.3}],
 ['Dark Matter','FX',{o1mode:2,o1wt:4,o1semi:-12,o1shape:.4,o2mode:1,o2semi:-5,o2lvl:.5,o2warp:.6,o2shape:.7,ring:.4,noise:.12,f1cut:.42,f1res:.5,f1env:.1,f2type:2,f2cut:.62,f2res:.6,route:1,aA:.8,aR:.9,l2rate:.2,phMix:.5,dlMix:.4,dlFb:.7,rvMix:.7,rvSize:.95,...mm(2,3,9,.3),...mm(3,2,14,.6),...mm(4,3,4,.5)}],
 ['Noise Riser','FX',{o1mode:1,o1lvl:.35,o1warp:.8,o1shape:1,noise:.8,ncol:.9,f1type:1,f1cut:.2,f1res:.55,f1env:0,mA:.88,mS:1,aA:.8,aS:1,aR:.6,phMix:.4,dlMix:.3,rvMix:.5,rvSize:.8,...mm(2,5,9,.75),...mm(3,5,1,.5),...mm(0,0,0,0)}],
 ['Init Saw','Init',{}]
];
const CATS=['Bass','Lead','Pad','Pluck','Keys','FX'];

// ---------- music theory ----------
const NN=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const SCALES={'Major':[0,2,4,5,7,9,11],'Minor':[0,2,3,5,7,8,10],'Dorian':[0,2,3,5,7,9,10],'Phrygian':[0,1,3,5,7,8,10],'Lydian':[0,2,4,6,7,9,11],'Mixolydian':[0,2,4,5,7,9,10],'Harm Minor':[0,2,3,5,7,8,11],'Pent Major':[0,2,4,7,9],'Pent Minor':[0,3,5,7,10],'Blues':[0,3,5,6,7,10],'Chromatic':[0,1,2,3,4,5,6,7,8,9,10,11]};
const CHSTEP={Triad:[0,2,4],'7th':[0,2,4,6],'9th':[0,2,4,6,8],Power:[0,4,7]};
// absolute degree index (0 = root at octave 0) -> midi note
function degNote(sc,root,d){const L=sc.length,o=Math.floor(d/L);return root+12*o+sc[d-o*L];}
// midi note -> nearest absolute degree at or below
function noteDeg(sc,root,n){const L=sc.length,r=n-root,o=Math.floor(r/12),pc=r-12*o;let i=0;for(let k=0;k<L;k++)if(sc[k]<=pc)i=k;return o*L+i;}
function chordFrom(sc,root,d,type){return CHSTEP[type].map(s=>degNote(sc,root,d+s));}
function chordName(notes){
  const r=notes[0],iv=notes.map(n=>((n-r)%12+12)%12),has=x=>iv.indexOf(x)>=0;
  let q=has(4)?(has(8)&&!has(7)?'aug':''):has(3)?(has(6)&&!has(7)?'dim':'m'):has(5)?'sus4':has(2)?'sus2':'5';
  if(notes.length>3&&q!=='5'){const nine=notes.length>4;
    if(has(11))q=(q==='m'?'m(maj':'maj')+(nine?'9':'7')+(q==='m'?')':'');
    else if(has(10))q=q==='dim'?'m7♭5':q+(nine?'9':'7');
    else if(has(9))q=q==='dim'?'dim7':q+'6';}
  return NN[((r%12)+12)%12]+q;
}
const ROM=['I','II','III','IV','V','VI','VII'];
const MOODS={Uplift:[[0,4,5,3],[3,0,4,5],[0,5,3,4],[0,2,3,4]],Dark:[[0,5,2,6],[0,3,5,4],[0,6,5,4],[0,5,3,6]],Dreamy:[[3,0,5,4],[0,2,5,3],[5,3,0,4],[1,4,0,5]],Tense:[[0,1,0,6],[0,4,5,1],[0,3,1,4],[5,4,0,0]],Epic:[[5,3,0,4],[0,4,5,2,3,0,3,4],[3,4,5,0],[0,0,5,6]]};
// returns [{name,rom,notes}] voice-led around middle C
function makeProgression(scName,root,mood,type,rnd){
  let sc=SCALES[scName];if(sc.length!==7)sc=sc.indexOf(3)>=0&&sc.indexOf(4)<0?SCALES.Minor:SCALES.Major;
  const T=MOODS[mood],degs=T[(rnd()*T.length)|0].slice();
  if(rnd()<0.35){const i=1+((rnd()*(degs.length-1))|0);degs[i]=(degs[i]+(rnd()<0.5?2:5))%7;}
  let centre=62;
  return degs.map(d=>{
    const raw=chordFrom(sc,root,d,type==='Power'?'Triad':type),r=raw[0];
    const up=raw.map(n=>{let m=n%12;while(m<centre-6)m+=12;return m;}).sort((a,b)=>a-b);
    centre=up.reduce((a,b)=>a+b,0)/up.length;
    let bass=((r%12)+12)%12+36;const notes=[bass].concat(up.filter((n,i)=>up.indexOf(n)===i));
    const minor=((raw[1]-raw[0])%12+12)%12===3;
    return {name:chordName(raw),rom:minor?ROM[d].toLowerCase():ROM[d],notes};
  });
}
// ---------- patch tools ----------
const NOMUT={vol:1,bpm:1,arpOn:1,arpHold:1,vmode:1,glide:1,dlPing:1,route:1,sync:1};
function gauss(rnd){return (rnd()+rnd()+rnd()+rnd()-2)*0.87;}
function sanitize(pt){
  if(pt.o1lvl+pt.o2lvl+pt.o3lvl+pt.sub+pt.noise<0.5)pt.o1lvl=0.8;
  if(pt.f1type<=1&&pt.f1cut+Math.max(0,pt.f1env)*0.6<0.25)pt.f1cut=0.3;
  if(pt.f1type===3&&pt.f1cut>0.6)pt.f1cut=0.5;
  if(pt.aS<0.05&&pt.aD<0.3)pt.aD=0.4;
  if(pt.f2type===0&&pt.route!==0)pt.route=0;
  pt.f1res=Math.min(pt.f1res,0.85);pt.dlFb=Math.min(pt.dlFb,0.8);
  return pt;
}
function mutate(src,amt,locks,rnd){
  const pt=Object.assign({},src);
  for(const id of IDS){const d=P[id];if(d.hide&&!/^m\da$/.test(id))continue;if(NOMUT[id]||locks[d.sec]||d.sec==='arp')continue;
    if(isKnob(d)){
      if(/^m\da$/.test(id)&&!pt[id])continue;
      if(rnd()<0.3+amt*0.5){const range=d.max-d.min;let v=pt[id]+gauss(rnd)*amt*range*(/semi$/.test(id)?0.12:0.3);
        v=Math.min(d.max,Math.max(d.min,v));if(d.step)v=Math.round(v/d.step)*d.step;
        if(/semi$/.test(id)){const ok=[-24,-12,-5,0,7,12,19,24];v=ok.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);}
        pt[id]=v;}
    }else if(d.opts&&!d.hide&&rnd()<amt*0.22)pt[id]=(rnd()*d.opts.length)|0;
  }
  return sanitize(pt);
}
function splice(a,b,locks,rnd){
  const pt=Object.assign({},a),pick={};
  ['osc','flt','env','mod','fx'].forEach(s=>pick[s]=rnd()<0.5);
  for(const id of IDS){const d=P[id];if(NOMUT[id]||locks[d.sec]||!pick[d.sec])continue;pt[id]=b[id];}
  return sanitize(pt);
}
