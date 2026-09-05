(function () {
  'use strict';
  const $=id=>document.getElementById(id), cfg={...Engine.defaults};
  let model=Engine.cycle(cfg), crank=0, selected=1, running=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last=performance.now(), audioContext=null, audioNode=null, gain=null, audible=false, startingAudio=false;
  const camera={yaw:0.95,elevation:0.40,zoom:1};
  const assembly=Assembly.create();
  const orbitVelocity={yaw:0,elevation:0};
  let labels=[], pointer=null, frame=0;
  const buttons=new Map();
  const modelDialog=$('model-dialog');
  $('open-model').onclick=()=>modelDialog.showModal();
  $('close-model').onclick=()=>modelDialog.close();
  modelDialog.addEventListener('click',event=>{
    if(event.target!==modelDialog)return;
    const r=modelDialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modelDialog.close();
  });
  for(const layer of Assembly.layers){
    const row=document.createElement('div');row.className='layer-row';row.dataset.layer=layer.id;
    const name=document.createElement('button');name.textContent=layer.name;name.onclick=()=>selectPart({layer:layer.id,name:layer.name,cylinder:null});
    const visibility=document.createElement('input');visibility.type='checkbox';visibility.checked=true;visibility.setAttribute('aria-label',`Show ${layer.name}`);
    visibility.onchange=()=>{if(visibility.checked)assembly.visible.add(layer.id);else assembly.visible.delete(layer.id);syncAssembly();};
    row.append(name,visibility);$('layer-list').append(row);
  }
  function syncAssembly(){
    for(const button of $('view-modes').children)button.setAttribute('aria-pressed',button.dataset.mode===assembly.mode);
    $('explode').value=assembly.targetExplode*100;$('explode-value').textContent=`${Math.round(assembly.targetExplode*100)}%`;
    for(const row of $('layer-list').children){row.querySelector('input').checked=assembly.visible.has(row.dataset.layer);row.classList.toggle('selected',row.dataset.layer===assembly.selected?.layer);}
    $('part-inspector').hidden=!assembly.selected;
    if(assembly.selected){$('part-name').textContent=assembly.selected.name;$('part-description').textContent=Assembly.layers.find(l=>l.id===assembly.selected.layer).description;}
  }
  function selectPart(part){assembly.selected=part;if(part?.cylinder)select(part.cylinder);syncAssembly();}
  for(const button of $('view-modes').children)button.onclick=()=>{assembly.mode=button.dataset.mode;assembly.targetExplode=assembly.mode==='exploded'?.85:0;assembly.visible=new Set(Assembly.layers.map(l=>l.id));assembly.selected=null;if(assembly.mode==='exploded')setRunning(false);syncAssembly();};
  $('explode').oninput=()=>{assembly.mode='exploded';assembly.targetExplode=Number($('explode').value)/100;syncAssembly();};
  $('show-all').onclick=()=>{assembly.visible=new Set(Assembly.layers.map(l=>l.id));assembly.selected=null;syncAssembly();};
  $('clear-part').onclick=()=>selectPart(null);
  $('hide-part').onclick=()=>{if(assembly.selected)assembly.visible.delete(assembly.selected.layer);selectPart(null);};
  $('isolate-part').onclick=()=>{if(assembly.selected)assembly.visible=new Set([assembly.selected.layer]);syncAssembly();};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){selectPart(null);}});
  for(let id=1;id<=8;id++){const label=document.createElement('span');label.textContent=id;$('part-labels').append(label);}
  for(const id of Engine.order){const b=document.createElement('button');b.textContent=id;b.setAttribute('aria-label',`Select cylinder ${id}`);b.setAttribute('aria-pressed',id===selected);b.onclick=()=>select(id);$('cylinders').append(b);buttons.set(id,b);}
  function select(id){selected=id;for(const [n,b] of buttons)b.setAttribute('aria-pressed',n===id);$('cylinder-title').textContent=`Cylinder ${id}`;}
  function audioParameters(){if(audioNode)audioNode.port.postMessage({rpm:cfg.rpm,amplitude:Math.max(.03,Math.min(1,(model.exhaustPressure-106000)/550000)),running:running&&!document.hidden});}
  function solve(){
    model=Engine.cycle(cfg);
    $('rpm-value').textContent=`${cfg.rpm} RPM`;$('throttle-value').textContent=`${Math.round(cfg.throttle*100)} %`;
    $('compression-value').textContent=`${cfg.compression.toFixed(1)} : 1`;$('advance-value').textContent=`${cfg.advance}° BTDC`;
    $('work').textContent=`${model.work.toFixed(1)} J`;$('power').textContent=`${(model.power/1000).toFixed(1)} kW`;
    $('tach-rpm').textContent=cfg.rpm;$('pulse-rate').textContent=(cfg.rpm*8/120).toFixed(0);
    audioParameters();
  }
  for(const key of ['rpm','throttle','compression','advance'])$(key).addEventListener('input',()=>{cfg[key]=Number($(key).value)/(key==='throttle'?100:1);solve();});
  function setRunning(value){running=value;$('pause').textContent=running?'Pause':'Resume';audioParameters();}
  $('pause').onclick=()=>setRunning(!running);
  $('angle').addEventListener('input',()=>{setRunning(false);crank=Number($('angle').value);});
  $('reset-view').onclick=()=>{Object.assign(camera,{yaw:.95,elevation:.40,zoom:1});orbitVelocity.yaw=orbitVelocity.elevation=0;};
  $('engine').addEventListener('pointerdown',e=>{
    if(pointer||e.button!==0)return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:e.timeStamp,moved:false};
    orbitVelocity.yaw=orbitVelocity.elevation=0;
    $('engine').setPointerCapture(e.pointerId);
  });
  $('engine').addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    const elapsed=Math.max(.008,(e.timeStamp-pointer.time)/1000);
    const sensitivity=2.8/Math.min($('engine').clientWidth,$('engine').clientHeight);
    pointer.moved ||= Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>4;
    if(pointer.moved){
      // Orbit the camera in the opposite horizontal direction so the object follows the hand.
      const yaw=-dx*sensitivity,elevation=dy*sensitivity;
      camera.yaw+=yaw;camera.elevation=Math.max(-.15,Math.min(1.2,camera.elevation+elevation));
      orbitVelocity.yaw=.5*orbitVelocity.yaw+.5*Math.max(-3,Math.min(3,yaw/elapsed));
      orbitVelocity.elevation=.5*orbitVelocity.elevation+.5*Math.max(-2,Math.min(2,elevation/elapsed));
    }
    pointer.x=e.clientX;pointer.y=e.clientY;pointer.time=e.timeStamp;
  });
  $('engine').addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    if(!pointer.moved){const rect=$('engine').getBoundingClientRect();const x=e.clientX-rect.left,y=e.clientY-rect.top;let nearest=null,distance=14;for(const l of labels){const d=Math.hypot(l.point[0]-x,l.point[1]-y);if(d<distance){distance=d;nearest=l.id;}}if(nearest){select(nearest);selectPart({layer:'rotating',name:`Piston & rod ${nearest}`,cylinder:nearest});}else selectPart(Scene.pick(x,y));}
    if(e.timeStamp-pointer.time>80||matchMedia('(prefers-reduced-motion: reduce)').matches)orbitVelocity.yaw=orbitVelocity.elevation=0;
    pointer=null;
  });
  $('engine').addEventListener('pointercancel',()=>{pointer=null;orbitVelocity.yaw=orbitVelocity.elevation=0;});
  $('engine').addEventListener('wheel',e=>{e.preventDefault();camera.zoom=Math.max(.65,Math.min(1.5,camera.zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
  $('engine').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();orbitVelocity.yaw=orbitVelocity.elevation=0;camera.yaw+=(e.key==='ArrowLeft'?.1:e.key==='ArrowRight'?-.1:0);camera.elevation=Math.max(-.15,Math.min(1.2,camera.elevation+(e.key==='ArrowUp'?-.06:e.key==='ArrowDown'?.06:0)));}});
  const workletSource=`class Exhaust extends AudioWorkletProcessor {
    constructor(){super();this.rpm=2400;this.amplitude=.5;this.running=true;this.phase=0;this.event=-1;this.impulses=[];this.a=0;this.b=0;
      this.port.onmessage=e=>{Object.assign(this,e.data);};}
    process(inputs,outputs){const channels=outputs[0],n=channels[0].length,order=[1,8,4,3,6,5,7,2];
      for(let i=0;i<n;i++){
        if(this.running){this.phase+=this.rpm*6/sampleRate;const current=Math.floor((this.phase-180)/90);
          if(current!==this.event){this.event=current;const cylinder=order[((current%8)+8)%8];this.impulses.push({age:0,bank:cylinder%2,amp:this.amplitude});}}
        let left=0,right=0;
        for(let j=this.impulses.length-1;j>=0;j--){const p=this.impulses[j];const t=p.age++/sampleRate;
          if(t>.12){this.impulses.splice(j,1);continue;}
          const f=p.bank?83:97;
          const wave=p.amp*(Math.exp(-t*85)*Math.sin(2*Math.PI*f*t)+.36*Math.exp(-t*145)*Math.sin(2*Math.PI*f*2.7*t)+.16*Math.exp(-t*650)*Math.sin(2*Math.PI*1250*t));
          left+=wave*(p.bank?1:.55);right+=wave*(p.bank?.55:1);}
        // Smooth saturation bounds stacked pulses without clipping.
        channels[0][i]=Math.tanh(left*.75)*.65;if(channels[1])channels[1][i]=Math.tanh(right*.75)*.65;
      }return true;
    }
  }registerProcessor('v8-exhaust',Exhaust);`;
  $('sound').onclick=async()=>{
    if(startingAudio)return;
    startingAudio=true;
    try{
      if(!audioContext){audioContext=new AudioContext();await audioContext.resume();
        if(!audioContext.audioWorklet)throw new Error('AudioWorklet is unavailable. Open this on localhost in a current browser.');
        const url=URL.createObjectURL(new Blob([workletSource],{type:'text/javascript'}));
        try{await audioContext.audioWorklet.addModule(url);}finally{URL.revokeObjectURL(url);}
        audioNode=new AudioWorkletNode(audioContext,'v8-exhaust',{numberOfOutputs:1,outputChannelCount:[2]});gain=audioContext.createGain();gain.gain.value=0;audioNode.connect(gain).connect(audioContext.destination);audioParameters();
      }
      await audioContext.resume();audible=!audible;gain.gain.setTargetAtTime(audible?.35:0,audioContext.currentTime,.025);
      $('sound').textContent=audible?'Mute sound':'Start sound';$('sound').setAttribute('aria-pressed',audible);
      $('audio-status').textContent='';
    }catch(error){$('audio-status').textContent=`Sound could not start: ${error.message}`;if(audioContext)await audioContext.close();audioContext=null;audioNode=null;audible=false;}
    finally{startingAudio=false;}
  };
  document.addEventListener('visibilitychange',()=>{last=performance.now();audioParameters();if(gain)gain.gain.setTargetAtTime(!document.hidden&&audible?.35:0,audioContext.currentTime,.025);});
  function draw(now){
    const dt=Math.min((now-last)/1000,.05);last=now;
    assembly.explode+=(assembly.targetExplode-assembly.explode)*(1-Math.exp(-8*dt));
    if(Math.abs(assembly.explode-assembly.targetExplode)<.0001)assembly.explode=assembly.targetExplode;
    if(!pointer){
      const decay=Math.exp(-12*dt),travel=(1-decay)/12;
      camera.yaw+=orbitVelocity.yaw*travel;
      camera.elevation=Math.max(-.15,Math.min(1.2,camera.elevation+orbitVelocity.elevation*travel));
      orbitVelocity.yaw*=decay;orbitVelocity.elevation*=decay;
    }
    if(running&&!document.hidden){const speed=$('speed').value;crank=Engine.mod(crank+dt*(speed==='real'?cfg.rpm:Number(speed))*6,720);}
    const phase=Engine.phase(crank,selected),sample=Engine.sampleAt(model,phase);
    labels=Scene.render($('engine'),model,crank,selected,camera,assembly);Renderer.pv($('pv'),model,phase);
    for(const el of $('part-labels').children)el.hidden=true;
    for(const label of labels){const el=$('part-labels').children[label.id-1];el.hidden=false;el.style.left=`${label.point[0]}px`;el.style.top=`${label.point[1]}px`;el.style.color=label.color;}
    const pc=$('pulses'),pw=pc.clientWidth,ph=pc.clientHeight,pr=Math.min(devicePixelRatio||1,2);
    if(pc.width!==Math.round(pw*pr)||pc.height!==Math.round(ph*pr)){pc.width=Math.round(pw*pr);pc.height=Math.round(ph*pr);}
    const px=pc.getContext('2d');px.setTransform(pr,0,0,pr,0,0);px.clearRect(0,0,pw,ph);px.strokeStyle='#dce4e9';px.lineWidth=1;
    for(let i=0;i<6;i++){px.beginPath();px.moveTo(i*pw/5,5);px.lineTo(i*pw/5,ph-15);px.stroke();}
    px.beginPath();const rate=cfg.rpm/15;for(let i=0;i<pw;i++){const t=i/pw*.05;const age=Engine.mod(t,1/rate);const value=Math.exp(-age*400)*Math.sin(age*1800);const y=ph*.60-value*ph*.40;if(i===0)px.moveTo(i,y);else px.lineTo(i,y);}px.strokeStyle='#328ca7';px.lineWidth=1.3;px.stroke();px.font='9px Consolas,monospace';px.fillStyle='#697c89';px.fillText('0',0,ph-2);px.textAlign='right';px.fillText('50 ms',pw,ph-2);px.textAlign='left';
    if(frame++%3===0){
      $('angle').value=crank;$('angle-value').textContent=`${crank.toFixed(0)}° CA`;
      $('partial').textContent=`${sample.work.toFixed(1)} J`;$('stroke-track').firstElementChild.style.left=`${phase/720*100}%`;
      const stroke=Math.floor(phase/180);[...$('stroke-labels').children].forEach((el,i)=>el.classList.toggle('active',i===stroke));
      $('live-state').textContent=`Cylinder ${selected}: ${phase.toFixed(0)}° · ${(sample.p/1e5).toFixed(1)} bar · ${(sample.v*1e6).toFixed(0)} cm³`;
      for(const [id,b]of buttons){const p=Engine.phase(crank,id);b.classList.toggle('firing',p>=model.start&&p<model.start+model.duration);}
    }
    requestAnimationFrame(draw);
  }
  const initialView=new URLSearchParams(location.search).get('view');
  if(['assembled','cutaway','exploded'].includes(initialView)){
    assembly.mode=initialView;
    if(initialView==='exploded'){assembly.explode=assembly.targetExplode=.85;running=false;}
  }
  syncAssembly();solve();setRunning(running);requestAnimationFrame(draw);
  // Read-only diagnostics for numerical and browser verification.
  window.v8Lab={get model(){return model;},get state(){return {crank,selected,running,audible,audioState:audioContext?.state,camera:{...camera},assembly:{mode:assembly.mode,explode:assembly.explode,visible:[...assembly.visible],selected:assembly.selected}};}};
})();
