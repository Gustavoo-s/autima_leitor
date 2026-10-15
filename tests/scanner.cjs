
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('assets/scanner-controller.js','utf8');
const bundle=fs.readFileSync('assets/index-uNk0pLyi.js','utf8');
const component=bundle.slice(bundle.indexOf('function Ud('),bundle.indexOf('function $d()'));
new vm.Script(component);
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function harness({pending=false,capabilitiesThrow=false,readBusyOnce=false,native=false}={}){
 let nextTimer=1, scanDelays=[], modes=[], stopped=0, calls=[],active=0,maxActive=0,states=[],reads=[],decodeCalls=0,resets=0,frames=[];
 const timeouts=new Map(),storage=new Map(),capture=deferred();let first=true;
 const video={srcObject:null,muted:false,playsInline:false,readyState:0,videoWidth:0,videoHeight:0,pause(){this.readyState=0},async play(){this.readyState=2;this.videoWidth=1280;this.videoHeight=720}};
 function stream(id){active++;maxActive=Math.max(maxActive,active);let ended=false;const track={stop(){if(!ended){ended=true;stopped++;active--}},getSettings:()=>({deviceId:id}),getCapabilities(){if(capabilitiesThrow)throw Error('unsupported');return {focusMode:['continuous']}},async applyConstraints(){}};return {getTracks:()=>[track],getVideoTracks:()=>[track]}}
 class Reader {constructor(hints){this.thorough=hints.get(3)===true}reset(){resets++}decode(){decodeCalls++;modes.push(this.thorough);const result=frames.shift();if(result instanceof Error)throw result;if(!result)throw Error('NotFound');return {getText:()=>result}}}
 const env={navigator:{mediaDevices:{async getUserMedia(c){calls.push(c);if(readBusyOnce&&calls.length===2){const err=Error('busy');err.name='NotReadableError';throw err}if(pending&&first){first=false;await capture.promise}return stream(c.video.deviceId?.exact||'rear')},async enumerateDevices(){return [{kind:'videoinput',deviceId:'rear'},{kind:'videoinput',deviceId:'front'}]}}},localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout(fn,ms){if(ms===60){scanDelays.push(ms);const key=nextTimer++;timeouts.set(key,fn);return key}return setTimeout(fn,0)},clearTimeout(key){timeouts.delete(key);clearTimeout(key)},URL};
 if(native)env.BarcodeDetector=class{static async getSupportedFormats(){return ['ean_13']}async detect(){return [{rawValue:'4006381333931'}]}};
 const context={setTimeout,clearTimeout,Map,Date};
 vm.createContext(context);vm.runInContext(source.replace('export function','function'),context);
 const controller=context.createScannerController({video,onState:value=>states.push(value),onRead:value=>reads.push(value),loadLibrary:async()=>({BrowserMultiFormatReader:Reader,BarcodeFormat:{EAN_13:7,CODE_128:4}})},env);
 async function tick(){const tasks=[...timeouts.values()];timeouts.clear();for(const fn of tasks)await fn();await new Promise(r=>setImmediate(r))}
 return {controller,capture,video,states,reads,calls,frames,tick,scanDelays,modes,get stopped(){return stopped},get active(){return active},get maxActive(){return maxActive},get decodeCalls(){return decodeCalls}};
}
(async()=>{
 let h=harness({capabilitiesThrow:true});await h.controller.start();assert(h.states.some(s=>s.running));h.frames.push(Error('temporary frame error'),'4006381333931');await h.tick();await h.tick();assert.deepEqual(h.reads,['4006381333931']);assert.equal(h.active,0);assert.deepEqual(h.modes.slice(0,3),[false,true,false]);assert(h.scanDelays.every(ms=>ms===60));h.controller.close();
 h=harness({readBusyOnce:true});await h.controller.start('rear');await h.controller.start('front');assert.equal(h.calls.length,3);assert.equal(h.calls.at(-1).video.deviceId.exact,'front');assert.equal(h.maxActive,1);assert(h.stopped>=1);h.controller.close();assert.equal(h.active,0);
 h=harness({pending:true});const old=h.controller.start('rear');await new Promise(r=>setTimeout(r,8));const latest=h.controller.start('front');h.capture.resolve();await Promise.all([old,latest]);assert.equal(h.maxActive,1);assert.equal(h.calls.at(-1).video.deviceId.exact,'front');assert(h.video.srcObject);h.frames.push('7891234567890');await h.tick();assert.deepEqual(h.reads,['7891234567890']);h.controller.close();
 h=harness({native:true});await h.controller.start();await new Promise(r=>setImmediate(r));assert.deepEqual(h.reads,['4006381333931']);h.controller.close();
 h=harness({pending:true});const closed=h.controller.start();await new Promise(r=>setTimeout(r,8));h.controller.close();h.capture.resolve();await closed;assert.equal(h.active,0);assert.equal(h.reads.length,0);
 console.log('PASS controller: frame errors recover; capability failure tolerated; busy camera retry; no overlapping cameras; pending acquisition switch; old operation cannot detach new stream; native detector return; close during acquisition.');
 // Decode a real synthetic EAN-13 through the exact bundled ZXing, not a reader mock.
 const L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
 const G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
 const R=L.map(bits=>bits.replace(/[01]/g,b=>b==='0'?'1':'0'));
 const parity=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
 const code='4006381333931';let bits='00000000000101';
 for(let i=1;i<=6;i++)bits+=(parity[+code[0]][i-1]==='L'?L:G)[+code[i]];
 bits+='01010';for(let i=7;i<13;i++)bits+=R[+code[i]];bits+='10100000000000';
 const width=bits.length*3,height=150,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4;const c=bits[Math.floor(x/3)]==='1'?0:255;pixels[p]=pixels[p+1]=pixels[p+2]=c;pixels[p+3]=255}
 class Video{constructor(){this.videoWidth=width;this.videoHeight=height;this.pixels=pixels}}
 const canvas=()=>{const context={drawImage(image){this.image=image},getImageData(){return {data:this.image.pixels}},clearRect(){},putImageData(){}};return {style:{},width:0,height:0,getContext(){return context}}};
 const libContext={console,Uint8ClampedArray,Uint8Array,Int32Array,Uint32Array,Map,Set,Date,Math,HTMLVideoElement:Video,HTMLImageElement:class{},document:{createElement:()=>canvas()},window:{},navigator:{},setTimeout,clearTimeout};
 vm.createContext(libContext);
 let lib=fs.readFileSync('assets/index-Cnw8yPzQ.js','utf8');assert.equal(require('crypto').createHash('sha1').update('blob '+Buffer.byteLength(lib)+'\0'+lib).digest('hex'),'eeb0f12d9aef2c782f80f11631bdb59da569cef2');
 lib=lib.replace(/export\{([^}]+)\};?\s*$/,(_,list)=>'globalThis.ZX={'+list.split(',').map(item=>{const parts=item.trim().split(/\s+as\s+/);return parts.length===2?parts[1]+':'+parts[0]:parts[0]}).join(',')+'};');
 vm.runInContext(lib,libContext);
 const reader=new libContext.ZX.BrowserMultiFormatReader(new Map([[2,[libContext.ZX.BarcodeFormat.EAN_13]],[3,true]]));
 assert.equal(reader.decode(new Video()).getText(),code);
 const fastReader=new libContext.ZX.BrowserMultiFormatReader(new Map([[2,[libContext.ZX.BarcodeFormat.EAN_13]]]));
 assert.equal(fastReader.decode(new Video()).getText(),code);
 console.log('PASS actual decoder: synthetic EAN-13 4006381333931 recognized by both fast and thorough modes in bundled library.');
})().catch(error=>{console.error(error);process.exitCode=1});
