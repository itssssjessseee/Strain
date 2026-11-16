// ---------- helpers & state ----------
const $=s=>document.querySelector(s);
const h=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.innerHTML=x;return e;};
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
let patch=Object.assign({},DEF,PRESETS[0][2]),patchName=PRESETS[0][0],patchIdx=0;
let user=[];try{user=JSON.parse(localStorage.getItem('strain.user')||'[]');}catch(e){}
const ctl={},undo=[];
let rootPc=9,scaleName='Minor',oct=3,chordMode='Off',layout=window.innerWidth<560?'pads':'keys';
// true when the page is hosted inside the plugin's web view; audio then runs in the host, not in Web Audio
const PLUG=!!(window.__JUCE__&&window.__JUCE__.backend);
const reg=(id,fn)=>(ctl[id]=ctl[id]||[]).push(fn);
const paint=id=>{const c=ctl[id];if(c)for(const f of c)f(patch[id]);};

// ---------- audio ----------
let ctx=null,node=null,eng=null,ready=false,analyser=null,waking=false;
const WSRC='const Engine=('+makeEngine.toString()+')();class S extends AudioWorkletProcessor{constructor(){super();this.e=new Engine(sampleRate);this.e.post=m=>this.port.postMessage(m);this.port.onmessage=ev=>this.e.msg(ev.data);}process(i,o){const c=o[0];this.e.process(c[0],c[1]||c[0],c[0].length);return true;}}registerProcessor("strain",S);';
const pend=[];
function send(m){if(PLUG){window.__JUCE__.backend.emitEvent('strain',m);return;}if(!ready){if(waking&&(m.t==='on'||m.t==='off'||m.t==='prog'))pend.push(m);return;}if(node)node.port.postMessage(m);else eng.msg(m);}
function onEng(m){if(m.t==='chord')document.querySelectorAll('#chords .pad').forEach((p,i)=>p.classList.toggle('now',i===m.i));}
function setStatus(on,txt){$('#led').classList.toggle('on',on);$('#stxt').textContent=txt;}
async function wake(){
  if(PLUG)return;
  if(ctx){if(ctx.state!=='running')ctx.resume().catch(()=>{});return;}
  if(waking)return;waking=true;
  try{
    ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
    analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.connect(ctx.destination);
    let mode='worklet';
    const mk=()=>{node=new AudioWorkletNode(ctx,'strain',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});node.port.onmessage=e=>onEng(e.data);node.connect(analyser);};
    try{const url=URL.createObjectURL(new Blob([WSRC],{type:'application/javascript'}));await ctx.audioWorklet.addModule(url);mk();}
    catch(e1){
      try{await ctx.audioWorklet.addModule('worklet.js');mk();}
      catch(e2){mode='compatibility';const E=makeEngine();eng=new E(ctx.sampleRate);eng.post=onEng;
        const sp=ctx.createScriptProcessor(1024,0,2);sp.onaudioprocess=ev=>{const b=ev.outputBuffer;eng.process(b.getChannelData(0),b.getChannelData(1),b.length);};sp.connect(analyser);window._sp=sp;}
    }
    ready=true;send({t:'patch',p:patch});pend.splice(0).forEach(send);
    ctx.resume().catch(()=>{});
    const upd=()=>setStatus(ctx.state==='running',ctx.state==='running'?'Audio on · '+Math.round(ctx.sampleRate/100)/10+' kHz · '+mode+' engine':'Tap once more to start audio.');
    ctx.onstatechange=upd;upd();scopeLoop();
  }catch(err){setStatus(false,'This browser blocked audio: '+err.message);}
}
['pointerup','click','keydown','touchend'].forEach(ev=>document.addEventListener(ev,()=>{if(ctx&&ctx.state!=='running')ctx.resume().catch(()=>{});},true));
function paintScope(buf,k){
  const cv=$('#scope'),g=cv.getContext('2d'),dpr=window.devicePixelRatio||1,w=cv.clientWidth*dpr|0,hh=cv.clientHeight*dpr|0,N=buf.length>>1;
  if(cv.width!==w||cv.height!==hh){cv.width=w;cv.height=hh;}
  g.clearRect(0,0,w,hh);
  let s=0;for(let i=1;i<N-1;i++)if(buf[i-1]<0&&buf[i]>=0){s=i;break;}
  g.beginPath();g.lineWidth=1.5*dpr;g.strokeStyle='#ff4a36';
  for(let i=0;i<N;i++){const x=i/(N-1)*w,y=hh/2-buf[s+i]*k*hh*0.48;i?g.lineTo(x,y):g.moveTo(x,y);}
  g.stroke();
}
function scopeLoop(){const buf=new Float32Array(1024);const draw=()=>{requestAnimationFrame(draw);analyser.getFloatTimeDomainData(buf);paintScope(buf,1);};draw();}

