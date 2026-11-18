import assert from 'node:assert/strict';
import {test} from 'node:test';
import {layoutScatterLabels,scatterScoreAxis} from '../../src/client/comparison/geometry.ts';

test('the score axis zooms into the plotted range without cropping low scores',()=>{
  const scores=(...values:number[])=>values.map(score=>({score}));
  assert.deepEqual(scatterScoreAxis(scores(69.66,91.14)),{min:60,ticks:[60,70,80,90,100]});
  assert.deepEqual(scatterScoreAxis(scores(69.66,91.14,52)),{min:40,ticks:[40,60,80,100]});
  assert.deepEqual(scatterScoreAxis(scores(97,99,100)),{min:70,ticks:[70,80,90,100]});
  const full={min:0,ticks:[0,20,40,60,80,100]};
  assert.deepEqual(scatterScoreAxis(scores(2,91)),full);
  assert.deepEqual(scatterScoreAxis(scores(91)),full);
  assert.deepEqual(scatterScoreAxis([]),full);
});

const points=[
  ['kimi-k3.1-pro',436.09,55.52,10,89,true],
  ['gpt-6-astra',159.46,57.95,15,114,true],
  ['glm-5.3',344.17,62.07,8,49,false],
  ['test/hy4-flash-dev',108.02,63.81,10,118,true],
  ['kimi-k3',296.62,71.84,8,49,false],
  ['qwen3.8-flash',477.11,72.71,8,89,false],
  ['glm-5.3-flash',766.65,78.91,8,89,false],
  ['deepseek-v4.1-flash',98.35,82.43,8,125,false],
  ['qwen3.8-max',399.93,86.07,8,78,false],
  ['MiniMax-M3.1-Flash',160.06,107.72,8,127,false],
].map(([key,x,y,radius,width,selected])=>({
  key:String(key),x:Number(x),y:Number(y),radius:Number(radius),width:Number(width),selected:Boolean(selected),
}));

test('the crowded desktop plot keeps both previously omitted labels in the plot',()=>{
  const bounds={left:42,right:882,top:14,bottom:277};
  const labels=layoutScatterLabels(points,bounds);
  assert.equal(labels.size,points.length);
  assert.ok(labels.has('deepseek-v4.1-flash'));
  assert.ok(labels.has('MiniMax-M3.1-Flash'));
  const boxes=points.map(point=>{
    const {tx,ty,anchor}=labels.get(point.key)!;
    const left=tx-(anchor==='start'?0:anchor==='end'?point.width:point.width/2);
    return {left:left-2,right:left+point.width+2,top:ty-10,bottom:ty+4};
  });
  for(const [i,a] of boxes.entries()){
    assert.ok(a.left>=bounds.left&&a.right<=bounds.right&&a.top>=bounds.top&&a.bottom<=bounds.bottom);
    for(const b of boxes.slice(i+1))assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
    for(const marker of points)assert.ok(a.right<=marker.x-marker.radius||a.left>=marker.x+marker.radius||
      a.bottom<=marker.y-marker.radius||a.top>=marker.y+marker.radius);
  }
});

test('labels that cannot fit remain available for the overflow list',()=>{
  const tooWide={key:'wide',x:60,y:50,width:150,radius:8,selected:false};
  assert.equal(layoutScatterLabels([tooWide],{left:42,right:100,top:14,bottom:277}).size,0);
});

test('near-overlapping writing markers each get an outward leader and an in-plot label',()=>{
  const writingPoints=[
    ['gpt-6-astra',171.75,44.13,15,131,true],
    ['kimi-k3.1-pro',168.78,66.91,10,86,true],
    ['deepseek-v4.1-flash',75.44,79.56,8,119,false],
    ['test/hy4-flash-dev',60.98,87.16,10,112,true],
    ['kimi-k3',124.78,94.75,8,46,false],
    ['glm-5.3-flash',761.47,99.81,8,86,false],
    ['glm-5.3',130.80,117.53,8,46,false],
    ['MiniMax-M3.1-Flash',143.59,122.59,8,127,false],
    ['qwen3.8-flash',142.20,125.13,8,86,false],
    ['qwen3.8-max',262.36,190.94,8,79,false],
  ].map(([key,x,y,radius,width,selected])=>({
    key:String(key),x:Number(x),y:Number(y),radius:Number(radius),width:Number(width),selected:Boolean(selected),
  }));
  const labels=layoutScatterLabels(writingPoints,{left:42,right:871,top:14,bottom:277});
  assert.equal(labels.size,writingPoints.length);
  for(const point of writingPoints){
    const label=labels.get(point.key)!;
    assert.ok(Math.hypot(label.leaderStartX-point.x,label.leaderStartY-point.y)>=point.radius-1e-9,point.key);
  }
  const miniMax=writingPoints[7]!,qwen=writingPoints[8]!;
  for(const [point,neighbor] of [[miniMax,qwen],[qwen,miniMax]] as const){
    const label=labels.get(point.key)!;
    assert.ok(Math.hypot(label.leaderStartX-neighbor.x,label.leaderStartY-neighbor.y)>=neighbor.radius);
  }
});
