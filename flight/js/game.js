// 大疆虚拟飞行 3D - DJI Flight Simulator
// Three.js Powered · Infinite Procedural World
import * as THREE from 'three';

class SimplexNoise {
  constructor(seed=42){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];this.p=[];for(let i=0;i<256;i++)this.p[i]=Math.floor(Math.abs(Math.sin(seed+i*127.1)*43758.5453)%256);this.perm=new Array(512);for(let i=0;i<512;i++)this.perm[i]=this.p[i&255]}
  dot(g,x,y){return g[0]*x+g[1]*y}
  noise2D(xin,yin){const F2=0.5*(Math.sqrt(3)-1),G2=(3-Math.sqrt(3))/6;let s=(xin+yin)*F2,i=Math.floor(xin+s),j=Math.floor(yin+s),t=(i+j)*G2,X0=i-t,Y0=j-t,x0=xin-X0,y0=yin-Y0,i1,j1;if(x0>y0){i1=1;j1=0}else{i1=0;j1=1}let x1=x0-i1+G2,y1=y0-j1+G2,x2=x0-1+2*G2,y2=y0-1+2*G2,ii=i&255,jj=j&255,gi0=this.perm[ii+this.perm[jj]]%12,gi1=this.perm[ii+i1+this.perm[jj+j1]]%12,gi2=this.perm[ii+1+this.perm[jj+1]]%12,n0=0,n1=0,n2=0,t0=0.5-x0*x0-y0*y0;if(t0>=0){t0*=t0;n0=t0*t0*this.dot(this.grad3[gi0],x0,y0)}let t1=0.5-x1*x1-y1*y1;if(t1>=0){t1*=t1;n1=t1*t1*this.dot(this.grad3[gi1],x1,y1)}let t2=0.5-x2*x2-y2*y2;if(t2>=0){t2*=t2;n2=t2*t2*this.dot(this.grad3[gi2],x2,y2)}return 70*(n0+n1+n2)}
  fbm(x,y,oct=6,lac=2,gain=0.5){let sum=0,amp=1,freq=1,mx=0;for(let i=0;i<oct;i++){sum+=this.noise2D(x*freq,y*freq)*amp;mx+=amp;amp*=gain;freq*=lac}return sum/mx}
}
const noise=new SimplexNoise(42);

const DRONES=[
  {name:'Air 3',maxSpeed:21,color:0xff9500,accel:8,batteryDrain:0.012},
  {name:'Mavic 3 Pro',maxSpeed:19,color:0xff3b30,accel:6,batteryDrain:0.015},
  {name:'Mini 4 Pro',maxSpeed:16,color:0xd0d0d0,accel:7,batteryDrain:0.018},
];
const GEAR_MULT={C:0.4,N:1.0,S:1.6};
const GEAR_DESC={C:'平稳档 · 慢速安全',N:'普通档 · 均衡飞行',S:'运动档 · 极速体验'};
const CHUNK_SIZE=200,CHUNK_RES=40,VIEW_DIST=3,TERRAIN_SCALE=80,TERRAIN_HEIGHT=60;

let currentDroneIdx=0,droneSpec=DRONES[0],battery=100,totalDist=0;
let isPaused=false,isCrashed=false,fpvMode=false,isCruise=false,isRTH=false;
let obstacleEnabled=true,currentGear='N',gameStarted=false;
let homePos=new THREE.Vector3(0,30,0);
let dronePos=new THREE.Vector3(0,30,0),droneVel=new THREE.Vector3(0,0,0);
let droneYaw=0,dronePitch=0,droneRoll=0,propSpeed=0;
let keys={},leftStick={x:0,y:0},rightStick={x:0,y:0};
let lastTime=0,notifTimer=0;

// THREE.JS
const scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(0x87CEEB,0.0015);
const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,0.5,2000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.2;
document.body.insertBefore(renderer.domElement,document.body.firstChild);
renderer.domElement.style.cssText='position:fixed;top:0;left:0;z-index:0;';

scene.add(new THREE.AmbientLight(0x6688cc,0.6));
const sunLight=new THREE.DirectionalLight(0xffeedd,1.8);
sunLight.position.set(200,300,100);sunLight.castShadow=true;
sunLight.shadow.mapSize.set(2048,2048);
sunLight.shadow.camera.near=1;sunLight.shadow.camera.far=800;
sunLight.shadow.camera.left=-300;sunLight.shadow.camera.right=300;
sunLight.shadow.camera.top=300;sunLight.shadow.camera.bottom=-300;
scene.add(sunLight);
scene.add(new THREE.HemisphereLight(0x87CEEB,0x3a7d3a,0.4));