// ---------- parameter plumbing ----------
function setParam(id,v){patch[id]=v;send({t:'p',k:id,v});paint(id);if(/mode$|sync$/.test(id))relabel();}
const OSCLBL={shape:['Shape','Density','Position'],warp:['Pulse W','Detune','Bend']};
const relab=[];
function relabel(){relab.forEach(f=>f());['o1shape','o2shape','o3shape','l1rate','l2rate','l3rate'].forEach(paint);}
function paintAll(){IDS.forEach(paint);relabel();}
function loadPatch(pt,name,idx){patch=Object.assign({},DEF,pt);patchName=name;patchIdx=idx==null?-1:idx;send({t:'patch',p:patch});if(PLUG)send({t:'name',n:name});paintAll();corners=null;drawMorph();syncSel();}
function pushUndo(){undo.push({p:Object.assign({},patch),n:patchName,i:patchIdx});if(undo.length>40)undo.shift();}

// ---------- controls ----------
const ARC=89.54;
function knob(id,label){
  const d=P[id],el=h('div','knob');el.tabIndex=0;el.setAttribute('role','slider');el.setAttribute('aria-label',label||d.label);
  el.innerHTML='<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="trk" cx="24" cy="24" r="19" transform="rotate(135 24 24)" stroke-dasharray="'+ARC+' 200"/><circle class="arc" cx="24" cy="24" r="19" transform="rotate(135 24 24)"/><g class="ptr"><circle cx="24" cy="24" r="13.5"/><line x1="24" y1="12.5" x2="24" y2="18.5"/></g></svg><span class="kv"></span><span class="kl">'+(label||d.label)+'</span>';
  const arc=el.querySelector('.arc'),ptr=el.querySelector('.ptr'),kv=el.querySelector('.kv'),kl=el.querySelector('.kl'),bi=d.min<0,rng=d.max-d.min;
  reg(id,v=>{const t=(v-d.min)/rng,a=bi?Math.min(t,.5):0,b=bi?Math.max(t,.5):t;
    arc.setAttribute('stroke-dasharray','0 '+(a*ARC).toFixed(2)+' '+((b-a)*ARC).toFixed(2)+' 200');
    ptr.setAttribute('transform','rotate('+(-135+270*t).toFixed(1)+' 24 24)');kv.textContent=d.fmt(v,patch);el.setAttribute('aria-valuetext',kv.textContent);});
  const put=v=>{v=clamp(v,d.min,d.max);if(d.step)v=Math.round(v/d.step)*d.step;if(v!==patch[id])setParam(id,v);};
  let sx=0,sy=0,sv=0,last=0,drag=false;
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.focus({preventScroll:true});
    const now=performance.now();if(now-last<320){put(d.def);last=0;return;}last=now;
    try{el.setPointerCapture(e.pointerId);}catch(x){}drag=true;sx=e.clientX;sy=e.clientY;sv=patch[id];});
  el.addEventListener('pointermove',e=>{if(!drag)return;put(sv+((sy-e.clientY)+(e.clientX-sx))/(e.shiftKey?700:170)*rng);});
  const end=()=>{drag=false;};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('keydown',e=>{const st=d.step||rng/50;if(e.key==='ArrowUp'||e.key==='ArrowRight'){put(patch[id]+st);e.preventDefault();}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){put(patch[id]-st);e.preventDefault();}});
  el._kl=kl;return el;
}
function sel(id,label){
  const d=P[id],w=h('div','sel');
  if(d.opts.length<=3){w.appendChild(h('span','',label||d.label));const g=h('div','seg');
    d.opts.forEach((o,i)=>{const b=h('button','',o);b.type='button';b.onclick=()=>setParam(id,i);g.appendChild(b);});w.appendChild(g);
    reg(id,v=>[].forEach.call(g.children,(b,i)=>b.classList.toggle('on',i===v)));}
  else{const l=h('label','',label||d.label);l.htmlFor='s_'+id;const s=h('select');s.id='s_'+id;d.opts.forEach((o,i)=>s.add(new Option(o,i)));
    s.onchange=()=>setParam(id,+s.value);w.appendChild(l);w.appendChild(s);reg(id,v=>{s.value=v;});}
  return w;
}
function tog(id,label){const b=h('button','btn tog','<i></i>'+(label||P[id].label));b.type='button';b.onclick=()=>{wake();setParam(id,patch[id]?0:1);};reg(id,v=>{b.classList.toggle('on',!!v);b.setAttribute('aria-pressed',!!v);});return b;}
function btn(txt,fn,cls){const b=h('button','btn'+(cls?' '+cls:''),txt);b.type='button';b.onclick=fn;return b;}
function grp(title,top,knobs,cls){
  const g=h('section','grp'+(cls?' '+cls:''));g.appendChild(h('h3','',title));
  if(top&&top.length){const r=h('div','row');top.forEach(e=>r.appendChild(e));g.appendChild(r);}
  if(knobs&&knobs.length){const k=h('div','knobs');knobs.forEach(e=>k.appendChild(typeof e==='string'?knob(e):e));g.appendChild(k);}
  return g;
}

