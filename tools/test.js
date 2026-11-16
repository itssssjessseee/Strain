const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync(__dirname+'/engine.js','utf8')+'\n'+fs.readFileSync(__dirname+'/params.js','utf8')+'\n;({makeEngine,DEF,PRESETS,makeProgression,mutate,splice,chordName,SCALES,chordFrom})';
const {makeEngine,DEF,PRESETS,makeProgression,mutate,splice,chordFrom,SCALES,chordName}=vm.runInThisContext(src);
let t0=Date.now();const Engine=makeEngine();const SR=48000;
let e=new Engine(SR);console.log('init ms',Date.now()-t0);
function run(e,secs,L,R){const n=128;let pk=0,sq=0,cnt=0,bad=0;const l=new Float32Array(n),r=new Float32Array(n);
  for(let s=0;s<secs*SR;s+=n){e.process(l,r,n);for(let i=0;i<n;i++){const a=l[i],b=r[i];if(!isFinite(a)||!isFinite(b))bad++;const m=Math.max(Math.abs(a),Math.abs(b));if(m>pk)pk=m;sq+=a*a+b*b;cnt+=2;}}
  return {pk,rms:Math.sqrt(sq/cnt),bad};}
for(const [name,cat,ov] of PRESETS){
  const e=new Engine(SR);const p=Object.assign({},DEF,ov);e.msg({t:'patch',p});
  const t=Date.now();
  const notes=cat==='Bass'?[36]:[60,64,67,71];
  notes.forEach(n=>e.msg({t:'on',n,v:0.8}));
  const a=run(e,2);notes.forEach(n=>e.msg({t:'off',n}));const b=run(e,1.5);
  const ms=Date.now()-t;
  console.log(name.padEnd(16),'pk',a.pk.toFixed(2),'rms',a.rms.toFixed(3),'tail',b.rms.toFixed(3),'bad',a.bad+b.bad,'cpu%',(ms/3500*100).toFixed(1));
}
// stress: 12 voices, 3 hyper oscs, dual filter, all fx
{const e=new Engine(SR);const p=Object.assign({},DEF,{o1mode:1,o2mode:1,o3mode:1,o2lvl:.8,o3lvl:.8,uni:4,f2type:1,chMix:.5,phMix:.5,dlMix:.5,rvMix:.5,satType:1});e.msg({t:'patch',p});
 [60,64,67].forEach(n=>e.msg({t:'on',n,v:.8}));const t=Date.now();const a=run(e,3);console.log('STRESS pk',a.pk.toFixed(2),'bad',a.bad,'cpu%',((Date.now()-t)/3000*100).toFixed(1));}
// random mutations for NaN hunting
{let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};let bad=0,maxpk=0,silent=0;
 for(let i=0;i<150;i++){const base=Object.assign({},DEF,PRESETS[i%PRESETS.length][2]);const p=mutate(base,1,{},rnd);p.arpOn=0;
  const e=new Engine(SR);e.msg({t:'patch',p});[48,60,67].forEach(n=>e.msg({t:'on',n,v:.9}));const a=run(e,0.8);bad+=a.bad;maxpk=Math.max(maxpk,a.pk);if(a.rms<0.003)silent++;}
 console.log('mutation fuzz: bad',bad,'maxpk',maxpk.toFixed(2),'silent',silent,'/150');}
// prog + arp
{const e=new Engine(SR);let chords=0;e.post=m=>{if(m.t==='chord')chords++;};const p=Object.assign({},DEF,{arpOn:1});e.msg({t:'patch',p});
 const pr=makeProgression('Minor',9,'Dark','7th',Math.random);console.log(pr.map(c=>c.rom+':'+c.name+' ['+c.notes+']').join('  '));
 e.msg({t:'prog',on:true,ch:pr.map(c=>c.notes),len:4});const a=run(e,5);e.msg({t:'prog',on:false});const b=run(e,3);
 console.log('prog chords',chords,'rms',a.rms.toFixed(3),'after stop',b.rms.toFixed(4),'bad',a.bad);}
// mono/legato
{const e=new Engine(SR);e.msg({t:'patch',p:Object.assign({},DEF,{vmode:2,glide:.3})});e.msg({t:'on',n:48,v:.8});run(e,.2);e.msg({t:'on',n:55,v:.8});run(e,.2);e.msg({t:'off',n:55});const a=run(e,.3);e.msg({t:'off',n:48});const b=run(e,2);
 console.log('legato rms',a.rms.toFixed(3),'released',b.rms.toFixed(4),'voices on',e.v.filter(v=>v.on).length);}
console.log(['Major','Minor'].map(s=>[0,1,2,3,4,5,6].map(d=>chordName(chordFrom(SCALES[s],60,d,'7th'))).join(' ')).join(' | '));
