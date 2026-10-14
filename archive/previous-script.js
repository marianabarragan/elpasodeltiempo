(() => {
  'use strict';
  const app = window.TimeExperience;

  const scenes = [...document.querySelectorAll('[data-scene]')];
  const state = {
    scene: 'intro', selectedColor: null, crayonActive: false,
    drawingProgress: 0, tasks: new Set(), pencilAttempts: 0,
    sound: false, hintTimer: null
  };
  const progress = { intro: 0, childhood: 8, adulthood: 36, oldage: 64, reflection: 100, contribute: 100, closing: 100 };
  const labels = ['childhood', 'adulthood', 'oldage', 'reflection'];
  const info = {
    tiempo: { title: 'Comparte tu tiempo', body: 'Empieza con algo sencillo y cercano. Muchas organizaciones realizan encuentros abiertos en los que puedes conversar, leer, caminar o compartir un saber.', ideas: ['Una llamada o visita acordada', 'Una tarde de juegos o lectura', 'Enseñar o aprender algo juntos'] },
    acompañar: { title: 'Acompaña un proceso', body: 'El acompañamiento frecuente permite que la confianza aparezca poco a poco. Puedes vincularte a un programa de voluntariado local y elegir una frecuencia posible para ti.', ideas: ['Consulta programas en tu comunidad', 'Define una frecuencia sostenible', 'Escucha y construye el vínculo con respeto'] },
    aporte: { title: 'Haz un aporte', body: 'Un aporte material o económico ayuda a sostener actividades y espacios de encuentro. Antes de donar, pregunta a la organización qué necesita realmente.', ideas: ['Materiales para talleres', 'Alimentos o elementos de cuidado', 'Apoyo económico a una entidad verificada'] }
  };
  const COLORS = { purple: 0x43265f, orange: 0xef7445, yellow: 0xf5bd38, green: 0x63a76e, turquoise: 0x58b9ae, brown: 0xa96342 };
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .82, metalness: 0, ...options });

  function box(w, h, d, color, x, y, z, rotationY = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    mesh.position.set(x, y, z); mesh.rotation.y = rotationY;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function cylinder(radiusTop, radiusBottom, height, segments, color, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), mat(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  class LowPolyWorld {
    constructor(containerId, mode) {
      this.container = document.getElementById(containerId);
      this.mode = mode;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color({ childhood: 0xf7e8bd, adulthood: 0xdfe4e4, oldage: 0xeadbcd }[mode]);
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.className = 'three-canvas';
      this.container.appendChild(this.renderer.domElement);
      this.camera = new THREE.OrthographicCamera(-9, 9, 7, -7, .1, 100);
      this.target = new THREE.Vector3(1.2, 0, 0);
      this.azimuth = -.72; this.elevation = .82; this.distance = 20; this.frustum = 15;
      this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
      this.drag = null; this.painting = false; this.lastPaintPoint = null; this.interactives = [];
      this.root = new THREE.Group(); this.scene.add(this.root);
      this.addLights();
      if (mode === 'childhood') this.buildChildhood();
      if (mode === 'adulthood') this.buildAdulthood();
      if (mode === 'oldage') this.buildOldAge();
      this.bindControls(); this.updateCamera(); this.resize();
      this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.container);
      this.animate();
    }

    addLights() {
      this.scene.add(new THREE.HemisphereLight(0xfff6df, 0x58465c, 2.25));
      const key = new THREE.DirectionalLight(0xffe1a6, 3.1);
      key.position.set(-7, 14, 9); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
      this.scene.add(key);
      const fill = new THREE.DirectionalLight(0xb9dfea, 1.15); fill.position.set(10, 8, -9); this.scene.add(fill);
    }
    addFloor(color) {
      const floor = cylinder(11.8, 12.4, .72, 10, color, 1.1, -1.2, 0); floor.scale.z = .72; this.root.add(floor);
      const rugColor = this.mode === 'childhood' ? 0xe8a663 : this.mode === 'adulthood' ? 0x77898b : 0xb97958;
      const rug = cylinder(6.4, 6.4, .08, 12, rugColor, 1.3, -.79, .3); rug.scale.z = .67; this.root.add(rug);
    }
    makeDrawingCanvas() {
      const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 720;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fffdf5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#776e69'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(105, 592); ctx.quadraticCurveTo(300, 555, 490, 588); ctx.quadraticCurveTo(700, 620, 920, 575); ctx.stroke();
      ctx.strokeRect(265, 330, 300, 255); ctx.beginPath(); ctx.moveTo(220, 335); ctx.lineTo(415, 170); ctx.lineTo(615, 335); ctx.stroke();
      ctx.strokeRect(365, 450, 90, 135); ctx.strokeRect(480, 385, 48, 62);
      ctx.beginPath(); ctx.arc(790, 165, 65, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(790 + Math.cos(a) * 87, 165 + Math.sin(a) * 87); ctx.lineTo(790 + Math.cos(a) * 115, 165 + Math.sin(a) * 115); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(720, 585); ctx.lineTo(735, 360); ctx.stroke();
      [[700,350,74],[760,325,85],[820,370,78]].forEach(([x,y,r]) => { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.stroke(); });
      ctx.fillStyle = '#9d9188'; ctx.font = '600 22px "DM Sans"'; ctx.fillText('MI LUGAR FAVORITO', 55, 60);
      return canvas;
    }

    buildChildhood() {
      this.addFloor(0xd79358);
      this.drawingCanvas = this.makeDrawingCanvas(); this.drawingContext = this.drawingCanvas.getContext('2d');
      this.drawingTexture = new THREE.CanvasTexture(this.drawingCanvas); this.drawingTexture.colorSpace = THREE.SRGBColorSpace;
      this.paper = new THREE.Mesh(new THREE.PlaneGeometry(9.7, 6.8), new THREE.MeshStandardMaterial({ map: this.drawingTexture, roughness: 1, side: THREE.DoubleSide }));
      this.paper.rotation.x = -Math.PI / 2; this.paper.rotation.z = -.06; this.paper.position.set(1.6, -.68, -.05); this.paper.receiveShadow = true; this.paper.userData.type = 'paper';
      this.root.add(this.paper); this.interactives.push(this.paper);
      this.crayonGroup = new THREE.Group();
      const body = cylinder(.27, .27, 3.7, 6, COLORS.yellow, 0, 0, 0); body.rotation.z = Math.PI / 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(.27, .62, 6), mat(COLORS.yellow)); tip.rotation.z = -Math.PI / 2; tip.position.x = 2.15; tip.castShadow = true;
      const wrapper = cylinder(.285, .285, 1.65, 6, 0xf4dd9d, 0, 0, 0); wrapper.rotation.z = Math.PI / 2;
      this.crayonGroup.add(body, tip, wrapper); this.crayonGroup.position.set(2.2, .06, 4.15); this.crayonGroup.rotation.y = -.16;
      this.crayonGroup.traverse(child => { child.userData.type = 'crayon'; });
      this.crayonParts = [body, tip]; this.root.add(this.crayonGroup); this.interactives.push(body, tip, wrapper);
      this.root.add(box(1.25, 1.25, 1.25, 0x5ea59c, -4.7, -.25, 3.8, .2), box(1.05, 1.05, 1.05, 0xe9af36, -5.3, -.35, 1.9, -.3));
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.82, 1), mat(COLORS.orange)); ball.position.set(6.1, -.1, 2.9); ball.castShadow = true; this.root.add(ball);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.05, .13, 6, 12), mat(0x614078)); hoop.rotation.x = Math.PI / 2; hoop.position.set(5.8, -.55, -3.1); hoop.castShadow = true; this.root.add(hoop);
      for (let i = 0; i < 4; i++) { const bead = new THREE.Mesh(new THREE.TetrahedronGeometry(.38), mat([COLORS.yellow,COLORS.turquoise,COLORS.orange,0x68447d][i])); bead.position.set(-5.5+i*.8,-.5+i*.03,-3.7+(i%2)*.5); bead.rotation.set(i,i*.4,0); bead.castShadow=true; this.root.add(bead); }
    }

    buildAdulthood() {
      this.addFloor(0x687a7e); this.root.add(box(12.5,.65,8.6,0x839397,1.2,-.55,0,.02));
      this.root.add(box(5.8,3.6,.32,0x34434b,2.4,1.65,-.85,-.05), box(5.2,3.05,.05,0x557580,2.4,1.65,-.65,-.05), box(.5,1.3,.5,0x596368,2.4,-.1,-.8), box(2.7,.22,1.4,0x697378,2.4,-.52,-.5));
      this.root.add(box(4.8,.18,1.65,0xc3c8c5,2,.0,2.1,-.04));
      for(let x=-1;x<=1;x++)for(let z=0;z<3;z++)this.root.add(box(.72,.06,.3,0x778286,2+x*.85,.12,1.7+z*.38,-.04));
      this.root.add(cylinder(.7,.65,1.4,8,0xd9d2c6,5.3,.15,2.4),cylinder(.53,.53,.03,12,0x553526,5.3,.87,2.4));
      const clock=cylinder(1.05,1.05,.32,12,0xf0eee6,-4.7,.7,-2.2);clock.rotation.x=Math.PI/2;this.root.add(clock);
      const h1=box(.08,.65,.06,0x3b464b,-4.7,.8,-2.01);h1.rotation.z=-.6;const h2=box(.07,.85,.06,COLORS.orange,-4.7,.82,-1.97);h2.rotation.z=.9;this.root.add(h1,h2);
      for(let i=0;i<5;i++)this.root.add(box(3.3,.05,2.2,i%2?0xf6e3b7:0xfffbef,-2.3+i*.07,-.14+i*.04,2.2-i*.08,-.16+i*.02));
      this.root.add(box(1.3,.16,2.3,0x403b49,-4.5,.03,.65,.12));
    }

    buildOldAge() {
      this.addFloor(0x8c5941); this.root.add(box(12.4,.7,8.5,0x9d684c,1.1,-.55,0,-.01),box(3.2,2.1,1.35,0xd0a05c,-3.8,.72,-2.3,.08));
      const speaker=cylinder(.72,.72,.08,12,0x67483a,-4.35,.8,-1.58);speaker.rotation.x=Math.PI/2;const dial=cylinder(.25,.25,.12,8,0x6d4d3d,-2.85,1.08,-1.57);dial.rotation.x=Math.PI/2;this.root.add(speaker,dial);
      this.memoryTexture=new THREE.CanvasTexture(this.makeDrawingCanvas());this.memoryTexture.colorSpace=THREE.SRGBColorSpace;
      this.memoryMaterial=new THREE.MeshStandardMaterial({map:this.memoryTexture,roughness:1,transparent:true,opacity:.32,side:THREE.DoubleSide});
      this.memoryPaper=new THREE.Mesh(new THREE.PlaneGeometry(7.3,5.1),this.memoryMaterial);this.memoryPaper.rotation.x=-Math.PI/2;this.memoryPaper.rotation.z=.035;this.memoryPaper.position.set(1.5,-.13,.45);this.memoryPaper.receiveShadow=true;this.root.add(this.memoryPaper);
      this.oldPencil3d=new THREE.Group();const pb=cylinder(.17,.17,3.8,6,0xdbad45,0,0,0);pb.rotation.z=Math.PI/2;const pt=new THREE.Mesh(new THREE.ConeGeometry(.18,.65,6),mat(0xd9c09a));pt.rotation.z=-Math.PI/2;pt.position.x=2.2;this.oldPencil3d.add(pb,pt);this.oldPencil3d.position.set(1.7,.18,3.7);this.oldPencil3d.rotation.y=-.12;this.root.add(this.oldPencil3d);
      this.root.add(box(2.3,.2,2.8,0xe1c497,5,.02,-2.6,.16),box(1.85,.08,2.3,0x9bb4a6,5,.14,-2.6,.16),cylinder(.7,.5,1.3,7,0xc77e59,-5.1,.15,2.7));
      for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.42,1.7,5),mat(i%2?0x638264:0x77936d));leaf.position.set(-5.1+Math.sin(i)*.55,1.1+Math.cos(i)*.15,2.7+Math.cos(i)*.45);leaf.rotation.z=(i-2)*.35;leaf.castShadow=true;this.root.add(leaf);}
      [-.7,.7].forEach(x=>{const lens=new THREE.Mesh(new THREE.TorusGeometry(.62,.09,5,12),mat(0x4c3c3a));lens.rotation.x=Math.PI/2;lens.position.set(x+4.1,.2,2.5);lens.castShadow=true;this.root.add(lens);});this.root.add(box(.9,.08,.08,0x4c3c3a,4.1,.2,2.5));
    }

    bindControls() {
      const canvas=this.renderer.domElement;
      canvas.addEventListener('contextmenu',e=>e.preventDefault());
      canvas.addEventListener('pointerdown',event=>{
        if (app.runtime.transitioning || state.scene !== this.mode) return;
        canvas.setPointerCapture(event.pointerId);const hit=this.pick(event);
        if(this.mode==='childhood'&&hit?.object.userData.type==='crayon'){
          if(!state.selectedColor){toast('Primero elige uno de los tres colores');document.querySelector('.vertical-palette').classList.add('hint-pulse');}else this.activateCrayon();return;
        }
        if(this.mode==='childhood'&&hit?.object.userData.type==='paper'&&state.crayonActive){this.painting=true;this.lastPaintPoint=this.uvToCanvas(hit.uv);canvas.classList.add('is-coloring');this.drawAt(this.lastPaintPoint,this.lastPaintPoint);return;}
        this.drag={x:event.clientX,y:event.clientY,azimuth:this.azimuth,elevation:this.elevation};canvas.classList.add('is-orbiting');
      });
      canvas.addEventListener('pointermove',event=>{
        if (app.runtime.transitioning || state.scene !== this.mode) return;
        if(this.painting){const hit=this.pick(event,[this.paper]);if(hit?.uv){const point=this.uvToCanvas(hit.uv);this.drawAt(this.lastPaintPoint,point);this.lastPaintPoint=point;}return;}
        if(!this.drag){const hit=this.mode==='childhood'?this.pick(event):null;canvas.classList.toggle('over-tool',hit?.object.userData.type==='crayon');return;}
        this.azimuth=this.drag.azimuth-(event.clientX-this.drag.x)*.008;this.elevation=THREE.MathUtils.clamp(this.drag.elevation+(event.clientY-this.drag.y)*.006,.28,1.28);this.updateCamera();
      });
      const finish=event=>{if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture(event.pointerId);this.painting=false;this.drag=null;this.lastPaintPoint=null;canvas.classList.remove('is-coloring','is-orbiting');};
      canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
      canvas.addEventListener('wheel',event=>{if(app.runtime.transitioning||state.scene!==this.mode)return;event.preventDefault();this.frustum=THREE.MathUtils.clamp(this.frustum+Math.sign(event.deltaY)*.7,11,20);this.resize();},{passive:false});
    }
    pick(event,objects=this.interactives){const rect=this.renderer.domElement.getBoundingClientRect();this.pointer.x=((event.clientX-rect.left)/rect.width)*2-1;this.pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;this.raycaster.setFromCamera(this.pointer,this.camera);return this.raycaster.intersectObjects(objects,true)[0];}
    uvToCanvas(uv){return{x:uv.x*this.drawingCanvas.width,y:(1-uv.y)*this.drawingCanvas.height};}
    drawAt(from,to){if(!from||!to||!state.selectedColor)return;const ctx=this.drawingContext;const distance=Math.hypot(to.x-from.x,to.y-from.y);ctx.save();ctx.strokeStyle=state.selectedColor;ctx.lineCap='round';ctx.lineJoin='round';for(let i=0;i<5;i++){ctx.globalAlpha=.18+Math.random()*.12;ctx.lineWidth=20+Math.random()*10;ctx.beginPath();ctx.moveTo(from.x+(Math.random()-.5)*8,from.y+(Math.random()-.5)*8);ctx.lineTo(to.x+(Math.random()-.5)*8,to.y+(Math.random()-.5)*8);ctx.stroke();}const specks=Math.max(2,Math.floor(distance/4));ctx.globalAlpha=.22;ctx.fillStyle=state.selectedColor;for(let i=0;i<specks;i++){const t=Math.random(),x=from.x+(to.x-from.x)*t+(Math.random()-.5)*24,y=from.y+(to.y-from.y)*t+(Math.random()-.5)*24;ctx.fillRect(x,y,1+Math.random()*3,1+Math.random()*3);}ctx.restore();this.drawingTexture.needsUpdate=true;if(distance>1){state.drawingProgress=Math.min(100,state.drawingProgress+distance/19);updatePaintProgress();}userAct();}
    setCrayonColor(color){this.crayonParts?.forEach(part=>part.material.color.set(color));this.crayonGroup?.scale.setScalar(1.08);setTimeout(()=>this.crayonGroup?.scale.setScalar(1),220);}
    activateCrayon(){if(!state.selectedColor){toast('Primero elige un color');return;}state.crayonActive=true;this.crayonGroup.position.y=.34;this.crayonGroup.rotation.z=-.08;setTimeout(()=>{if(this.crayonGroup)this.crayonGroup.position.y=.16;},260);document.getElementById('childInstruction').innerHTML='<span>3</span> Mantén clic y colorea sobre la hoja';this.container.classList.add('tool-active');toast('Crayola activa: ahora dibuja sobre la hoja');tone(530,.12);}
    revealMemory(sourceCanvas){if(sourceCanvas){this.memoryTexture.image=sourceCanvas;this.memoryTexture.needsUpdate=true;}this.memoryMaterial.opacity=1;this.memoryPaper.position.y=.08;this.memoryPaper.rotation.z=-.03;}
    setPencilAttempt(attempt){if(!this.oldPencil3d)return;if(attempt===1)this.oldPencil3d.position.x+=.35;if(attempt===2)this.oldPencil3d.rotation.z=.12;if(attempt>=3){this.oldPencil3d.position.set(3.8,1.2,3);this.oldPencil3d.rotation.set(0,-.12,-.3);}}
    resetDrawing(){if(this.mode!=='childhood')return;const clean=this.makeDrawingCanvas();this.drawingContext.clearRect(0,0,this.drawingCanvas.width,this.drawingCanvas.height);this.drawingContext.drawImage(clean,0,0);this.drawingTexture.needsUpdate=true;this.container.classList.remove('tool-active');this.crayonGroup.position.set(2.2,.06,4.15);this.crayonGroup.rotation.set(0,-.16,0);this.setCrayonColor('#F5BD38');}
    resetOldAge(){if(this.mode!=='oldage')return;this.memoryMaterial.opacity=.32;this.memoryPaper.position.y=-.13;this.memoryPaper.rotation.z=.035;this.oldPencil3d.position.set(1.7,.18,3.7);this.oldPencil3d.rotation.set(0,-.12,0);}
    updateCamera(){const cosE=Math.cos(this.elevation);this.camera.position.set(this.target.x+this.distance*Math.sin(this.azimuth)*cosE,this.target.y+this.distance*Math.sin(this.elevation),this.target.z+this.distance*Math.cos(this.azimuth)*cosE);this.camera.lookAt(this.target);this.camera.updateMatrixWorld();}
    resize(){const width=Math.max(1,this.container.clientWidth),height=Math.max(1,this.container.clientHeight),aspect=width/height;this.camera.left=-this.frustum*aspect/2;this.camera.right=this.frustum*aspect/2;this.camera.top=this.frustum/2;this.camera.bottom=-this.frustum/2;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);}
    animate(){requestAnimationFrame(()=>this.animate());if(state.scene!==this.mode||this.container.closest('[data-scene]').hidden)return;if(this.mode==='childhood'&&this.crayonGroup&&!state.crayonActive)this.crayonGroup.rotation.x=Math.sin(performance.now()*.0015)*.025;this.renderer.render(this.scene,this.camera);}
  }

  let worlds={};
  let introScene;
  let introTransition;
  app.scenes = new Map();
  function prepareChildhood() {
    if (worlds.childhood) return worlds.childhood;
    worlds.childhood = new LowPolyWorld('childhood3d', 'childhood');
    app.scenes.set('childhood', worlds.childhood);
    return worlds.childhood;
  }
  try {
    introScene = new app.IntroScene(document.getElementById('intro3d'));
    app.scenes.set('intro', introScene);
    introTransition = new app.SceneTransition({
      intro: introScene,
      prepareChildhood,
      enterChildhood: () => showScene('childhood'),
      afterEnter: scheduleHint
    });
    app.transition = introTransition;
  } catch (error) {
    console.error('No fue posible iniciar la experiencia 3D', error);
    document.getElementById('intro3d').innerHTML = '<p class="webgl-error">Tu navegador no pudo iniciar la escena 3D. Prueba actualizarlo o activar la aceleración gráfica.</p>';
    document.getElementById('startExperience').disabled = true;
  }

  function showScene(name){if(!app.runtime.allowedScenes.has(name))return;const next=scenes.find(scene=>scene.dataset.scene===name);if(!next)return;scenes.forEach(scene=>{const active=scene===next;scene.hidden=!active;scene.classList.toggle('is-active',active);});state.scene=name;document.body.classList.toggle('intro-active',name==='intro');document.body.classList.toggle('journey-on',name!=='intro');document.getElementById('progressFill').style.width=`${progress[name]}%`;labels.forEach((label,index)=>{const currentIndex=labels.indexOf(name);document.querySelector(`[data-step="${label}"]`).classList.toggle('active',currentIndex>=index||['contribute','closing'].includes(name));});clearTimeout(state.hintTimer);if(!app.runtime.transitioning)scheduleHint();window.scrollTo({top:0,behavior:'smooth'});requestAnimationFrame(()=>worlds[name]?.resize());if(name==='intro')introScene?.resize();}
  function scheduleHint(){clearTimeout(state.hintTimer);state.hintTimer=setTimeout(()=>{let target;if(state.scene==='childhood'){if(!state.selectedColor)target=document.querySelector('.vertical-palette');else if(!state.crayonActive){target=document.getElementById('childhood3d');toast('Haz clic sobre la crayola 3D para activarla');}else{target=document.getElementById('childhood3d');toast('Mantén el clic sobre la hoja y mueve la crayola');}}if(state.scene==='adulthood')target=document.querySelector('.task-item:not(.done)');if(state.scene==='oldage'&&state.pencilAttempts<3)target=document.getElementById('oldPencil');if(target){target.classList.add('hint-pulse');setTimeout(()=>target.classList.remove('hint-pulse'),3000);}},5000);}
  function userAct(){clearTimeout(state.hintTimer);document.querySelectorAll('.hint-pulse').forEach(item=>item.classList.remove('hint-pulse'));scheduleHint();}
  function updatePaintProgress(){const percent=Math.round(state.drawingProgress);document.getElementById('paintProgress').style.width=`${percent}%`;document.getElementById('paintPercent').textContent=`${percent}%`;if(percent>=100){document.getElementById('childReflection').classList.add('show');document.querySelector('[data-scene="childhood"] .continue-button').disabled=false;document.getElementById('childInstruction').innerHTML='<span>✓</span> Tu recuerdo está listo';toast('Tu recuerdo ya tiene color');tone(650,.35);}}
  function tone(frequency=520,duration=.08){if(!state.sound)return;const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;const ctx=new AudioContext(),oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.frequency.value=frequency;oscillator.type='sine';gain.gain.setValueAtTime(.06,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+duration);}
  function toast(message){const element=document.getElementById('toast');element.textContent=message;element.classList.add('show');clearTimeout(element.timer);element.timer=setTimeout(()=>element.classList.remove('show'),2200);}

  document.addEventListener('click',event=>{if(app.runtime.transitioning)return;const go=event.target.closest('[data-go]');if(go&&!go.disabled)showScene(go.dataset.go);if(event.target.closest('[data-action="restart"]')){resetExperience();introTransition?.reset();}if(event.target.closest('[data-action="exit"]')){toast('Gracias por compartir este momento.');setTimeout(()=>showScene('intro'),900);}userAct();});
  document.querySelectorAll('.crayon').forEach(crayon=>crayon.addEventListener('click',()=>{state.selectedColor=crayon.dataset.color;state.crayonActive=false;document.getElementById('childhood3d').classList.remove('tool-active');document.querySelectorAll('.crayon').forEach(item=>{const selected=item===crayon;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected));});worlds.childhood?.setCrayonColor(state.selectedColor);document.getElementById('childInstruction').innerHTML='<span>2</span> Haz clic sobre la crayola 3D';tone(430);}));
  document.getElementById('activateCrayonKeyboard').addEventListener('click',()=>worlds.childhood?.activateCrayon());
  document.querySelectorAll('.task-item').forEach((task,index)=>task.addEventListener('click',()=>{task.classList.toggle('done');task.classList.contains('done')?state.tasks.add(index):state.tasks.delete(index);const count=state.tasks.size;document.getElementById('taskCounter').textContent=`${count} / 3`;document.getElementById('taskProgress').style.width=`${count/3*100}%`;tone(task.classList.contains('done')?680:390);const complete=count===3;document.getElementById('adultReflection').classList.toggle('show',complete);document.querySelector('[data-scene="adulthood"] .continue-button').disabled=!complete;if(complete)toast('Por hoy, todo está hecho. Respira.');}));
  document.getElementById('oldPencil').addEventListener('click',event=>{const pencil=event.currentTarget;if(state.pencilAttempts>=3)return;state.pencilAttempts++;pencil.classList.remove('resist','shake');void pencil.offsetWidth;worlds.oldage?.setPencilAttempt(state.pencilAttempts);if(state.pencilAttempts===1){pencil.classList.add('resist');document.getElementById('oldInstruction').innerHTML='<span>↗</span> Sin prisa. Intenta una vez más';tone(310,.16);}else if(state.pencilAttempts===2){pencil.classList.add('shake');document.getElementById('oldInstruction').innerHTML='<span>↗</span> A tu propio ritmo';tone(360,.16);}else{pencil.classList.add('taken');document.getElementById('oldInstruction').innerHTML='<span>✓</span> Mira lo que aún permanece';worlds.oldage?.revealMemory(worlds.childhood?.drawingCanvas);document.getElementById('oldReflection').classList.add('show');document.querySelector('[data-scene="oldage"] .continue-button').disabled=false;tone(560,.5);toast('Un recuerdo volvió a encontrarte');}});
  const soundButton=document.getElementById('soundToggle');soundButton.addEventListener('click',()=>{state.sound=!state.sound;soundButton.setAttribute('aria-pressed',String(state.sound));soundButton.setAttribute('aria-label',state.sound?'Desactivar sonidos':'Activar sonidos');tone(560,.12);});
  const dialog=document.getElementById('infoDialog');document.querySelectorAll('.learn-more').forEach(button=>button.addEventListener('click',()=>{const item=info[button.dataset.topic];document.getElementById('dialogContent').innerHTML=`<p class="eyebrow">Una forma de empezar</p><h3>${item.title}</h3><p>${item.body}</p><ul>${item.ideas.map(idea=>`<li>${idea}</li>`).join('')}</ul>`;dialog.showModal();}));document.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  function resetExperience(){state.selectedColor=null;state.crayonActive=false;state.drawingProgress=0;state.tasks.clear();state.pencilAttempts=0;document.querySelectorAll('.crayon').forEach(item=>{item.classList.remove('selected');item.setAttribute('aria-pressed','false');});document.querySelectorAll('.task-item').forEach(task=>task.classList.remove('done'));document.querySelectorAll('.reflection-card').forEach(card=>card.classList.remove('show'));document.querySelectorAll('.continue-button').forEach(button=>button.disabled=true);document.getElementById('taskCounter').textContent='0 / 3';document.getElementById('taskProgress').style.width='0%';document.getElementById('paintProgress').style.width='0%';document.getElementById('paintPercent').textContent='0%';document.getElementById('childInstruction').innerHTML='<span>1</span> Elige un color';document.getElementById('oldInstruction').innerHTML='<span>↗</span> Intenta tomar el lápiz';document.getElementById('oldPencil').classList.remove('resist','shake','taken');worlds.childhood?.resetDrawing();worlds.oldage?.resetOldAge();showScene('intro');}
  const previewScene = new URLSearchParams(window.location.search).get('scene');
  if (previewScene === 'childhood') { prepareChildhood(); showScene('childhood'); app.Interface.setPhase('childhood'); }
  else scheduleHint();
})();
