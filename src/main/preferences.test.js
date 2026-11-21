const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"), path = require("node:path"), os = require("node:os");
const { snap, snapProgress, contain, restore, remember, compactSize } = require("./placement");
const { loadFile, readOverride, storeOverride, removeOverride } = require("./localLyrics");

test("monitor-relative placement survives rearrangement and clamps after resolution changes", () => {
  const area = { x: -1440, y: 50, width: 1440, height: 900 };
  const b = { x: -600, y: 700, width: 500, height: 246 };
  const saved = remember(b, area);
  assert.deepEqual(restore({width:500,height:246}, area, saved), b);
  const compact = restore(compactSize, { ...area, x: 0 }, saved);
  assert.equal(compact.x + 154, b.x + 250 + 1440);
  assert.equal(compact.y, b.y);
  const smaller = restore(compactSize, {x:0,y:0,width:800,height:600}, saved);
  assert.equal(smaller.x + smaller.width, 800);
  assert.equal(smaller.y + smaller.height, 600);
});

test("snap near work-area edges and corners but not in the interior", () => {
  const area = {x:-1000,y:-50,width:1000,height:850};
  const b = {...compactSize,x:-995,y:728};
  assert.deepEqual(snap(b,area), {...b,x:-1000,y:737});
  const middle = {...b,x:-700,y:500};
  assert.deepEqual(snap(middle,area),middle);
});

test("full rectangle stays in the usable monitor area on every side, corner and monitor handoff", () => {
  for (const area of [{x:-1536,y:-120,width:1496,height:824},{x:0,y:48,width:1920,height:1032}]) {
    for (const size of [compactSize,{width:651,height:317}]) {
      for (const dx of [-10000,100,10000]) for (const dy of [-10000,90,10000]) {
        assert.deepEqual(contain({...size,x:area.x+dx,y:area.y+dy},area),{...size,
          x:area.x+(dx<0?0:dx===100?100:area.width-size.width),
          y:area.y+(dy<0?0:dy===90?90:area.height-size.height)});
      }
    }
    assert.deepEqual(contain({width:3000,height:2000,x:75,y:-300},area),area);
  }
});

test("dock zone includes 36 DIPs, leaves 37 alone and picks the closer edge", () => {
  const area = { x: 0, y: 0, width: 1000, height: 800 };
  const b = { ...compactSize, x: 36, y: 800 - compactSize.height - 36 };
  assert.deepEqual(snap(b, area), { ...b, x: 0, y: 737 });
  assert.equal(snap({ ...b, x: 37 }, area).x, 37);
  assert.equal(snap({ ...b, width: 940, x: 40 }, area).x, 60);
});

test("magnetic pull starts gently, gains speed, and finishes without overshooting", () => {
  assert.equal(snapProgress(0), 0);
  assert.equal(snapProgress(1.2), 1);
  assert.ok(snapProgress(.25) < .1);
  assert.ok(snapProgress(.75) - snapProgress(.5) > snapProgress(.5) - snapProgress(.25));
  for (let i = 1; i <= 100; i++) assert.ok(snapProgress(i/100) >= snapProgress((i-1)/100));
});

test("local copies preserve repeated timestamps, replace and remove only the selected song", async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lyrics-override-"));
  t.after(() => fs.rm(dir,{recursive:true, force:true}));
  const file = path.join(dir,"source.lrc");
  await fs.writeFile(file,"\uFEFF[offset:+100]\r\n[0:03.20][01:00]Again\n[00:01]First");
  const {raw,lyrics} = await loadFile(file);
  assert.deepEqual(lyrics.synced.map(l=>l.timeMs),[900,3100,59900]);
  await storeOverride(dir,"../../A",raw);
  await fs.unlink(file);
  assert.deepEqual(await readOverride(dir,"../../A"),lyrics);
  assert.equal(await readOverride(dir,"B"),null);
  await storeOverride(dir,"../../A","[0:00]New");
  assert.equal((await readOverride(dir,"../../A")).synced[0].text,"New");
  await removeOverride(dir,"../../A");
  assert.equal(await readOverride(dir,"../../A"),null);
  await fs.writeFile(file,"No timestamps");
  await assert.rejects(loadFile(file),/timestamped/);
  await fs.writeFile(file,Buffer.alloc(256*1024+1));
  await assert.rejects(loadFile(file),/256 KB/);
});