// ---------- panels ----------
const TABS=[['osc','Osc'],['flt','Filter'],['env','Env'],['lfo','LFO'],['mtx','Matrix'],['fx','FX'],['arp','Arp'],['muse','Muse',1],['evo','Evolve',1]];
const tabs={};
TABS.forEach(([id,name,fx],i)=>{
  const b=h('button',fx?'fx':'',name);b.type='button';b.onclick=()=>showTab(id);b.dataset.t=id;$('#tabs').appendChild(b);
  const p=h('div','tab');p.id='t_'+id;$('#panel').appendChild(p);tabs[id]=p;});
function showTab(id){for(const k in tabs)tabs[k].classList.toggle('on',k===id);document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===id));$('#panel').scrollTop=0;}

// oscillators
for(let i=1;i<=3;i++){const o='o'+i,ks=knob(o+'shape'),kw=knob(o+'warp'),wt=sel(o+'wt');
  relab.push(()=>{const m=patch[o+'mode'];ks._kl.textContent=OSCLBL.shape[m];kw._kl.textContent=OSCLBL.warp[m];wt.style.display=m===2?'':'none';});
  const top=[sel(o+'mode'),wt];if(i===2)top.push(tog('sync'));
  const kn=[ks,kw,o+'semi',o+'det',o+'lvl'];if(i===2)kn.push('fm');
  tabs.osc.appendChild(grp('Oscillator '+i,top,kn));}
tabs.osc.appendChild(grp('Mixer',[],['sub','noise','ncol','ring']));
tabs.osc.appendChild(grp('Voice',[sel('vmode')],['uni','udet','uspread','glide','drift']));
// filters
tabs.flt.appendChild(grp('Filter 1',[sel('f1type')],['f1cut','f1res','f1env','f1key']));
tabs.flt.appendChild(grp('Filter 2',[sel('f2type')],['f2cut','f2res','f2env','f2key']));
tabs.flt.appendChild(grp('Routing and saturation',[sel('route'),sel('satType')],['fbal','drive']));
// envelopes
tabs.env.appendChild(grp('Amp envelope',[],['aA','aD','aS','aR','velAmp']));
tabs.env.appendChild(grp('Filter envelope',[],['fA','fD','fS','fR']));
tabs.env.appendChild(grp('Mod envelope',[],['mA','mD','mS','mR']));
// lfos
for(let i=1;i<=3;i++){const l='l'+i;tabs.lfo.appendChild(grp('LFO '+i,[sel(l+'shape'),tog(l+'sync')],i===1?[l+'rate','l1fade']:[l+'rate']));}
// matrix
{const g=grp('Modulation matrix',[],[]);g.appendChild(h('p','','Eight slots. Each sends one source to one destination. Slide is finger movement up or down a key after you press it.'));
  for(let j=0;j<8;j++){const r=h('div','mrow'),s=h('select'),d=h('select'),a=h('input'),o=h('output');
    s.id='mx_s'+j;d.id='mx_d'+j;a.id='mx_a'+j;s.setAttribute('aria-label','Slot '+(j+1)+' source');d.setAttribute('aria-label','Slot '+(j+1)+' destination');a.setAttribute('aria-label','Slot '+(j+1)+' amount');
    SRC.forEach((n,i)=>s.add(new Option(n,i)));DST.forEach((n,i)=>d.add(new Option(n,i)));a.type='range';a.min=-1;a.max=1;a.step=0.01;
    s.onchange=()=>setParam('m'+j+'s',+s.value);d.onchange=()=>setParam('m'+j+'d',+d.value);a.oninput=()=>setParam('m'+j+'a',+a.value);
    reg('m'+j+'s',v=>{s.value=v;});reg('m'+j+'d',v=>{d.value=v;});reg('m'+j+'a',v=>{a.value=v;o.textContent=bip(v);});
    r.appendChild(s);r.appendChild(a);r.appendChild(o);r.appendChild(d);g.appendChild(r);}
  g.style.gridColumn='1/-1';tabs.mtx.appendChild(g);}
