/* Native WebGL assembly renderer with independent parts and exact color picking. */
(function(root){
  'use strict';
  const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k),sub=(a,b)=>add(a,b,-1),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>a.map(v=>v/Math.hypot(...a));
  const axes=[[1,0,0],[0,1,0],[0,0,1]],shaftAxes=[[1,0,0],[0,0,1],[0,1,0]];
  function mul(a,b){const c=new Float32Array(16);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)c[col*4+row]+=a[k*4+row]*b[col*4+k];return c;}
  let state=null,lastFrame=null;
  const cuttable=new Set(['block','heads','pan','covers','intake','timing']);
  function init(canvas){
    const gl=canvas.getContext('webgl',{antialias:true,alpha:false});if(!gl)throw Error('WebGL is required for the engine view.');
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 position;attribute vec3 normal;uniform mat4 mvp;uniform mat4 model;uniform mat3 normalMatrix;varying vec3 N;varying vec3 P;void main(){P=(model*vec4(position,1.)).xyz;N=normalMatrix*normal;gl_Position=mvp*vec4(position,1.);}`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec3 N;varying vec3 P;uniform vec4 color;uniform vec3 eye;uniform float metal;uniform float cutaway;uniform float picking;uniform vec3 pickColor;void main(){if(cutaway>.5&&P.x>.002)discard;if(picking>.5){gl_FragColor=vec4(pickColor,1.);return;}vec3 n=normalize(N);vec3 l=normalize(vec3(-.5,1.,.8));vec3 v=normalize(eye-P);float d=max(dot(n,l),0.);float fill=max(dot(n,normalize(vec3(.7,.4,-1.))),0.);float spec=pow(max(dot(n,normalize(l+v)),0.),36.+metal*48.);float rim=pow(1.-abs(dot(n,v)),3.);float grain=sin(P.x*4100.)*sin(P.y*3900.)*sin(P.z*4300.)*.015*(1.-metal);vec3 c=color.rgb*(.42+.58*d+.20*fill+grain)+vec3(spec*.48*metal+rim*.08*metal);gl_FragColor=vec4(c,color.a);}`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    const attrs={position:gl.getAttribLocation(program,'position'),normal:gl.getAttribLocation(program,'normal')};
    const U=Object.fromEntries(['mvp','model','normalMatrix','color','eye','metal','cutaway','picking','pickColor'].map(k=>[k,gl.getUniformLocation(program,k)]));
    const meshData={...Geometry.meshes(),...(root.BlenderMeshes||{})},meshes={};
    for(const[name,vertices]of Object.entries(meshData)){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);meshes[name]={buffer,count:vertices.length/6};}
    return {gl,program,attrs,U,meshes,canvas,meshData,pickBuffer:null};
  }
  function draw(command,vp,picking=false,index=0){
    const {gl,U,meshes,attrs}=state,c=command;
    const m=new Float32Array([...c.basis[0].map(v=>v*c.size[0]),0,...c.basis[1].map(v=>v*c.size[1]),0,...c.basis[2].map(v=>v*c.size[2]),0,...c.center,1]);
    const normals=new Float32Array([...c.basis[0].map(v=>v/c.size[0]),...c.basis[1].map(v=>v/c.size[1]),...c.basis[2].map(v=>v/c.size[2])]);
    gl.uniformMatrix4fv(U.mvp,false,mul(vp,m));gl.uniformMatrix4fv(U.model,false,m);gl.uniformMatrix3fv(U.normalMatrix,false,normals);gl.uniform4fv(U.color,c.color);gl.uniform1f(U.metal,c.metal);gl.uniform1f(U.cutaway,c.cut?1:0);gl.uniform1f(U.picking,picking?1:0);
    if(picking)gl.uniform3fv(U.pickColor,[(index&255)/255,((index>>8)&255)/255,((index>>16)&255)/255]);
    const mesh=meshes[c.type];gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(attrs.position);gl.enableVertexAttribArray(attrs.normal);gl.vertexAttribPointer(attrs.position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attrs.normal,3,gl.FLOAT,false,24,12);gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  function render(canvas,model,crank,selected,camera,assembly){
    if(!state)state=init(canvas);
    const {gl,program,U}=state,w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2),e=assembly.explode;
    const signature=[w,h,dpr,crank,selected,camera.yaw,camera.elevation,camera.zoom,e,assembly.mode,[...assembly.visible].join(','),assembly.selected?.layer,...Object.values(model.cfg)].join('|');
    if(lastFrame?.signature===signature)return lastFrame.labels;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.965,.972,.975,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.useProgram(program);
    const target=[0,.10+e*.06,0],distance=1.6;
    const eye=add(target,[Math.sin(camera.yaw)*Math.cos(camera.elevation)*distance,Math.sin(camera.elevation)*distance,Math.cos(camera.yaw)*Math.cos(camera.elevation)*distance]);
    const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);
    const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
    const mobile=w<760,usableW=mobile?w-15:Math.max(380,w-535),usableH=mobile?355:Math.max(300,h-220);
    const scale=Math.min(usableW/(.67+e*.32),usableH/(.58+e*.80))*camera.zoom;
    const centerX=mobile?w*.5:(w>1100?w*.49:w*.44),centerY=mobile?258:h*.43;
    const proj=new Float32Array([2*scale/w,0,0,0,0,2*scale/h,0,0,0,0,-2/5,0,2*centerX/w-1,1-2*centerY/h,-1,1]);
    const vp=mul(proj,view);gl.uniform3fv(U.eye,eye);
    const silver=[.70,.75,.79,1],cast=[.57,.64,.68,1],dark=[.075,.095,.12,1],steel=[.34,.40,.45,1],brass=[.63,.48,.28,1],cover=[.16,.24,.29,1];
    const commands=[],labels=[];let context={layer:'block',name:'Cylinder block',offset:[0,0,0],cylinder:null};
    function group(layer,name,bank=0,cylinder=null){
      const u=[bank*Math.SQRT1_2,Math.SQRT1_2,0];let offset=[0,0,0];
      if(layer==='block')offset=[0,.115*e,0];
      if(layer==='bearings')offset=[0,-.075*e,0];
      if(layer==='pan')offset=[0,-.19*e,0];
      if(layer==='heads')offset=add([0,.15*e,0],u,.12*e);
      if(layer==='valves')offset=bank?add([0,.18*e,0],u,.17*e):[0,.05*e,0];
      if(layer==='covers')offset=add([0,.25*e,0],u,.23*e);
      if(layer==='intake')offset=[0,.39*e,0];
      if(layer==='exhaust')offset=[bank*.19*e,0,0];
      if(layer==='timing')offset=[0,0,(name.includes('Flywheel')?1:-1)*.16*e];
      context={layer,name,offset,cylinder};
    }
    function part(type,center,basis,size,color,metal=1,pickable=true){
      if(!assembly.visible.has(context.layer))return;
      const selectedLayer=assembly.selected?.layer===context.layer;
      const tint=selectedLayer?[Math.min(1,color[0]*.78+.25),Math.min(1,color[1]*.8+.13),color[2]*.75,color[3]]:color;
      commands.push({type,center:add(center,context.offset),basis,size,color:tint,metal,pickable,layer:context.layer,name:context.name,cylinder:context.cylinder,cut:assembly.mode==='cutaway'&&cuttable.has(context.layer)});
    }
    function tube(a,b,r,color=silver,type='cylinder',metal=1){const delta=sub(b,a),u=norm(delta),n=norm(cross(Math.abs(u[2])<.9?[0,0,1]:[1,0,0],u)),v=cross(n,u);part(type,add(a,delta,.5),[n,u,v],[r,Math.hypot(...delta),r],color,metal);}
    function box(c,size,color=cast,basis=axes,type='box',metal=.5){part(type,c,basis,size,color,metal);}
    function bolt(c,u,r=.003){tube(c,add(c,u,.003),r,silver);tube(add(c,u,.003),add(c,u,.0038),r*.43,dark);}
    function pipe(points,r,color=steel){for(let i=1;i<points.length;i++)tube(points[i-1],points[i],r,color);}
    const head=Engine.r+Engine.rod+.012+Engine.stroke/(model.cfg.compression-1);
    // A continuous casting with eight through-bores, a valley, and lower crankcase skirt.
    group('block','Cylinder block');
    part('halfTube',[0,0,0],shaftAxes,[.103,.46,.076],cast,.4);
    for(const xx of[-.093,.093])box([xx,-.055,0],[.023,.022,.478],cast);
    box([0,.086,0],[.065,.018,.455],cast);
    for(const bank of[-1,1]){
      const u=[bank*Math.SQRT1_2,Math.SQRT1_2,0],n=[Math.SQRT1_2,-bank*Math.SQRT1_2,0],basis=[n,u,[0,0,1]],pos=(d,zz=0)=>[u[0]*d,u[1]*d,zz];
      group('block',bank<0?'Left cylinder bank':'Right cylinder bank',bank);
      for(let i=0;i<4;i++){
        const zz=(i-1.5)*.11;
        part('bore',pos((.078+head)/2,zz),basis,[.055,head-.078,.055],cast,.38);
        part('liner',pos((.080+head)/2,zz),basis,[.043,head-.080,.043],silver);
        for(const side of[-1,1]){const c=add(pos(head+.001,zz),n,side*.047);bolt(c,u,.003);}
        const plug=add(pos(.122,zz),n,bank*.057);tube(plug,add(plug,n,bank*.003),.013,steel);tube(add(plug,n,bank*.003),add(plug,n,bank*.004),.010,brass);
      }
      for(const side of[-1,1])box(add(pos(.128),n,side*.058),[.012,.099,.454],cast,basis);
      // Heads, ports, and spark plugs. A bank remains intact in the half-section view.
      group('heads',bank<0?'Left cylinder head':'Right cylinder head',bank);
      box(pos(head+.024),[.129,.043,.472],silver,basis,'bevel',.72);
      box(pos(head+.001),[.132,.002,.474],dark,basis);
      for(let i=0;i<4;i++){
        const zz=(i-1.5)*.11;
        for(const side of[-1,1]){
          const p=add(pos(head+.021,zz),n,side*.065);
          tube(p,add(p,n,side*.004),.015,steel,'tube');
          tube(add(p,n,side*.001),add(p,n,side*.002),.011,dark);
        }
        const plug=add(pos(head+.01,zz+.031),n,bank*.052);tube(plug,add(plug,n,bank*.025),.004,[.88,.87,.78,1]);
        bolt(add(pos(head+.047,zz),n,bank*.045),u,.004);
      }
      // Removable ribbed covers with a gasket and perimeter fasteners.
      group('covers',bank<0?'Left rocker cover':'Right rocker cover',bank);
      box(pos(head+.089),[.127,.051,.468],cover,basis,'coverShell',.7);
      box(pos(head+.064),[.136,.004,.475],dark,basis);
      for(const offset of[-.033,-.016,0,.016,.033])box(add(pos(head+.115),n,offset),[.005,.004,.374],silver,basis,'bevel');
      for(const zz of[-.185,0,.185])for(const side of[-1,1])bolt(add(pos(head+.077,zz),n,side*.059),u,.004);
      if(bank<0){const cap=pos(head+.122,-.14);part('cylinder',cap,basis,[.018,.015,.018],dark);part('cylinder',add(cap,u,.008),basis,[.015,.002,.015],brass);}
    }
    // Crankshaft with four cross-plane throws and individual counterweights.
    group('rotating','Cross-plane crankshaft');tube([0,0,-.274],[0,0,.258],.016,silver);
    for(let i=0;i<4;i++){
      const k=Engine.piston(crank,i*2+1),zz=(i-1.5)*.11,p=[k.pin[0],k.pin[1],zz];
      const radial=norm([p[0],p[1],0]),perp=[-radial[1],radial[0],0];
      for(const offset of[-.032,.032]){
        tube([0,0,zz+offset],add(p,[0,0,1],offset),.017,steel);
        part('weight',[-p[0]*.38,-p[1]*.38,zz+offset],[perp,[0,0,1],radial],[.047,.014,.047],steel);
      }
      tube(add(p,[0,0,1],-.033),add(p,[0,0,1],.033),.013,silver);
    }
    for(let i=0;i<5;i++){
      const zz=-.22+i*.11;group('bearings',`Main bearing ${i+1}`);
      part('halfTube',[0,-.002,zz],shaftAxes,[.027,.023,.027],brass);
      part('halfTube',[0,-.005,zz],shaftAxes,[.034,.028,.034],silver);
      for(const xx of[-.041,.041]){box([xx,-.024,zz],[.025,.029,.03],silver,axes,'bevel');tube([xx,-.048,zz],[xx,.012,zz],.003,steel);bolt([xx,-.05,zz],[0,-1,0],.005);}
    }
    // Pistons and rods retain the exact thermodynamic slider-crank positions.
    for(let id=1;id<=8;id++){
      const k=Engine.piston(crank,id),phase=Engine.phase(crank,id),s=Engine.sampleAt(model,phase),bank=id%2?-1:1,basis=[k.n,k.u,[0,0,1]],pos=d=>[k.u[0]*d,k.u[1]*d,k.axial];
      group('rotating',`Piston & rod ${id}`,bank,id);
      const delta=sub(k.center,k.pin),rodU=norm(delta),rodN=norm(cross([0,0,1],rodU));
      box(add(k.pin,delta,.5),[.012,Math.hypot(...delta)-.01,.011],silver,[rodN,rodU,[0,0,1]],'bevel');
      box(add(k.pin,delta,.5),[.007,Math.hypot(...delta)-.025,.0115],steel,[rodN,rodU,[0,0,1]],'bevel');
      tube(add(k.pin,[0,0,1],-.009),add(k.pin,[0,0,1],.009),.019,silver,'tube');
      part('cylinder',pos(k.distance-.004),basis,[.041,.033,.041],silver);
      for(const d of[.001,.0055,.0095])part('cylinder',pos(k.distance+d),basis,[.0415,.0014,.0415],dark);
      part('cylinder',pos(k.distance+.013),basis,[.035,.001,.035],[.78,.80,.80,1]);
      tube(add(k.center,k.n,-.041),add(k.center,k.n,.041),.006,steel);
      // Valve lift uses smooth ideal stroke timing; it remains illustrative, not a cam design.
      group('valves',`Valve gear ${id}`,bank,id);
      for(const side of[-1,1]){
        const valvePhase=side<0?phase:phase-540,lift=valvePhase>=0&&valvePhase<180?.009*Math.sin(valvePhase*Math.PI/180)**2:0;
        const valve=add(pos(head+.002-lift),k.n,side*.020);
        part('cylinder',valve,basis,[.014,.003,.014],side<0?silver:brass);
        tube(valve,add(valve,k.u,.064),.0025,steel);
        const springBase=add(pos(head+.045),k.n,side*.020),length=.021-lift;
        part('spring',add(springBase,k.u,length/2),basis,[.007,length,.007],steel);
        part('cylinder',add(springBase,k.u,length),basis,[.009,.003,.009],silver);
        const pivot=pos(head+.066),tip=add(pos(head+.066-lift),k.n,side*.020),back=add(pos(head+.066+lift*.6),k.n,-side*.025);
        tube(back,tip,.004,silver);tube(add(pivot,[0,0,1],-.008),add(pivot,[0,0,1],.008),.006,steel);
        const lifter=[bank*.018,.088,k.axial+side*.014];tube(lifter,back,.0028,silver);
      }
      const crown=k.distance+.012,col=phase<180?[.20,.67,.83,.13]:phase<360?[.38,.64,.73,.1]:phase<540?[1,.40,.065,.17+Math.min(1,s.p/model.peak)*.33]:[.52,.57,.6,.10];
      group('rotating',`Combustion chamber ${id}`,bank,id);
      if(assembly.mode==='cutaway'&&e<.01&&bank>0)part('cylinder',pos((head+crown)/2),basis,[.039,Math.max(.001,head-crown),.039],col,0,false);
      if(assembly.visible.has('rotating')&&(assembly.mode==='cutaway'||assembly.mode==='exploded')){
        const p=add(pos(head+.077),assembly.mode==='exploded'?[0,.01,0]:[0,0,0]),clip=[0,0,0,0];for(let row=0;row<4;row++)for(let j=0;j<4;j++)clip[row]+=vp[j*4+row]*[...p,1][j];
        labels.push({id,point:[(clip[0]+1)*w/2,(1-clip[1])*h/2],color:id===selected?'#c27816':'#546774'});
      }
    }
    group('valves','Camshaft');tube([0,.08,-.24],[0,.08,.24],.009,steel);
    for(let i=0;i<16;i++){const a=(crank*.5+i*45)*Math.PI/180,zz=-.20+i*.0267;part('cylinder',[Math.sin(a)*.0035,.08+Math.cos(a)*.0035,zz],shaftAxes,[.013,.009,.013],silver);}
    // Sealed intake plenum, curved runners, and a front throttle body.
    group('intake','Intake plenum');box([0,.254,0],[.115,.071,.331],silver,axes,'bevel',.6);
    box([0,.290,0],[.095,.009,.31],cover,axes,'bevel');
    for(let i=0;i<7;i++)box([0,.296,-.12+i*.04],[.083,.003,.005],silver,axes,'bevel');
    for(const bank of[-1,1])for(let i=0;i<4;i++){
      group('intake',`${bank<0?'Left':'Right'} intake runner ${i+1}`);
      const zz=(i-1.5)*.11;pipe([[bank*.037,.243,zz*.8],[bank*.061,.214,zz],[bank*.09,.191,zz],[bank*.113,.172,zz]],.014,silver);
      for(const side of[-1,1])bolt([bank*.062,.215,zz+side*.015],[0,1,0],.0025);
    }
    group('intake','Throttle body');tube([0,.256,-.173],[0,.256,-.221],.029,steel,'tube');tube([0,.256,-.22],[0,.256,-.228],.033,silver,'tube');
    part('cylinder',[0,.256,-.22],shaftAxes,[.024,.002,.024],brass);
    // Short, swept exhaust manifolds with flanges and merged outlets.
    for(const bank of[-1,1]){
      for(let i=0;i<4;i++){
        group('exhaust',`${bank<0?'Left':'Right'} exhaust runner ${i+1}`,bank);
        const zz=(i-1.5)*.11;
        pipe([[bank*.189,.12,zz],[bank*.212,.10,zz],[bank*.234,.056,zz+.014],[bank*.22,.018,.205]],.012,steel);
        box([bank*.187,.119,zz],[.009,.043,.043],silver);
        for(const dz of[-.017,.017])bolt([bank*.194,.126,zz+dz],[bank,0,0],.003);
      }
      group('exhaust',bank<0?'Left exhaust collector':'Right exhaust collector',bank);
      tube([bank*.22,.018,.19],[bank*.22,-.004,.27],.024,steel,'tube');tube([bank*.22,-.004,.266],[bank*.22,-.007,.276],.029,silver,'tube');
    }
    group('pan','Oil sump');box([0,-.109,0],[.191,.085,.445],dark,axes,'sump',.75);
    box([0,-.065,0],[.218,.008,.48],silver,axes,'flange');box([0,-.061,0],[.215,.002,.476],dark,axes,'flange');
    for(const xx of[-.096,.096])for(let i=0;i<8;i++)bolt([xx,-.071,-.211+i*.0603],[0,-1,0],.0035);
    for(const xx of[-.065,-.032,0,.032,.065])box([xx,-.152,0],[.007,.003,.33],steel,axes,'bevel');
    tube([.083,-.131,.16],[.101,-.131,.16],.005,brass);
    // Sprockets, chain links, front cover, pulley, and flywheel.
    group('timing','Timing chain & sprockets');
    for(const[yy,radius,ratio]of[[0,.025,1],[.08,.05,.5]]){
      tube([0,yy,-.254],[0,yy,-.265],radius,silver,'tube');
      const count=ratio===1?20:40;
      for(let i=0;i<count;i++){const a=(crank*ratio)*Math.PI/180+i*Math.PI*2/count;box([Math.cos(a)*radius,yy+Math.sin(a)*radius,-.262],[.004,.004,.011],steel);}
      tube([0,yy,-.25],[0,yy,-.268],.009,steel);
    }
    for(let side of[-1,1])for(let i=0;i<16;i++){
      const t=((i/16+Engine.mod(crank,360)/360/16)%1),xx=side*(.025+.025*t),yy=.08*t;
      box([xx,yy,-.267],[.007,.004,.004],dark);
    }
    for(const[yy,radius,start,count]of[[.08,.05,0,32],[0,.025,Math.PI,16]])for(let i=0;i<count;i++){
      const a=start+(i+.5)*Math.PI/count;
      box([Math.cos(a)*radius,yy+Math.sin(a)*radius,-.267],[.005,.004,.005],dark);
    }
    group('timing','Front timing cover');box([0,.038,-.281],[.143,.192,.022],cover,axes,'bevel',.7);
    tube([0,0,-.29],[0,0,-.324],.049,steel);for(const zz of[-.30,-.307,-.314])tube([0,0,zz],[0,0,zz-.002],.050,dark);
    for(const xx of[-.055,.055])for(const yy of[-.035,.04,.115])bolt([xx,yy,-.294],[0,0,-1],.0035);
    group('timing','Flywheel');tube([0,0,.257],[0,0,.281],.075,silver);tube([0,0,.281],[0,0,.285],.066,steel);tube([0,0,.285],[0,0,.292],.019,silver);
    for(let i=0;i<64;i++){const a=(crank+i*360/64)*Math.PI/180;box([Math.cos(a)*.075,Math.sin(a)*.075,.270],[.004,.004,.022],steel);}
    for(let i=0;i<8;i++){const a=crank*Math.PI/180+i*Math.PI/4;bolt([Math.cos(a)*.038,Math.sin(a)*.038,.286],[0,0,1],.004);}
    const opaque=commands.filter(c=>c.color[3]>=1),transparent=commands.filter(c=>c.color[3]<1);
    for(let i=0;i<16;i++)transparent.push({type:'cylinder',center:[0,-.156-e*.19,0],basis:axes,size:[.32-i*.009,.0001,.27-i*.007],color:[.32,.39,.43,.007],metal:0,pickable:false,cut:false});
    gl.disable(gl.BLEND);gl.depthMask(true);for(const c of opaque)draw(c,vp);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    transparent.sort((a,b)=>dot(sub(b.center,eye),z)-dot(sub(a.center,eye),z));for(const c of transparent)draw(c,vp);
    gl.depthMask(true);gl.disable(gl.BLEND);lastFrame={commands,vp,eye,w,h,signature,labels};
    return labels;
  }
  function pick(x,y){
    if(!state||!lastFrame)return null;
    const{gl,canvas,U}=state,{commands,vp}=lastFrame;
    if(!state.pickBuffer||state.pickBuffer.width!==canvas.width||state.pickBuffer.height!==canvas.height){
      if(state.pickBuffer){gl.deleteFramebuffer(state.pickBuffer.fbo);gl.deleteTexture(state.pickBuffer.texture);gl.deleteRenderbuffer(state.pickBuffer.depth);}
      const fbo=gl.createFramebuffer(),texture=gl.createTexture(),depth=gl.createRenderbuffer();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,canvas.width,canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,canvas.width,canvas.height);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);state.pickBuffer={fbo,texture,depth,width:canvas.width,height:canvas.height};
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,state.pickBuffer.fbo);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.depthMask(true);
    commands.forEach((c,i)=>{if(c.pickable)draw(c,vp,true,i+1);});
    const pixel=new Uint8Array(4),px=Math.min(canvas.width-1,Math.max(0,Math.floor(x/canvas.clientWidth*canvas.width))),py=Math.min(canvas.height-1,Math.max(0,Math.floor((1-y/canvas.clientHeight)*canvas.height)));
    gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.uniform1f(U.picking,0);gl.enable(gl.DITHER);
    const c=commands[pixel[0]+pixel[1]*256+pixel[2]*65536-1];return c?{layer:c.layer,name:c.name,cylinder:c.cylinder}:null;
  }
  root.Scene={render,pick,exportAssembly:()=>({meshes:state?.meshData,parts:lastFrame?.commands.filter(c=>c.pickable).map(c=>({...c,cut:false})),source:root.BlenderMeshes?'Blender':'procedural'})};
})(globalThis);
