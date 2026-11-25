const test = require("node:test");
const assert = require("node:assert/strict");
const {matchCover,createCoverLookup} = require("./artwork");
const song={uri:"sample",artist:"Money Man",track:"Courtesy",album:"Epidemic"};
const record={artistName:song.artist,trackName:song.track,collectionName:song.album,
  artworkUrl100:"https://is1-ssl.mzstatic.com/image/thumb/test/100x100bb.jpg"};
test("cover fallback requires a matching recording and edition and a trusted image URL",()=>{
  for(const other of [{artistName:"Wrong"}, {trackName:"Different"}, {collectionName:"Epidemic (Deluxe)"},
    {artworkUrl100:"https://elsewhere.invalid/not-art"}]) assert.equal(matchCover(song,[{...record,...other}]),"");
  assert.equal(matchCover(song,[{...record,collectionName:"Epidemic (Deluxe)"},record]),record.artworkUrl100.replace("100x100","600x600"));
});
test("coalesces concurrent requests and caches both covers and misses",async()=>{
  for(const results of [[],[record]]) {
    let calls=0;
    const lookup=createCoverLookup(async()=>{calls++;return {ok:true,json:async()=>({results})};});
    const [a,b]=await Promise.all([lookup(song),lookup(song)]);
    assert.equal(a,b);assert.equal(await lookup(song),a);assert.equal(calls,1);
  }
});
