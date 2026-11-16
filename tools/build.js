const fs=require('fs'),d=__dirname;
const eng=fs.readFileSync(d+'/engine.js','utf8'),par=fs.readFileSync(d+'/params.js','utf8'),app=fs.readFileSync(d+'/app.js','utf8');
let t=fs.readFileSync(d+'/template.html','utf8');
t=t.replace('/*ENGINE*/',()=>eng).replace('/*PARAMS*/',()=>par).replace('/*APP*/',()=>app);
// keep the page pure ASCII so it renders the same whatever charset the host web view assumes
{const i=t.indexOf('<script>'),j=t.lastIndexOf('</script>');
 const ent=x=>x.replace(/[^\x00-\x7f]/gu,c=>'&#x'+c.codePointAt(0).toString(16)+';');
 const esc=x=>x.replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 t=ent(t.slice(0,i))+esc(t.slice(i,j))+ent(t.slice(j));}
fs.mkdirSync(d+'/dist',{recursive:true});
fs.writeFileSync(d+'/dist/index.html',t);
fs.writeFileSync(d+'/dist/worklet.js','const Engine=('+eng.trim()+')();class S extends AudioWorkletProcessor{constructor(){super();this.e=new Engine(sampleRate);this.e.post=m=>this.port.postMessage(m);this.port.onmessage=ev=>this.e.msg(ev.data);}process(i,o){const c=o[0];this.e.process(c[0],c[1]||c[0],c[0].length);return true;}}registerProcessor("strain",S);\n');
if(fs.existsSync(d+'/../ui'))fs.writeFileSync(d+'/../ui/index.html',t);   // the copy embedded in the plugin
console.log('built',t.length);
