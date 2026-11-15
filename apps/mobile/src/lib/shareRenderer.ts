// Desenho da arte/vídeo de compartilhamento: uma página com <canvas> rodando no WebView (iframe na web).
// Recebe a cena pronta do core (`buildShareScene`) e só desenha; o vídeo é gravado no próprio aparelho
// com MediaRecorder (sem servidor, sem custo). Protocolo: ver `lib/shareBridge.ts`.
// Obs.: sem crases nem "${" no script abaixo (está dentro de um template literal).

export const SHARE_HTML = String.raw`<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}
#wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
canvas{max-width:100%;max-height:100%;width:auto;height:auto;display:block;border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
</style></head>
<body><div id="wrap"><canvas id="cv" width="1080" height="1920"></canvas></div>
<script>
(function(){
var O='#D94F16', OD='#C93C05', OL='#EB6D35', WH='#FFF9F4', CH='#1D1E22', SAND='#F5EADF';
var DISPLAY="MBDisplay,'Arial Black',sans-serif", BODY="MBBody,system-ui,sans-serif", BOLD="MBBold,system-ui,sans-serif";
var cv=document.getElementById('cv'), ctx=cv.getContext('2d');
var scene=null, bg=null, logo=null, layer=null, busy=false;

function send(o){var s=JSON.stringify(o); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if(window.parent!==window) window.parent.postMessage(s,'*');}
function loadImg(src){return new Promise(function(res){if(!src) return res(null); var i=new Image(); i.onload=function(){res(i)}; i.onerror=function(){res(null)}; i.src=src;});}
function loadFont(name,src){ if(!src||!window.FontFace) return Promise.resolve(); var f=new FontFace(name,'url('+src+')'); return f.load().then(function(x){document.fonts.add(x)}).catch(function(){}); }

// ---------- utilidades de desenho ----------
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
function cover(c,im,x,y,w,h,alpha){ if(!im) return; var s=Math.max(w/im.width,h/im.height), iw=w/s, ih=h/s; c.save(); c.globalAlpha=alpha==null?1:alpha; c.drawImage(im,(im.width-iw)/2,(im.height-ih)/2,iw,ih,x,y,w,h); c.restore(); }
function grad(c,y0,y1,a0,a1,rgb){ var g=c.createLinearGradient(0,y0,0,y1); g.addColorStop(0,'rgba('+rgb+','+a0+')'); g.addColorStop(1,'rgba('+rgb+','+a1+')'); c.fillStyle=g; c.fillRect(0,Math.min(y0,y1),scene.w,Math.abs(y1-y0)); }
function font(c,f,size){ c.font=size+'px '+f; }
/** Texto que encolhe até caber em maxW. Devolve a largura final. */
function fit(c,text,f,size,maxW){ font(c,f,size); while(size>12 && c.measureText(text).width>maxW){ size-=2; font(c,f,size);} return c.measureText(text).width; }
/** Texto com espaçamento entre letras (eyebrow), sem depender de ctx.letterSpacing. */
function spaced(c,text,x,y,sp,align){ var w=0,i; for(i=0;i<text.length;i++) w+=c.measureText(text[i]).width+(i<text.length-1?sp:0); var cx=align==='right'?x-w:align==='center'?x-w/2:x; var a=c.textAlign; c.textAlign='left'; for(i=0;i<text.length;i++){ c.fillText(text[i],cx,y); cx+=c.measureText(text[i]).width+sp;} c.textAlign=a; return w; }
function shadowOn(c,blur,col){ c.shadowColor=col||'rgba(0,0,0,.45)'; c.shadowBlur=blur; c.shadowOffsetX=0; c.shadowOffsetY=blur/4; }
function shadowOff(c){ c.shadowColor='transparent'; c.shadowBlur=0; c.shadowOffsetY=0; }

/** Facho do farol: dois triângulos laranja suaves saindo de (x,y). */
function beams(c,x,y,len,alpha){ c.save(); c.globalAlpha=alpha; var g=c.createRadialGradient(x,y,0,x,y,len); g.addColorStop(0,'rgba(235,109,53,.9)'); g.addColorStop(1,'rgba(235,109,53,0)'); c.fillStyle=g; c.beginPath(); c.moveTo(x,y); c.lineTo(x-len,y-len*0.28); c.lineTo(x-len,y+len*0.28); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x,y); c.lineTo(x+len,y-len*0.28); c.lineTo(x+len,y+len*0.28); c.closePath(); c.fill(); c.restore(); }

function brand(c,x,y,size,dark){ if(logo){ c.save(); rr(c,x,y,size,size,size*0.22); c.clip(); c.drawImage(logo,x,y,size,size); c.restore(); }
  c.fillStyle=dark?CH:WH; c.textBaseline='alphabetic'; c.textAlign='left'; font(c,DISPLAY,size*0.36); c.fillText('MISSÃO',x+size+20,y+size*0.46); c.fillText('BARRA',x+size+20,y+size*0.88); }

function noPhoto(c,w,h){ c.fillStyle=CH; c.fillRect(0,0,w,h); var g=c.createRadialGradient(w*0.5,h*0.18,10,w*0.5,h*0.18,h*0.9); g.addColorStop(0,'rgba(217,79,22,.30)'); g.addColorStop(1,'rgba(29,30,34,0)'); c.fillStyle=g; c.fillRect(0,0,w,h); beams(c,w*0.5,h*0.12,w*0.9,0.35); }

// ---------- percurso ----------
function routeBox(L,box){ var s=Math.min(box.w/scene.ax,box.h/scene.ay); return {s:s,ox:box.x+(box.w-scene.ax*s)/2,oy:box.y+(box.h-scene.ay*s)/2}; }
function line(c,pts,T,upto){ if(pts.length<2) return null; var n=upto==null?pts.length-1:Math.max(0,Math.min(pts.length-1,upto)); var k=Math.floor(n), f=n-k, i;
  c.beginPath(); c.moveTo(T(pts[0])[0],T(pts[0])[1]); for(i=1;i<=k;i++){ var p=T(pts[i]); c.lineTo(p[0],p[1]); }
  var head=T(pts[k]); if(f>0&&k+1<pts.length){ var a=T(pts[k]), b=T(pts[k+1]); head=[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]; c.lineTo(head[0],head[1]); }
  return head; }
function drawRoute(c,box,upto,opt){ opt=opt||{}; var r=routeBox(null,box); var T=function(p){return [r.ox+p[0]*r.s,r.oy+p[1]*r.s];};
  var track=scene.track, ghost=scene.ghost, main=track.length>1?track:ghost; c.save(); c.lineJoin='round'; c.lineCap='round';
  if(track.length>1&&ghost.length>1){ c.setLineDash([2,20]); c.strokeStyle='rgba(255,249,244,.55)'; c.lineWidth=8; line(c,ghost,T,null); c.stroke(); c.setLineDash([]); }
  if(main.length<2){ c.restore(); return; }
  var col=opt.color||O;
  line(c,main,T,upto); c.strokeStyle='rgba(0,0,0,.35)'; c.lineWidth=26; c.stroke();
  line(c,main,T,upto); c.strokeStyle=opt.outline||WH; c.lineWidth=18; c.stroke();
  shadowOn(c,26,'rgba(217,79,22,.85)'); var head=line(c,main,T,upto); c.strokeStyle=col; c.lineWidth=10; c.stroke(); shadowOff(c);
  var s=T(main[0]); c.fillStyle=WH; c.strokeStyle=CH; c.lineWidth=6; c.beginPath(); c.arc(s[0],s[1],15,0,7); c.fill(); c.stroke();
  var done=upto==null||upto>=main.length-1;
  if(done){ var e=T(main[main.length-1]); c.fillStyle=col; c.strokeStyle=WH; c.lineWidth=7; c.beginPath(); c.arc(e[0],e[1],19,0,7); c.fill(); c.stroke(); }
  else if(head){ var pulse=(Date.now()%1000)/1000; c.fillStyle='rgba(217,79,22,'+(0.45*(1-pulse))+')'; c.beginPath(); c.arc(head[0],head[1],22+26*pulse,0,7); c.fill(); c.fillStyle=col; c.strokeStyle=WH; c.lineWidth=7; c.beginPath(); c.arc(head[0],head[1],20,0,7); c.fill(); c.stroke(); }
  c.restore(); }

// ---------- números ----------
/** Número + unidade + rótulo. opt: dark (fundo claro), orange (sobre laranja), above (rótulo acima do número). */
function stat(c,s,x,y,size,align,maxW,opt){ opt=opt||{}; c.textBaseline='alphabetic'; var unit=s.unit&&s.value!=='—'?s.unit:'';
  font(c,DISPLAY,size); var vw=c.measureText(s.value).width; font(c,BOLD,size*0.38); var uw=unit?c.measureText(' '+unit).width:0;
  var sz=maxW&&vw+uw>maxW?size*maxW/(vw+uw):size; font(c,DISPLAY,sz); vw=c.measureText(s.value).width; font(c,BOLD,sz*0.38); uw=unit?c.measureText(' '+unit).width:0;
  var x0=align==='center'?x-(vw+uw)/2:align==='right'?x-vw-uw:x; c.textAlign='left';
  c.fillStyle=opt.dark?CH:WH; font(c,DISPLAY,sz); c.fillText(s.value,x0,y);
  if(unit){ c.fillStyle=opt.orange?'rgba(255,249,244,.8)':opt.dark?OD:OL; font(c,BOLD,sz*0.38); c.fillText(' '+unit,x0+vw,y); }
  var ls=Math.min(30,Math.max(20,size*0.27)); c.fillStyle=opt.orange?'rgba(255,249,244,.85)':opt.dark?'#4B4C53':SAND; font(c,BOLD,ls);
  var ly=opt.above?y-sz*0.76-18:y+sz*0.2+26; spaced(c,s.label.toUpperCase(),align==='center'?x:align==='right'?x:x0,ly,3,align==='center'?'center':align==='right'?'right':'left'); }

function liveStats(k){ if(k==null) return scene.stats; var f=scene.frames[k]; return [{label:'Distância',value:f.km,unit:'km'},{label:'Tempo',value:f.elapsed},{label:'Pace atual',value:f.pace,unit:'/km'}]; }
function clockChip(c,k,x,y,align){ if(!scene.frames.length) return; var f=k==null?scene.frames[scene.frames.length-1]:scene.frames[k]; font(c,DISPLAY,60); var w=Math.max(c.measureText(f.clock).width,150)+56, h=128;
  var x0=align==='right'?x-w:x; c.fillStyle='rgba(29,30,34,.78)'; rr(c,x0,y,w,h,18); c.fill(); c.fillStyle=O; c.fillRect(x0,y+18,7,h-36);
  c.fillStyle=OL; font(c,BOLD,21); spaced(c,k==null?'CHEGADA':'HORÁRIO',x0+30,y+42,3); c.fillStyle=WH; font(c,DISPLAY,60); c.textAlign='left'; c.fillText(f.clock,x0+28,y+106); }

function eyebrow(c,text,x,y,color,maxW,align){ c.fillStyle=color; font(c,BOLD,30); var t=text.toUpperCase(); while(t.length>4&&c.measureText(t).width+t.length*3>maxW) t=t.slice(0,-2); if(t!==text.toUpperCase()) t=t.replace(/\s*\S?$/,'')+'…';
  var dotX=align==='center'?null:x; if(dotX!=null){ c.beginPath(); c.arc(x+9,y-10,9,0,7); c.fill(); spaced(c,t,x+32,y,3); } else spaced(c,t,x,y,3,'center'); }

// ---------- modelos ----------
var L={};
L.farol={ static:function(c,w,h){ if(bg) cover(c,bg,0,0,w,h); else noPhoto(c,w,h); grad(c,0,h*0.26,0.6,0,'0,0,0'); grad(c,h*0.42,h,0,0.93,'20,20,22'); brand(c,64,64,104); },
  box:function(w,h){ return scene.format==='story'?{x:110,y:h*0.13,w:w-220,h:h*0.27}:{x:110,y:h*0.17,w:w-220,h:h*0.24}; },
  front:function(c,w,h,k){ var st=liveStats(k), pad=72, y=h-pad, big=scene.format==='story'?230:190;
    c.fillStyle=SAND; font(c,BODY,28); c.textAlign='left'; if(scene.name){ spaced(c,scene.name.toUpperCase(),pad,y,4); y-=78; }
    var rest=st.slice(1,4), cw=(w-pad*2)/rest.length; for(var i=0;i<rest.length;i++) stat(c,rest[i],pad+i*cw,y-40,66,'left',cw-24); y-=40+66+44;
    stat(c,st[0],pad,y-big*0.2,big,'left',w-pad*2,{above:true}); y-=big*0.2+big*0.76+18+30+56;
    if(scene.subtitle){ c.fillStyle=SAND; font(c,BODY,28); c.textAlign='left'; c.fillText(scene.subtitle,pad,y); y-=52; }
    eyebrow(c,scene.title,pad,y,OL,w-pad*2); clockChip(c,k,w-64,64,'right'); } };
L.cartao={ split:function(h){ return h*(scene.format==='story'?0.5:0.4); },
  static:function(c,w,h){ var sy=this.split(h); if(bg) cover(c,bg,0,0,w,sy); else noPhoto(c,w,sy); grad(c,0,sy*0.4,0.55,0,'0,0,0'); c.fillStyle=CH; c.fillRect(0,sy,w,h-sy); c.fillStyle=OD; c.fillRect(0,sy,w,14); brand(c,64,64,96);
    eyebrow(c,scene.title,72,sy+96,OL,w-144); if(scene.subtitle){ c.fillStyle=SAND; font(c,BODY,28); c.textAlign='left'; c.fillText(scene.subtitle,72,sy+142);} },
  box:function(w,h){ var sy=this.split(h); return {x:72,y:sy+190,w:w*0.46,h:h-sy-190-(scene.name?140:80)}; },
  front:function(c,w,h,k){ var sy=this.split(h), st=liveStats(k), x=w*0.46+130, y=sy+200, limit=h-(scene.name?130:70), story=scene.format==='story';
    // Empilha só o que cabe (Feed tem menos altura que Story).
    for(var i=0;i<st.length;i++){ var size=i===0?(story?104:88):(story?76:60), need=size*0.78+size*0.2+26+30; if(y+need>limit) break; y+=size*0.78; stat(c,st[i],x,y,size,'left',w-x-60); y+=size*0.2+26+(story?52:34); }
    if(scene.name){ c.fillStyle=SAND; font(c,BODY,28); c.textAlign='left'; spaced(c,scene.name.toUpperCase(),72,h-72,4); }
    clockChip(c,k,w-64,64,'right'); } };
L.mapa={ static:function(c,w,h){ c.fillStyle=CH; c.fillRect(0,0,w,h); if(bg){ cover(c,bg,0,0,w,h,0.24); } grad(c,0,h,0.35,0.95,'29,30,34'); var g=c.createRadialGradient(w/2,h*0.42,10,w/2,h*0.42,w*0.75); g.addColorStop(0,'rgba(217,79,22,.13)'); g.addColorStop(1,'rgba(217,79,22,0)'); c.fillStyle=g; c.fillRect(0,0,w,h);
    brand(c,64,64,96); c.textAlign='right'; c.fillStyle=SAND; font(c,BODY,26); if(scene.subtitle) c.fillText(scene.subtitle.split(' · ')[0],w-64,112); },
  box:function(w,h){ return {x:90,y:240,w:w-180,h:h-240-(scene.format==='story'?560:470)}; },
  front:function(c,w,h,k){ var st=liveStats(k).slice(0,3), pad=64, y=h-(scene.name?150:96), cw=(w-pad*2)/st.length;
    eyebrow(c,scene.title,w/2,y-240,OL,w-pad*2,'center');
    for(var i=0;i<st.length;i++){ stat(c,st[i],pad+cw*i+cw/2,y-60,i===0?96:80,'center',cw-20); if(i){ c.fillStyle='rgba(255,249,244,.16)'; c.fillRect(pad+cw*i,y-150,2,150);} }
    if(scene.name){ c.fillStyle=SAND; font(c,BODY,28); spaced(c,scene.name.toUpperCase(),w/2,h-72,4,'center'); }
    if(k!=null||scene.frames.length) clockChip(c,k,w-64,170,'right'); } };
L.faixa={ band:function(h){ return h*(scene.format==='story'?0.66:0.6); },
  static:function(c,w,h){ if(bg) cover(c,bg,0,0,w,h); else noPhoto(c,w,h); grad(c,0,h*0.3,0.55,0,'0,0,0'); grad(c,h*0.75,h,0,0.75,'0,0,0'); brand(c,64,64,96); },
  box:function(w,h){ return {x:110,y:h*0.2,w:w-220,h:this.band(h)-h*0.2-150}; },
  front:function(c,w,h,k){ var st=liveStats(k), by=this.band(h), bh=scene.format==='story'?420:380;
    c.save(); c.translate(w/2,by+bh/2); c.rotate(-0.045); shadowOn(c,30,'rgba(0,0,0,.35)'); c.fillStyle=OD; c.fillRect(-w*0.7,-bh/2,w*1.4,bh); shadowOff(c);
    c.fillStyle=WH; font(c,BOLD,28); spaced(c,scene.title.toUpperCase().slice(0,34),-w/2+72,-bh/2+66,3);
    stat(c,st[0],-w/2+72,-bh/2+230,170,'left',w*0.55,{orange:true}); var rest=st.slice(1,3); for(var i=0;i<rest.length;i++) stat(c,rest[i],w/2-72,-bh/2+120+i*130,64,'right',w*0.36,{orange:true});
    c.restore();
    var y=h-80; c.textAlign='left'; c.fillStyle=WH; font(c,BODY,28); if(scene.subtitle) c.fillText(scene.subtitle,72,y); if(scene.name){ font(c,BOLD,28); c.textAlign='right'; c.fillText(scene.name.toUpperCase(),w-72,y);}
    clockChip(c,k,w-64,64,'right'); } };

function buildLayer(){ var w=scene.w,h=scene.h; var off=document.createElement('canvas'); off.width=w; off.height=h; var c=off.getContext('2d'); (L[scene.layout]||L.farol).static(c,w,h); layer=off; }
function render(k){ if(!scene) return; var w=scene.w,h=scene.h,M=L[scene.layout]||L.farol; if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
  if(!layer) buildLayer(); ctx.clearRect(0,0,w,h); ctx.drawImage(layer,0,0); drawRoute(ctx,M.box(w,h),k==null?null:scene.frames[k].i); M.front(ctx,w,h,k); }

// ---------- exportar ----------
function sendBlob(id,blob,mime){ var r=new FileReader(); r.onload=function(){ var s=String(r.result); s=s.slice(s.indexOf(',')+1); var size=262144, n=Math.ceil(s.length/size);
  for(var i=0;i<n;i++) send({type:'chunk',id:id,i:i,n:n,data:s.slice(i*size,(i+1)*size)}); send({type:'done',id:id,mime:mime}); }; r.onerror=function(){ send({type:'error',id:id,message:'read'}); }; r.readAsDataURL(blob); }
function exportImage(id){ render(null); cv.toBlob(function(b){ if(!b){ send({type:'error',id:id,message:'image'}); return; } sendBlob(id,b,'image/jpeg'); },'image/jpeg',0.92); }
function pickMime(){ var list=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']; for(var i=0;i<list.length;i++){ try{ if(MediaRecorder.isTypeSupported(list[i])) return list[i]; }catch(e){} } return ''; }
function exportVideo(id){ if(!window.MediaRecorder||!cv.captureStream){ send({type:'error',id:id,message:'unsupported'}); return; } if(!scene.frames.length){ send({type:'error',id:id,message:'no-track'}); return; }
  var mime=pickMime(), stream=cv.captureStream(30), rec, chunks=[];
  try{ rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:6000000}:{videoBitsPerSecond:6000000}); }catch(e){ send({type:'error',id:id,message:'unsupported'}); return; }
  busy=true; var n=scene.frames.length, intro=15, hold=75, total=intro+n+hold, fps=30, last=-1;
  rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
  rec.onstop=function(){ busy=false; var type=(rec.mimeType||mime||'video/webm').split(';')[0]; sendBlob(id,new Blob(chunks,{type:type}),type); };
  render(0); rec.start(250); var t0=performance.now();
  (function tick(){ var k=Math.floor((performance.now()-t0)/1000*fps); if(k>=total){ render(null); setTimeout(function(){ rec.stop(); stream.getTracks().forEach(function(t){t.stop();}); },300); return; }
    if(k!==last){ last=k; render(k<intro?0:k<intro+n?k-intro:null); if(k%15===0) send({type:'progress',id:id,p:k/total}); }
    requestAnimationFrame(tick); })(); }

window.mbReceive=function(m){
  if(m.type==='assets'){ Promise.all([loadImg(m.logo).then(function(i){logo=i;}),loadFont('MBDisplay',m.display),loadFont('MBBody',m.body),loadFont('MBBold',m.bold)]).then(function(){ layer=null; render(null); send({type:'assets-ok'}); }); }
  else if(m.type==='bg'){ loadImg(m.src).then(function(i){ bg=i; layer=null; if(!busy) render(null); send({type:'bg-ok',key:m.key}); }); }
  else if(m.type==='scene'){ scene=m.scene; layer=null; if(!busy) render(null); }
  else if(m.type==='export'){ if(busy){ send({type:'error',id:m.id,message:'busy'}); return; } if(m.kind==='video') exportVideo(m.id); else exportImage(m.id); }
};
window.addEventListener('message',function(e){ if(typeof e.data==='string'&&e.data.charAt(0)==='{'){ try{ var m=JSON.parse(e.data); if(m&&m.to==='canvas') window.mbReceive(m); }catch(x){} } });
send({type:'ready'});
})();
</script></body></html>`;