// fx
tabs.fx.appendChild(grp('Chorus',[],['chRate','chDepth','chMix']));
tabs.fx.appendChild(grp('Phaser',[],['phRate','phDepth','phFb','phMix']));
tabs.fx.appendChild(grp('Delay',[sel('dlTime'),tog('dlPing')],['dlFb','dlTone','dlMix']));
tabs.fx.appendChild(grp('Reverb',[],['rvSize','rvDamp','rvMix']));
tabs.fx.appendChild(grp('Output',[],['boost','vol']));
// arp
{tabs.arp.appendChild(grp('Arpeggiator',[tog('arpOn'),tog('arpHold'),sel('arpMode'),sel('arpDiv')],['arpOct','arpGate','arpSwing','bpm']));
  const g=grp('Step pattern',[],[]);g.appendChild(h('p','','Tap a step to cycle rest, note, accent.'));
  const st=h('div','steps');
  for(let i=0;i<16;i++){const b=h('button');b.type='button';b.setAttribute('aria-label','Step '+(i+1));b.onclick=()=>setParam('ap'+i,patch['ap'+i]===1?2:patch['ap'+i]===2?0:1);reg('ap'+i,v=>{b.className=v?'s'+v:'';});st.appendChild(b);}
  g.appendChild(st);
  const r=h('div','row');
  r.appendChild(btn('Roll a rhythm',()=>{const k=5+((Math.random()*8)|0),rot=(Math.random()*16)|0;let acc=0;
    for(let i=0;i<16;i++){const j=(i+rot)%16;acc+=k;let v=0;if(acc>=16){acc-=16;v=Math.random()<0.3?2:1;}setParam('ap'+j,v);}if(!patch.ap0)setParam('ap0',2);}));
  r.appendChild(btn('Fill all',()=>{for(let i=0;i<16;i++)setParam('ap'+i,i%4?1:2);}));
  g.appendChild(r);tabs.arp.appendChild(g);}

// ---------- muse: chord progressions ----------
let mood='Dark',ctype='7th',clen=4,prog=[],playing=false;
function sendProg(){send({t:'prog',on:playing,ch:prog.map(c=>c.notes),len:clen});}
function roll(){prog=makeProgression(scaleName,rootPc,mood,ctype,Math.random);drawProg();if(playing)sendProg();}
function drawProg(){const box=$('#chords');box.innerHTML='';
  prog.forEach(c=>{const p=h('button','pad','<b>'+c.name+'</b><span>'+c.rom+'</span>');p.type='button';
    const up=()=>{if(p._on){p._on=false;p.classList.remove('dn');c.notes.forEach(n=>send({t:'off',n}));}};
    p.addEventListener('pointerdown',e=>{e.preventDefault();wake();try{p.setPointerCapture(e.pointerId);}catch(x){}p._on=true;p.classList.add('dn');c.notes.forEach(n=>send({t:'on',n,v:0.75}));});
    p.addEventListener('pointerup',up);p.addEventListener('pointercancel',up);box.appendChild(p);});}
