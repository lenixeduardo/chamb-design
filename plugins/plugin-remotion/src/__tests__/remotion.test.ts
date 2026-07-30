import { describe, expect, it } from 'vitest';
import {
  PluginRegistry,
  applyOperation,
  createDocument,
  createNode,
  seededRng,
  setIdRng,
  type DesignDocument,
  type MotionSpec,
} from '@opendesign/core';
import { componentsPlugin, heroCentered, navbar } from '@opendesign/components';
import { exportProject, exportersPlugin } from '@opendesign/exporters';
import {
  buildTimeline,
  cubicBezier,
  frameStates,
  generateRemotionProject,
  motionAtFrame,
  msToFrames,
  msToFrameOffset,
  remotionPlugin,
  resolveEasing,
} from '../index.js';
import { RemotionNotInstalledError } from '../render.js';

function docWithMotion(specs: (MotionSpec | undefined)[]): DesignDocument {
  setIdRng(seededRng(7));
  let doc = createDocument({ name: 'Motion test' });
  const rootId = doc.pages[0]!.rootId;

  specs.forEach((spec, index) => {
    const node = createNode({ type: 'frame', name: `Node ${index}` });
    if (spec) node.motion = spec;
    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: rootId,
      index,
    }).document;
  });

  return doc;
}

/* ------------------------------- easing ------------------------------- */

