/**
 * The Locomotion World — PixiJS strip rendering Gothicvania pixel art
 * (Ansimuz, CC0 — see public/world/ATTRIBUTION.md). Every visible property
 * derives from database state delivered via the snapshot:
 *
 *   biome tint & speed  ← momentum (computed in Rust)
 *   permanent gold tiles ← verified evidence count (paving_ratio)
 *   equipment accents    ← defeated bosses
 *   sword glow           ← sharpness & affinities
 *   the hell-hound       ← momentum collapse (< 0.75): inertia hunts you
 *   the ghost            ← the Cognitive Fog boss, alive, in low momentum
 *   weather & fog        ← momentum extremes
 *
 * The scene renders; it never owns or invents state.
 */
import {
  AnimatedSprite, Application, Assets, Container, Graphics, Rectangle, Sprite,
  Texture, TilingSprite,
} from "pixi.js";
import { audio } from "../audio/engine";
import type { BiomeMode, SystemSnapshot } from "../types/contracts";

const S = 2; // pixel-art scale for near layers
const TILE_W = 16 * S;
const GROUND_TILE_H = 48;

type TileKind = "MUD" | "EARTH" | "COBBLE" | "PAVED" | "STONE";

/** Deterministic per-index hash so the road is stable between frames/runs. */
function tileHash(i: number): number {
  let h = (i ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

/** Biome is expressed by tinting the real stone tile — mud swallows it. */
const TILE_TINT: Record<TileKind, number> = {
  PAVED: 0xffffff,
  COBBLE: 0xaaaabc,
  EARTH: 0x8f7a5c,
  MUD: 0x4f3f30,
  STONE: 0xe0c87e, // evidence-paved: permanently warm
};

function sliceFrames(tex: Texture, frameW: number, frameH: number, count: number): Texture[] {
  const out: Texture[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Texture({ source: tex.source, frame: new Rectangle(i * frameW, 0, frameW, frameH) }));
  }
  return out;
}

interface WorldTextures {
  sky: Texture; clouds: Texture; mountains: Texture; farBuildings: Texture;
  forest: Texture; town: Texture; ground: Texture;
  heroRun: Texture[]; heroIdle: Texture[]; houndRun: Texture[]; ghostIdle: Texture[];
}

export class LocomotionScene {
  private app: Application;
  private host: HTMLElement;
  private root = new Container();
  private tex: WorldTextures | null = null;

  private sky!: TilingSprite;
  private clouds!: TilingSprite;
  private mountains!: TilingSprite;
  private farBuildings!: TilingSprite;
  private forest!: TilingSprite;
  private town!: TilingSprite;
  private ground = new Container();
  private tiles: { sprite: Sprite; index: number }[] = [];
  private hero!: AnimatedSprite;
  private heroAccents = new Graphics();
  private hound!: AnimatedSprite;
  private ghost!: AnimatedSprite;
  private weather = new Container();
  private rainDrops: Graphics[] = [];
  private motes: Graphics[] = [];
  private fogOverlay = new Graphics();
  private loadFailed = false;

  private distance = 0;
  private phase = 0;
  private lastStepAt = 0;
  private paused = false;
  private destroyed = false;

  private speed = 1.0;
  private biome: BiomeMode = "EARTH";
  private paving = 0;
  private momentum = 1.0;
  private sharpness = 10;
  private fire = 0;
  private lightning = 0;
  private fogBossAlive = false;
  private equipped = { boots: false, hood: false, pauldrons: false };

  private constructor(app: Application, host: HTMLElement) {
    this.app = app;
    this.host = host;
  }

  static async create(host: HTMLElement): Promise<LocomotionScene> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x07070d,
      antialias: false,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
    });
    host.appendChild(app.canvas);
    const scene = new LocomotionScene(app, host);
    await scene.build();
    app.ticker.add(() => scene.tick(app.ticker.deltaMS));
    return scene;
  }

  private async loadTextures(): Promise<WorldTextures> {
    const names = [
      "bg-sky", "bg-clouds", "bg-mountains", "bg-far-buildings", "bg-forest",
      "bg-town", "ground", "hero-run", "hero-idle", "hound-run", "ghost-idle",
    ];
    const loaded: Record<string, Texture> = {};
    for (const n of names) {
      loaded[n] = await Assets.load<Texture>(`/world/${n}.png`);
      loaded[n].source.scaleMode = "nearest";
    }
    return {
      sky: loaded["bg-sky"],
      clouds: loaded["bg-clouds"],
      mountains: loaded["bg-mountains"],
      farBuildings: loaded["bg-far-buildings"],
      forest: loaded["bg-forest"],
      town: loaded["bg-town"],
      ground: loaded["ground"],
      heroRun: sliceFrames(loaded["hero-run"], 66, 48, 12),
      heroIdle: sliceFrames(loaded["hero-idle"], 38, 48, 4),
      houndRun: sliceFrames(loaded["hound-run"], 67, 32, 5),
      ghostIdle: sliceFrames(loaded["ghost-idle"], 64, 80, 7),
    };
  }

  private async build() {
    this.app.stage.addChild(this.root);
    try {
      this.tex = await this.loadTextures();
    } catch (e) {
      // The world refuses to lie: if art is missing, say so instead of
      // painting a substitute reality.
      this.loadFailed = true;
      console.error("World art failed to load:", e);
      const msg = new Graphics();
      msg.rect(0, 0, 4000, 400).fill(0x0a0a10);
      this.root.addChild(msg);
      return;
    }
    const t = this.tex;
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    const mk = (texture: Texture, height: number) =>
      new TilingSprite({ texture, width: W, height });

    // Far sky layers are authored for a 224px screen — scale to strip height.
    const skyScale = H / 224;
    this.sky = mk(t.sky, H);
    this.sky.tileScale.set(skyScale);
    this.clouds = mk(t.clouds, H);
    this.clouds.tileScale.set(skyScale);
    this.mountains = mk(t.mountains, H);
    this.mountains.tileScale.set(skyScale);
    this.root.addChild(this.sky, this.clouds, this.mountains);

    // Near layers at crisp pixel scale.
    this.farBuildings = mk(t.farBuildings, 80 * S);
    this.farBuildings.tileScale.set(S);
    this.forest = mk(t.forest, 96 * S);
    this.forest.tileScale.set(S);
    this.town = mk(t.town, 99 * S);
    this.town.tileScale.set(S);
    this.root.addChild(this.farBuildings, this.forest, this.town);

    // Ground tile pool.
    this.root.addChild(this.ground);
    const count = Math.ceil(2400 / TILE_W) + 2;
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(t.ground);
      sprite.scale.set(S);
      this.ground.addChild(sprite);
      this.tiles.push({ sprite, index: i });
    }

    // The ghost haunts the mid-distance (in front of town, behind hero).
    this.ghost = new AnimatedSprite(t.ghostIdle);
    this.ghost.animationSpeed = 0.12;
    this.ghost.scale.set(S * 0.8);
    this.ghost.anchor.set(0.5, 1);
    this.ghost.alpha = 0;
    this.ghost.play();
    this.root.addChild(this.ghost);

    // The hound hunts behind the hero.
    this.hound = new AnimatedSprite(t.houndRun);
    this.hound.animationSpeed = 0.22;
    this.hound.scale.set(S);
    this.hound.anchor.set(0.5, 1);
    this.hound.alpha = 0;
    this.hound.play();
    this.root.addChild(this.hound);

    // The operator.
    this.hero = new AnimatedSprite(t.heroRun);
    this.hero.animationSpeed = 0.18;
    this.hero.scale.set(S);
    this.hero.anchor.set(0.5, 1);
    this.hero.play();
    this.root.addChild(this.hero);
    this.root.addChild(this.heroAccents);

    // Weather.
    this.root.addChild(this.weather);
    for (let i = 0; i < 42; i++) {
      const drop = new Graphics();
      drop.moveTo(0, 0).lineTo(-2.5, 9).stroke({ color: 0x6b7890, width: 1, alpha: 0.5 });
      drop.visible = false;
      this.weather.addChild(drop);
      this.rainDrops.push(drop);
    }
    for (let i = 0; i < 16; i++) {
      const mote = new Graphics();
      mote.circle(0, 0, 1.2).fill({ color: 0xc9a227, alpha: 0.5 });
      mote.visible = false;
      this.weather.addChild(mote);
      this.motes.push(mote);
    }

    this.root.addChild(this.fogOverlay);
    this.layout();
  }

  private groundTop(): number {
    return this.app.screen.height - 34 * S; // show tile surface + some wall
  }

  private layout() {
    if (!this.tex) return;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const gt = this.groundTop();
    for (const layer of [this.sky, this.clouds, this.mountains, this.farBuildings, this.forest, this.town]) {
      layer.width = W;
    }
    this.sky.y = 0;
    this.clouds.y = 0;
    this.mountains.y = 0;
    this.farBuildings.y = gt - 80 * S + 14 * S;
    this.forest.y = gt - 96 * S + 30 * S;
    this.town.y = gt - 99 * S + 12 * S;
    this.ground.y = gt;
    this.hero.x = Math.min(W * 0.32, 380);
    this.hero.y = gt + 2;
    this.hound.y = gt + 2;
    this.ghost.y = gt - 10;
    this.fogOverlay.clear();
    this.fogOverlay.rect(0, 0, W, H).fill(0x767e92);
    this.fogOverlay.alpha = 0;
  }

  // ------------------------------------------------------------- state in

  update(snap: SystemSnapshot) {
    this.speed = snap.locomotion_speed;
    this.biome = snap.biome;
    this.paving = snap.paving_ratio;
    this.momentum = snap.profile.momentum;
    this.sharpness = snap.weapon.sharpness;
    this.fire = snap.weapon.fire_affinity;
    this.lightning = snap.weapon.lightning_affinity;
    this.fogBossAlive = snap.bosses.some((b) => b.sector === "INTELLECTUAL" && !b.defeated);
    this.equipped = {
      boots: snap.equipment.some((e) => e.sector === "FINANCIAL" && e.unlocked),
      hood: snap.equipment.some((e) => e.sector === "INTELLECTUAL" && e.unlocked),
      pauldrons: snap.equipment.some((e) => e.sector === "PHYSICAL" && e.unlocked),
    };
    for (const t of this.tiles) this.applyTile(t);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (!this.tex || this.loadFailed) return;
    // Walking stops; the operator breathes. Idle frames are narrower, so the
    // anchor keeps the feet planted.
    const target = paused ? this.tex.heroIdle : this.tex.heroRun;
    if (this.hero.textures !== target) {
      this.hero.textures = target;
      this.hero.animationSpeed = paused ? 0.07 : 0.18;
      this.hero.play();
    }
  }

  private kindFor(index: number): TileKind {
    if (tileHash(index * 31 + 7) < this.paving) return "STONE";
    if (this.biome === "MUD") return tileHash(index * 13 + 1) < 0.85 ? "MUD" : "EARTH";
    if (this.biome === "EARTH") return tileHash(index * 13 + 1) < 0.8 ? "EARTH" : "MUD";
    if (this.biome === "COBBLE") return tileHash(index * 13 + 1) < 0.75 ? "COBBLE" : "EARTH";
    return tileHash(index * 13 + 1) < 0.8 ? "PAVED" : "COBBLE";
  }

  private applyTile(t: { sprite: Sprite; index: number }) {
    t.sprite.tint = TILE_TINT[this.kindFor(t.index)];
  }

  /** Equipment accents + the back-blade, drawn over the hero sprite. */
  private drawAccents() {
    const g = this.heroAccents;
    g.clear();
    if (!this.tex || this.loadFailed) return;
    const hx = this.hero.x;
    const hy = this.hero.y;
    const bob = this.paused ? 0 : Math.abs(Math.sin(this.phase)) * 2;
    const pulse = 0.55 + Math.sin(performance.now() / 400) * 0.2;

    // The hero's own sword carries the whetstone's glow — a soft aura around
    // the sprite instead of a duplicate drawn blade.
    const glow = Math.max(0, (this.sharpness - 25) / 75);
    if (glow > 0.05) {
      g.ellipse(hx + 2, hy - 44 + bob, 26, 44)
        .fill({ color: this.fire > 0.25 ? 0xd97b2f : 0xc9a227, alpha: (0.03 + glow * 0.06) * pulse });
    }
    if (this.lightning > 0.3 && Math.random() < 0.015) {
      g.moveTo(hx + 8, hy - 60 + bob).lineTo(hx + 13, hy - 52 + bob).lineTo(hx + 9, hy - 46 + bob)
        .stroke({ color: 0xbfd4ff, width: 1.2, alpha: 0.9 });
    }

    // Reinforced Steel Greaves — gold shimmer at the boots.
    if (this.equipped.boots) {
      g.rect(hx - 14, hy - 5, 26, 2).fill({ color: 0xc9a227, alpha: 0.35 * pulse + 0.15 });
    }
    // Strategic Iron Hood — a cold steel halo at the head.
    if (this.equipped.hood) {
      g.ellipse(hx + 2, hy - 88 + bob, 12, 4).stroke({ color: 0x8ea7bd, width: 1.4, alpha: 0.3 + 0.2 * pulse });
    }
    // Tempered Pauldrons — glints at the shoulders.
    if (this.equipped.pauldrons) {
      g.circle(hx - 10, hy - 66 + bob, 2.2).fill({ color: 0xb0584f, alpha: 0.5 + 0.25 * pulse });
      g.circle(hx + 12, hy - 66 + bob, 2.2).fill({ color: 0xb0584f, alpha: 0.5 + 0.25 * pulse });
    }
  }

  // ------------------------------------------------------------- tick

  private tick(deltaMS: number) {
    if (this.destroyed || !this.tex || this.loadFailed) return;
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    if (this.sky.width !== W) this.layout();

    const dt = Math.min(deltaMS, 50) / 1000;
    if (!this.paused) {
      const pxPerSec = 46 * this.speed;
      this.distance += pxPerSec * dt;
      this.phase += dt * (3.4 + this.speed * 2.6);
      this.hero.animationSpeed = 0.12 + this.speed * 0.06;

      if (this.phase - this.lastStepAt >= Math.PI) {
        this.lastStepAt = this.phase;
        const idx = Math.floor((this.distance + this.hero.x) / TILE_W);
        const kind = this.kindFor(idx);
        audio.footstep(kind === "STONE" ? "COBBLE" : kind);
      }
    }

    // Parallax: deeper layers crawl, near layers march.
    this.clouds.tilePosition.x = -(this.distance * 0.03 + performance.now() / 900);
    this.mountains.tilePosition.x = -this.distance * 0.06;
    this.farBuildings.tilePosition.x = -this.distance * 0.16;
    this.forest.tilePosition.x = -this.distance * 0.32;
    this.town.tilePosition.x = -this.distance * 0.5;

    const firstIndex = Math.floor(this.distance / TILE_W);
    const offset = -(this.distance % TILE_W);
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      const newIndex = firstIndex + i;
      if (t.index !== newIndex) {
        t.index = newIndex;
        this.applyTile(t);
      }
      t.sprite.x = offset + i * TILE_W;
      t.sprite.y = 0;
    }

    this.drawAccents();

    // The hell-hound: inertia given a body. It closes in as momentum dies.
    const houndActive = this.momentum < 0.75 && !this.paused;
    const houndTargetAlpha = houndActive ? 0.9 : 0;
    this.hound.alpha += (houndTargetAlpha - this.hound.alpha) * 0.02;
    if (this.hound.alpha > 0.01) {
      const closeness = (0.75 - Math.max(0.25, this.momentum)) / 0.5; // 0..1
      this.hound.x = this.hero.x - 190 + closeness * 90 + Math.sin(performance.now() / 700) * 8;
    }

    // The ghost: the Cognitive Fog drifting through the town while it lives.
    const ghostActive = this.fogBossAlive && this.momentum < 1.0;
    const ghostTarget = ghostActive ? 0.4 : 0;
    this.ghost.alpha += (ghostTarget - this.ghost.alpha) * 0.01;
    if (this.ghost.alpha > 0.01) {
      const t = performance.now() / 1000;
      this.ghost.x = ((this.hero.x + 260 + Math.sin(t * 0.21) * 120) + W) % W;
      this.ghost.y = this.groundTop() - 26 + Math.sin(t * 0.9) * 7;
    }

    // Weather is a function of momentum.
    const raining = this.momentum < 0.7;
    const shining = this.momentum >= 1.5;
    for (let i = 0; i < this.rainDrops.length; i++) {
      const d = this.rainDrops[i];
      d.visible = raining;
      if (!raining) continue;
      const speed = 260 + (i % 5) * 40;
      const t = (performance.now() / 1000) * speed + i * 97;
      d.x = ((i * 149 + t * 0.32) % (W + 40)) - 20;
      d.y = (t % (H + 30)) - 15;
    }
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.visible = shining;
      if (!shining) continue;
      const t = performance.now() / 1000;
      m.x = ((i * 211 + t * 14) % (W + 20)) - 10;
      m.y = 30 + ((Math.sin(t * 0.7 + i) + 1) / 2) * (H - 100);
      m.alpha = 0.25 + ((Math.sin(t * 1.3 + i * 2) + 1) / 2) * 0.4;
    }

    // The cognitive fog thickens as momentum dies.
    const fogTarget = Math.max(0, Math.min(0.38, (1.15 - this.momentum) * 0.36));
    this.fogOverlay.alpha += (fogTarget - this.fogOverlay.alpha) * 0.03;
  }

  destroy() {
    this.destroyed = true;
    this.app.destroy(true, { children: true, texture: false });
    while (this.host.firstChild) this.host.removeChild(this.host.firstChild);
  }
}