function uiSeg(label,opts,get,set){const w=h('div','sel');w.appendChild(h('span','',label));const g=h('div','seg');
  const upd=()=>[].forEach.call(g.children,(b,i)=>b.classList.toggle('on',opts[i]===get()));
  opts.forEach(o=>{const b=h('button','',o);b.type='button';b.onclick=()=>{set(o);upd();};g.appendChild(b);});w.appendChild(g);upd();return w;}
{const g=grp('Chord progression',[],[],'fxg');
  g.appendChild(h('p','','Rolls a progression in the key set above the keyboard. Hold a chord to hear it, or press Play to loop it. Turn on the arp to have it follow the chords.'));
  const r1=h('div','row');
  r1.appendChild(uiSeg('Mood',Object.keys(MOODS),()=>mood,v=>{mood=v;roll();}));
  r1.appendChild(uiSeg('Colour',['Triad','7th','9th'],()=>ctype,v=>{ctype=v;roll();}));
  r1.appendChild(uiSeg('Beats per chord',['2','4','8'],()=>''+clen,v=>{clen=+v;if(playing)sendProg();}));
  g.appendChild(r1);
  const c=h('div','pads');c.id='chords';g.appendChild(c);
  const r2=h('div','row');
  const pb=btn('▶ Play',()=>{wake();playing=!playing;pb.innerHTML=playing?'■ Stop':'▶ Play';pb.classList.toggle('hot',playing);
    sendProg();if(!playing)document.querySelectorAll('#chords .pad').forEach(p=>p.classList.remove('now'));},'');
  r2.appendChild(pb);r2.appendChild(btn('Roll again',roll));r2.appendChild(tog('arpOn','Arp'));r2.appendChild(tog('arpHold','Latch'));
  g.appendChild(r2);const k=h('div','knobs');k.appendChild(knob('bpm'));k.appendChild(knob('arpGate'));k.appendChild(knob('arpOct'));g.appendChild(k);
  g.style.gridColumn='1/-1';tabs.muse.appendChild(g);}

