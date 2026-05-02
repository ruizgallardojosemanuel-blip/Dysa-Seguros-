// hero3d.js v11 – Dysa Seguros
// · Sin recorte cuadrado: overflow visible + posiciones/escala ajustadas para caber en canvas
// · Iluminación realista: luz clave superior-izquierda, hemisfera, relleno y contraluz
// · Materiales con especular y brillos
// · Sombras elípticas difuminadas bajo cada figura
// · Sistema completo de idle 5s, hover y click (igual que v9)

// ── RoundedBoxGeometry — implementación inline (no requiere importar módulos) ──
// Técnica: BoxGeometry subdividido + cada vértice desplazado hacia la esquina
// interior más cercana y luego empujado outward por `radius`.
// Produce esquinas esféricas, aristas cilíndricas y caras planas.
function RoundedBoxGeometry(width, height, depth, segments, radius) {
  segments = Math.max(2, Math.round(segments || 2));
  radius   = Math.max(0, Math.min(radius || 0.1,
               Math.min(width, height, depth) / 2 - 1e-4));

  var geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments);
  var pos = geo.attributes.position;
  var iw  = width  / 2 - radius;
  var ih  = height / 2 - radius;
  var id  = depth  / 2 - radius;

  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Punto interior más cercano (clamp a la caja interior)
    var cx = Math.max(-iw, Math.min(iw, x));
    var cy = Math.max(-ih, Math.min(ih, y));
    var cz = Math.max(-id, Math.min(id, z));
    // Dirección normalizada desde el interior hacia la superficie
    var dx = x - cx, dy = y - cy, dz = z - cz;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-6) { dx /= len; dy /= len; dz /= len; }
    // Nueva posición: interior + dirección × radio
    pos.setXYZ(i, cx + dx * radius, cy + dy * radius, cz + dz * radius);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

