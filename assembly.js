(function(root){
  'use strict';
  const layers = [
    ['block','Cylinder block','The two cylinder banks, bore liners, and crankcase casting.'],
    ['rotating','Crank & pistons','Eight pistons and connecting rods drive four shared crank throws.'],
    ['bearings','Main bearings','Five main bearing caps support the crankshaft.'],
    ['pan','Oil pan','The lower sump and its bolted sealing flange.'],
    ['heads','Cylinder heads','Two head castings close the chambers and carry the ports.'],
    ['valves','Valvetrain','The half-speed camshaft actuates pushrods, rockers, and spring-return valves.'],
    ['covers','Valve covers','Removable covers enclose the rocker assemblies.'],
    ['intake','Intake manifold','The central plenum distributes the intake charge to both banks.'],
    ['exhaust','Exhaust manifolds','Four runners on each bank merge into a collector.'],
    ['timing','Timing & flywheel','A 2:1 timing drive links crank and cam. The flywheel turns with the crank.']
  ].map(([id,name,description])=>({id,name,description}));
  root.Assembly={layers,create:()=>({mode:'assembled',explode:0,targetExplode:0,visible:new Set(layers.map(l=>l.id)),selected:null})};
})(globalThis);