// ---------- evolve: generate, mutate, morph ----------
const locks={};let mAmt=0.3,corners=null,mx=0.5,my=0.5,genN=0;
const MORPH=IDS.filter(id=>isKnob(P[id])&&!NOMUT[id]&&P[id].sec!=='arp');
const tag=()=>(((Math.random()*0xffff)|0).toString(16).toUpperCase()+'000').slice(0,4);
function scatter(){corners=[Object.assign({},patch),mutate(patch,0.45,locks,Math.random),mutate(patch,0.45,locks,Math.random),mutate(patch,0.75,locks,Math.random)];mx=0;my=0;drawMorph();}
function drawMorph(){const m=$('#mh');if(!m)return;m.style.display=corners?'':'none';m.style.left=mx*100+'%';m.style.top=my*100+'%';}
let morphRaf=0;
function morph(){morphRaf=0;const w=[(1-mx)*(1-my),mx*(1-my),(1-mx)*my,mx*my],o={};
  for(const id of MORPH){let v=0;for(let c=0;c<4;c++)v+=w[c]*corners[c][id];if(P[id].step)v=Math.round(v);if(v!==patch[id]){patch[id]=v;o[id]=v;paint(id);}}
  send({t:'patch',p:o});drawMorph();}
{const g1=grp('Generate',[],[],'fxg');g1.appendChild(h('p','','Start a new patch from a family. Each press gives a different one.'));
  const r=h('div','chips');CATS.forEach(c=>r.appendChild(btn(c,()=>{wake();pushUndo();const pool=PRESETS.filter(p=>p[1]===c),b=pool[(Math.random()*pool.length)|0];
    const pt=mutate(Object.assign({},DEF,b[2]),0.4,{},Math.random);loadPatch(pt,c+' '+tag());})));g1.appendChild(r);tabs.evo.appendChild(g1);
  const g2=grp('Mutate',[],[],'fxg');g2.appendChild(h('p','','Nudge the current patch. Low amounts keep its character, high amounts go somewhere new. Locked sections stay as they are.'));
  const ar=h('div','row'),al=h('label','sel','Amount');al.htmlFor='mAmt';al.style.flex='1';const a=h('input');a.type='range';a.id='mAmt';a.min=0.05;a.max=1;a.step=0.01;a.value=mAmt;a.oninput=()=>{mAmt=+a.value;};al.appendChild(a);ar.appendChild(al);g2.appendChild(ar);
  const br=h('div','row');
  br.appendChild(btn('Mutate',()=>{wake();pushUndo();loadPatch(mutate(patch,mAmt,locks,Math.random),patchName.replace(/ ·\d+$/,'')+' ·'+(++genN));},'hot'));
  br.appendChild(btn('Splice',()=>{wake();pushUndo();const b=PRESETS[(Math.random()*(PRESETS.length-1))|0];loadPatch(splice(patch,Object.assign({},DEF,b[2]),locks,Math.random),patchName.split(' × ')[0]+' × '+b[0]);}));
  br.appendChild(btn('Undo',()=>{const u=undo.pop();if(u)loadPatch(u.p,u.n,u.i);}));g2.appendChild(br);
  const lr=h('div','chips');lr.style.alignItems='center';lr.appendChild(h('span','sel','Lock'));[['osc','Osc'],['flt','Filter'],['env','Env'],['mod','Mod'],['fx','FX']].forEach(([k,n])=>{const b=btn(n,()=>{locks[k]=!locks[k];b.classList.toggle('on',!!locks[k]);b.setAttribute('aria-pressed',!!locks[k]);});lr.appendChild(b);});
  g2.appendChild(lr);tabs.evo.appendChild(g2);
  const g3=grp('Morph pad',[],[],'fxg');g3.appendChild(h('p','','Drag between four versions of the patch. Scatter fills B, C and D with variations of the current sound. Store saves the current sound to a corner.'));
  const pad=h('div','','<em>A</em><em>B</em><em>C</em><em>D</em><div id="mh"></div>');pad.id='morph';
  const mv=e=>{const r=pad.getBoundingClientRect();mx=clamp((e.clientX-r.left)/r.width,0,1);my=clamp((e.clientY-r.top)/r.height,0,1);if(!morphRaf)morphRaf=requestAnimationFrame(morph);};
  let md=false;pad.addEventListener('pointerdown',e=>{e.preventDefault();wake();if(!corners)scatter();try{pad.setPointerCapture(e.pointerId);}catch(x){}md=true;mv(e);});
  pad.addEventListener('pointermove',e=>{if(md)mv(e);});const me=()=>{md=false;};pad.addEventListener('pointerup',me);pad.addEventListener('pointercancel',me);
  g3.appendChild(pad);
  const sr=h('div','chips');sr.appendChild(btn('Scatter',()=>{scatter();},'hot'));
  'ABCD'.split('').forEach((n,i)=>sr.appendChild(btn('Store '+n,()=>{if(!corners)corners=[0,1,2,3].map(()=>Object.assign({},patch));corners[i]=Object.assign({},patch);mx=i%2;my=i>>1;drawMorph();})));
  g3.appendChild(sr);tabs.evo.appendChild(g3);}

// ---------- patch browser ----------
function buildSel(){const s=$('#pSel');s.innerHTML='';const cur=new Option('','-1');cur.hidden=true;s.add(cur);
  const cats={};PRESETS.forEach((p,i)=>{(cats[p[1]]=cats[p[1]]||[]).push(new Option(p[0],i));});
  for(const c in cats){const g=h('optgroup');g.label=c;cats[c].forEach(o=>g.appendChild(o));s.appendChild(g);}
  if(user.length){const g=h('optgroup');g.label='Saved';user.forEach((u,i)=>g.appendChild(new Option(u.n,1000+i)));s.appendChild(g);}}
function syncSel(){const s=$('#pSel');if(patchIdx>=0)s.value=patchIdx;else{s.options[0].text=patchName;s.options[0].hidden=false;s.value='-1';}}
function pick(i){if(i>=1000){const u=user[i-1000];if(u)loadPatch(u.p,u.n,i);}else{const p=PRESETS[i];loadPatch(p[2],p[0],i);}}
$('#pSel').onchange=e=>{pushUndo();pick(+e.target.value);};
const stepPatch=d=>{const n=PRESETS.length;let i=patchIdx>=0&&patchIdx<1000?patchIdx:(d>0?-1:0);pushUndo();pick(((i+d)%n+n)%n);};
$('#pPrev').onclick=()=>stepPatch(-1);$('#pNext').onclick=()=>stepPatch(1);
$('#pSave').onclick=()=>{const n=patchName.replace(/ \(saved\)$/,'')+' (saved)';user.push({n,p:Object.assign({},patch)});if(user.length>24)user.shift();
  let ok=true;try{localStorage.setItem('strain.user',JSON.stringify(user));}catch(e){ok=false;}
  buildSel();patchName=n;patchIdx=1000+user.length-1;syncSel();if(PLUG)send({t:'name',n});$('#pSave').textContent=ok?'Saved':'Saved for this visit';setTimeout(()=>{$('#pSave').textContent='Save';},1600);};

