function makeEngine(){
'use strict';
const TAU=6.283185307179586,NV=12,TS=2048,NT=6,NF=8,NM=7;
const HC=[0,-1,1,-0.57,0.57,-0.18,0.18];
const ARPDIV=[1,0.5,1/3,0.25,1/6,0.125];
const DLB=[0.25,0.5,0.75,1,1.5,2,1/3,2/3];
const LFB=[16,8,4,3,2,1,0.5,0.25,0.125];
const RVB=[1153,1327,1559,1801,2069,2311,2617,2903];
const clp=(x,a,b)=>x<a?a:x>b?b:x;
const tanh=x=>{if(x>3)return 1;if(x<-3)return -1;const x2=x*x;return x*(27+x2)/(27+9*x2);};
function pb(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
// classic oscillator: sine -> saw -> pulse morph, band-limited
function cv(ph,inc,sh,w){
  const saw=2*ph-1-pb(ph,inc);
  if(sh<0.5){const s=-Math.sin(TAU*ph);return s+(saw-s)*sh*2;}
  let p2=ph+w;if(p2>=1)p2-=1;
  const pul=saw-(2*p2-1-pb(p2,inc));
  return saw+(pul-saw)*(sh-0.5)*2;
}
function es(env,S,ca,cd,cr){
  if(env.s===1){env.v+=(1.25-env.v)*ca;if(env.v>=1){env.v=1;env.s=2;}}
  else if(env.s===2){env.v+=(S-env.v)*cd;}
  else if(env.s===3){env.v-=env.v*cr;if(env.v<1e-4){env.v=0;env.s=0;}}
  return env.v;
}
function svf(sv,j,x,k,a1,a2,a3,type,bg){
  const v3=x-sv[j+1],v1=a1*sv[j]+a2*v3,v2=sv[j+1]+a2*sv[j]+a3*v3;
  sv[j]=2*v1-sv[j];sv[j+1]=2*v2-sv[j+1];
  return type===1?v2:type===2?v1*bg:type===3?x-k*v1-v2:x-k*v1;
}
function sat(x,type,g,mk){
  switch(type){
    case 1:return tanh(x*g)*mk;
    case 2:x*=g;return (x>1?1:x<-1?-1:x)*mk;
    case 3:return Math.sin(x*g);
    case 4:return (Math.abs(tanh(x*g))-0.35)*1.4*mk;
    case 5:return Math.round(x*g)/g;
  }
  return x;
}
// ---------- wavetables ----------
let WT=null;
function amp(t,x,h){
  switch(t){
    case 0:{const c=1+x*x*70,lp=1/(1+Math.pow(h/c,4)),d=(h-c)/(0.2*c+0.6);return (1/h)*lp*(1+1.5*Math.exp(-d*d));}
    case 1:{const V=[[800,1150,2900],[400,2000,2600],[270,2300,3000],[450,800,2830],[325,700,2700]];
      const v=x*4,i=Math.min(3,Math.floor(v)),f=v-i,fr=h*110;let a=0;
      for(let k=0;k<3;k++){const F=V[i][k]+(V[i+1][k]-V[i][k])*f,bw=90+k*40+F*0.04,d=(fr-F)/bw;a+=Math.exp(-d*d)*(k===0?1:k===1?0.6:0.3);}
      return a+(h===1?0.35:h===2?0.15:0.01/h);}
    case 2:{const d=0.5-x*0.45;return Math.sin(Math.PI*h*d)/h;}
    case 3:{const B=[1,3,5,9,13,19,27,37],i=B.indexOf(h);return i<0?0:Math.exp(-i*(1.3-x*1.1))*(i%2?0.8:1);}
    case 4:{const c=0.5+0.5*Math.cos(h*(0.35+x*2.6));return c*c/Math.pow(h,0.8);}
    default:{const D=[1,2,3,4,6,8,10,12,16],i=D.indexOf(h);if(i<0)return 0;
      return [1,0.9-x*0.5,0.3+x*0.6,x*0.9,0.5*x,x*x,0.4*x*x,0.3*x*x,0.5*x*x*x+0.02][i];}
  }
}
function buildWT(){
  const sinT=new Float32Array(TS);for(let i=0;i<TS;i++)sinT[i]=Math.sin(TAU*i/TS);
  const W=[];
  for(let t=0;t<NT;t++){const F=[];
    for(let f=0;f<NF;f++){const x=f/(NF-1),acc=new Float32Array(TS),M=new Array(NM);let h=1;
      for(let m=NM-1;m>=0;m--){const H=256>>m;
        for(;h<=H;h++){const a=amp(t,x,h);if(Math.abs(a)<1e-5)continue;
          for(let i=0,j=0;i<TS;i++){acc[i]+=a*sinT[j];j=(j+h)&(TS-1);}}
        const b=new Float32Array(TS+1);b.set(acc);b[TS]=acc[0];M[m]=b;}
      let pk=0,sq=0;for(let i=0;i<TS;i++){const a=M[0][i];sq+=a*a;if(Math.abs(a)>pk)pk=Math.abs(a);}
      const rms=Math.sqrt(sq/TS),g=Math.min(1.5/(pk||1),0.5/(rms||1));
      for(let m=0;m<NM;m++){const b=M[m];for(let i=0;i<=TS;i++)b[i]*=g;}
      F.push(M);}
    W.push(F);}
  return W;
}
function osc(q,m,f,s,w){
  if(m===0){let ph=q.ph+f;if(ph>=1||ph<0){q.w=ph>=1?1:0;ph-=Math.floor(ph);}else q.w=0;q.ph=ph;
    const a=f<0?-f:f;return cv(ph,a>0.49?0.49:a,s,w);}
  if(m===1){const hp=q.hp,hi=q.hi;let sum=0;
    for(let k=0;k<7;k++){const d=hi[k];let ph=hp[k]+d;
      if(ph>=1){ph-=1;if(k===0)q.w=1;}else if(k===0)q.w=0;
      hp[k]=ph;let v=2*ph-1;
      if(ph<d){const t=ph/d;v-=t+t-t*t-1;}else if(ph>1-d){const t=(ph-1)/d;v-=t*t+t+t+1;}
      sum+=k?v*s:v;}
    q.ph=hp[0];return sum*q.nm;}
  let ph=q.ph+f;if(ph>=1||ph<0){q.w=ph>=1?1:0;ph-=Math.floor(ph);}else q.w=0;q.ph=ph;
  const pw=q.pw,pd=ph<pw?ph*0.5/pw:0.5+(ph-pw)*0.5/(1-pw),x=pd*TS,i=x|0,fr=x-i,A=q.tA,B=q.tB,a=A[i]+(A[i+1]-A[i])*fr;
  return a+(B[i]+(B[i+1]-B[i])*fr-a)*q.ff;
}
// ---------- voice ----------
class Voice{
  constructor(e){this.e=e;this.on=false;this.gate=false;this.key=-1;this.note=60;this.cur=60;this.vel=0;this.age=0;this.pan=0;this.ud=0;this.rnd=0;this.slide=0;this.id=0;
    this.o=[0,1,2].map(()=>({ph:0,z:0,w:0,nm:1,hp:new Float32Array(7),hi:new Float32Array(7),tA:null,tB:null,ff:0,pw:0.5}));
    this.sp=0;this.nz=0;this.aE={v:0,s:0};this.fE={v:0,s:0};this.mE={v:0,s:0};
    this.ld=new Float64Array(4);this.sv=new Float64Array(4);this.md=new Float32Array(24);this.dr=0;this.drT=0;this.drG=0;}
  start(n,vel,k,u,leg,poly){
    const e=this.e,fresh=!this.on;
    this.key=n;this.note=n;this.vel=vel;this.gate=true;this.id=++e.vid;
    this.ud=u>1?k/(u-1)*2-1:0;this.pan=this.ud;
    if(e.p.glide>0&&e.last>=0){if(fresh||poly)this.cur=e.last;}else this.cur=n;
    if(fresh){this.aE.v=this.fE.v=this.mE.v=0;this.ld.fill(0);this.sv.fill(0);this.nz=0;this.sp=0;this.slide=0;this.dr=0;
      for(const q of this.o){q.ph=u>1?Math.random():0;q.z=0;for(let j=0;j<7;j++)q.hp[j]=Math.random();}}
    if(!leg){this.aE.s=this.fE.s=this.mE.s=1;this.age=0;this.rnd=Math.random()*2-1;}
    this.on=true;
  }
  release(){this.gate=false;if(this.aE.s)this.aE.s=3;if(this.fE.s)this.fE.s=3;if(this.mE.s)this.mE.s=3;}
  render(L,R,off,n){
    const e=this.e,p=e.p,md=this.md,sr=e.sr,o=this.o;
    this.age+=n;
    const fE=es(this.fE,p.fS,e.cfA,e.cfD,e.cfR),mE=es(this.mE,p.mS,e.cmA,e.cmD,e.cmR);
    md.fill(0);
    const sl=e.slots;
    if(sl.length){const fd=e.fadeN>0?Math.min(1,this.age/e.fadeN):1;
      for(let j=0;j<sl.length;j++){const s=sl[j];let x;
        switch(s.s){case 1:x=e.lfo[0]*fd;break;case 2:x=e.lfo[1];break;case 3:x=e.lfo[2];break;case 4:x=fE;break;case 5:x=mE;break;
          case 6:x=this.vel;break;case 7:x=(this.cur-60)/24;break;case 8:x=e.mw;break;case 9:x=this.slide;break;case 10:x=this.rnd;break;default:x=this.aE.v;}
        md[s.d]+=x*s.a;}}
    this.cur+=(this.note-this.cur)*e.glc;
    if((this.drT-=n)<=0){this.drG=Math.random()*2-1;this.drT=sr*(0.15+Math.random()*0.5);}
    this.dr+=(this.drG-this.dr)*0.004;
    const base=this.cur+e.bend*2+md[1]+this.ud*p.udet*0.45+this.dr*p.drift*0.2;
    const inc=e.tI,lv=e.tL,sh=e.tS,wp=e.tW,om=e.om;
    for(let i=0;i<3;i++){
      const st=base+e.ose[i]+e.ode[i]*0.5+(i===1?md[2]:i===2?md[3]:0);
      let f=440*Math.pow(2,(st-69)/12)/sr;if(f>0.45)f=0.45;
      inc[i]=f;lv[i]=clp(e.olv[i]+md[15+i],0,1);sh[i]=clp(e.osh[i]+md[4+i],0,1);
      const w=clp(e.owp[i]+md[7],0,1),q=o[i],m=om[i];
      if(m===0)wp[i]=0.5+w*0.45;
      else if(m===1){const d=w*w*0.06+0.0004;for(let k=0;k<7;k++)q.hi[k]=f*(1+d*HC[k]);q.nm=0.9/Math.sqrt(1+6*sh[i]*sh[i]);}
      else{const pos=sh[i]*(NF-1);let f0=pos|0;if(f0>NF-2)f0=NF-2;q.ff=pos-f0;
        let mm=Math.ceil(Math.log2(512*f));mm=mm<0?0:mm>NM-1?NM-1:mm;
        const T=WT[e.owt[i]];q.tA=T[f0][mm];q.tB=T[f0+1][mm];q.pw=0.5-w*0.45;}
    }
    const fm=clp(p.fm*p.fm*8+md[8]*8,0,12),ring=p.ring,sync=p.sync>0&&om[1]===0;
    const l1=lv[0],l2=lv[1],l3=lv[2],ls=clp(p.sub+md[20],0,1),ln=clp(p.noise+md[18],0,1);
    const on2=l2>0||ring>0,on1=l1>0||ring>0||(on2&&(fm>0||sync)),on3=l3>0;
    const m1=om[0],m2=om[1],m3=om[2],i1=inc[0],i2b=inc[1],i3=inc[2],s1=sh[0],s2=sh[1],s3=sh[2],w1=wp[0],w2=wp[1],w3=wp[2];
    const o1=o[0],o2=o[1],o3=o[2],subI=i1*0.5,nc=0.02+p.ncol*p.ncol*0.98;
    // filters
    const kt=(this.cur-60)/12;
    let fc=clp(20*Math.pow(2,e.sC1*10+p.f1env*fE*8+p.f1key*kt+md[9]*8),20,sr*0.45);
    const g1=Math.tan(Math.PI*fc/sr),r1=clp(p.f1res+md[11],0,1),t1=p.f1type|0;
    let G=0,G2=0,G3=0,G4=0,k1=0,lg=1,a11=0,a12=0,a13=0,bg1=1;
    if(t1===0){G=g1/(1+g1);G2=G*G;G3=G2*G;G4=G3*G;k1=r1*4.2;lg=1.7*(1+k1*0.15);}
    else{k1=2-1.92*r1;a11=1/(1+g1*(g1+k1));a12=g1*a11;a13=g1*a12;bg1=0.5+0.5*k1;}
    const t2=p.f2type|0;let k2=0,a21=0,a22=0,a23=0,bg2=1;
    if(t2){fc=clp(20*Math.pow(2,e.sC2*10+p.f2env*fE*8+p.f2key*kt+(md[9]+md[10])*8),20,sr*0.45);
      const g2=Math.tan(Math.PI*fc/sr);k2=2-1.92*clp(p.f2res,0,1);a21=1/(1+g2*(g2+k2));a22=g2*a21;a23=g2*a22;bg2=0.5+0.5*k2;}
    const route=p.route|0,bal=clp(p.fbal+md[12],-1,1),bp=bal>0?bal:0,bn=bal<0?-bal:0,bm=(bal+1)*0.5,ga=Math.min(1,2-2*bm),gb=Math.min(1,2*bm);
    const st=p.satType|0,drv=clp(p.drive+md[19],0,1),sg=st===5?Math.pow(2,7-drv*6):1+drv*drv*24,smk=1/(1+drv*1.2);
    const u=clp(p.uni|0,1,4),ag=(1-p.velAmp+p.velAmp*this.vel)*clp(1+md[13],0,2)*0.42/Math.sqrt(u);
    const pn=clp(this.pan*p.uspread+md[14],-1,1),gl=Math.cos((pn+1)*0.7853981634)*ag,gr=Math.sin((pn+1)*0.7853981634)*ag;
    const aE=this.aE,aS=p.aS,caA=e.caA,caD=e.caD,caR=e.caR,ld=this.ld,sv=this.sv;
    for(let i=0;i<n;i++){
      const a=es(aE,aS,caA,caD,caR);
      let x1=0,x2=0,x3=0;
      if(on1)x1=osc(o1,m1,i1,s1,w1);
      if(on2){
        const f2=fm>0?i2b*(1+fm*x1):i2b;
        if(sync){
          let ph=o2.ph+f2;if(ph>=1||ph<0)ph-=Math.floor(ph);
          const af=f2<0?-f2:f2,ai=af>0.49?0.49:af;let v=cv(ph,ai,s2,w2);
          if(o1.w){const t=o1.ph/i1;let np=t*f2;np-=Math.floor(np);const vr=cv(np,ai,s2,w2),h=vr-v;o2.z+=h*t*t*0.5;v=vr-h*(1-t)*(1-t)*0.5;ph=np;}
          o2.ph=ph;x2=o2.z;o2.z=v;
        }else x2=osc(o2,m2,f2,s2,w2);
      }
      if(on3)x3=osc(o3,m3,i3,s3,w3);
      let A=x1*l1,B=x2*l2+x3*l3+x1*x2*ring;
      if(ls>0){let sp=this.sp+subI;if(sp>=1)sp-=1;this.sp=sp;A+=Math.sin(TAU*sp)*ls;}
      if(ln>0){e.seed=(Math.imul(e.seed,1664525)+1013904223)|0;this.nz+=(e.seed/2147483648-this.nz)*nc;B+=this.nz*ln*1.5;}
      const xin=route===2?A:A+B;
      let y1;
      if(t1===0){
        const S=(1-G)*(G3*ld[0]+G2*ld[1]+G*ld[2]+ld[3]);
        let uu=tanh((xin*0.6-k1*S)/(1+k1*G4)),v=(uu-ld[0])*G;
        uu=v+ld[0];ld[0]=uu+v;v=(uu-ld[1])*G;uu=v+ld[1];ld[1]=uu+v;v=(uu-ld[2])*G;uu=v+ld[2];ld[2]=uu+v;v=(uu-ld[3])*G;uu=v+ld[3];ld[3]=uu+v;
        y1=uu*lg;
      }else y1=svf(sv,0,xin,k1,a11,a12,a13,t1,bg1);
      const s=st?sat(y1,st,sg,smk):y1;
      let y;
      if(!t2)y=route===2?s+B:s;
      else if(route===0){const y2=svf(sv,2,s+(xin-s)*bp,k2,a21,a22,a23,t2,bg2);y=y2+(s-y2)*bn;}
      else if(route===1){const y2=svf(sv,2,xin,k2,a21,a22,a23,t2,bg2);y=s*(1-bm)+y2*bm;}
      else{const y2=svf(sv,2,B,k2,a21,a22,a23,t2,bg2);y=s*ga+y2*gb;}
      y=tanh(y*0.5)*2*a;
      L[off+i]+=y*gl;R[off+i]+=y*gr;
    }
    if(aE.s===0)this.on=false;
  }
}
// ---------- engine ----------
class Engine{
  constructor(sr){
    this.sr=sr;this.p={};this.ready=false;this.dirty=true;this.post=()=>{};
    if(!WT)WT=buildWT();
    this.v=[];for(let i=0;i<NV;i++)this.v.push(new Voice(this));
    this.vid=0;this.last=-1;this.stack=[];this.held=[];this.phys=0;this.poff=[];
    this.bend=0;this.mw=0;this.seed=12345;
    this.om=[0,0,0];this.owt=[0,0,0];this.osh=[0,0,0];this.owp=[0,0,0];this.ose=[0,0,0];this.ode=[0,0,0];this.olv=[0,0,0];
    this.tI=new Float64Array(3);this.tL=new Float64Array(3);this.tS=new Float64Array(3);this.tW=new Float64Array(3);
    this.slots=[];this.ap=new Int8Array(16);
    this.lfo=[0,0,0];this.lp=[0,0,0];this.lh=[0,0,0];this.ln=[0,0,0];
    this.sC1=0.7;this.sC2=0.5;this.sV=0.7;
    this.aT=0;this.aS=0;this.aN=0;
    this.pg=[];this.pgN=[];this.pgOn=false;this.pgI=-1;this.pgT=0;this.pgL=4;
    this.cb0=new Float32Array(4096);this.cb1=new Float32Array(4096);this.cw=0;this.cp=0;
    this.ps=new Float64Array(12);this.pf0=0;this.pf1=0;this.pp=0;
    const dn=sr>50000?262144:131072;this.d0=new Float32Array(dn);this.d1=new Float32Array(dn);this.dm=dn-1;this.dw=0;this.dT=sr*0.3;
    this.dlL=0;this.dlR=0;this.dhL=0;this.dhR=0;
    this.rb=[];for(let k=0;k<8;k++)this.rb.push(new Float32Array(16384));
    this.rw=0;this.rl=new Int32Array(8);this.rg=new Float32Array(8);this.rs=new Float32Array(8);this.ro=new Float32Array(8);this.rsz=-1;
    this.ab=[0,1,2,3].map(()=>new Float32Array(1024));this.al=[142,379,107,277].map(x=>Math.min(1000,Math.round(x*sr/48000)));this.aw=0;
    this.bl=0;this.br=0;this.dxl=0;this.dxr=0;this.dyl=0;this.dyr=0;
  }
  msg(m){
    switch(m.t){
      case 'p':this.set(m.k,m.v);break;
      case 'patch':{const was=this.p.arpOn;for(const k in m.p)this.p[k]=m.p[k];this.dirty=true;this.ready=true;if(was&&!this.p.arpOn)this.panic();break;}
      case 'on':this.keyDown(m.n,m.v);break;
      case 'off':this.keyUp(m.n);break;
      case 'slide':for(const v of this.v)if(v.on&&v.key===m.n)v.slide=m.v;break;
      case 'bend':this.bend=m.v;break;
      case 'mw':this.mw=m.v;break;
      case 'panic':this.stopProg();this.panic();break;
      case 'prog':this.stopProg();if(m.on&&m.ch.length){this.pg=m.ch;this.pgL=m.len;this.pgI=-1;this.pgT=0;this.pgOn=true;}break;
    }
  }
  set(k,v){const was=this.p[k];this.p[k]=v;this.dirty=true;if(k==='arpOn'&&was!==v)this.panic();if(k==='arpHold'&&!v){this.held.length=0;this.phys=0;}}
  panic(){for(const v of this.v)if(v.on)v.release();this.held.length=0;this.poff.length=0;this.stack.length=0;this.phys=0;}
  stopProg(){if(!this.pgOn)return;for(const n of this.pgN)this.keyUp(n);this.pgN=[];this.pgOn=false;if(this.p.arpOn)this.held.length=0;}
  derive(){
    const p=this.p,sr=this.sr;this.dirty=false;
    for(let i=0;i<3;i++){const o='o'+(i+1);this.om[i]=p[o+'mode']|0;this.owt[i]=clp(p[o+'wt']|0,0,NT-1);this.osh[i]=p[o+'shape'];this.owp[i]=p[o+'warp'];this.ose[i]=p[o+'semi'];this.ode[i]=p[o+'det'];this.olv[i]=p[o+'lvl'];}
    this.slots=[];
    for(let j=0;j<8;j++){const s=p['m'+j+'s']|0,d=p['m'+j+'d']|0,a=p['m'+j+'a'];if(s&&d&&a)this.slots.push({s,d,a:d<=3?a*Math.abs(a)*24:a});}
    for(let i=0;i<16;i++)this.ap[i]=p['ap'+i]|0;
    const T=x=>0.001*Math.pow(10000,x),ds=1/sr,dc=16/sr,c=(dt,k,x)=>1-Math.exp(-dt*k/T(x));
    this.caA=c(ds,1.6,p.aA);this.caD=c(ds,4,p.aD);this.caR=c(ds,5,p.aR);
    this.cfA=c(dc,1.6,p.fA);this.cfD=c(dc,4,p.fD);this.cfR=c(dc,5,p.fR);
    this.cmA=c(dc,1.6,p.mA);this.cmD=c(dc,4,p.mD);this.cmR=c(dc,5,p.mR);
    this.glc=p.glide>0?1-Math.exp(-dc/(0.004+p.glide*p.glide*1.2)):1;
    this.fadeN=p.l1fade>0?p.l1fade*p.l1fade*3*sr:0;
    if(p.rvSize!==this.rsz){this.rsz=p.rvSize;const rt=0.4+p.rvSize*p.rvSize*10;
      for(let k=0;k<8;k++){const l=Math.min(16000,Math.round(RVB[k]*(0.6+p.rvSize*0.9)*sr/48000));this.rl[k]=l;this.rg[k]=Math.pow(10,-3*l/(rt*sr));}}
  }
  keyDown(n,v){
    if(this.p.arpOn){
      if(this.p.arpHold&&this.phys===0)this.held.length=0;
      this.phys++;
      if(!this.held.length){this.aT=0;this.aS=0;this.aN=0;}
      if(!this.held.some(h=>h.n===n))this.held.push({n,v});
    }else this.noteOn(n,v);
  }
  keyUp(n){
    if(this.p.arpOn){this.phys=Math.max(0,this.phys-1);
      if(!this.p.arpHold){const i=this.held.findIndex(h=>h.n===n);if(i>=0)this.held.splice(i,1);}}
    else this.noteOff(n);
  }
  noteOn(n,vel){
    const p=this.p,u=clp(p.uni|0,1,4),V=this.v,vm=p.vmode|0;
    if(vm===0){
      this.stack.length=0;
      let got=[];for(const v of V)if(v.on&&v.key===n)got.push(v);
      if(got.length!==u){for(const v of got)v.release();got=[];
        for(let k=0;k<u;k++){let best=null,bs=1e18;
          for(const v of V){if(got.indexOf(v)>=0)continue;const s=!v.on?-1:!v.gate?v.aE.v:1e6+v.id;if(s<bs){bs=s;best=v;}}
          got.push(best);}}
      for(let k=0;k<u;k++)got[k].start(n,vel,k,u,false,true);
    }else{
      const st=this.stack,i=st.indexOf(n);if(i>=0)st.splice(i,1);st.push(n);
      const leg=vm===2&&st.length>1;
      for(let k=0;k<NV;k++){if(k<u)V[k].start(n,vel,k,u,leg&&V[k].on&&V[k].gate,false);else if(V[k].on&&V[k].gate)V[k].release();}
    }
    this.last=n;
  }
  noteOff(n){
    const p=this.p,V=this.v;
    if((p.vmode|0)===0){for(const v of V)if(v.on&&v.gate&&v.key===n)v.release();return;}
    const st=this.stack,i=st.indexOf(n);if(i<0)return;st.splice(i,1);
    if(i===st.length){
      if(st.length){const m=st[st.length-1];for(const v of V)if(v.on&&v.gate){v.key=m;v.note=m;if(!(p.glide>0))v.cur=m;}this.last=m;}
      else for(const v of V)if(v.on&&v.gate)v.release();
    }
  }
  arp(m){
    const p=this.p,po=this.poff;
    for(let i=po.length-1;i>=0;i--){if((po[i].t-=m)<=0){this.noteOff(po[i].n);po.splice(i,1);}}
    const hl=this.held.length;if(!hl)return;
    if((this.aT-=m)>0)return;
    const si=this.aS++,spb=this.sr*60/p.bpm,sw=p.arpSwing*0.5;
    const len=spb*ARPDIV[p.arpDiv|0]*((si&1)?1-sw:1+sw);this.aT+=len;
    const pv=this.ap[si&15];if(!pv)return;
    const mode=p.arpMode|0,oct=clp(p.arpOct|0,1,4),gate=len*(0.08+p.arpGate*0.95);
    const hs=mode===4?this.held:this.held.slice().sort((a,b)=>a.n-b.n);
    const play=(n,v)=>{if(n>120)return;for(let i=po.length-1;i>=0;i--)if(po[i].n===n)po.splice(i,1);
      this.noteOn(n,pv===2?Math.min(1,v*1.2+0.12):v*0.72);po.push({n,t:gate});};
    if(mode===5){for(const h of hs)play(h.n,h.v);return;}
    const Ln=hl*oct;let k=this.aN++;
    if(mode===1)k=Ln-1-(k%Ln);else if(mode===2){const per=Math.max(1,2*Ln-2);k%=per;if(k>=Ln)k=per-k;}else if(mode===3)k=(Math.random()*Ln)|0;else k%=Ln;
    const h=hs[k%hl];play(h.n+12*((k/hl)|0),h.v);
  }
  tick(m){
    const p=this.p,sr=this.sr;
    if(this.dirty)this.derive();
    this.sC1+=(p.f1cut-this.sC1)*0.25;this.sC2+=(p.f2cut-this.sC2)*0.25;this.sV+=(p.vol-this.sV)*0.1;
    for(let i=0;i<3;i++){const L='l'+(i+1),x=p[L+'rate'];
      const rate=p[L+'sync']?(p.bpm/60)/LFB[Math.round(x*8)]:0.02*Math.pow(1500,x);
      let ph=this.lp[i]+rate*m/sr;
      if(ph>=1){ph-=Math.floor(ph);this.lh[i]=this.ln[i];this.ln[i]=Math.random()*2-1;}
      this.lp[i]=ph;let v;
      switch(p[L+'shape']|0){case 0:v=Math.sin(TAU*ph);break;case 1:v=4*Math.abs(ph-0.5)-1;break;case 2:v=1-2*ph;break;case 3:v=ph<0.5?1:-1;break;case 4:v=this.ln[i];break;
        default:{const c=(1-Math.cos(Math.PI*ph))*0.5;v=this.lh[i]+(this.ln[i]-this.lh[i])*c;}}
      this.lfo[i]=v;}
    if(this.pgOn&&(this.pgT-=m)<=0){
      for(const n of this.pgN)this.keyUp(n);
      this.pgI=(this.pgI+1)%this.pg.length;this.pgN=this.pg[this.pgI].slice();
      for(const n of this.pgN)this.keyDown(n,0.72);
      this.pgT+=this.pgL*sr*60/p.bpm;this.post({t:'chord',i:this.pgI});
    }
    if(p.arpOn)this.arp(m);
  }
  fx(L,R,off,n){
    const p=this.p,sr=this.sr;
    const bb=p.boost*1.5,bc=1-Math.exp(-TAU*110/sr);
    const cm=p.chMix,cr=0.1*Math.pow(50,p.chRate)/sr,cd=p.chDepth*0.006*sr,c0=0.012*sr,cb0=this.cb0,cb1=this.cb1;
    const pm=p.phMix,pfb=p.phFb*0.75,ps=this.ps;let pa0=0,pa1=0;
    if(pm>0){this.pp+=0.05*Math.pow(100,p.phRate)*n/sr;this.pp-=Math.floor(this.pp);
      let t=Math.tan(Math.PI*clp(700*Math.pow(2,Math.sin(TAU*this.pp)*p.phDepth*2.2),40,sr*0.4)/sr);pa0=(t-1)/(t+1);
      t=Math.tan(Math.PI*clp(700*Math.pow(2,Math.sin(TAU*(this.pp+0.25))*p.phDepth*2.2),40,sr*0.4)/sr);pa1=(t-1)/(t+1);}
    const dmx=p.dlMix,dfb=p.dlFb*0.92,dm=this.dm,dtg=Math.min(dm-4,DLB[p.dlTime|0]*60/p.bpm*sr),dlc=0.04+p.dlTone*p.dlTone*0.9,ping=p.dlPing>0,d0=this.d0,d1=this.d1;
    const rm=p.rvMix,rdc=1-p.rvDamp*0.85,rb=this.rb,rl=this.rl,rg=this.rg,rs=this.rs,ro=this.ro,ab=this.ab,al=this.al;
    const vol=this.sV*this.sV*2.6;
    for(let j=off;j<off+n;j++){
      let l=L[j],r=R[j];
      if(bb>0){this.bl+=(l-this.bl)*bc;this.br+=(r-this.br)*bc;l+=this.bl*bb;r+=this.br*bb;}
      if(cm>0){const w=this.cw;cb0[w]=l;cb1[w]=r;let cp=this.cp+cr;if(cp>=1)cp-=1;this.cp=cp;
        let x=w-(c0+cd*Math.sin(TAU*cp));if(x<0)x+=4096;let i=x|0,f=x-i;const wl=cb0[i]+(cb0[(i+1)&4095]-cb0[i])*f;
        x=w-(c0+cd*Math.cos(TAU*cp));if(x<0)x+=4096;i=x|0;f=x-i;const wr=cb1[i]+(cb1[(i+1)&4095]-cb1[i])*f;
        l=l*(1-cm*0.3)+wl*cm*0.8;r=r*(1-cm*0.3)+wr*cm*0.8;this.cw=(w+1)&4095;}
      if(pm>0){let x=l+this.pf0*pfb;for(let k=0;k<6;k++){const y=pa0*x+ps[k];ps[k]=x-pa0*y;x=y;}this.pf0=x;l=(l+x*pm)*(1-pm*0.25);
        x=r+this.pf1*pfb;for(let k=6;k<12;k++){const y=pa1*x+ps[k];ps[k]=x-pa1*y;x=y;}this.pf1=x;r=(r+x*pm)*(1-pm*0.25);}
      if(dmx>0){this.dT+=(dtg-this.dT)*0.0004;const w=this.dw;let x=w-this.dT;if(x<0)x+=dm+1;const i=x|0,f=x-i,i0=i&dm,i1=(i+1)&dm;
        const yl=d0[i0]+(d0[i1]-d0[i0])*f,yr=d1[i0]+(d1[i1]-d1[i0])*f;
        this.dlL+=(yl-this.dlL)*dlc;this.dlR+=(yr-this.dlR)*dlc;this.dhL+=(this.dlL-this.dhL)*0.012;this.dhR+=(this.dlR-this.dhR)*0.012;
        const fl=this.dlL-this.dhL+1e-15,fr=this.dlR-this.dhR+1e-15;
        if(ping){d0[w]=(l+r)*0.5+fr*dfb;d1[w]=fl*dfb;}else{d0[w]=l+fl*dfb;d1[w]=r+fr*dfb;}
        this.dw=(w+1)&dm;l+=yl*dmx;r+=yr*dmx;}
      if(rm>0){const aw=this.aw;let xl=l+1e-15,xr=r+1e-15,b=ab[0],d=b[(aw-al[0])&1023],y=d-0.6*xl;b[aw]=xl+0.6*y;xl=y;
        b=ab[1];d=b[(aw-al[1])&1023];y=d-0.6*xl;b[aw]=xl+0.6*y;xl=y;
        b=ab[2];d=b[(aw-al[2])&1023];y=d-0.6*xr;b[aw]=xr+0.6*y;xr=y;
        b=ab[3];d=b[(aw-al[3])&1023];y=d-0.6*xr;b[aw]=xr+0.6*y;xr=y;
        this.aw=(aw+1)&1023;
        const rw=this.rw;let sum=0;
        for(let k=0;k<8;k++){const o=rb[k][(rw-rl[k])&16383],s=rs[k]+(o-rs[k])*rdc;rs[k]=s;ro[k]=s;sum+=s;}
        sum*=0.25;
        for(let k=0;k<8;k++)rb[k][rw]=((k&1)?xr:xl)+(ro[k]-sum)*rg[k];
        this.rw=(rw+1)&16383;
        l=l*(1-rm*0.35)+(ro[0]-ro[2]+ro[4]-ro[6])*0.4*rm;r=r*(1-rm*0.35)+(ro[1]-ro[3]+ro[5]-ro[7])*0.4*rm;}
      l*=vol;r*=vol;
      const yl=l-this.dxl+0.9975*this.dyl;this.dxl=l;this.dyl=yl;const yr=r-this.dxr+0.9975*this.dyr;this.dxr=r;this.dyr=yr;
      L[j]=tanh(yl);R[j]=tanh(yr);
    }
  }
  process(L,R,n){
    if(!this.ready){L.fill(0);if(R!==L)R.fill(0);return;}
    const V=this.v;
    for(let i=0;i<n;i+=16){const m=Math.min(16,n-i);this.tick(m);
      for(let j=i;j<i+m;j++){L[j]=0;R[j]=0;}
      for(let k=0;k<NV;k++)if(V[k].on)V[k].render(L,R,i,m);
      this.fx(L,R,i,m);}
  }
}
return Engine;
}
