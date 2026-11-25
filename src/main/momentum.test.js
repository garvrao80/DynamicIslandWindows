const test = require("node:test");
const assert = require("node:assert/strict");
const {sample, releaseGlide, throwTarget} = require("./momentum");
function flick(points) {
  const history = [];
  for (const [at,x,y=0] of points) sample(history,{x,y},at);
  return releaseGlide(history);
}

test("slow, stationary, paused and tiny drags stop without coasting", () => {
  for (const path of [[[0,0],[20,8],[40,16]], [[0,0],[20,0]], [[0,0],[20,40],[75,40]],
    [[0,0],[16,90],[200,90]], [[0,0],[12,10]]]) assert.equal(flick(path),null);
});
test("fast releases coast in the latest direction with bounded distance and duration", () => {
  const g=flick([[0,0,0],[16,48,-64],[32,96,-128]]);
  assert.ok(g.dx>0 && g.dy<0 && Math.abs(g.dx/g.dy+0.75)<0.001);
  assert.ok(Math.hypot(g.dx,g.dy)<=90 && g.duration<=210);
  assert.ok(flick([[0,0],[20,50],[40,95],[60,60],[76,40]]).dx<0);
});

test("directed throws can reach every edge and corner on an offset monitor in either size", () => {
  const area={x:-1700,y:-80,width:1600,height:1040};
  for (const size of [{width:308,height:63},{width:563,height:269}]) {
    for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
      const x = dx<0?area.x:dx>0?area.x+area.width-size.width:area.x+500;
      const y = dy<0?area.y:dy>0?area.y+area.height-size.height:area.y+400;
      const from={...size,x:x-175*dx,y:y-165*dy};
      assert.deepEqual(throwTarget(from,area,{dx,dy,speed:2}),{...size,x,y});
    }
  }
});
test("long reach ignores slow, away, grazing, out-of-range and poorly aimed corner throws", () => {
  const area={x:0,y:0,width:1600,height:1000}, from={x:200,y:165,width:300,height:60};
  for(const g of [null,{speed:1.1,dx:-1,dy:0},{speed:4,dx:1,dy:0},{speed:4,dx:0,dy:1}])
    assert.equal(throwTarget(from,area,g),null);
  assert.equal(throwTarget({...from,y:15},area,{speed:2,dx:1,dy:-.1}),null);
  assert.equal(throwTarget({...from,x:421},area,{speed:8,dx:-1,dy:0}),null);
  assert.deepEqual(throwTarget(from,area,{speed:2,dx:-1,dy:-.4}),{...from,x:0,y:85});
});
