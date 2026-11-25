// Real Electron window, renderer and IPC; isolated profile and fake player.
const {app, BrowserWindow, dialog, globalShortcut, screen, systemPreferences} = require("electron");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict");
const profile = fs.mkdtempSync(path.join(os.tmpdir(),"island-desktop-"));
app.setPath("userData",profile);
app.setLoginItemSettings = () => {};
let track = "A", progress = 2000, choose, finishOnline, callback;
const media = require("../src/main/windowsMedia");
const transport = [];
media.getWindowsPlayback = async () => ({uri:track, track, artist:"Fixture", isPlaying:true, progressMs:progress, durationMs:60000});
media.requestWindowsMedia = async (action, ms) => { transport.push(action); if (action === "seek") progress = ms; };
const online = {synced:[{timeMs:0,text:"Online"}], plain:"", source:"Fixture"};
// No external catalog requests from this isolated player.
const fixtureCover="data:image/svg+xml;base64,"+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="blue"/></svg>').toString("base64");
require("../src/main/artwork").createCoverLookup=()=>async()=>fixtureCover;
require("../src/main/lyrics").fetchLyrics = async () => finishOnline ? online :
  new Promise(resolve => { finishOnline = () => resolve(online); });
dialog.showOpenDialog = () => choose();
globalShortcut.register = (key, fn) => {
  if (key === "Alt+Shift+I") return false;
  callback = fn; return true;
};
globalShortcut.unregister = () => {};
const wait = ms => new Promise(r => setTimeout(r, ms));
setTimeout(() => { console.error("Timed out"); app.exit(2); }, 40000);
app.once("browser-window-created", (_, win) => win.webContents.once("did-finish-load", async () => {
  const js = code => win.webContents.executeJavaScript(code).catch(e => {throw new Error(code + ": " + e.message);});
  const until = async code => {
    for (let n=0; n<150; n++) { if (await js(code)) return; await wait(20); }
    throw new Error(code);
  };
  try {
    await until('currentState?.playback?.uri === "A"');
    await until('art.style.backgroundImage.includes("data:image/") && expandedArt.style.backgroundImage === art.style.backgroundImage');
    await js('setExpanded(true)'); await wait(400);
    await js('settingsToggle.click(); shortcut.value="Ctrl+Alt+L"; snapEdges.checked=true; settings.requestSubmit()');
    await until('currentState.config.snapEdges && currentState.config.toggleShortcut === "Ctrl+Alt+L"');
    const customSize = await js('window.lyricsIsland.resizeExpanded({width: 563, height: 269})');
    const bounds = win.getBounds();
    callback(); assert.equal(win.isVisible(),false);
    callback(); assert.ok(win.isVisible()); assert.deepEqual(win.getBounds(),bounds);
    await js('settingsToggle.click(); shortcut.value="Alt+Shift+I"; settings.requestSubmit()');
    await until('settingsMessage.textContent.includes("in use")');
    assert.equal(await js('currentState.config.toggleShortcut'),"Ctrl+Alt+L");
    const area = screen.getDisplayMatching(bounds).workArea;
    const nativeMove = () => win.emit("will-move", {preventDefault() {}}, win.getBounds());
    let reduced = false;
    systemPreferences.getAnimationSettings = () => ({ prefersReducedMotion: reduced });
    await js('window.lyricsIsland.onDocked(e => {window.lastDock = e})');
    const near = {...customSize,x:area.x+32,y:area.y+30};
    win.setBounds(near);
    const viewport = await js('[innerWidth, innerHeight]');
    nativeMove(); win.emit("moved");
    assert.ok(win.getBounds().x > area.x + 27);
    await wait(180);
    assert.ok(win.getBounds().x > area.x && win.getBounds().x < near.x);
    // A second drag owns the window immediately, even with a frame outstanding.
    nativeMove();
    const held = win.getBounds();
    await wait(450);
    assert.deepEqual(win.getBounds(),held);
    assert.ok(await js('!window.lastDock'));
    win.emit("moved");
    await until('window.lastDock?.horizontal === "left" && window.lastDock.vertical === "top"');
    assert.ok(await js('reducedMotion.matches || (dockGlow.getAnimations().length > 0 && getComputedStyle(dockGlow).pointerEvents === "none")'));
    assert.ok(Math.abs(win.getBounds().x-area.x)<=1 && Math.abs(win.getBounds().y-area.y)<=1);
    const landed = win.getBounds();
    for (const dim of ["width","height"])
      assert.ok(Math.abs(landed[dim] - near[dim]) <= 1, dim + " changed: " + near[dim] + " to " + landed[dim]);
    assert.deepEqual(await js('[innerWidth, innerHeight]'),viewport);
    const strips = BrowserWindow.getAllWindows().filter(w => w !== win);
    assert.equal(strips.length, 2, "one light per contacted screen edge");
    for (const strip of strips) {
      for (let n=0;n<30 && !strip.isVisible();n++) await wait(12);
      assert.equal(strip.isFocusable(), false, "edge light must not take focus");
      assert.equal(strip.isVisible(), true, "edge light must be visible after landing");
      const bounds = strip.getBounds();
      const display = screen.getDisplayMatching(win.getBounds()).bounds;
      if (strip.webContents.isLoadingMainFrame()) await new Promise(resolve => strip.webContents.once("did-finish-load",resolve));
      const top = strip.webContents.getURL().endsWith("#top");
      const thickness = await strip.webContents.executeJavaScript("document.querySelector(':target').getBoundingClientRect()." + (top ? "height" : "width"));
      assert.equal(thickness,16,"visible edge-light thickness");
      assert.ok(top ? Math.abs(bounds.y-display.y)<=1 :
        Math.abs(bounds.x-display.x)<=1, JSON.stringify({url:strip.webContents.getURL(),bounds,display}));
      assert.ok(top ? bounds.width > landed.width : bounds.height > landed.height);
      assert.ok(await strip.webContents.executeJavaScript("document.body.classList.contains('lit') && getComputedStyle(document.querySelector(':target')).backgroundImage.includes('radial-gradient')"));
    }
    await wait(1150);
    assert.ok(strips.every(strip => strip.isDestroyed()), "edge lights disappear after the pulse");
    const far = {...near, x:area.x+area.width-near.width-35, y:area.y+area.height-near.height-35};
    win.setBounds(far);
    nativeMove(); win.emit("moved");
    await until('window.lastDock?.horizontal === "right" && window.lastDock.vertical === "bottom"');
    assert.deepEqual(await js('[innerWidth, innerHeight]'),viewport);
    for (const strip of BrowserWindow.getAllWindows().filter(w => w !== win)) {
      if (strip.webContents.isLoadingMainFrame()) await new Promise(resolve => strip.webContents.once("did-finish-load",resolve));
      const b = strip.getBounds(), d = screen.getDisplayMatching(win.getBounds()).bounds;
      const delta = strip.webContents.getURL().endsWith("#bottom") ? b.y+b.height-d.y-d.height : b.x+b.width-d.x-d.width;
      assert.ok(Math.abs(delta) <= 1, "light must reach physical screen border: " + JSON.stringify({b,d}));
    }
    reduced = true;
    win.setBounds(near);
    await js('window.lastDock = null');
    nativeMove(); win.emit("moved");
    assert.ok(Math.abs(win.getBounds().x-area.x)<=1);
    await wait(80);
    assert.ok(await js('!window.lastDock'));
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    const file = path.join(profile,"fixture.lrc");
    fs.writeFileSync(file,"[00:00]First\n[00:12]Second");
    choose = () => ({canceled:false,filePaths:[file]});
    await js('importLrc.click()'); await until('currentState.lyrics.source === "Local LRC"');
    finishOnline(); await wait(80);
    assert.equal(await js('lyricsList.children[1].textContent'),"Second");
    // Existing lyric seek includes the player's 250 ms lead guard.
    await js('lyricsList.children[1].click()'); await until('currentState.playback.progressMs === 12250');
    assert.equal(progress,12250);
    await js('timingButtons[1].click()'); await until('currentState.config.songOffsetMs === 250');
    await js('lyricsWindow.dispatchEvent(new WheelEvent("wheel",{deltaY:80,cancelable:true}))');
    assert.equal(await js('backToLive.hidden'),false);
    await until('backToLive.hidden');
    choose = () => ({canceled:true});
    await js('window.lyricsIsland.localLyrics("A","import")');
    assert.equal(await js('currentState.lyrics.source'),"Local LRC");
    let finishDialog;
    choose = () => new Promise(r => { finishDialog = r; });
    await js('importLrc.click()'); await wait(75);
    track = "B"; await js('window.lyricsIsland.saveConfig({})');
    await until('currentState.playback.uri === "B"');
    finishDialog({canceled:false,filePaths:[file]});
    await until('settingsMessage.textContent.includes("Song changed")');
    await until('currentState.lyrics.source === "Fixture"');
    fs.unlinkSync(file);
    track = "A"; await js('window.lyricsIsland.saveConfig({})');
    await until('currentState.lyrics.source === "Local LRC"');
    await js('removeLrc.click()'); await until('currentState.lyrics.source === "Fixture"');
    await js('setExpanded(false)'); await wait(400);
    assert.ok(Math.abs(win.getBounds().width - 308) <= 1); // Fractional Windows DPI rounding.
    // Drive the actual pointer listeners while independently controlling the
    // desktop cursor reported to main. Assert bounds BEFORE releasing the drag.
    const realCursor = screen.getCursorScreenPoint;
    for (const expanded of [false, true]) {
      await js('window.lyricsIsland.saveConfig({snapEdges:false})');
      if (expanded) { await js('setExpanded(true)'); await wait(400); }
      const grip = await js('(()=>{const r=document.querySelector('+
        JSON.stringify(expanded?".lyric-line.active":"#play")+').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
      const actionsBeforeDrag = transport.length;
      // Simulate cursor samples through the production drag IPC, independently of
      // the user's mouse. Check actual window bounds after releasing and regrabbing.
      const home = win.getBounds();
      const base = {...home, x:area.x+100, y:area.y+100};
      let flickCursor;
      screen.getCursorScreenPoint = () => flickCursor;
      const phase = name => js('window.lyricsIsland.drag('+JSON.stringify(name)+',{x:20,y:20})');
      async function flick(stepX=32, stepY=0) {
        win.setBounds(base);
        flickCursor={x:base.x+20,y:base.y+20};
        await phase("start");
        for (let i=0;i<3;i++) {
          await wait(16);
          flickCursor={x:flickCursor.x+stepX,y:flickCursor.y+stepY};
          await phase("move");
        }
        await phase("end");
        return win.getBounds().x;
      }
      reduced=false;
      const released=await flick();
      await wait(240);
      const landed=win.getBounds();
      assert.ok(landed.x > released+8 && landed.x <= released+91,"fast release should coast briefly");
      assert.ok(Math.abs(landed.y-base.y)<=1 && Math.abs(landed.width-base.width)<=1);
      await flick(); await wait(30); await phase("start");
      const caught=win.getBounds(); await wait(240);
      assert.deepEqual(win.getBounds(),caught,"regrab cancels coast");
      await phase("cancel");
      {
        await js('window.lastDock=null;window.lyricsIsland.saveConfig({snapEdges:true})');
        const right = area.x+area.width-base.width;
        const bottom = area.y+area.height-base.height;
        const originalX = base.x, originalY = base.y;
        // Beyond even a max 90-DIP coast plus the ordinary 36-DIP snap.
        base.x = right-144-165;
        if (expanded) base.y = bottom-144-170;
        await flick(48,expanded?48:0);
        await until(expanded ? 'window.lastDock?.horizontal==="right" && window.lastDock.vertical==="bottom"'
          : 'window.lastDock?.horizontal==="right" && !window.lastDock.vertical');
        assert.ok(Math.abs(win.getBounds().x-right)<=1,"glide settles at work-area edge");
        if (expanded) assert.ok(Math.abs(win.getBounds().y-bottom)<=1,"diagonal throw attaches to both edges");
        await js('window.lastDock=null');
        await flick(48,expanded?48:0); await wait(30); await phase("start");
        const heldThrow=win.getBounds(); await wait(470);
        assert.deepEqual(win.getBounds(),heldThrow,"regrab interrupts long throw");
        assert.ok(await js('!window.lastDock'));
        await phase("cancel");
        base.x = originalX; base.y = originalY;
        await js('window.lyricsIsland.saveConfig({snapEdges:false})');
      }
      reduced=true;
      const instant=await flick(); await wait(100);
      assert.equal(win.getBounds().x,instant,"reduced motion never coasts");
      win.setBounds({...home,x:area.x+100,y:area.y+100});
      const start = win.getBounds();
      let cursor = {x:start.x+grip.x,y:start.y+grip.y};
      screen.getCursorScreenPoint = () => cursor;
      win.webContents.sendInputEvent({type:"mouseDown",button:"left",clickCount:1,...grip});
      await wait(100);
      cursor={x:cursor.x+20,y:cursor.y};
      win.webContents.sendInputEvent({type:"mouseMove",modifiers:["leftButtonDown"],x:grip.x+20,y:grip.y});
      await until('dragging');
      await wait(90);
      assert.ok(Math.abs(win.getBounds().x-start.x-20)<=1,"native pointer gesture moves the window");
      win.webContents.sendInputEvent({type:"mouseUp",button:"left",clickCount:1,...grip});
      await wait(100);
      assert.equal(transport.length,actionsBeforeDrag,"drag must not play/pause or seek");
      // Windows may discard injected pointer capture when the real mouse is
      // elsewhere. Exercise all long-distance moves with the same drag IPC.
      await js('window.lyricsIsland.drag("start",'+JSON.stringify(grip)+')');
      const endX=area.x+area.width, endY=area.y+area.height;
      const midX=area.x+Math.floor(area.width/2), midY=area.y+Math.floor(area.height/2);
      for (const [x,y] of [[area.x,midY],[endX-1,midY],[midX,area.y],[midX,endY-1],
        [area.x,area.y],[endX-1,area.y],[area.x,endY-1],[endX-1,endY-1]]) {
        cursor = {x,y};
        // Dragging uses the logical layout size, not a DPI-rounded HWND readback.
        const size=expanded ? customSize : {width:308,height:63};
        const wantedX=Math.max(area.x,Math.min(x-grip.x,endX-size.width));
        const wantedY=Math.max(area.y,Math.min(y-grip.y,endY-size.height));
        await js('window.lyricsIsland.drag("move")');
        const b=win.getBounds();
        assert.ok(b.x>=area.x && b.y>=area.y && b.x+b.width<=endX+1 && b.y+b.height<=endY+1, JSON.stringify(b));
        assert.ok(Math.abs(b.x-wantedX)<=1 && Math.abs(b.y-wantedY)<=1, JSON.stringify({b,wantedX,wantedY}));
      }
      await js('window.lyricsIsland.drag("end")');
      await wait(100);
      win.webContents.sendInputEvent({type:"mouseDown",button:"left",clickCount:1,...grip});
      win.webContents.sendInputEvent({type:"mouseUp",button:"left",clickCount:1,...grip});
      await wait(130);
      assert.equal(transport.at(-1),expanded?"seek":"pause","ordinary click still activates the target");
      if (expanded) {
        reduced = false;
        await js('window.lastDock=null;window.lyricsIsland.saveConfig({snapEdges:true})');
        win.webContents.sendInputEvent({type:"mouseDown",button:"left",clickCount:1,...grip}); await wait(40);
        cursor = {x:midX, y:area.y+grip.y+25};
        win.webContents.sendInputEvent({type:"mouseMove",modifiers:["leftButtonDown"],x:grip.x+8,y:grip.y});
        await wait(90);
        assert.ok(Math.abs(win.getBounds().y-area.y-25)<=1);
        win.webContents.sendInputEvent({type:"mouseUp",button:"left",clickCount:1,...grip});
        await until('window.lastDock?.vertical==="top"');
        assert.ok(Math.abs(win.getBounds().y-area.y)<=1);
      }
    }
    screen.getCursorScreenPoint = realCursor;
    reduced = true; // Exercise shape independently of the timed light overlay.
    const cx = area.x + Math.round((area.width-customSize.width)/2);
    const cy = area.y + Math.round((area.height-customSize.height)/2);
    const checkDock = async (size, expectedViewport, sx, sy, compact = false) => {
      win.setBounds({...size, x:sx<0?area.x+18:sx>0?area.x+area.width-size.width-18:cx,
        y:sy<0?area.y+18:sy>0?area.y+area.height-size.height-18:cy});
      nativeMove(); win.emit("moved"); await wait(310);
      const contacts = [sy<0,sx>0,sy>0,sx<0]; // clockwise from top
      const result = await js(`(()=>{try{
        const p=document.querySelector("#notchOutline path"), w=island.offsetWidth, h=island.offsetHeight;
        const contacts=${JSON.stringify(contacts)};
        const compact=${compact};
        if (!getComputedStyle(island).clipPath.startsWith("path(")) return "no silhouette";
        for(let i=0;i<4;i++){
          const horizontal=contacts[i<2?0:2],vertical=contacts[i===0||i===3?3:1];
          const inside=(u,v)=>{
            const point=p.ownerSVGElement.createSVGPoint();
            point.x=i===0||i===3?u:w-u; point.y=i<2?v:h-v;
            return p.isPointInFill(point);
          };
          if(horizontal && vertical){if(!inside(1,1))return "shared corner";}
          else if(horizontal){if(!inside(compact?4:7,.5)||inside(compact?4:12,compact?7:15)||!inside(compact?9:17,compact?15:30))return "horizontal shoulder";}
          else if(vertical){if(!inside(.5,compact?4:7)||inside(compact?7:15,compact?4:12)||!inside(compact?15:30,compact?9:17))return "vertical shoulder";}
          else if(inside(1,1))return "free corner";
        }
        // Verify the visible disks plus a small clearance, not just their centers.
        const origin=island.getBoundingClientRect(), point=p.ownerSVGElement.createSVGPoint();
        const checkNode=(el, rounded=false)=>{
          const rect=el.getBoundingClientRect(), style=getComputedStyle(el);
          if(rect.width<=0 || rect.height<=0)return el.id+" collapsed";
          const cssRadius=style.borderTopLeftRadius;
          const radius=rounded ? parseFloat(cssRadius)*(cssRadius.endsWith("%")?Math.min(rect.width,rect.height)/100:1) : 0;
          for(const hor of [-1,1]) for(const vert of [-1,1]) for(let a=0;a<=90;a+=15){
            const gap=compact?5:0;
            point.x=rect.x-origin.x+rect.width/2+hor*(rect.width/2-radius+(radius+gap)*Math.cos(a*Math.PI/180));
            point.y=rect.y-origin.y+rect.height/2+vert*(rect.height/2-radius+(radius+gap)*Math.sin(a*Math.PI/180));
            if(!p.isPointInFill(point))return el.id+" clipped";
          }
          return "";
        };
        for(const id of compact?["art","track","lyric"]:["expandedArt","expandedTrack","expandedArtist","progressElapsed","progressDuration","status"]){
          const node=document.getElementById(id), problem=checkNode(node,["art","expandedArt"].includes(id));
          if(problem)return problem;
        }
        for(const btn of document.querySelectorAll(compact?".compact button":"#collapse,#resizeHandle,.expanded-controls button")){
          const rect=btn.getBoundingClientRect(), x=rect.x+rect.width/2, y=rect.y+rect.height/2;
          if(document.elementFromPoint(x,y)?.closest("button")!==btn)return btn.id+" blocked";
          for(let i=0;i<32;i++){
            const angle=i*Math.PI/16;
            point.x=x-origin.x+(rect.width/2+5)*Math.cos(angle);
            point.y=y-origin.y+(rect.height/2+5)*Math.sin(angle);
            if(!p.isPointInFill(point))return btn.id+" touches dock outline";
          }
        }
        return "ok"; } catch(e){return String(e);}
      })()`);
      assert.equal(result,"ok",JSON.stringify({sx,sy,result}));
      assert.deepEqual(await js('[innerWidth,innerHeight]'),expectedViewport);
    };
    for (const size of [customSize,{width:500,height:246}]) {
      win.setBounds({...size,x:cx,y:cy});
      await js('window.lyricsIsland.resizeExpanded('+JSON.stringify(size)+')');
      await wait(350);
      const expectedViewport = await js('[innerWidth,innerHeight]');
      await js('expandedTrack.textContent="Low Life (feat. The Weeknd)"; statusNode.textContent="Spotify on this PC - LRCLIB (cached)"');
      for (const [sx,sy] of [[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[1,1],[-1,1]])
        await checkDock(size,expectedViewport,sx,sy);
    }
    win.setBounds({...customSize,x:cx,y:cy}); nativeMove(); win.emit("moved");
    await until('!island.classList.contains("shaped") && getComputedStyle(island).clipPath==="none"');
    await js('setExpanded(false)'); await wait(350);
    assert.equal(await js('getComputedStyle(island).clipPath'),"none");
    const smallViewport=await js('[innerWidth,innerHeight]');
    for (const [sx,sy] of [[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[1,1],[-1,1]])
      await checkDock({width:308,height:63},smallViewport,sx,sy,true);
    win.setBounds({width:308,height:63,x:cx,y:cy}); nativeMove(); win.emit("moved");
    await until('!island.classList.contains("shaped") && getComputedStyle(island).clipPath==="none"');
    console.log("PASS: compact/expanded drag at all 4 edges and corners; shortcut, snap, local lyrics, seek, scrolling and fallback");
    app.quit();
  } catch (error) {console.error(error); app.exit(1);}
}));
require("../src/main/main");