const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:{topColor:{value:new THREE.Color(0x0055aa)},bottomColor:{value:new THREE.Color(0x87CEEB)},offset:{value:20},exponent:{value:0.4}},vertexShader:`varying vec3 vWP;void main(){vWP=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`uniform vec3 topColor;uniform vec3 bottomColor;uniform float offset;uniform float exponent;varying vec3 vWP;void main(){float h=normalize(vWP+offset).y;gl_FragColor=vec4(mix(bottomColor,topColor,max(pow(max(h,0.0),exponent),0.0)),1.0);}`});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500,32,32),skyMat));

// TERRAIN
const terrainChunks=new Map(),terrainGroup=new THREE.Group(),chunkObjects=new Map();
scene.add(terrainGroup);

function getTerrainHeight(wx,wz){
  const nx=wx/TERRAIN_SCALE,nz=wz/TERRAIN_SCALE;
  let h=noise.fbm(nx*0.8,nz*0.8,6,2,0.5)*TERRAIN_HEIGHT;
  h+=noise.fbm(nx*0.15,nz*0.15,3,2,0.6)*TERRAIN_HEIGHT*2;
  const d=Math.sqrt(wx*wx+wz*wz);
  if(d<80){const b=1-d/80;h=h*(1-b)+2*b}
  return h;
}
function chunkKey(cx,cz){return cx+','+cz}

function createTerrainChunk(cx,cz){
  const key=chunkKey(cx,cz);if(terrainChunks.has(key))return;
  const ox=cx*CHUNK_SIZE,oz=cz*CHUNK_SIZE;
  const geo=new THREE.PlaneGeometry(CHUNK_SIZE,CHUNK_SIZE,CHUNK_RES,CHUNK_RES);
  geo.rotateX(-Math.PI/2);
  const pos=geo.attributes.position,colors=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const wx=ox+pos.getX(i),wz=oz+pos.getZ(i),h=getTerrainHeight(wx,wz);
    pos.setY(i,h);
    let r,g,b;
    if(h<-5){r=0.15;g=0.3;b=0.55}else if(h<2){r=0.65;g=0.6;b=0.4}else if(h<30){const n=(h+TERRAIN_HEIGHT)/(TERRAIN_HEIGHT*3);r=0.2+n*0.1;g=0.45+n*0.15;b=0.15}else if(h<60){r=0.35;g=0.3;b=0.2}else{r=0.85;g=0.88;b=0.92}
    colors[i*3]=r;colors[i*3+1]=g;colors[i*3+2]=b;
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true}));
  mesh.position.set(ox,0,oz);mesh.receiveShadow=true;
  terrainGroup.add(mesh);terrainChunks.set(key,mesh);
  populateChunk(cx,cz,ox,oz);
}

function removeTerrainChunk(cx,cz){
  const key=chunkKey(cx,cz),mesh=terrainChunks.get(key);
  if(mesh){terrainGroup.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();terrainChunks.delete(key)}
  if(chunkObjects.has(key)){chunkObjects.get(key).forEach(o=>{scene.remove(o);if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}});chunkObjects.delete(key)}
}

function updateTerrainChunks(){
  const cx=Math.floor(dronePos.x/CHUNK_SIZE),cz=Math.floor(dronePos.z/CHUNK_SIZE);
  const needed=new Set();
  for(let dx=-VIEW_DIST;dx<=VIEW_DIST;dx++)for(let dz=-VIEW_DIST;dz<=VIEW_DIST;dz++){
    const k=chunkKey(cx+dx,cz+dz);needed.add(k);if(!terrainChunks.has(k))createTerrainChunk(cx+dx,cz+dz);
  }
  for(const[key]of terrainChunks)if(!needed.has(key)){const[x,z]=key.split(',').map(Number);removeTerrainChunk(x,z)}
}

// WORLD OBJECTS
const birds=[],cars=[],people=[],clouds=[];
const treeTrunkGeo=new THREE.CylinderGeometry(0.3,0.5,4,6),treeTrunkMat=new THREE.MeshLambertMaterial({color:0x5c3a1e});
const treeCrownGeo1=new THREE.ConeGeometry(3,6,6),treeCrownGeo2=new THREE.SphereGeometry(3,6,5);
const treeCrownMat1=new THREE.MeshLambertMaterial({color:0x2d6b2d}),treeCrownMat2=new THREE.MeshLambertMaterial({color:0x3a8a3a});
const buildingGeo=new THREE.BoxGeometry(1,1,1),buildingMat=new THREE.MeshLambertMaterial({color:0x888899});
const towerGeo=new THREE.CylinderGeometry(0.3,0.5,30,6),towerMat=new THREE.MeshLambertMaterial({color:0x999999});

function populateChunk(cx,cz,ox,oz){
  const key=chunkKey(cx,cz),objs=[];
  let s=cx*73856093^cz*19349663;
  const rng=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff};
  for(let i=0;i<25;i++){
    const tx=ox+(rng()-0.5)*CHUNK_SIZE,tz=oz+(rng()-0.5)*CHUNK_SIZE,th=getTerrainHeight(tx,tz);
    if(th<3||th>55)continue;const tt=rng()>0.5?0:1,sc=0.8+rng()*1.5;
    const g=new THREE.Group();
    const trunk=new THREE.Mesh(treeTrunkGeo,treeTrunkMat);trunk.scale.set(sc,sc,sc);trunk.position.y=2*sc;g.add(trunk);
    const crown=new THREE.Mesh(tt===0?treeCrownGeo1:treeCrownGeo2,tt===0?treeCrownMat1:treeCrownMat2);
    crown.scale.set(sc,sc*(tt===0?1.2:1),sc);crown.position.y=(tt===0?7:6)*sc;g.add(crown);
    g.position.set(tx,th,tz);g.castShadow=true;scene.add(g);objs.push(g);
  }
  for(let i=0;i<5;i++){
    const bx=ox+(rng()-0.5)*CHUNK_SIZE*0.6,bz=oz+(rng()-0.5)*CHUNK_SIZE*0.6,bh=getTerrainHeight(bx,bz);
    if(bh<2||bh>30)continue;const h=8+rng()*25,w=5+rng()*10,d=5+rng()*10;
    const bldg=new THREE.Mesh(buildingGeo,buildingMat.clone());
    bldg.material.color.setHSL(rng()*0.1+0.55,0.1,0.5+rng()*0.3);
    bldg.scale.set(w,h,d);bldg.position.set(bx,bh+h/2,bz);bldg.castShadow=true;bldg.receiveShadow=true;
    scene.add(bldg);objs.push(bldg);
  }
  if(rng()>0.7){const tx=ox+(rng()-0.5)*CHUNK_SIZE*0.5,tz=oz+(rng()-0.5)*CHUNK_SIZE*0.5,th=getTerrainHeight(tx,tz);
    const tw=new THREE.Mesh(towerGeo,towerMat);tw.position.set(tx,th+15,tz);tw.castShadow=true;scene.add(tw);objs.push(tw)}
  if(rng()>0.6){const lx=ox+(rng()-0.5)*CHUNK_SIZE*0.4,lz=oz+(rng()-0.5)*CHUNK_SIZE*0.4;
    if(getTerrainHeight(lx,lz)<5){const wg=new THREE.CircleGeometry(20+rng()*30,16);wg.rotateX(-Math.PI/2);
    const water=new THREE.Mesh(wg,new THREE.MeshPhongMaterial({color:0x2266aa,transparent:true,opacity:0.7,shininess:100,specular:0x88bbff}));
    water.position.set(lx,1.5,lz);scene.add(water);objs.push(water)}}
  chunkObjects.set(key,objs);
}

// BIRDS
function createBirdMesh(){const g=new THREE.Group();const bg=new THREE.SphereGeometry(0.3,4,4);bg.scale(1.5,0.6,0.8);g.add(new THREE.Mesh(bg,new THREE.MeshLambertMaterial({color:0x333333})));const wg=new THREE.PlaneGeometry(1.5,0.4),wm=new THREE.MeshLambertMaterial({color:0x444444,side:THREE.DoubleSide});const lw=new THREE.Mesh(wg,wm);lw.position.set(0,0.1,0.8);lw.name='leftWing';g.add(lw);const rw=new THREE.Mesh(wg,wm);rw.position.set(0,0.1,-0.8);rw.name='rightWing';g.add(rw);return g}
function spawnBirds(){for(let i=0;i<20;i++){const bird=createBirdMesh(),a=Math.random()*Math.PI*2,d=50+Math.random()*200;bird.position.set(dronePos.x+Math.cos(a)*d,25+Math.random()*60,dronePos.z+Math.sin(a)*d);const sp=5+Math.random()*10,dir=Math.random()*Math.PI*2;bird.userData={vx:Math.cos(dir)*sp,vy:(Math.random()-0.5)*2,vz:Math.sin(dir)*sp,wingPhase:Math.random()*Math.PI*2,wingSpeed:8+Math.random()*6};scene.add(bird);birds.push(bird)}}
function updateBirds(dt){birds.forEach(bird=>{const d=bird.userData;d.wingPhase+=d.wingSpeed*dt;const lw=bird.getObjectByName('leftWing'),rw=bird.getObjectByName('rightWing');if(lw)lw.rotation.z=Math.sin(d.wingPhase)*0.5;if(rw)rw.rotation.z=-Math.sin(d.wingPhase)*0.5;bird.position.x+=d.vx*dt;bird.position.y+=d.vy*dt;bird.position.z+=d.vz*dt;bird.rotation.y=Math.atan2(d.vx,d.vz);if(bird.position.distanceTo(dronePos)>300){const a=Math.random()*Math.PI*2,nd=50+Math.random()*150;bird.position.set(dronePos.x+Math.cos(a)*nd,25+Math.random()*60,dronePos.z+Math.sin(a)*nd);const sp=5+Math.random()*10,dir=Math.random()*Math.PI*2;d.vx=Math.cos(dir)*sp;d.vz=Math.sin(dir)*sp}if(bird.position.y<10){bird.position.y=10;d.vy=Math.abs(d.vy)}if(bird.position.y>100){bird.position.y=100;d.vy=-Math.abs(d.vy)}})}

// CARS
function createCarMesh(color){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(2,0.8,4),new THREE.MeshLambertMaterial({color}));body.position.y=0.6;g.add(body);const top=new THREE.Mesh(new THREE.BoxGeometry(1.6,0.6,2),new THREE.MeshLambertMaterial({color:0xaaddff,transparent:true,opacity:0.6}));top.position.y=1.2;g.add(top);const wg=new THREE.CylinderGeometry(0.3,0.3,0.2,8);wg.rotateZ(Math.PI/2);const wm=new THREE.MeshLambertMaterial({color:0x222222});[[-1,0.3,1.2],[1,0.3,1.2],[-1,0.3,-1.2],[1,0.3,-1.2]].forEach(p=>{const w=new THREE.Mesh(wg,wm);w.position.set(...p);g.add(w)});return g}
function spawnCars(){const cc=[0xe53935,0x1e88e5,0x43a047,0xfdd835,0xff9800,0x8e24aa];for(let i=0;i<12;i++){const car=createCarMesh(cc[Math.floor(Math.random()*cc.length)]),a=Math.random()*Math.PI*2,d=30+Math.random()*200;const cx=dronePos.x+Math.cos(a)*d,cz=dronePos.z+Math.sin(a)*d;car.position.set(cx,getTerrainHeight(cx,cz)+0.3,cz);const dir=Math.random()*Math.PI*2,sp=8+Math.random()*15;car.userData={vx:Math.cos(dir)*sp,vz:Math.sin(dir)*sp};car.rotation.y=dir;scene.add(car);cars.push(car)}}
function updateCars(dt){cars.forEach(car=>{car.position.x+=car.userData.vx*dt;car.position.z+=car.userData.vz*dt;car.position.y=getTerrainHeight(car.position.x,car.position.z)+0.3;if(car.position.distanceTo(dronePos)>300){const a=Math.random()*Math.PI*2,nd=50+Math.random()*150;car.position.x=dronePos.x+Math.cos(a)*nd;car.position.z=dronePos.z+Math.sin(a)*nd;car.position.y=getTerrainHeight(car.position.x,car.position.z)+0.3}})}

// PEOPLE
function createPersonMesh(shirtColor){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,1.0,6),new THREE.MeshLambertMaterial({color:shirtColor}));body.position.y=0.8;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(0.2,6,6),new THREE.MeshLambertMaterial({color:0xddbb88}));head.position.y=1.5;g.add(head);const lg=new THREE.CylinderGeometry(0.08,0.08,0.6,4),lm=new THREE.MeshLambertMaterial({color:0x333355});const ll=new THREE.Mesh(lg,lm);ll.position.set(-0.1,0.3,0);ll.name='leftLeg';g.add(ll);const rl=new THREE.Mesh(lg,lm);rl.position.set(0.1,0.3,0);rl.name='rightLeg';g.add(rl);return g}
function spawnPeople(){for(let i=0;i<15;i++){const shirt=new THREE.Color().setHSL(Math.random(),0.6,0.5).getHex(),p=createPersonMesh(shirt),a=Math.random()*Math.PI*2,d=20+Math.random()*150;const px=dronePos.x+Math.cos(a)*d,pz=dronePos.z+Math.sin(a)*d;p.position.set(px,getTerrainHeight(px,pz),pz);const dir=Math.random()*Math.PI*2,sp=1+Math.random()*2;p.userData={vx:Math.cos(dir)*sp,vz:Math.sin(dir)*sp,walkPhase:Math.random()*Math.PI*2};p.rotation.y=dir;scene.add(p);people.push(p)}}
function updatePeople(dt){people.forEach(p=>{p.userData.walkPhase+=8*dt;p.position.x+=p.userData.vx*dt;p.position.z+=p.userData.vz*dt;p.position.y=getTerrainHeight(p.position.x,p.position.z);const ll=p.getObjectByName('leftLeg'),rl=p.getObjectByName('rightLeg');if(ll)ll.rotation.x=Math.sin(p.userData.walkPhase)*0.4;if(rl)rl.rotation.x=-Math.sin(p.userData.walkPhase)*0.4;if(p.position.distanceTo(dronePos)>200){const a=Math.random()*Math.PI*2,nd=30+Math.random()*100;p.position.x=dronePos.x+Math.cos(a)*nd;p.position.z=dronePos.z+Math.sin(a)*nd;p.position.y=getTerrainHeight(p.position.x,p.position.z)}})}

// CLOUDS
function createCloud(){const g=new THREE.Group(),cm=new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.8});for(let i=0;i<3+Math.floor(Math.random()*4);i++){const r=10+Math.random()*20,puff=new THREE.Mesh(new THREE.SphereGeometry(r,6,5),cm);puff.position.set((Math.random()-0.5)*30,(Math.random()-0.5)*5,(Math.random()-0.5)*20);puff.scale.y=0.4+Math.random()*0.3;g.add(puff)}return g}
function spawnClouds(){for(let i=0;i<30;i++){const c=createCloud(),a=Math.random()*Math.PI*2,d=100+Math.random()*800;c.position.set(dronePos.x+Math.cos(a)*d,120+Math.random()*200,dronePos.z+Math.sin(a)*d);c.userData={speed:1+Math.random()*3,dir:Math.random()*Math.PI*2};scene.add(c);clouds.push(c)}}
function updateClouds(dt){clouds.forEach(c=>{c.position.x+=Math.cos(c.userData.dir)*c.userData.speed*dt;c.position.z+=Math.sin(c.userData.dir)*c.userData.speed*dt;if(c.position.distanceTo(dronePos)>900){const a=Math.random()*Math.PI*2;c.position.x=dronePos.x+Math.cos(a)*(500+Math.random()*300);c.position.z=dronePos.z+Math.sin(a)*(500+Math.random()*300)}})}

// DRONE MODEL
let droneGroup=null,propellers=[];
function createDroneModel(droneIdx){
  if(droneGroup){scene.remove(droneGroup);droneGroup.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material){if(Array.isArray(c.material))c.material.forEach(m=>m.dispose());else c.material.dispose()}})}
  const spec=DRONES[droneIdx],g=new THREE.Group();propellers=[];const accent=spec.color;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,0.3,1.0),new THREE.MeshPhongMaterial({color:0x1a1a1a,shininess:80})));
  const shell=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.15,0.8),new THREE.MeshPhongMaterial({color:accent,shininess:100}));shell.position.y=0.22;g.add(shell);
  const gimbal=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,8),new THREE.MeshPhongMaterial({color:0x111111,shininess:120}));gimbal.position.set(0,-0.2,0.4);g.add(gimbal);
  const lens=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,0.1,8),new THREE.MeshPhongMaterial({color:0x2244aa,shininess:200}));lens.rotation.x=Math.PI/2;lens.position.set(0,-0.25,0.5);g.add(lens);
  const armPos=[{x:1.2,z:1.2,a:Math.PI/4},{x:-1.2,z:1.2,a:3*Math.PI/4},{x:1.2,z:-1.2,a:-Math.PI/4},{x:-1.2,z:-1.2,a:-3*Math.PI/4}];
  armPos.forEach((ap,idx)=>{
    const arm=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.08,0.12),new THREE.MeshPhongMaterial({color:0x2a2a2a}));arm.position.set(ap.x*0.5,0,ap.z*0.5);arm.rotation.y=ap.a;g.add(arm);
    const motor=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.18,0.2,8),new THREE.MeshPhongMaterial({color:0x333333}));motor.position.set(ap.x,0.1,ap.z);g.add(motor);
    const propGroup=new THREE.Group();propGroup.position.set(ap.x,0.25,ap.z);
    const blade1=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.02,0.15),new THREE.MeshPhongMaterial({color:0x444444,transparent:true,opacity:0.7}));propGroup.add(blade1);
    const blade2=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.02,0.15),new THREE.MeshPhongMaterial({color:0x444444,transparent:true,opacity:0.7}));blade2.rotation.y=Math.PI/2;propGroup.add(blade2);
    const guard=new THREE.Mesh(new THREE.TorusGeometry(1.1,0.03,4,16),new THREE.MeshPhongMaterial({color:0x333333}));guard.rotation.x=Math.PI/2;propGroup.add(guard);
    g.add(propGroup);propellers.push(propGroup);
    const ledColor=idx<2?0x00ff00:0xff0000;const led=new THREE.Mesh(new THREE.SphereGeometry(0.05,4,4),new THREE.MeshBasicMaterial({color:ledColor}));led.position.set(ap.x,-0.1,ap.z);g.add(led);
  });
  const legMat=new THREE.MeshPhongMaterial({color:0x333333});
  [[-0.4,0,0.3],[0.4,0,0.3],[-0.4,0,-0.3],[0.4,0,-0.3]].forEach(p=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.4,4),legMat);leg.position.set(p[0],-0.35,p[2]);g.add(leg)});
  const skid1=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.04,0.06),legMat);skid1.position.set(0,-0.55,0.3);g.add(skid1);
  const skid2=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.04,0.06),legMat);skid2.position.set(0,-0.55,-0.3);g.add(skid2);
  g.position.copy(dronePos);scene.add(g);droneGroup=g;
}

// PHYSICS
function updateDrone(dt){
  if(isCrashed||isPaused||!gameStarted)return;
  const gearMult=GEAR_MULT[currentGear],maxSpd=droneSpec.maxSpeed*gearMult,accel=droneSpec.accel*gearMult;
  let inputF=0,inputR=0,inputUp=0,inputYaw=0;
  if(keys['w']||keys['W']||keys['ArrowUp'])inputF=1;
  if(keys['s']||keys['S']||keys['ArrowDown'])inputF=-1;
  if(keys['a']||keys['A']||keys['ArrowLeft'])inputR=-1;
  if(keys['d']||keys['D']||keys['ArrowRight'])inputR=1;
  if(keys[' '])inputUp=1;
  if(keys['Shift']||keys['shift'])inputUp=-1;
  if(keys['q']||keys['Q'])inputYaw=-1;
  if(keys['e']||keys['E'])inputYaw=1;
  inputF+=rightStick.y;inputR+=rightStick.x;inputUp+=leftStick.y;inputYaw+=leftStick.x;

  if(isCruise&&!isRTH){inputF=1;inputUp=0;inputR=0;inputYaw=0}
  if(isRTH){
    const toHome=new THREE.Vector3().subVectors(homePos,dronePos);
    const dist=toHome.length();
    if(dist<3){isRTH=false;droneVel.set(0,0,0);showNotif('已返航到家');return}
    toHome.normalize();
    inputF=1;inputR=toHome.x*Math.cos(droneYaw)-toHome.z*Math.sin(droneYaw);
    inputYaw=Math.atan2(toHome.x,toHome.z)-droneYaw;
    if(dist<20)inputUp=(homePos.y-dronePos.y)*0.1;
    else if(dronePos.y<30)inputUp=0.5;
  }

  droneYaw+=inputYaw*2.0*dt;
  const forward=new THREE.Vector3(-Math.sin(droneYaw),0,-Math.cos(droneYaw));
  const right=new THREE.Vector3(Math.cos(droneYaw),0,-Math.sin(droneYaw));
  const targetVel=new THREE.Vector3();
  targetVel.addScaledVector(forward,inputF*maxSpd);
  targetVel.addScaledVector(right,inputR*maxSpd);
  targetVel.y=inputUp*maxSpd*0.6;

  droneVel.lerp(targetVel,accel*dt*0.3);
  const spd=droneVel.length();
  if(spd>maxSpd)droneVel.multiplyScalar(maxSpd/spd);

  const prevPos=dronePos.clone();
  dronePos.add(droneVel.clone().multiplyScalar(dt));
  const groundH=getTerrainHeight(dronePos.x,dronePos.z)+1;
  if(dronePos.y<groundH){dronePos.y=groundH;if(droneVel.y<-8){crash();return}else droneVel.y=0}
  if(dronePos.y>500)dronePos.y=500;

  dronePitch=THREE.MathUtils.lerp(dronePitch,inputF*0.3,3*dt);
  droneRoll=THREE.MathUtils.lerp(droneRoll,-inputR*0.3,3*dt);
  propSpeed=THREE.MathUtils.lerp(propSpeed,gameStarted?30:0,5*dt);

  const moved=dronePos.distanceTo(prevPos);
  totalDist+=moved;
  battery-=droneSpec.batteryDrain*dt*(1+spd*0.05);
  if(battery<=0){battery=0;crash();showNotif('电池耗尽！炸机！');return}
  if(battery<20&&battery>19.5)showNotif('⚠️ 电量低于 20%');

  // Bird collision
  for(const bird of birds){
    if(bird.position.distanceTo(dronePos)<3){
      crash();showNotif('💥 撞到飞鸟！炸机！');return;
    }
  }

  // Obstacle avoidance
  if(obstacleEnabled)updateObstacleIndicator();
}

function crash(){
  isCrashed=true;
  document.getElementById('crashOverlay').classList.add('show');
  setTimeout(()=>{
    isCrashed=false;dronePos.copy(homePos);droneVel.set(0,0,0);
    droneYaw=0;dronePitch=0;droneRoll=0;battery=100;totalDist=0;
    document.getElementById('crashOverlay').classList.remove('show');
    showNotif('已重置到家园点');
  }, 2000);
}

function updateObstacleIndicator(){
  const dirs=[{id:'ob-tl',dx:-1,dz:-1},{id:'ob-tc',dx:0,dz:-1},{id:'ob-tr',dx:1,dz:-1},{id:'ob-ml',dx:-1,dz:0},{id:'ob-mr',dx:1,dz:0},{id:'ob-bl',dx:-1,dz:1},{id:'ob-bc',dx:0,dz:1},{id:'ob-br',dx:1,dz:1}];
  dirs.forEach(d=>{
    const el=document.getElementById(d.id);if(!el)return;el.className='ob-cell';
    const checkDir=new THREE.Vector3(Math.sin(droneYaw)+d.dx*0.5,0,Math.cos(droneYaw)+d.dz*0.5).normalize();
    const ray=new THREE.Raycaster(dronePos,checkDir,0,20);
    const hits=ray.intersectObjects(terrainGroup.children,true);
    if(hits.length>0){
      const dist=hits[0].distance;
      if(dist<3)el.classList.add('active-danger');
      else if(dist<8)el.classList.add('active-warn');
      else el.classList.add('active-safe');
    }
  });
  // Check birds proximity
  const warnBorder=document.getElementById('warnBorder');
  const warnOverlay=document.getElementById('warningOverlay');
  let closeBird=false;
  birds.forEach(b=>{if(b.position.distanceTo(dronePos)<15)closeBird=true});
  if(closeBird){warnOverlay.classList.add('show');warnBorder.classList.add('red')}
  else{warnOverlay.classList.remove('show');warnBorder.classList.remove('red')}
}

// CAMERA
function updateCamera(){
  sky.position.copy(dronePos);
  sunLight.position.set(dronePos.x+200,300,dronePos.z+100);
  sunLight.target.position.copy(dronePos);
  sunLight.target.updateMatrixWorld();

  if(fpvMode){
    camera.position.copy(dronePos).add(new THREE.Vector3(0,0.3,0));
    const lookDir=new THREE.Vector3(-Math.sin(droneYaw),dronePitch*0.3,-Math.cos(droneYaw));
    camera.lookAt(dronePos.clone().add(lookDir));
  }else{
    const offset=new THREE.Vector3(0,8,15).applyAxisAngle(new THREE.Vector3(0,1,0),droneYaw);
    const targetCamPos=dronePos.clone().add(offset);
    camera.position.lerp(targetCamPos,0.05);
    camera.lookAt(dronePos);
  }
}

// UI UPDATE
function updateUI(){
  if(!gameStarted)return;
  const spd=droneVel.length();
  const alt=dronePos.y-getTerrainHeight(dronePos.x,dronePos.z);
  const dist=dronePos.distanceTo(homePos);
  const hdg=((droneYaw*180/Math.PI)%360+360)%360;

  document.getElementById('teleAlt').textContent=alt.toFixed(1);
  document.getElementById('teleSpd').textContent=spd.toFixed(1);
  document.getElementById('teleDis').textContent=dist.toFixed(1);
  document.getElementById('teleDist').textContent=(totalDist/1000).toFixed(2);
  document.getElementById('teleHdg').textContent=Math.round(hdg);

  document.getElementById('batteryFill').style.width=battery+'%';
  document.getElementById('batteryVal').textContent=Math.round(battery)+'%';
  const bf=document.getElementById('batteryFill');
  bf.classList.remove('low','mid');
  if(battery<20)bf.classList.add('low');else if(battery<50)bf.classList.add('mid');

  document.getElementById('flightMode').textContent=currentGear+'档';

  // Signal strength based on distance
  const signal=Math.max(1,Math.min(5,Math.round(5-dist/1000)));
  document.getElementById('signalVal').textContent=signal;
  const gps=Math.min(23,Math.round(12+dist*0.01));
  document.getElementById('gpsVal').textContent=gps;

  // Notification
  if(notifTimer>0){
    notifTimer-=0.016;
    document.getElementById('notification').classList.add('show');
    if(notifTimer<=0)document.getElementById('notification').classList.remove('show');
  }
}

function showNotif(text, dur=3){
  const el=document.getElementById('notification');
  el.textContent=text;el.classList.add('show');notifTimer=dur;
}

// GLOBAL FUNCTIONS (called from HTML)
window.selectDrone=function(idx){
  currentDroneIdx=idx;droneSpec=DRONES[idx];
  document.querySelectorAll('.drone-card').forEach((c,i)=>{c.classList.toggle('active',i===idx)});
  createDroneModel(idx);
  showNotif('切换机型: '+droneSpec.name);
};

window.setGear=function(gear){
  currentGear=gear;
  ['C','N','S'].forEach(g=>{document.getElementById('gear'+g).classList.toggle('active',g===gear)});
  document.getElementById('gearDesc').textContent=GEAR_DESC[gear];
  document.getElementById('flightMode').textContent=gear+'档';
  showNotif('切换至 '+GEAR_DESC[gear]);
};

window.toggleCruise=function(){
  isCruise=!isCruise;
  document.getElementById('btnCruise').classList.toggle('active',isCruise);
  showNotif(isCruise?'🚀 巡航模式已开启':'巡航模式已关闭');
};

window.triggerRTH=function(){
  if(isRTH){isRTH=false;showNotif('返航已取消');return}
  isRTH=true;isCruise=false;
  document.getElementById('btnRTH').classList.add('active');
  document.getElementById('btnCruise').classList.remove('active');
  showNotif('🏠 返航中...');
  setTimeout(()=>{if(isRTH)document.getElementById('btnRTH').classList.remove('active')},3000);
};

window.toggleObstacle=function(){
  obstacleEnabled=!obstacleEnabled;
  document.getElementById('btnOBS').classList.toggle('active',obstacleEnabled);
  showNotif(obstacleEnabled?'🛡️ 避障已开启':'避障已关闭');
};

window.toggleFPV=function(){
  fpvMode=!fpvMode;
  document.getElementById('btnFPV').classList.toggle('active',fpvMode);
  showNotif(fpvMode?'👁️ FPV 第一人称':'第三人称视角');
};

window.togglePause=function(){
  isPaused=!isPaused;
  document.getElementById('btnPause').classList.toggle('active',isPaused);
  showNotif(isPaused?'⏸️ 已暂停':'继续飞行');
};

// INPUT
window.addEventListener('keydown',e=>{keys[e.key]=true;if([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))e.preventDefault();
  if(e.key==='v'||e.key==='V')window.toggleFPV();
  if(e.key==='h'||e.key==='H')window.triggerRTH();
  if(e.key==='p'||e.key==='P')window.togglePause();
  if(e.key==='c'||e.key==='C')window.toggleCruise();
  if(e.key==='o'||e.key==='O')window.toggleObstacle();
  if(e.key==='1')window.selectDrone(0);
  if(e.key==='2')window.selectDrone(1);
  if(e.key==='3')window.selectDrone(2);
});
window.addEventListener('keyup',e=>{keys[e.key]=false});

// JOYSTICK
function setupJoystick(baseId,thumbId,stickObj){
  const base=document.getElementById(baseId),thumb=document.getElementById(thumbId);
  if(!base||!thumb)return;
  let active=false,startX,startY;
  const onStart=e=>{active=true;const t=e.touches?e.touches[0]:e;const r=base.getBoundingClientRect();startX=r.left+r.width/2;startY=r.top+r.height/2;e.preventDefault()};
  const onMove=e=>{if(!active)return;const t=e.touches?e.touches[0]:e;const dx=t.clientX-startX,dy=t.clientY-startY;const maxR=50;const dist=Math.sqrt(dx*dx+dy*dy);const clampDist=Math.min(dist,maxR);const angle=Math.atan2(dy,dx);const nx=Math.cos(angle)*clampDist/maxR,ny=Math.sin(angle)*clampDist/maxR;stickObj.x=nx;stickObj.y=-ny;thumb.style.transform=`translate(${-50+nx*50}%,${-50-ny*50}%)`;e.preventDefault()};
  const onEnd=()=>{active=false;stickObj.x=0;stickObj.y=0;thumb.style.transform='translate(-50%,-50%)'};
  base.addEventListener('touchstart',onStart);base.addEventListener('mousedown',onStart);
  window.addEventListener('touchmove',onMove);window.addEventListener('mousemove',onMove);
  window.addEventListener('touchend',onEnd);window.addEventListener('mouseup',onEnd);
}

// GAME LOOP
function gameLoop(time){
  requestAnimationFrame(gameLoop);
  const dt=Math.min((time-lastTime)/1000,0.05);lastTime=time;

  if(gameStarted&&!isPaused){
    updateDrone(dt);
    updateBirds(dt);updateCars(dt);updatePeople(dt);updateClouds(dt);
    updateTerrainChunks();
    if(droneGroup){
      droneGroup.position.copy(dronePos);
      droneGroup.rotation.set(dronePitch,droneYaw,droneRoll);
      propellers.forEach((p,i)=>{p.rotation.y+=propSpeed*dt*(i%2===0?1:-1)});
    }
  }
  updateCamera();
  updateUI();
  renderer.render(scene,camera);
}

// INIT
function init(){
  document.getElementById('loadingText').style.display='none';
  document.getElementById('startScreen').style.display='flex';

  document.getElementById('startBtn').addEventListener('click',()=>{
    document.getElementById('startScreen').style.display='none';
    ['topBar','leftPanel','rightPanel','bottomPanel','ctrlButtons','joystickLeft','joystickRight'].forEach(id=>{document.getElementById(id).style.display=''});
    gameStarted=true;
    createDroneModel(currentDroneIdx);
    spawnBirds();spawnCars();spawnPeople();spawnClouds();
    updateTerrainChunks();
    setupJoystick('baseL','thumbL',leftStick);
    setupJoystick('baseR','thumbR',rightStick);
    showNotif('🛫 起飞！祝飞行愉快',5);
  });

  window.addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
  });

  lastTime=performance.now();
  requestAnimationFrame(gameLoop);
}

init();