(function () {
  'use strict';

  function init() {
    if (typeof THREE === 'undefined') return;
    var con = document.querySelector('.hero-visual');
    if (!con) return;

    con.innerHTML = '';
    con.style.position = 'relative';
    con.style.overflow  = 'visible';   // sin recorte cuadrado

    var W = con.offsetWidth  || 420;
    var H = con.offsetHeight || 420;

    var rnd = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    rnd.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rnd.setSize(W, H);
    rnd.setClearColor(0x000000, 0);
    Object.assign(rnd.domElement.style, {
      position:'absolute', top:'0', left:'0', width:'100%', height:'100%'
    });
    con.appendChild(rnd.domElement);

    var sc  = new THREE.Scene();
    var cam = new THREE.PerspectiveCamera(68, W / H, 0.1, 100);
    cam.position.set(0, 1.0, 10.5);
    cam.lookAt(0, -0.1, 0);

    // ── ILUMINACIÓN REALISTA ─────────────────────────────────────────────────
    // Luz ambiente hemisférica: cielo azul claro / suelo casi negro
    sc.add(new THREE.HemisphereLight(0x1a3a70, 0x060810, 1.0));

    // Luz clave principal: superior-IZQUIERDA (cara superior e izquierda brillantes)
    var key = new THREE.DirectionalLight(0xb8d4f0, 5.5);
    key.position.set(-7, 14, 8); sc.add(key);

    // Relleno suave desde la derecha (no deja zonas completamente negras)
    var fill = new THREE.DirectionalLight(0x0c2040, 1.8);
    fill.position.set(9, 4, 6); sc.add(fill);

    // Contraluz azul eléctrico desde atrás-abajo
    var rim = new THREE.DirectionalLight(0x1E6FD9, 3.2);
    rim.position.set(2, -3, -10); sc.add(rim);

    // Point light para brillos especulares en esquinas superiores
    var spec = new THREE.PointLight(0x8ab8ff, 4.0, 22);
    spec.position.set(-4, 8, 7); sc.add(spec);

    var fillPt = new THREE.PointLight(0x4a9fd0, 2.0, 28);
    fillPt.position.set(0, 5, 5); sc.add(fillPt);

    // ── HELPERS ──────────────────────────────────────────────────────────────
    function mp(c, o) {
      return new THREE.MeshPhongMaterial(Object.assign({
        color: c,
        flatShading: true,
        specular: new THREE.Color(0x223355),
        shininess: 55
      }, o || {}));
    }
    function mpS(c, o) { // brillo alto (cristal, luces)
      return new THREE.MeshPhongMaterial(Object.assign({
        color: c, flatShading: true,
        specular: new THREE.Color(0x8ac0ff), shininess: 120
      }, o || {}));
    }
    function mpR(c, o) { // smooth shading para superficies curvas
      return new THREE.MeshPhongMaterial(Object.assign({
        color: c, flatShading: false,
        specular: new THREE.Color(0x4488bb), shininess: 75
      }, o || {}));
    }
    function bx(w, h, d, c, o) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mp(c, o)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function eout(t) { t = Math.max(0, Math.min(1, t)); return 1 - (1 - t) * (1 - t); }
    function eio(t)  { t = Math.max(0, Math.min(1, t)); return t < .5 ? 2*t*t : -1+(4-2*t)*t; }

    // ── PARTÍCULAS ────────────────────────────────────────────────────────────
    var pN = 80, pBuf = new Float32Array(pN * 3);
    for (var i = 0; i < pN; i++) {
      pBuf[i*3]   = (Math.random() - .5) * 22;
      pBuf[i*3+1] = (Math.random() - .5) * 14;
      pBuf[i*3+2] = (Math.random() - .5) * 6 - 1;
    }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pBuf, 3));
    sc.add(new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0x6FB8FF, size: .05, transparent: true, opacity: .32
    })));

    // ── SOMBRAS ELÍPTICAS DIFUMINADAS ────────────────────────────────────────
    // 3 capas concéntricas: interior opaca → exterior transparente
    var SHADOW_OPS = [0.48, 0.26, 0.10];
    function mkShadow(rx, rz, ry) {
      var g = new THREE.Group();
      SHADOW_OPS.forEach(function (op, idx) {
        var r = [0.42, 0.68, 1.0][idx];
        var m = new THREE.Mesh(
          new THREE.CircleGeometry(r, 28),
          new THREE.MeshBasicMaterial({
            color: 0x010306, transparent: true, opacity: op, depthWrite: false
          })
        );
        m.rotation.x = -Math.PI / 2;
        g.add(m);
      });
      g.scale.set(rx, 1, rz);
      if (ry) g.rotation.y = ry;
      return g;
    }

    var GROUND_Y = -1.30;
    var shadows = [
      mkShadow(1.85, 0.88, -Math.PI * 0.80),  // coche (elipse alineada con cuerpo)
      mkShadow(1.70, 1.70, -0.18),             // edificio
      mkShadow(0.95, 0.42, -0.26),             // póliza (pequeña, objeto elevado)
    ];
    shadows.forEach(function (s) { sc.add(s); });

    // ── COCHE — sedan.glb cargado con GLTFLoader ─────────────────────────────
    function mkCar() {
      var g = new THREE.Group();
      g.userData.wheels = []; // evita errores en el loop de animación

      var neonMat = new THREE.MeshPhongMaterial({
        color:     new THREE.Color(0x0ea5e9),
        emissive:  new THREE.Color(0x0369a1),
        emissiveIntensity: 0.45,
        specular:  new THREE.Color(0x7dd3fc),
        shininess: 140,
        flatShading: false
      });

      if (typeof THREE.GLTFLoader === 'undefined') {
        // fallback: caja redondeada simple
        var fallback = new THREE.Mesh(
          new RoundedBoxGeometry(2.8, 0.9, 1.3, 4, 0.18), neonMat);
        fallback.position.y = 0.45;
        g.add(fallback);
        return g;
      }

      var loader = new THREE.GLTFLoader();
      loader.load('./sedan.glb', function (gltf) {
        var model = gltf.scene;

        // Normalizar escala → ~2.8 unidades de longitud
        var box = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3();
        box.getSize(size);
        var maxDim = Math.max(size.x, size.y, size.z);
        var targetSize = 2.80;
        var sc = targetSize / (maxDim || 1);
        model.scale.setScalar(sc);

        // Centrar en base (y=0)
        box.setFromObject(model);
        var center = new THREE.Vector3();
        box.getCenter(center);
        model.position.x -= center.x;
        model.position.y -= box.min.y;
        model.position.z -= center.z;

        // Aplicar material neón a todas las mallas
        model.traverse(function (child) {
          if (child.isMesh) {
            child.material = neonMat;
            child.castShadow = true;
          }
        });

        g.add(model);
      }, undefined, function (err) {
        // fallback si no carga el GLB
        var fallback = new THREE.Mesh(
          new RoundedBoxGeometry(2.8, 0.9, 1.3, 4, 0.18), neonMat);
        fallback.position.y = 0.45;
        g.add(fallback);
      });

      return g;
    }

    // ── EDIFICIO ─────────────────────────────────────────────────────────────
    function mkBld() {
      var g = new THREE.Group(), af = [], nF = 9;
      for (var f = 0; f < nF; f++) {
        var bw = 1.88 - f * .036, bd = 1.55 - f * .016, bh = .44;
        var fc = f === 0 ? 0x09162e : (f % 2 === 0 ? 0x112244 : 0x0a1a36);
        var fl = bx(bw, bh, bd, fc);
        fl.userData.tY = f * bh; fl.position.y = fl.userData.tY - 8; fl.userData.fi = f;
        g.add(fl); af.push(fl);
        var ep2 = new THREE.Mesh(new THREE.BoxGeometry(bw + .04, .036, .036), mpS(0x2a5080));
        ep2.userData.tY = fl.userData.tY + bh * .5 - .018;
        ep2.position.set(0, ep2.userData.tY - 8, bd * .5 + .018); ep2.userData.fi = f;
        g.add(ep2); af.push(ep2);
      }
      var wL = bx(1.0, 2.8, 1.4, 0x0c1c3c); wL.userData.tY = 1.4; wL.position.set(-1.44, wL.userData.tY - 8, 0); wL.userData.fi = 1; g.add(wL); af.push(wL);
      var wR = bx(1.0, 2.2, 1.4, 0x091530); wR.userData.tY = 1.1; wR.position.set( 1.44, wR.userData.tY - 8, 0); wR.userData.fi = 1; g.add(wR); af.push(wR);
      var cL = new THREE.Mesh(new THREE.BoxGeometry(1.04, .12, 1.44), mpS(0x6FB8FF));
      cL.userData.tY = 2.86; cL.position.set(-1.44, cL.userData.tY - 8, 0); cL.userData.fi = nF; g.add(cL); af.push(cL);
      var cR = new THREE.Mesh(new THREE.BoxGeometry(1.04, .12, 1.44), mpS(0x4a9fd0));
      cR.userData.tY = 2.22; cR.position.set( 1.44, cR.userData.tY - 8, 0); cR.userData.fi = nF; g.add(cR); af.push(cR);
      var crY = nF * .44;
      var cr = new THREE.Mesh(new THREE.BoxGeometry(2.0, .14, 1.68), mpS(0x6FB8FF));
      cr.userData.tY = crY; cr.position.y = crY - 8; cr.userData.fi = nF + 1; g.add(cr); af.push(cr);
      var ant = bx(.046, .50, .046, 0x4a9fd0); ant.userData.tY = crY + .38; ant.position.set(.30, crY + .38 - 8, 0); ant.userData.fi = nF + 2; g.add(ant); af.push(ant);
      var ab = new THREE.Mesh(new THREE.SphereGeometry(.068, 5, 5), mp(0x6FB8FF, { emissive: 0x6FB8FF, emissiveIntensity: 3.2 }));
      ab.userData.tY = crY + .65; ab.position.set(.30, crY + .65 - 8, 0); ab.userData.fi = nF + 2; g.add(ab); af.push(ab);
      var wins = [], wgeo = new THREE.BoxGeometry(.22, .28, .056);
      for (var r = 1; r < nF; r++) {
        for (var cc = -1; cc <= 1; cc++) {
          var lit = Math.random() > .12;
          var wm = new THREE.Mesh(wgeo, mpS(lit ? 0x6FB8FF : 0x030810,
            lit ? { emissive: 0x1a4e7a, emissiveIntensity: .90 } : {}));
          wm.userData.tY = r * .44 + .08; wm.position.set(cc * .50, wm.userData.tY - 8, .795); wm.userData.fi = r;
          g.add(wm); wins.push(wm); af.push(wm);
        }
      }
      g.userData.wins = wins; g.userData.af = af;
      g.rotation.y = -0.18;
      return g;
    }

    // ── PÓLIZA ────────────────────────────────────────────────────────────────
    function mkCert() {
      var g = new THREE.Group();
      for (var p = 0; p < 6; p++) {
        var pg2 = bx(2.20, 3.30, .055, p % 2 === 0 ? 0xdce8f4 : 0xcddff0);
        pg2.position.set(p * .012, p * .005, -.12 + p * .046); g.add(pg2);
      }
      var back  = bx(2.32, 3.42, .10, 0x091830); back.position.z  = -.36; g.add(back);
      var cover = bx(2.32, 3.42, .10, 0x0B2545); cover.position.z = .17;  g.add(cover);
      var spine = bx(.14, 3.42, .66, 0x134E84); spine.position.set(-1.23, 0, -.095); g.add(spine);
      var spL   = new THREE.Mesh(new THREE.BoxGeometry(.14, .06, .68), mpS(0x6FB8FF, { emissive: 0x6FB8FF, emissiveIntensity: .60 }));
      spL.position.set(-1.23, .80, -.095); g.add(spL);
      var band  = bx(2.32, .72, .12, 0x1E6FD9); band.position.set(0, 1.35, .24); g.add(band);
      var emb   = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .13, 6),
        mpS(0x6FB8FF, { emissive: 0x6FB8FF, emissiveIntensity: 1.4 }));
      emb.rotation.x = Math.PI / 2; emb.position.set(0, 1.35, .32); g.add(emb);
      var ck1 = bx(.07, .38, .14, 0x0B2545); ck1.rotation.z =  .55; ck1.position.set(-.09, 1.28, .39); g.add(ck1);
      var ck2 = bx(.07, .56, .14, 0x0B2545); ck2.rotation.z = -.32; ck2.position.set( .10, 1.38, .39); g.add(ck2);
      var sep1 = new THREE.Mesh(new THREE.BoxGeometry(2.32, .04, .12),
        mpS(0x6FB8FF, { emissive: 0x4a9fd0, emissiveIntensity: .7 }));
      sep1.position.set(0, .98, .24); g.add(sep1);
      var nb = bx(1.80, .16, .12, 0x1a3460); nb.position.set(0, .68, .24); g.add(nb);
      [.32, .10, -.12, -.34, -.56].forEach(function (y2, idx) {
        var lw = [1.60, 1.20, 1.45, 1.0, 1.30][idx];
        var dl = bx(lw, .048, .12, 0x2a5080, { opacity: .58, transparent: true }); dl.position.set(0, y2, .24); g.add(dl);
      });
      var sep2 = bx(2.0, .028, .12, 0x1E6FD9, { opacity: .40, transparent: true }); sep2.position.set(0, -1.10, .24); g.add(sep2);
      [-.42, .42].forEach(function (x2) {
        var sl = bx(.80, .036, .12, 0x2a5080, { opacity: .48, transparent: true }); sl.position.set(x2, -1.32, .24); g.add(sl);
      });
      var brd = bx(2.36, 3.46, .044, 0x1E6FD9, { opacity: .32, transparent: true }); brd.position.z = .19; g.add(brd);
      return g;
    }

    // ── INSTANCIAR ────────────────────────────────────────────────────────────
    var car  = mkCar();
    var bld  = mkBld();
    var cert = mkCert();
    sc.add(car); sc.add(bld); sc.add(cert);

    // ── POSICIONES — calibradas para no salirse del canvas 420×420 (FOV 68°) ─
    var carFinalY  = -1.20;
    var bldFinalY  = -1.00;
    var certFinalY = -0.65;

    var objs = [
      { g: car,  baseScale: 1.20, entryDelay: 0.00, finalX: -3.40, finalY: carFinalY,  finalZ: 2.00,
        baseRotY: -Math.PI * 0.80, shadow: shadows[0],
        hoverT: 0, clickT: 0, clickPhase: 0, idleT: 0, entryDone: false, rotY: 0, floatY: 0 },
      { g: bld,  baseScale: 1.15, entryDelay: 0.18, finalX:  0.00, finalY: bldFinalY,  finalZ:-0.80,
        baseRotY: -0.18,           shadow: shadows[1],
        hoverT: 0, clickT: 0, clickPhase: 0, idleT: 0, entryDone: false, rotY: 0, floatY: 0 },
      { g: cert, baseScale: 1.20, entryDelay: 0.34, finalX:  3.40, finalY: certFinalY, finalZ: 2.00,
        baseRotY: -0.26,           shadow: shadows[2],
        hoverT: 0, clickT: 0, clickPhase: 0, idleT: 0, entryDone: false, rotY: 0, floatY: 0 },
    ];

    objs.forEach(function (o) {
      o.rotY = o.baseRotY;
      o.g.position.set(o.finalX, o.finalY, o.finalZ);
      o.g.rotation.y = o.rotY;
      o.g.scale.setScalar(0);
      // Posicionar sombra en suelo
      o.shadow.position.set(o.finalX, GROUND_Y, o.finalZ - 0.05);
    });

    // ── HITBOXES para raycasting ──────────────────────────────────────────────
    var hitMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
    var hitMeshes = [];
    var hitSizes = [
      [3.4, 1.3, 1.8, 0.50],
      [4.2, 4.8, 2.4, 2.20],
      [2.6, 3.6, 0.9, 0.00],
    ];
    objs.forEach(function (o, idx) {
      var s = hitSizes[idx];
      var hb = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), hitMat.clone());
      hb.position.y = s[3];
      hb.userData.objRef = o;
      o.g.add(hb);
      hitMeshes.push(hb);
    });

    // ── RAYCASTER ─────────────────────────────────────────────────────────────
    var rc    = new THREE.Raycaster();
    var mouse = new THREE.Vector2(-99, -99);
    var hovObj = null;

    rnd.domElement.addEventListener('mousemove', function (e) {
      var rect = rnd.domElement.getBoundingClientRect();
      mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    });
    rnd.domElement.addEventListener('mouseleave', function () { mouse.set(-99, -99); });
    rnd.domElement.addEventListener('click', function (e) {
      var rect = rnd.domElement.getBoundingClientRect();
      rc.setFromCamera(new THREE.Vector2(
         ((e.clientX - rect.left) / rect.width)  * 2 - 1,
        -((e.clientY - rect.top)  / rect.height) * 2 + 1
      ), cam);
      var hits = rc.intersectObjects(hitMeshes);
      if (hits.length) {
        var o = hits[0].object.userData.objRef;
        if (o && o.clickPhase === 0) { o.clickT = 0; o.clickPhase = 1; }
      }
    });

    // ── BUCLE PRINCIPAL ────────────────────────────────────────────────────────
    var ENTRY_DUR = 0.8;
    var IDLE_DUR  = 3.0;
    var IDLE_FADE = 0.8;
    var CPULSE    = 1 / 0.15;
    var lastTS = null, elapsed = 0;

    function tick(ts) {
      requestAnimationFrame(tick);
      if (!lastTS) lastTS = ts;
      var dt = Math.min((ts - lastTS) / 1000, .05); lastTS = ts;
      elapsed += dt;
      var t = ts * .001;

      // Raycaster
      rc.setFromCamera(mouse, cam);
      var hits = rc.intersectObjects(hitMeshes);
      hovObj = hits.length ? hits[0].object.userData.objRef : null;
      rnd.domElement.style.cursor = hovObj ? 'pointer' : 'default';

      objs.forEach(function (o) {
        // 1. Entrada (escala 0 → baseScale, ease-out 0.8s)
        var rawEP = (elapsed - o.entryDelay) / ENTRY_DUR;
        var ep = eout(Math.max(0, Math.min(1, rawEP)));
        if (!o.entryDone && rawEP >= 1.0) o.entryDone = true;
        if (o.entryDone) o.idleT += dt;

        // 2. Intensidad del idle (5s activo, luego ease-out 0.8s)
        var idleS = 0;
        if (o.entryDone) {
          if (o.idleT < IDLE_DUR) {
            idleS = 1.0;
          } else {
            idleS = Math.max(0, 1.0 - eout(Math.min(1, (o.idleT - IDLE_DUR) / IDLE_FADE)));
          }
        }

        // 3. Rotación y flotación en idle
        if (idleS > 0) {
          o.rotY  += 0.30 * idleS * dt;
          o.floatY = Math.sin(t + o.entryDelay * 3) * 0.15 * idleS;
        } else {
          // Volver suavemente al ángulo base
          var targetRot = o.baseRotY;
          if (o === objs[2]) {
            var diff = Math.abs(o.rotY - o.baseRotY) % (Math.PI * 2);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (diff < 0.08) targetRot = o.baseRotY + Math.sin(t * .38) * .08;
          }
          o.rotY   = lerp(o.rotY, targetRot, Math.min(1, dt * 2));
          o.floatY = 0;
        }
        o.g.rotation.y = o.rotY;

        // 4. Hover (elevación +0.3, escala ×1.1)
        var isHov = (o === hovObj);
        o.hoverT = Math.max(0, Math.min(1, o.hoverT + (isHov ? dt * 6 : -dt * 6)));
        var hE = eout(o.hoverT);

        // 5. Pulso de click (1.0 → 1.2 → 1.0 en 0.3s)
        if (o.clickPhase === 1) {
          o.clickT += dt * CPULSE;
          if (o.clickT >= 1) { o.clickT = 0; o.clickPhase = 2; }
        } else if (o.clickPhase === 2) {
          o.clickT += dt * CPULSE;
          if (o.clickT >= 1) { o.clickT = 0; o.clickPhase = 0; }
        }
        var cMult = o.clickPhase === 1 ? lerp(1.0, 1.2, eout(o.clickT))
                  : o.clickPhase === 2 ? lerp(1.2, 1.0, eout(o.clickT))
                  : 1.0;

        // 6. Aplicar transformaciones
        o.g.scale.setScalar(o.baseScale * ep * cMult * (1.0 + hE * 0.1));
        o.g.position.set(o.finalX, o.finalY + o.floatY + hE * 0.3, o.finalZ);
        setAlpha(o.g, eio(ep));

        // 7. Actualizar sombra
        o.shadow.position.set(o.finalX, GROUND_Y, o.finalZ - 0.05);
        var shadowFade = eio(ep) * (1 - hE * 0.45);
        o.shadow.children.forEach(function (c, i) {
          c.material.opacity = SHADOW_OPS[i] * shadowFade;
        });
      });

      // Ruedas del coche
      car.userData.wheels.forEach(function (w) { w.rotation.z += dt * .5; });

      // Pisos del edificio (emergen de abajo arriba)
      var bldDelay = objs[1].entryDelay;
      (bld.userData.af || []).forEach(function (f) {
        if (f.userData.tY == null) return;
        var d = (f.userData.fi || 0) * .062;
        f.position.y = lerp(f.userData.tY - 8, f.userData.tY,
          eio(Math.max(0, elapsed - bldDelay - d) / .55));
      });

      // Parpadeo de ventanas
      var wins = bld.userData.wins || [];
      if (Math.random() < .013) {
        var rw3 = wins[Math.floor(Math.random() * wins.length)];
        if (rw3 && rw3.material) rw3.material.emissiveIntensity = Math.random() > .2 ? .90 : 0;
      }

      // Pulso de luz especular
      spec.intensity  = 4.0 + Math.sin(t * .46) * .8;
      fillPt.intensity = 2.0 + Math.sin(t * .34 + 1.2) * .5;

      rnd.render(sc, cam);
    }

    function setAlpha(obj, a) {
      obj.traverse(function (o) {
        if (!o.isMesh) return;
        var m = o.material;
        if (m._b == null) m._b = (m.opacity != null ? m.opacity : 1);
        m.opacity = m._b * a;
        m.transparent = m.opacity < .999;
      });
    }

    requestAnimationFrame(tick);

    new ResizeObserver(function () {
      var nW = con.offsetWidth, nH = con.offsetHeight;
      rnd.setSize(nW, nH); cam.aspect = nW / nH; cam.updateProjectionMatrix();
    }).observe(con);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) lastTS = null;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
