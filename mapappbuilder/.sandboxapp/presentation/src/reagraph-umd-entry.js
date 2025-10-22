import * as reagraphModule from 'reagraph';
import * as graphologyModule from 'graphology';
import * as reactModule from 'react';
import * as jsxRuntimeModule from 'react/jsx-runtime';
import * as reactDomModule from 'react-dom';
import * as fiberModule from '@react-three/fiber';
import * as threeModule from 'three';
import * as threeStdlibModule from 'three-stdlib';
import * as dreiModule from '@react-three/drei';
import * as reactSpringThreeModule from '@react-spring/three';
import * as d3Force3dModule from 'd3-force-3d';
import * as d3HierarchyModule from 'd3-hierarchy';
import circularLayout from 'graphology-layout/circular.js';
import noverlapLayout from 'graphology-layout-noverlap';
import forceAtlas2Layout from 'graphology-layout-forceatlas2';
import randomLayout from 'graphology-layout/random.js';
import pagerankMetric from 'graphology-metrics/centrality/pagerank.js';
import degreeMetric from 'graphology-metrics/centrality/degree.js';
import * as d3ScaleModule from 'd3-scale';
import * as graphologyShortestPathModule from 'graphology-shortest-path';
import * as zustandNamespace from 'zustand';
import * as zustandShallowModule from 'zustand/shallow';
import * as ellipsizeModule from 'ellipsize';
import * as useGestureReactModule from '@use-gesture/react';
import * as cameraControlsModule from 'camera-controls';
import * as holdEventModule from 'hold-event';
import * as classNamesModule from 'classnames';

export * from 'reagraph';
export default reagraphModule;

const globalTarget = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined'
      ? window
      : (typeof self !== 'undefined' ? self : {}));

function expose(name, value) {
  if (value !== undefined && value !== null) {
    globalTarget[name] = value;
  }
}

const pickDefault = mod => (mod && typeof mod === 'object' && 'default' in mod && mod.default ? mod.default : mod);

const threeDefault = pickDefault(threeModule);
const graphologyDefault = graphologyModule.Graph || pickDefault(graphologyModule);
const zustandDefault = pickDefault(zustandNamespace);
const reactDomDefault = pickDefault(reactDomModule);
const classNamesDefault = pickDefault(classNamesModule);
const ellipsizeDefault = pickDefault(ellipsizeModule);
const zustandShallow = pickDefault(zustandShallowModule);
const cameraControls = pickDefault(cameraControlsModule);
const holdEvent = pickDefault(holdEventModule);

if (cameraControls && typeof cameraControls.install === 'function') {
  cameraControls.install({ THREE: threeDefault });
}

expose('reagraph', reagraphModule || null);
expose('graphology', graphologyModule || null);
expose('Graph', graphologyDefault || null);
expose('React', reactModule || null);
expose('ReactDOM', reactDomModule || null);
expose('jsxRuntime', jsxRuntimeModule || null);
expose('reactDom', reactDomDefault || null);
expose('fiber', fiberModule || null);
expose('three', threeDefault || null);
expose('THREE', threeDefault || null);
expose('threeStdlib', threeStdlibModule || null);
expose('drei', dreiModule || null);
expose('three$1', reactSpringThreeModule || null);
expose('d3Force3d', d3Force3dModule || null);
expose('d3Hierarchy', d3HierarchyModule || null);
expose('circular', circularLayout || null);
expose('noverlapLayout', noverlapLayout || null);
expose('forceAtlas2Layout', forceAtlas2Layout || null);
expose('random', randomLayout || null);
expose('pagerank', pagerankMetric || null);
expose('degree_js', degreeMetric || null);
expose('d3Scale', d3ScaleModule || null);
expose('graphologyShortestPath', graphologyShortestPathModule || null);
expose('zustand', zustandDefault || null);
expose('zustandModule', zustandNamespace || null);
expose('shallow', zustandShallow || null);
expose('ellipsize', ellipsizeDefault || null);
expose('ThreeCameraControls', cameraControls || null);
expose('holdEvent', holdEvent || null);
expose('classNames', classNamesDefault || null);
expose('react', reactModule || null);
expose('useGestureReact', useGestureReactModule || null);

// ensure modules stay referenced so they are not shaken off
void reagraphModule;
void graphologyModule;
void reactModule;
void reactDomModule;
void jsxRuntimeModule;
void fiberModule;
void threeModule;
void threeStdlibModule;
void dreiModule;
void reactSpringThreeModule;
void d3Force3dModule;
void d3HierarchyModule;
void circularLayout;
void noverlapLayout;
void forceAtlas2Layout;
void randomLayout;
void pagerankMetric;
void degreeMetric;
void d3ScaleModule;
void graphologyShortestPathModule;
void zustandNamespace;
void zustandShallow;
void ellipsizeDefault;
void useGestureReactModule;
void cameraControls;
void holdEvent;
void classNamesDefault;