// ---------- keyboard ----------
const kb=$('#kb'),strip=$('#strip'),touches=new Map(),BLACK=[1,3,6,8,10];
function sc(){return SCALES[scaleName];}
function inScale(n){return sc().indexOf(((n-rootPc)%12+12)%12)>=0;}
function chordOf(n){return chordMode==='Off'?[n]:chordFrom(sc(),rootPc,noteDeg(sc(),rootPc,n),chordMode).filter(x=>x<=120);}
function buildKb(){
  kb.innerHTML='';kb.className=layout==='pads'?'padsL':'';
  if(layout==='keys'){
    const W=kb.clientWidth||360,nW=clamp(Math.floor(W/36),7,24),base=12*(oct+1),ww=100/nW;let n=base,wi=0;
    while(wi<nW){const pc=n%12,blk=BLACK.indexOf(pc)>=0,k=h('div','key '+(blk?'b':'w'));k.dataset.n=n;
      if(scaleName!=='Chromatic'){if(inScale(n))k.classList.add('in');else k.classList.add('out');}
      if(pc===rootPc)k.classList.add('in','root');
      if(blk){k.style.left='calc('+(wi*ww)+'% - '+(ww*0.3)+'%)';k.style.width=(ww*0.6)+'%';}else wi++;
      kb.appendChild(k);n++;}
  }else{
    const s=sc(),L=s.length,cols=L>8?L:L+1;
    for(let r=1;r>=0;r--){const row=h('div','prow');
      for(let i=0;i<cols;i++){const k=h('div','key p');
        const nn=degNote(s,rootPc+12,(oct-1+r)*L+i);k.dataset.n=nn;
        if(((nn-rootPc)%12+12)%12===0)k.classList.add('root');
        k.textContent=chordMode==='Off'?NN[nn%12]+(Math.floor(nn/12)-1):chordName(chordOf(nn));row.appendChild(k);}
      kb.appendChild(row);}
  }
}
function keyAt(e){const el=document.elementFromPoint(e.clientX,e.clientY);return el&&el.closest?el.closest('.key'):null;}
function kDown(e){const k=keyAt(e);if(!k)return;const r=k.getBoundingClientRect(),yf=clamp((e.clientY-r.top)/r.height,0,1);
  const notes=chordOf(+k.dataset.n),v=e.pointerType==='mouse'?0.8:0.5+0.5*yf;notes.forEach(n=>send({t:'on',n,v}));k.classList.add('dn');
  touches.set(e.pointerId,{k,notes,y0:e.clientY,hgt:r.height});}
function kUp(id){const t=touches.get(id);if(!t)return;t.notes.forEach(n=>send({t:'off',n}));t.k.classList.remove('dn');touches.delete(id);}
kb.addEventListener('pointerdown',e=>{e.preventDefault();wake();try{kb.setPointerCapture(e.pointerId);}catch(x){}kDown(e);});
kb.addEventListener('pointermove',e=>{const t=touches.get(e.pointerId);if(!t)return;const k=keyAt(e);
  if(k&&k!==t.k){kUp(e.pointerId);kDown(e);}else{const s=clamp((t.y0-e.clientY)/t.hgt*1.6,-1,1);t.notes.forEach(n=>send({t:'slide',n,v:s}));}});