describe('easing', () => {
  it('is pinned at both ends', () => {
    const ease = cubicBezier(0.16, 1, 0.3, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('is monotonic across the curve', () => {
    const ease = cubicBezier(0.16, 1, 0.3, 1);
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = ease(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('front-loads an ease-out curve', () => {
    // The library's default curve should be well past halfway at t=0.5.
    expect(cubicBezier(0.16, 1, 0.3, 1)(0.5)).toBeGreaterThan(0.8);
  });

  it('parses css keywords and cubic-bezier strings', () => {
    expect(resolveEasing('linear')(0.5)).toBeCloseTo(0.5, 5);
    expect(resolveEasing('cubic-bezier(0, 0, 1, 1)')(0.25)).toBeCloseTo(0.25, 2);
  });

  it('falls back rather than throwing on an unknown easing', () => {
    // A typo in a CSS string should not fail a render.
    expect(() => resolveEasing('wobble-9000')(0.5)).not.toThrow();
    expect(resolveEasing('wobble-9000')(1)).toBe(1);
  });
});

describe('msToFrames', () => {
  it('converts durations and never rounds to zero', () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(msToFrames(500, 60)).toBe(30);
    // A 5ms animation still occupies one frame; zero would divide by zero later.
    expect(msToFrames(5, 30)).toBe(1);
  });
});

/* ------------------------------ timeline ------------------------------ */

describe('buildTimeline', () => {
  it('includes mount and in-view, and skips interaction triggers', () => {
    const doc = docWithMotion([
      { engine: 'css', trigger: 'mount', duration: 400 },
      { engine: 'css', trigger: 'in-view', duration: 600 },
      { engine: 'css', trigger: 'hover', duration: 200 },
      { engine: 'css', trigger: 'tap', duration: 120 },
      undefined,
    ]);

    const { entries } = buildTimeline(doc, doc.pages[0]!.rootId, { fps: 30 });
    // There is no cursor in a video, so hover and tap would animate for no
    // visible reason.
    expect(entries).toHaveLength(2);
  });

  it('offsets by delay and by stagger index', () => {
    const doc = docWithMotion([
      { engine: 'css', trigger: 'mount', duration: 300, stagger: 100 },
      { engine: 'css', trigger: 'mount', duration: 300, stagger: 100 },
      { engine: 'css', trigger: 'mount', duration: 300, stagger: 100 },
    ]);

    const { entries } = buildTimeline(doc, doc.pages[0]!.rootId, { fps: 30, leadFrames: 0 });
    const starts = entries.map((entry) => entry.startFrame);

    expect(starts[0]!).toBeLessThan(starts[1]!);
    expect(starts[1]!).toBeLessThan(starts[2]!);
  });

  it('sizes the composition to the last animation plus a tail', () => {
    const doc = docWithMotion([{ engine: 'css', trigger: 'mount', duration: 1000, delay: 500 }]);
    const { durationInFrames } = buildTimeline(doc, doc.pages[0]!.rootId, {
      fps: 30,
      leadFrames: 0,
      tailFrames: 30,
    });

    // 500ms delay + 1000ms duration = 45 frames, plus a 30-frame hold.
    expect(durationInFrames).toBe(75);
  });

  it('returns a non-zero duration for a page with no motion at all', () => {
    const doc = docWithMotion([undefined, undefined]);
    const { entries, durationInFrames } = buildTimeline(doc, doc.pages[0]!.rootId, { fps: 30 });

    expect(entries).toHaveLength(0);
    // A still page should still produce a renderable video, not a zero-frame one.
    expect(durationInFrames).toBeGreaterThan(0);
  });

  it('skips hidden subtrees', () => {
    setIdRng(seededRng(11));
    let doc = createDocument();
    const node = createNode({ type: 'frame' });
    node.hidden = true;
    node.motion = { engine: 'css', trigger: 'mount', duration: 400 };

    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: [node],
      rootId: node.id,
      parentId: doc.pages[0]!.rootId,
      index: 0,
    }).document;

    expect(buildTimeline(doc, doc.pages[0]!.rootId).entries).toHaveLength(0);
  });
});

/* --------------------------- frame sampling --------------------------- */

describe('motionAtFrame', () => {
  const entry = {
    nodeId: 'n1',
    spec: {
      engine: 'css' as const,
      trigger: 'mount' as const,
      from: { opacity: 0, y: 24 },
      to: { opacity: 1, y: 0 },
      duration: 1000,
      ease: 'linear',
    },
    startFrame: 10,
    durationInFrames: 30,
  };

  it('holds the from-state before it starts', () => {
    const state = motionAtFrame(entry, 0);
    expect(state.opacity).toBe(0);
    expect(state.transform).toBe('translateY(24px)');
  });

  it('holds the to-state after it ends', () => {
    const state = motionAtFrame(entry, 100);
    expect(state.opacity).toBe(1);
    // A zero translate collapses to `none` rather than `translateY(0px)`.
    expect(state.transform).toBe('none');
  });

  it('interpolates linearly in the middle', () => {
    const state = motionAtFrame(entry, 25);
    expect(state.opacity).toBeCloseTo(0.5, 2);
    expect(state.transform).toBe('translateY(12px)');
  });

  it('never leaves a node mid-interpolation at the video edges', () => {
    for (const frame of [-5, 0, 9, 40, 41, 1000]) {
      const state = motionAtFrame(entry, frame);
      expect([0, 1]).toContain(state.opacity);
    }
  });

  it('interpolates blur into a filter', () => {
    const blurred = motionAtFrame(
      {
        ...entry,
        spec: { ...entry.spec, from: { opacity: 0, blur: 10 }, to: { opacity: 1, blur: 0 } },
      },
      25,
    );
    expect(blurred.filter).toMatch(/^blur\(5(\.\d+)?px\)$/);
  });

  it('composes multiple transform channels', () => {
    const state = motionAtFrame(
      {
        ...entry,
        spec: {
          ...entry.spec,
          from: { x: 10, y: 20, scale: 0.5, rotate: 45 },
          to: { x: 10, y: 20, scale: 0.5, rotate: 45 },
        },
      },
      25,
    );
    expect(state.transform).toBe('translateX(10px) translateY(20px) scale(0.5) rotate(45deg)');
  });

  it('builds a state map for every animated node', () => {
    const doc = docWithMotion([
      { engine: 'css', trigger: 'mount', from: { opacity: 0 }, to: { opacity: 1 }, duration: 300 },
      { engine: 'css', trigger: 'mount', from: { opacity: 0 }, to: { opacity: 1 }, duration: 300 },
    ]);

    const { entries } = buildTimeline(doc, doc.pages[0]!.rootId);
    const states = frameStates(entries, 0);
    expect(Object.keys(states)).toHaveLength(2);
  });
});

/* ------------------------------- export ------------------------------- */

function landingPage(): DesignDocument {
  setIdRng(seededRng(21));
  let doc = createDocument({ name: 'Chamb Reel' });
  const rootId = doc.pages[0]!.rootId;

  let counter = 0;
  const createId = () => `r_${(counter += 1)}`;

  for (const [index, block] of [navbar, heroCentered].entries()) {
    const built = block.create({ createId, tokens: doc.tokens });
    doc = applyOperation(doc, {
      type: 'insertSubtree',
      nodes: built.nodes,
      rootId: built.rootId,
      parentId: rootId,
      index,
    }).document;
  }

  return doc;
}

describe('remotion export target', () => {
  it('registers as an export target alongside the built-ins', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, exportersPlugin, remotionPlugin]);

    expect(registry.getExporter('remotion')?.label).toBe('Video (Remotion)');
    expect(registry.getExporters()).toHaveLength(7);
  });

  it('emits a runnable project without importing Remotion', async () => {
    const registry = new PluginRegistry();
    await registry.registerAll([componentsPlugin, exportersPlugin, remotionPlugin]);

    const { files } = await exportProject(registry, landingPage(), 'remotion');
    const paths = files.map((file) => file.path);

    expect(paths).toEqual(
      expect.arrayContaining([
        'src/index.ts',
        'src/Root.tsx',
        'src/Scene.tsx',
        'src/document.json',
        'src/theme.css',
        'remotion.config.ts',
        'package.json',
        'README.md',
      ]),
    );
  });

  it('declares Remotion in the emitted project, not in this package', async () => {
    const files = generateRemotionProject(landingPage());
    const pkg = JSON.parse(files.find((file) => file.path === 'package.json')!.contents) as {
      dependencies: Record<string, string>;
    };

    expect(pkg.dependencies.remotion).toBeTruthy();

    // This plugin's own manifest must keep Remotion as a peer, so installing
    // OpenDesign never pulls non-MIT code in.
    const own = JSON.parse(
      new TextDecoder().decode(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').readFileSync(new URL('../../package.json', import.meta.url)),
      ),
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };

    expect(own.dependencies?.remotion).toBeUndefined();
    expect(own.peerDependencies?.remotion).toBeTruthy();
  });

  it('sizes each composition from the page timeline', () => {
    const files = generateRemotionProject(landingPage(), { fps: 60 });
    const root = files.find((file) => file.path === 'src/Root.tsx')!.contents;

    expect(root).toContain('fps={60}');
    expect(root).toMatch(/durationInFrames=\{\d+\}/);
    // The hero animates, so the composition must be longer than the tail alone.
    const frames = Number(/durationInFrames=\{(\d+)\}/.exec(root)![1]);
    expect(frames).toBeGreaterThan(60);
  });

  it('renders with inline styles, because Remotion has no Tailwind pass', () => {
    const scene = generateRemotionProject(landingPage()).find(
      (file) => file.path === 'src/Scene.tsx',
    )!.contents;

    expect(scene).toContain('styleMode="inline"');
    expect(scene).toContain('editorAttributes={false}');
    // Motion is stripped so the CSS engine does not double-animate.
    expect(scene).toContain('motion: undefined');
  });

  it('carries the design tokens and a reset into the video stylesheet', () => {
    const css = generateRemotionProject(landingPage()).find(
      (file) => file.path === 'src/theme.css',
    )!.contents;

    expect(css).toContain('--color-accent');
    expect(css).not.toContain('@theme');
    expect(css).toMatch(/h1, h2, h3, h4, h5, h6, p \{[\s\S]*?margin: 0;/);
  });

  it('states the licence terms in the generated README', () => {
    const readme = generateRemotionProject(landingPage()).find(
      (file) => file.path === 'README.md',
    )!.contents;

    expect(readme).toContain('not** MIT');
    expect(readme).toContain('remotion.dev/license');
  });

  it('honours a custom resolution', () => {
    const root = generateRemotionProject(landingPage(), { width: 1080, height: 1920 }).find(
      (file) => file.path === 'src/Root.tsx',
    )!.contents;

    expect(root).toContain('width={1080}');
    expect(root).toContain('height={1920}');
  });
});

describe('render entry point', () => {
  it('explains what to install and why when Remotion is missing', () => {
    const error = new RemotionNotInstalledError('@remotion/renderer');
    expect(error.message).toContain('pnpm add remotion');
    expect(error.message).toContain('remotion.dev/license');
    // The user should learn the export target still works without it.
    expect(error.message).toContain('emits a runnable project');
  });
});

describe('msToFrameOffset', () => {
  it('allows zero, unlike the duration conversion', () => {
    // A delay of 0 must land on frame 0. Reusing msToFrames here pushed every
    // un-delayed animation one frame late, and the error compounded with stagger.
    expect(msToFrameOffset(0, 30)).toBe(0);
    expect(msToFrames(0, 30)).toBe(1);
  });

  it('rounds a delay to the nearest frame', () => {
    expect(msToFrameOffset(500, 30)).toBe(15);
    expect(msToFrameOffset(250, 60)).toBe(15);
  });

  it('starts an un-delayed animation exactly at the lead-in', () => {
    const doc = docWithMotion([{ engine: 'css', trigger: 'mount', duration: 300 }]);
    const { entries } = buildTimeline(doc, doc.pages[0]!.rootId, { fps: 30, leadFrames: 6 });
    expect(entries[0]!.startFrame).toBe(6);
  });
});

describe('emitted code is syntactically valid', () => {
  it('parses every generated TSX/TS file', async () => {
    // Templated code is generated by string concatenation, so a stray backtick
    // or an unbalanced brace would ship silently. esbuild parses without needing
    // the imports to resolve.
    const { transform } = await import('esbuild');
    const files = generateRemotionProject(landingPage());

    const sources = files.filter((file) => /\.tsx?$/.test(file.path));
    expect(sources.length).toBeGreaterThan(3);

    for (const file of sources) {
      await expect(
        transform(file.contents, {
          loader: file.path.endsWith('.tsx') ? 'tsx' : 'ts',
          sourcefile: file.path,
        }),
      ).resolves.toBeTruthy();
    }
  });

  it('emits valid JSON for the document and package manifest', () => {
    const files = generateRemotionProject(landingPage());
    for (const path of ['src/document.json', 'package.json']) {
      const file = files.find((candidate) => candidate.path === path)!;
      expect(() => JSON.parse(file.contents)).not.toThrow();
    }
  });
});