['pointerup','pointercancel'].forEach(ev=>kb.addEventListener(ev,e=>kUp(e.pointerId)));
kb.addEventListener('contextmenu',e=>e.preventDefault());
// strip
{const ol=h('span','oct'),setO=d=>{oct=clamp(oct+d,0,6);ol.textContent='Oct '+oct;buildKb();};
  strip.appendChild(btn('−',()=>setO(-1)));strip.appendChild(ol);strip.appendChild(btn('+',()=>setO(1)));ol.textContent='Oct '+oct;
  strip.children[0].setAttribute('aria-label','Octave down');strip.children[2].setAttribute('aria-label','Octave up');
  const ks=h('select');ks.id='keySel';ks.setAttribute('aria-label','Key');NN.forEach((n,i)=>ks.add(new Option(n,i)));ks.value=rootPc;ks.onchange=()=>{rootPc=+ks.value;buildKb();roll();};strip.appendChild(ks);
  const ss=h('select');ss.id='scaleSel';ss.setAttribute('aria-label','Scale');Object.keys(SCALES).forEach(n=>ss.add(new Option(n,n)));ss.value=scaleName;ss.onchange=()=>{scaleName=ss.value;buildKb();roll();};strip.appendChild(ss);
  const lb=btn(layout==='pads'?'Scale pads':'Piano',()=>{layout=layout==='pads'?'keys':'pads';lb.textContent=layout==='pads'?'Scale pads':'Piano';buildKb();});strip.appendChild(lb);
  const cs=h('select');cs.id='chordSel';cs.setAttribute('aria-label','Chord mode');['Off','Triad','7th','9th','Power'].forEach(n=>cs.add(new Option(n==='Off'?'Chords off':'Chords: '+n,n)));cs.onchange=()=>{chordMode=cs.value;buildKb();};strip.appendChild(cs);
  strip.appendChild(tog('arpOn','Arp'));
  strip.appendChild(btn('All notes off',()=>{send({t:'panic'});touches.clear();document.querySelectorAll('.key.dn').forEach(k=>k.classList.remove('dn'));}));
  const mb=btn('MIDI',()=>{if(!navigator.requestMIDIAccess){mb.textContent='No MIDI here';return;}
    navigator.requestMIDIAccess().then(m=>{const hook=()=>{let c=0;m.inputs.forEach(i=>{c++;i.onmidimessage=ev=>{const [st,a,b]=ev.data,cmd=st&0xf0;wake();
        if(cmd===0x90&&b>0)send({t:'on',n:a,v:b/127});else if(cmd===0x80||cmd===0x90)send({t:'off',n:a});
        else if(cmd===0xb0&&a===1)send({t:'mw',v:b/127});else if(cmd===0xe0)send({t:'bend',v:((b<<7|a)-8192)/8192});};});
        mb.textContent=c?'MIDI: '+c+' in':'MIDI: none found';mb.classList.toggle('on',c>0);};hook();m.onstatechange=hook;}).catch(()=>{mb.textContent='MIDI blocked';});});
  if(!PLUG)strip.appendChild(mb);}
// computer keyboard
const KMAP={a:0,w:1,s:2,e:3,d:4,f:5,t:6,g:7,y:8,h:9,u:10,j:11,k:12,o:13,l:14,p:15},kheld={};
document.addEventListener('keydown',e=>{if(e.repeat||e.metaKey||e.ctrlKey||/INPUT|SELECT/.test(e.target.tagName)||e.target.classList.contains('knob'))return;
  const k=e.key.toLowerCase();if(k==='z'||k==='x'){strip.children[k==='z'?0:2].click();return;}
  if(k in KMAP&&!kheld[k]){wake();const notes=chordOf(12*(oct+1)+KMAP[k]);kheld[k]=notes;notes.forEach(n=>send({t:'on',n,v:0.8}));}});
document.addEventListener('keyup',e=>{const k=e.key.toLowerCase(),n=kheld[k];if(n){n.forEach(x=>send({t:'off',n:x}));delete kheld[k];}});
if(!PLUG)window.addEventListener('blur',()=>send({t:'panic'}));
let rz=0;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(buildKb,150);});

// ---------- boot ----------
buildSel();showTab('osc');paintAll();syncSel();buildKb();roll();drawMorph();

// ---------- plugin bridge ----------
if(PLUG){
  setStatus(true,'Running as a plugin. Audio, MIDI and tempo come from the host.');
  window.__JUCE__.backend.addEventListener('strain',m=>{
    if(m.t==='state'){Object.assign(patch,m.p);if(m.n){patchName=m.n;patchIdx=PRESETS.findIndex(p=>p[0]===m.n);}paintAll();syncSel();}
    else if(m.t==='pv'){patch[m.k]=m.v;paint(m.k);if(/mode$|sync$/.test(m.k))relabel();}
    else if(m.t==='chord')onEng(m);
    else if(m.t==='scope')paintScope(m.d,0.001);
  });
  send({t:'hello'});
}
